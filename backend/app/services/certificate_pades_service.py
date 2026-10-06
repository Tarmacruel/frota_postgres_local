from __future__ import annotations

import base64
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Iterable, Sequence
from urllib.parse import urlparse

from asn1crypto import algos, cms, core, x509
from cryptography import x509 as crypto_x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.ades.api import CAdESSignedAttrSpec
from pyhanko.sign.ades.cades_asn1 import (
    SignaturePolicyId,
    SignaturePolicyIdentifier,
)
from pyhanko.sign.fields import SigSeedSubFilter
from pyhanko.sign.signers import ExternalSigner, PdfSignatureMetadata, PdfSigner
from pyhanko.sign.signers.pdf_byterange import PreparedByteRangeDigest
from pyhanko.sign.signers.pdf_cms import PdfCMSSignedAttributes
from pyhanko.sign.signers.pdf_signer import PdfTBSDocument
from pyhanko.sign.timestamps import HTTPTimeStamper, TimeStamper
from pyhanko.sign.validation import async_validate_pdf_signature
from pyhanko_certvalidator import CertificateValidator, ValidationContext
from pyhanko_certvalidator.registry import SimpleCertificateStore

from app.core.cpf import mask_cpf, normalize_cpf


PADES_AD_RT_POLICY_OID = "2.16.76.1.7.1.12.1.3"
PADES_AD_RT_POLICY_URI = (
    "https://politicas.icpbrasil.gov.br/PA_PAdES_AD_RT_v1_3.der"
)
PADES_AD_RT_POLICY_SHA256 = (
    "92a972e7c292bb884e98e650773d9e9876994effb43eb36199b06bf2864a677c"
)
DEFAULT_BYTES_RESERVED = 131_072
SUPPORTED_SIGNATURE_ALGORITHMS = frozenset({"RS256", "ES256", "ES384", "ES512"})
_SUBJECT_CPF_PATTERN = re.compile(
    r"(?:CPF\s*[:=\-]?\s*)?(\d{11})", re.IGNORECASE
)
ICP_BRASIL_PERSON_SIGNATURE_POLICY_PREFIXES = (
    "2.16.76.1.2.1.",  # certificado de assinatura A1
    "2.16.76.1.2.3.",  # certificado de assinatura A3
)
_ICP_BRASIL_PERSON_OTHER_NAME_OID = "2.16.76.1.3.1"
_ICP_BRASIL_LEGAL_ENTITY_OTHER_NAME_OID = "2.16.76.1.3.3"


class CertificateSigningError(ValueError):
    """Raised when a certificate signing step must fail closed."""


@dataclass(frozen=True, slots=True)
class PreparedPadesSignature:
    prepared_pdf: bytes
    document_digest: bytes
    reserved_region_start: int
    reserved_region_end: int
    signed_attributes: bytes
    signing_certificate: bytes
    certificate_chain: tuple[bytes, ...]
    signature_algorithm: str
    digest_algorithm: str
    field_name: str
    prepared_at: datetime

    @property
    def to_be_signed_base64(self) -> str:
        return base64.b64encode(self.signed_attributes).decode("ascii")


@dataclass(frozen=True, slots=True)
class CompletedPadesSignature:
    signed_pdf: bytes
    sha256: str
    validation_summary: str
    timestamped_at: datetime | None

    @property
    def timestamped(self) -> bool:
        return self.timestamped_at is not None


class CertificatePadesService:
    """
    Stateless PAdES interrupted-signing engine.

    The private key is deliberately absent from this API. ``prepare`` returns
    the exact DER-encoded CMS signed attributes for the Windows agent to sign;
    ``complete`` verifies the raw signature before embedding it into the PDF.
    """

    def __init__(
        self,
        *,
        validation_context: ValidationContext | None = None,
        timestamper: TimeStamper | None = None,
        require_timestamp: bool = True,
    ) -> None:
        self._validation_context = validation_context
        self._timestamper = timestamper
        self._require_timestamp = require_timestamp

    @classmethod
    def with_http_tsa(
        cls,
        tsa_url: str,
        *,
        validation_context: ValidationContext,
        timeout_seconds: int = 10,
        auth: tuple[str, str] | None = None,
        allow_local_http: bool = False,
    ) -> CertificatePadesService:
        parsed_url = urlparse(tsa_url)
        local_http = (
            allow_local_http
            and parsed_url.scheme == "http"
            and parsed_url.hostname in {"127.0.0.1", "localhost"}
        )
        if parsed_url.scheme != "https" and not local_http:
            raise CertificateSigningError("A ACT deve ser acessada por HTTPS.")
        return cls(
            validation_context=validation_context,
            timestamper=HTTPTimeStamper(
                tsa_url,
                https=parsed_url.scheme == "https",
                timeout=timeout_seconds,
                auth=auth,
            ),
            require_timestamp=True,
        )

    async def prepare(
        self,
        *,
        canonical_pdf: bytes,
        certificate_der: bytes,
        chain_der: Sequence[bytes],
        supported_algorithms: Iterable[str],
        field_name: str,
        reason: str = "Assinatura ICP-Brasil em homologação",
    ) -> PreparedPadesSignature:
        self._require_pdf(canonical_pdf)
        signing_certificate = self._load_certificate(certificate_der)
        chain = tuple(self._load_certificate(item) for item in chain_der)
        signature_algorithm = self._select_algorithm(
            signing_certificate, supported_algorithms
        )
        self.assert_icp_brasil_person_certificate(certificate_der)
        self._validate_current_validity(certificate_der)
        await self._validate_chain(signing_certificate, chain)

        certificate_store = self._certificate_store(chain)
        signer = ExternalSigner(
            signing_cert=signing_certificate,
            cert_registry=certificate_store,
            signature_value=self._placeholder_size(signature_algorithm),
            signature_mechanism=self._signature_mechanism(signature_algorithm),
            embed_roots=False,
        )
        signature_metadata = PdfSignatureMetadata(
            field_name=field_name,
            md_algorithm="sha256",
            reason=reason,
            location="Teixeira de Freitas/BA — HOMOLOGAÇÃO",
            subfilter=SigSeedSubFilter.PADES,
            embed_validation_info=False,
            validation_context=self._validation_context,
            cades_signed_attr_spec=self._policy_attributes(),
        )
        pdf_signer = PdfSigner(
            signature_metadata,
            signer,
            timestamper=self._timestamper,
        )
        input_stream = io.BytesIO(canonical_pdf)
        output = io.BytesIO()
        writer = IncrementalPdfFileWriter(input_stream, strict=True)
        try:
            prepared_digest, _, output = await pdf_signer.async_digest_doc_for_signing(
                writer,
                bytes_reserved=DEFAULT_BYTES_RESERVED,
                output=output,
            )
            signed_attributes = await signer.signed_attrs(
                prepared_digest.document_digest,
                "sha256",
                attr_settings=PdfCMSSignedAttributes(
                    cades_signed_attrs=self._policy_attributes()
                ),
                use_pades=True,
                timestamper=self._timestamper,
                dry_run=False,
            )
            return PreparedPadesSignature(
                prepared_pdf=output.getvalue(),
                document_digest=prepared_digest.document_digest,
                reserved_region_start=prepared_digest.reserved_region_start,
                reserved_region_end=prepared_digest.reserved_region_end,
                signed_attributes=signed_attributes.dump(),
                signing_certificate=certificate_der,
                certificate_chain=tuple(chain_der),
                signature_algorithm=signature_algorithm,
                digest_algorithm="sha256",
                field_name=field_name,
                prepared_at=datetime.now(UTC),
            )
        except Exception as exc:
            if isinstance(exc, CertificateSigningError):
                raise
            raise CertificateSigningError(
                "Não foi possível preparar o PDF para assinatura."
            ) from exc

    async def complete(
        self,
        *,
        prepared: PreparedPadesSignature,
        raw_signature: bytes,
    ) -> CompletedPadesSignature:
        if self._require_timestamp and self._timestamper is None:
            raise CertificateSigningError(
                "A assinatura AD-RT exige uma Autoridade de Carimbo do Tempo."
            )
        if datetime.now(UTC) - prepared.prepared_at > _five_minutes():
            raise CertificateSigningError("A preparação da assinatura expirou.")

        self._verify_raw_signature(
            prepared.signing_certificate,
            prepared.signed_attributes,
            raw_signature,
            prepared.signature_algorithm,
        )
        signing_certificate = self._load_certificate(
            prepared.signing_certificate
        )
        self.assert_icp_brasil_person_certificate(
            prepared.signing_certificate
        )
        chain = tuple(
            self._load_certificate(item) for item in prepared.certificate_chain
        )
        await self._validate_chain(signing_certificate, chain)
        signer = ExternalSigner(
            signing_cert=signing_certificate,
            cert_registry=self._certificate_store(chain),
            signature_value=raw_signature,
            signature_mechanism=self._signature_mechanism(
                prepared.signature_algorithm
            ),
            embed_roots=False,
        )
        signed_attributes = cms.CMSAttributes.load(prepared.signed_attributes)
        try:
            signature_cms = await signer.async_sign_prescribed_attributes(
                prepared.digest_algorithm,
                signed_attributes,
                timestamper=self._timestamper,
                dry_run=False,
            )
            output = io.BytesIO(prepared.prepared_pdf)
            digest = PreparedByteRangeDigest(
                document_digest=prepared.document_digest,
                reserved_region_start=prepared.reserved_region_start,
                reserved_region_end=prepared.reserved_region_end,
            )
            PdfTBSDocument.resume_signing(output, digest, signature_cms)
            signed_pdf = output.getvalue()
            summary, timestamped_at = await self._validate_completed_pdf(signed_pdf)
            return CompletedPadesSignature(
                signed_pdf=signed_pdf,
                sha256=hashlib.sha256(signed_pdf).hexdigest(),
                validation_summary=summary,
                timestamped_at=timestamped_at,
            )
        except Exception as exc:
            if isinstance(exc, CertificateSigningError):
                raise
            raise CertificateSigningError(
                "A assinatura não pôde ser incorporada ou validada."
            ) from exc

    async def _validate_completed_pdf(
        self, signed_pdf: bytes
    ) -> tuple[str, datetime | None]:
        reader = PdfFileReader(io.BytesIO(signed_pdf), strict=True)
        if not reader.embedded_signatures:
            raise CertificateSigningError("O PDF final não contém assinatura.")
        status = await async_validate_pdf_signature(
            reader.embedded_signatures[-1],
            signer_validation_context=self._validation_context,
        )
        if not status.intact or not status.valid:
            raise CertificateSigningError(
                "A validação criptográfica do PDF final falhou."
            )
        if self._validation_context is not None and not status.bottom_line:
            raise CertificateSigningError(
                "A cadeia do PDF final não foi considerada confiável."
            )
        timestamp_status = status.timestamp_validity
        timestamped_at = None
        if timestamp_status is not None:
            if (
                not timestamp_status.intact
                or not timestamp_status.valid
                or (
                    self._validation_context is not None
                    and not timestamp_status.trusted
                )
            ):
                raise CertificateSigningError(
                    "O carimbo do tempo incorporado não é válido ou confiável."
                )
            timestamped_at = timestamp_status.timestamp
        if self._require_timestamp and timestamped_at is None:
            raise CertificateSigningError(
                "O PDF final não contém carimbo do tempo AD-RT válido."
            )
        return status.summary(), timestamped_at

    async def _validate_chain(
        self,
        signing_certificate: x509.Certificate,
        chain: Sequence[x509.Certificate],
    ) -> None:
        if self._validation_context is None:
            return
        try:
            validator = CertificateValidator(
                signing_certificate,
                intermediate_certs=chain,
                validation_context=self._validation_context,
            )
            await validator.async_validate_usage({"digital_signature"})
        except Exception as exc:
            raise CertificateSigningError(
                "A cadeia do certificado não é confiável ou está revogada."
            ) from exc

    @staticmethod
    def extract_cpf(certificate_der: bytes) -> str | None:
        certificate = crypto_x509.load_der_x509_certificate(certificate_der)
        subject_candidates: list[str] = []
        try:
            subject_candidates.extend(
                attribute.value
                for attribute in certificate.subject.get_attributes_for_oid(
                    crypto_x509.NameOID.SERIAL_NUMBER
                )
            )
        except (ValueError, TypeError):
            pass

        for candidate in subject_candidates:
            match = _SUBJECT_CPF_PATTERN.fullmatch(candidate.strip())
            if match:
                try:
                    return normalize_cpf(match.group(1))
                except ValueError:
                    pass

        try:
            extension = certificate.extensions.get_extension_for_class(
                crypto_x509.SubjectAlternativeName
            ).value
            for other_name in extension.get_values_for_type(crypto_x509.OtherName):
                if (
                    other_name.type_id.dotted_string
                    != _ICP_BRASIL_PERSON_OTHER_NAME_OID
                ):
                    continue
                decoded = CertificatePadesService._decode_other_name_value(
                    other_name.value
                )
                # DOC-ICP-04: nascimento (8 posições) seguido do CPF (11).
                if len(decoded) >= 19 and decoded[:19].isdigit():
                    try:
                        return normalize_cpf(decoded[8:19])
                    except ValueError:
                        pass
        except crypto_x509.ExtensionNotFound:
            pass
        return None

    @staticmethod
    def _decode_other_name_value(value: bytes) -> str:
        for asn1_type in (
            core.UTF8String,
            core.PrintableString,
            core.IA5String,
            core.OctetString,
        ):
            try:
                native = asn1_type.load(value).native
            except (TypeError, ValueError):
                continue
            if isinstance(native, bytes):
                return native.decode("latin-1", errors="ignore")
            if isinstance(native, str):
                return native
        return value.decode("latin-1", errors="ignore")

    @staticmethod
    def certificate_policy_oids(certificate_der: bytes) -> tuple[str, ...]:
        certificate = crypto_x509.load_der_x509_certificate(certificate_der)
        try:
            policies = certificate.extensions.get_extension_for_class(
                crypto_x509.CertificatePolicies
            ).value
        except crypto_x509.ExtensionNotFound:
            return ()
        return tuple(policy.policy_identifier.dotted_string for policy in policies)

    @classmethod
    def assert_icp_brasil_person_certificate(
        cls, certificate_der: bytes
    ) -> tuple[str, ...]:
        policy_oids = cls.certificate_policy_oids(certificate_der)
        if not any(
            policy_oid.startswith(prefix)
            for policy_oid in policy_oids
            for prefix in ICP_BRASIL_PERSON_SIGNATURE_POLICY_PREFIXES
        ):
            raise CertificateSigningError(
                "O certificado não possui política ICP-Brasil de assinatura A1 ou A3."
            )
        certificate = crypto_x509.load_der_x509_certificate(certificate_der)
        try:
            alternative_names = certificate.extensions.get_extension_for_class(
                crypto_x509.SubjectAlternativeName
            ).value
        except crypto_x509.ExtensionNotFound:
            alternative_names = None
        if alternative_names is not None and any(
            other_name.type_id.dotted_string
            == _ICP_BRASIL_LEGAL_ENTITY_OTHER_NAME_OID
            for other_name in alternative_names.get_values_for_type(
                crypto_x509.OtherName
            )
        ):
            raise CertificateSigningError(
                "Certificado de pessoa jurídica não pode assinar como e-CPF."
            )
        if cls.extract_cpf(certificate_der) is None:
            raise CertificateSigningError(
                "O certificado ICP-Brasil não identifica uma pessoa física com CPF válido."
            )
        return policy_oids

    @classmethod
    def assert_cpf_matches(cls, certificate_der: bytes, expected_cpf: str) -> str:
        certificate_cpf = cls.extract_cpf(certificate_der)
        try:
            normalized_expected = normalize_cpf(expected_cpf)
        except ValueError as exc:
            raise CertificateSigningError(
                "A conta autenticada não possui CPF válido para comparação."
            ) from exc
        if not certificate_cpf or certificate_cpf != normalized_expected:
            raise CertificateSigningError(
                "O CPF do e-CPF não corresponde ao usuário autenticado."
            )
        return mask_cpf(certificate_cpf) or "***.***.***-**"

    @staticmethod
    def certificate_fingerprint(certificate_der: bytes) -> str:
        return hashlib.sha256(certificate_der).hexdigest()

    @staticmethod
    def _verify_raw_signature(
        certificate_der: bytes,
        payload: bytes,
        signature: bytes,
        algorithm: str,
    ) -> None:
        certificate = crypto_x509.load_der_x509_certificate(certificate_der)
        public_key = certificate.public_key()
        try:
            if algorithm == "RS256" and isinstance(public_key, rsa.RSAPublicKey):
                public_key.verify(signature, payload, padding.PKCS1v15(), hashes.SHA256())
                return
            if algorithm.startswith("ES") and isinstance(public_key, ec.EllipticCurvePublicKey):
                digest = {
                    "ES256": hashes.SHA256(),
                    "ES384": hashes.SHA384(),
                    "ES512": hashes.SHA512(),
                }[algorithm]
                public_key.verify(signature, payload, ec.ECDSA(digest))
                return
        except (InvalidSignature, ValueError) as exc:
            raise CertificateSigningError(
                "A assinatura retornada pelo agente é inválida."
            ) from exc
        raise CertificateSigningError(
            "Algoritmo incompatível com a chave pública do certificado."
        )

    @staticmethod
    def _select_algorithm(
        certificate: x509.Certificate,
        supported_algorithms: Iterable[str],
    ) -> str:
        requested = [
            item.upper()
            for item in supported_algorithms
            if item.upper() in SUPPORTED_SIGNATURE_ALGORITHMS
        ]
        key_algorithm = certificate.public_key.algorithm
        if key_algorithm == "rsa" and "RS256" in requested:
            return "RS256"
        if key_algorithm == "ec":
            for algorithm in ("ES256", "ES384", "ES512"):
                if algorithm in requested:
                    return algorithm
        raise CertificateSigningError(
            "O certificado não oferece algoritmo de assinatura compatível."
        )

    @staticmethod
    def _signature_mechanism(algorithm: str) -> algos.SignedDigestAlgorithm:
        names = {
            "RS256": "sha256_rsa",
            "ES256": "sha256_ecdsa",
            "ES384": "sha384_ecdsa",
            "ES512": "sha512_ecdsa",
        }
        try:
            return algos.SignedDigestAlgorithm({"algorithm": names[algorithm]})
        except KeyError as exc:
            raise CertificateSigningError("Algoritmo não suportado.") from exc

    @staticmethod
    def _placeholder_size(algorithm: str) -> int:
        return 512 if algorithm == "RS256" else 144

    @staticmethod
    def _certificate_store(
        chain: Sequence[x509.Certificate],
    ) -> SimpleCertificateStore:
        store = SimpleCertificateStore()
        for certificate in chain:
            store.register(certificate)
        return store

    @staticmethod
    def _load_certificate(payload: bytes) -> x509.Certificate:
        try:
            return x509.Certificate.load(payload)
        except (ValueError, TypeError) as exc:
            raise CertificateSigningError("Certificado DER inválido.") from exc

    @staticmethod
    def _validate_current_validity(certificate_der: bytes) -> None:
        certificate = crypto_x509.load_der_x509_certificate(certificate_der)
        now = datetime.now(UTC)
        if now < certificate.not_valid_before_utc or now > certificate.not_valid_after_utc:
            raise CertificateSigningError("O certificado está fora do período de validade.")
        try:
            key_usage = certificate.extensions.get_extension_for_class(
                crypto_x509.KeyUsage
            ).value
            if not key_usage.digital_signature and not key_usage.content_commitment:
                raise CertificateSigningError(
                    "O certificado não permite assinatura digital."
                )
        except crypto_x509.ExtensionNotFound:
            pass

    @staticmethod
    def _policy_attributes() -> CAdESSignedAttrSpec:
        policy_id = SignaturePolicyIdentifier(
            name="signature_policy_id",
            value=SignaturePolicyId(
                {
                    "sig_policy_id": PADES_AD_RT_POLICY_OID,
                    "sig_policy_hash": algos.DigestInfo(
                        {
                            "digest_algorithm": {"algorithm": "sha256"},
                            "digest": bytes.fromhex(PADES_AD_RT_POLICY_SHA256),
                        }
                    ),
                    "sig_policy_qualifiers": [
                        {
                            "sig_policy_qualifier_id": "sp_uri",
                            "sig_qualifier": core.IA5String(
                                PADES_AD_RT_POLICY_URI
                            ),
                        }
                    ],
                }
            ),
        )
        return CAdESSignedAttrSpec(signature_policy_identifier=policy_id)

    @staticmethod
    def _require_pdf(payload: bytes) -> None:
        if len(payload) < 8 or not payload.startswith(b"%PDF-"):
            raise CertificateSigningError("O artefato canônico não é um PDF válido.")


def _five_minutes():
    from datetime import timedelta

    return timedelta(minutes=5)
