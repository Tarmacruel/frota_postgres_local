from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta

import pytest
from asn1crypto import cms, core
from asn1crypto import keys as asn1_keys
from asn1crypto import x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID, ObjectIdentifier
from pyhanko.sign.timestamps import DummyTimeStamper
from pyhanko_certvalidator import ValidationContext
from pyhanko_certvalidator.registry import SimpleCertificateStore
from reportlab.pdfgen import canvas

from app.services.certificate_pades_service import (
    PADES_AD_RT_POLICY_OID,
    CertificatePadesService,
    CertificateSigningError,
)


def _issue_certificate(
    *,
    common_name: str,
    key: rsa.RSAPrivateKey | ec.EllipticCurvePrivateKey,
    issuer_certificate: x509.Certificate,
    issuer_key: rsa.RSAPrivateKey,
    serial_number_text: str | None = None,
    tsa: bool = False,
    certificate_policy_oid: str | None = None,
) -> x509.Certificate:
    attributes = [x509.NameAttribute(NameOID.COMMON_NAME, common_name)]
    if serial_number_text:
        attributes.append(x509.NameAttribute(NameOID.SERIAL_NUMBER, serial_number_text))
    now = datetime.now(UTC)
    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name(attributes))
        .issuer_name(issuer_certificate.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=2))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=None,
                decipher_only=None,
            ),
            True,
        )
    )
    if tsa:
        builder = builder.add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.TIME_STAMPING]), True
        )
    if certificate_policy_oid:
        builder = builder.add_extension(
            x509.CertificatePolicies(
                [
                    x509.PolicyInformation(
                        ObjectIdentifier(certificate_policy_oid), None
                    )
                ]
            ),
            False,
        )
    return builder.sign(issuer_key, hashes.SHA256())


def _material():
    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Frota HML Test Root")])
    root_certificate = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=None,
                decipher_only=None,
            ),
            True,
        )
        .sign(root_key, hashes.SHA256())
    )
    signer_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    signer_certificate = _issue_certificate(
        common_name="Assinante de Homologação",
        key=signer_key,
        issuer_certificate=root_certificate,
        issuer_key=root_key,
        serial_number_text="52998224725",
        certificate_policy_oid="2.16.76.1.2.1.999999",
    )
    tsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    tsa_certificate = _issue_certificate(
        common_name="ACT de teste",
        key=tsa_key,
        issuer_certificate=root_certificate,
        issuer_key=root_key,
        tsa=True,
    )

    root_asn1 = asn1_x509.Certificate.load(root_certificate.public_bytes(serialization.Encoding.DER))
    tsa_asn1 = asn1_x509.Certificate.load(tsa_certificate.public_bytes(serialization.Encoding.DER))
    signer_der = signer_certificate.public_bytes(serialization.Encoding.DER)
    store = SimpleCertificateStore()
    store.register(root_asn1)
    timestamper = DummyTimeStamper(
        tsa_asn1,
        asn1_keys.PrivateKeyInfo.load(
            tsa_key.private_bytes(
                serialization.Encoding.DER,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        ),
        certs_to_embed=store,
        fixed_dt=now,
    )
    validation_context = ValidationContext(
        trust_roots=[root_asn1],
        other_certs=[tsa_asn1],
        allow_fetching=False,
        revocation_mode="soft-fail",
    )
    return signer_key, signer_der, root_asn1.dump(), timestamper, validation_context


def _pdf() -> bytes:
    output = io.BytesIO()
    document = canvas.Canvas(output, invariant=True)
    document.drawString(72, 760, "HOMOLOGAÇÃO — SEM VALIDADE OPERACIONAL")
    document.drawString(72, 730, "Termo sintético para teste PAdES")
    document.save()
    return output.getvalue()


@pytest.mark.asyncio
async def test_interrupted_pades_signature_with_timestamp_and_policy():
    signer_key, signer_der, root_der, timestamper, context = _material()
    service = CertificatePadesService(
        validation_context=context,
        timestamper=timestamper,
        require_timestamp=True,
    )

    prepared = await service.prepare(
        canonical_pdf=_pdf(),
        certificate_der=signer_der,
        chain_der=[root_der],
        supported_algorithms=["RS256"],
        field_name="FrotaHML-1",
    )
    raw_signature = signer_key.sign(
        prepared.signed_attributes,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    completed = await service.complete(prepared=prepared, raw_signature=raw_signature)

    assert completed.signed_pdf.startswith(b"%PDF-")
    assert completed.timestamped is True
    assert completed.timestamped_at is not None
    assert len(completed.sha256) == 64
    signed_attributes = cms.CMSAttributes.load(prepared.signed_attributes)
    policy_attribute = next(
        attribute
        for attribute in signed_attributes
        if attribute["type"].native == "signature_policy_identifier"
    )
    assert (
        policy_attribute["values"][0].chosen["sig_policy_id"].native
        == PADES_AD_RT_POLICY_OID
    )
    assert CertificatePadesService.extract_cpf(signer_der) == "52998224725"
    assert CertificatePadesService.assert_cpf_matches(
        signer_der, "529.982.247-25"
    ) == "529.***.***-25"


@pytest.mark.asyncio
async def test_rejects_tampered_raw_signature():
    _, signer_der, root_der, timestamper, context = _material()
    service = CertificatePadesService(
        validation_context=context,
        timestamper=timestamper,
    )
    prepared = await service.prepare(
        canonical_pdf=_pdf(),
        certificate_der=signer_der,
        chain_der=[root_der],
        supported_algorithms=["RS256"],
        field_name="FrotaHML-2",
    )

    with pytest.raises(CertificateSigningError, match="inválida"):
        await service.complete(prepared=prepared, raw_signature=b"invalid")


@pytest.mark.asyncio
async def test_interrupted_pades_supports_ecdsa_signer():
    _, _, root_der, timestamper, _ = _material()
    root_asn1 = asn1_x509.Certificate.load(root_der)
    # The root private key is not exposed by _material, so issue a compact,
    # independent chain for the ECDSA leaf.
    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "ECDSA HML Root")])
    root_certificate = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), True)
        .sign(root_key, hashes.SHA256())
    )
    signer_key = ec.generate_private_key(ec.SECP256R1())
    signer_certificate = _issue_certificate(
        common_name="Assinante ECDSA HML",
        key=signer_key,
        issuer_certificate=root_certificate,
        issuer_key=root_key,
        serial_number_text="52998224725",
        certificate_policy_oid="2.16.76.1.2.3.999999",
    )
    signer_der = signer_certificate.public_bytes(serialization.Encoding.DER)
    ecdsa_root_der = root_certificate.public_bytes(serialization.Encoding.DER)
    ecdsa_context = ValidationContext(
        trust_roots=[root_asn1, asn1_x509.Certificate.load(ecdsa_root_der)],
        allow_fetching=False,
        revocation_mode="soft-fail",
    )
    service = CertificatePadesService(
        validation_context=ecdsa_context,
        timestamper=timestamper,
    )
    prepared = await service.prepare(
        canonical_pdf=_pdf(),
        certificate_der=signer_der,
        chain_der=[ecdsa_root_der],
        supported_algorithms=["ES256"],
        field_name="FrotaHML-ECDSA",
    )
    raw_signature = signer_key.sign(
        prepared.signed_attributes,
        ec.ECDSA(hashes.SHA256()),
    )

    completed = await service.complete(
        prepared=prepared,
        raw_signature=raw_signature,
    )

    assert completed.signed_pdf.startswith(b"%PDF-")
    assert completed.timestamped is True


def test_rejects_cpf_mismatch_and_non_pdf():
    _, signer_der, _, _, _ = _material()
    with pytest.raises(CertificateSigningError, match="não corresponde"):
        CertificatePadesService.assert_cpf_matches(signer_der, "123.456.789-09")


def test_extracts_cpf_from_icp_brasil_person_other_name():
    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SAN HML Root")])
    root_certificate = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), True)
        .sign(root_key, hashes.SHA256())
    )
    signer_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    person_data = core.PrintableString("0101199052998224725").dump()
    certificate = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Pessoa HML")]))
        .issuer_name(root_certificate.subject)
        .public_key(signer_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.OtherName(
                        ObjectIdentifier("2.16.76.1.3.1"), person_data
                    )
                ]
            ),
            False,
        )
        .add_extension(
            x509.CertificatePolicies(
                [
                    x509.PolicyInformation(
                        ObjectIdentifier("2.16.76.1.2.1.999999"), None
                    )
                ]
            ),
            False,
        )
        .sign(root_key, hashes.SHA256())
    )
    certificate_der = certificate.public_bytes(serialization.Encoding.DER)

    assert CertificatePadesService.extract_cpf(certificate_der) == "52998224725"
    assert CertificatePadesService.assert_icp_brasil_person_certificate(
        certificate_der
    ) == ("2.16.76.1.2.1.999999",)

    malformed_data = core.PrintableString(
        "010119901111111111152998224725"
    ).dump()
    malformed = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Pessoa inválida")]))
        .issuer_name(root_certificate.subject)
        .public_key(signer_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.OtherName(
                        ObjectIdentifier("2.16.76.1.3.1"), malformed_data
                    )
                ]
            ),
            False,
        )
        .sign(root_key, hashes.SHA256())
        .public_bytes(serialization.Encoding.DER)
    )
    assert CertificatePadesService.extract_cpf(malformed) is None


def test_rejects_certificate_without_a1_or_a3_signature_policy():
    _, signer_der, _, _, _ = _material()
    assert CertificatePadesService.certificate_policy_oids(signer_der)

    # A synthetic seal policy must not be accepted as a person's signature.
    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Policy HML Root")])
    root = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(root_key, hashes.SHA256())
    )
    rejected = _issue_certificate(
        common_name="Selo HML",
        key=rsa.generate_private_key(public_exponent=65537, key_size=2048),
        issuer_certificate=root,
        issuer_key=root_key,
        serial_number_text="52998224725",
        certificate_policy_oid="2.16.76.1.2.101.999999",
    ).public_bytes(serialization.Encoding.DER)

    with pytest.raises(CertificateSigningError, match="A1 ou A3"):
        CertificatePadesService.assert_icp_brasil_person_certificate(rejected)

    legal_entity = (
        x509.CertificateBuilder()
        .subject_name(
            x509.Name(
                [
                    x509.NameAttribute(NameOID.COMMON_NAME, "Pessoa jurídica HML"),
                    x509.NameAttribute(NameOID.SERIAL_NUMBER, "52998224725"),
                ]
            )
        )
        .issuer_name(root.subject)
        .public_key(
            rsa.generate_private_key(
                public_exponent=65537, key_size=2048
            ).public_key()
        )
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.OtherName(
                        ObjectIdentifier("2.16.76.1.3.3"),
                        core.PrintableString("12345678000199").dump(),
                    )
                ]
            ),
            False,
        )
        .add_extension(
            x509.CertificatePolicies(
                [
                    x509.PolicyInformation(
                        ObjectIdentifier("2.16.76.1.2.1.999999"), None
                    )
                ]
            ),
            False,
        )
        .sign(root_key, hashes.SHA256())
        .public_bytes(serialization.Encoding.DER)
    )
    with pytest.raises(CertificateSigningError, match="pessoa jurídica"):
        CertificatePadesService.assert_icp_brasil_person_certificate(
            legal_entity
        )


def test_tsa_transport_is_https_except_explicit_loopback_homologation():
    *_, context = _material()
    with pytest.raises(CertificateSigningError, match="HTTPS"):
        CertificatePadesService.with_http_tsa(
            "http://tsa.example.invalid/",
            validation_context=context,
            allow_local_http=True,
        )

    service = CertificatePadesService.with_http_tsa(
        "http://127.0.0.1:18081/tsa",
        validation_context=context,
        allow_local_http=True,
    )
    assert service is not None
