"""Public validation messages without echoing submitted data or exceptions."""

FIELD_LABELS = {
    "name": "Nome completo", "email": "E-mail", "cpf": "CPF",
    "password": "Senha", "organization_id": "Secretaria", "role": "Perfil",
    "matricula": "Matrícula",
}


def validation_message(error: dict) -> str:
    location = error.get("loc", ())
    field = location[-1] if location else None
    label = FIELD_LABELS.get(field, "Campo informado")
    kind = error.get("type", "")
    context = error.get("ctx") or {}
    if kind == "missing":
        return f"{label}: preenchimento obrigatório."
    if kind in {"string_too_short", "string_too_long"}:
        key = "min_length" if kind == "string_too_short" else "max_length"
        limit = context.get(key)
        if isinstance(limit, int):
            direction = "no mínimo" if key == "min_length" else "no máximo"
            return f"{label}: informe {direction} {limit} caracteres."
    if field == "cpf":
        return "CPF inválido. Confira os 11 números, incluindo os dois dígitos finais, com o documento do titular."
    if field == "matricula":
        return "Matrícula: preenchimento obrigatório. Informe a matrícula do condutor."
    if field == "email":
        return "E-mail inválido. Informe o endereço no formato nome@dominio, sem espaços."
    if field == "organization_id":
        return "Secretaria inválida. Selecione uma secretaria da lista."
    if field == "role":
        return "Perfil inválido. Selecione um dos perfis disponíveis."
    if kind in {"int_parsing", "int_type"}:
        return f"{label}: informe um número inteiro."
    if kind in {"float_parsing", "float_type", "decimal_parsing"}:
        return f"{label}: informe um número válido."
    return f"{label}: valor inválido. Revise o preenchimento e tente novamente."
