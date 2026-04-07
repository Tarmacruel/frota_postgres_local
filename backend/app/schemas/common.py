from __future__ import annotations


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not email or " " in email or email.count("@") != 1:
        raise ValueError("Informe um e-mail valido")

    local_part, domain = email.split("@", 1)
    if not local_part or not domain or domain.startswith(".") or domain.endswith("."):
        raise ValueError("Informe um e-mail valido")

    return email
