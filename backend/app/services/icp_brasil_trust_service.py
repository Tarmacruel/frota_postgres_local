from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

from asn1crypto import x509
from pyhanko_certvalidator import ValidationContext

from app.services.certificate_pades_service import CertificateSigningError


@dataclass(frozen=True, slots=True)
class IcpBrasilRootSpec:
    filename: str
    sha256: str
    common_name: str


CURRENT_ICP_BRASIL_ROOTS: tuple[IcpBrasilRootSpec, ...] = (
    IcpBrasilRootSpec(
        filename="ICP-Brasilv4.crt",
        sha256="857ff3bf31628979e479c5bc0bdf3e706bcc7bafb7ddf0c1134fc21f1cfab141",
        common_name="Autoridade Certificadora Raiz Brasileira v4",
    ),
    IcpBrasilRootSpec(
        filename="ICP-Brasilv5.crt",
        sha256="5bd85f219695dabe6cf3d4bd713d9bd8e41b2323194022acf1acd658daef148a",
        common_name="Autoridade Certificadora Raiz Brasileira v5",
    ),
    IcpBrasilRootSpec(
        filename="ICP-Brasilv6.crt",
        sha256="a91e45782e58755dffc6621cb05c2342db74398ffc6e930b0b3a23325a3bfdfd",
        common_name="Autoridade Certificadora Raiz Brasileira v6",
    ),
    IcpBrasilRootSpec(
        filename="ICP-Brasilv7.crt",
        sha256="4fe1d8599fc00f0b61b12391c98d97af36bcada115bd894f8755e01e212bc4be",
        common_name="Autoridade Certificadora Raiz Brasileira v7",
    ),
    IcpBrasilRootSpec(
        filename="ICP-Brasilv12.crt",
        sha256="ce6c66c73e41b12881ea8a9b8cb7efef9a482ea012c3cd3b843667e37a7a145c",
        common_name="Autoridade Certificadora Raiz Brasileira v12",
    ),
    IcpBrasilRootSpec(
        filename="ICP-Brasilv13.crt",
        sha256="da54711b5816a2487903c62de28402dca2eea21ccc4e977f1d2645486d84d30c",
        common_name="Autoridade Certificadora Raiz Brasileira v13",
    ),
)


class IcpBrasilTrustStore:
    """Loads a deliberately small, hash-pinned set of ICP-Brasil trust anchors."""

    def __init__(
        self,
        root: str | Path,
        *,
        expected_roots: Sequence[IcpBrasilRootSpec] = CURRENT_ICP_BRASIL_ROOTS,
    ) -> None:
        self.root = Path(root).resolve()
        self.expected_roots = tuple(expected_roots)

    def load(self) -> tuple[x509.Certificate, ...]:
        if not self.root.is_dir():
            raise CertificateSigningError(
                "O repositório confiável ICP-Brasil não está instalado."
            )
        loaded: list[x509.Certificate] = []
        for spec in self.expected_roots:
            path = (self.root / spec.filename).resolve()
            if path.parent != self.root or not path.is_file():
                raise CertificateSigningError(
                    f"Âncora ICP-Brasil ausente: {spec.filename}."
                )
            payload = path.read_bytes()
            actual_hash = hashlib.sha256(payload).hexdigest()
            if actual_hash != spec.sha256:
                raise CertificateSigningError(
                    f"Hash inválido para a âncora {spec.filename}."
                )
            try:
                certificate = x509.Certificate.load(payload)
            except (TypeError, ValueError) as exc:
                raise CertificateSigningError(
                    f"Âncora ICP-Brasil inválida: {spec.filename}."
                ) from exc
            if certificate.subject != certificate.issuer:
                raise CertificateSigningError(
                    f"A âncora {spec.filename} não é autoemitida."
                )
            common_name = certificate.subject.native.get("common_name")
            if common_name != spec.common_name:
                raise CertificateSigningError(
                    f"Identidade inesperada na âncora {spec.filename}."
                )
            loaded.append(certificate)
        return tuple(loaded)

    def validation_context(
        self,
        *,
        other_certificates_der: Sequence[bytes] = (),
        allow_fetching: bool = False,
        require_revocation: bool = True,
    ) -> ValidationContext:
        try:
            intermediates = [
                x509.Certificate.load(payload)
                for payload in other_certificates_der
            ]
        except (TypeError, ValueError) as exc:
            raise CertificateSigningError(
                "A cadeia intermediária contém certificado inválido."
            ) from exc
        return ValidationContext(
            trust_roots=self.load(),
            other_certs=intermediates,
            allow_fetching=allow_fetching,
            revocation_mode="require" if require_revocation else "soft-fail",
        )
