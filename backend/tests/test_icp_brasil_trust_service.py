from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app.services.certificate_pades_service import CertificateSigningError
from app.services.icp_brasil_trust_service import (
    CURRENT_ICP_BRASIL_ROOTS,
    IcpBrasilRootSpec,
    IcpBrasilTrustStore,
)


def test_current_trust_set_covers_active_general_purpose_roots():
    assert {item.filename for item in CURRENT_ICP_BRASIL_ROOTS} == {
        "ICP-Brasilv4.crt",
        "ICP-Brasilv5.crt",
        "ICP-Brasilv6.crt",
        "ICP-Brasilv7.crt",
        "ICP-Brasilv12.crt",
        "ICP-Brasilv13.crt",
    }
    assert all(len(item.sha256) == 64 for item in CURRENT_ICP_BRASIL_ROOTS)


def _root_payload(common_name: str) -> bytes:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    now = datetime.now(UTC)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), True)
        .sign(key, hashes.SHA256())
    )
    return certificate.public_bytes(serialization.Encoding.DER)


def test_loads_only_hash_pinned_self_signed_root(tmp_path):
    import hashlib

    payload = _root_payload("Raiz ICP HML")
    (tmp_path / "root.crt").write_bytes(payload)
    store = IcpBrasilTrustStore(
        tmp_path,
        expected_roots=(
            IcpBrasilRootSpec(
                "root.crt", hashlib.sha256(payload).hexdigest(), "Raiz ICP HML"
            ),
        ),
    )

    assert len(store.load()) == 1
    assert store.validation_context(allow_fetching=False, require_revocation=False)


def test_rejects_tampered_root(tmp_path):
    (tmp_path / "root.crt").write_bytes(_root_payload("Raiz ICP HML"))
    store = IcpBrasilTrustStore(
        tmp_path,
        expected_roots=(IcpBrasilRootSpec("root.crt", "0" * 64, "Raiz ICP HML"),),
    )

    with pytest.raises(CertificateSigningError, match="Hash inválido"):
        store.load()
