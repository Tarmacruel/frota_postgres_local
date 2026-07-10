from __future__ import annotations

import hashlib


def only_cpf_digits(value: str | None) -> str:
    return "".join(character for character in str(value or "") if character.isdigit())


def normalize_cpf(value: str | None) -> str:
    digits = only_cpf_digits(value)
    if len(digits) != 11:
        raise ValueError("CPF deve conter 11 digitos")
    if len(set(digits)) == 1:
        raise ValueError("CPF invalido")

    numbers = [int(character) for character in digits]
    first_check = sum(numbers[index] * (10 - index) for index in range(9))
    first_digit = (first_check * 10 % 11) % 10
    second_check = sum(numbers[index] * (11 - index) for index in range(10))
    second_digit = (second_check * 10 % 11) % 10

    if numbers[9] != first_digit or numbers[10] != second_digit:
        raise ValueError("CPF invalido")
    return digits


def mask_cpf(value: str | None) -> str | None:
    if not value:
        return None
    digits = only_cpf_digits(value)
    if len(digits) != 11:
        return None
    return f"{digits[:3]}.***.***-{digits[-2:]}"


def hash_cpf(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(normalize_cpf(value).encode("utf-8")).hexdigest()
