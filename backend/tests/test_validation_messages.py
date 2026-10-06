import json
from uuid import uuid4

import pytest
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.main import validation_exception_handler
from app.schemas.user import UserCreate


@pytest.mark.asyncio
async def test_user_validation_explains_fields_without_exposing_input():
    with pytest.raises(ValidationError) as caught:
        UserCreate(name="A", email="invalid-email", cpf="52998224724",
                   password="secret", organization_id=uuid4())
    errors = [dict(error, loc=("body", *error["loc"])) for error in caught.value.errors()]
    response = await validation_exception_handler(
        Request({"type": "http"}), RequestValidationError(errors)
    )
    payload = json.loads(response.body)
    messages = {error["loc"][-1]: error["msg"] for error in payload["detail"]}
    assert response.status_code == 422
    assert "11 números" in messages["cpf"]
    assert "nome@dominio" in messages["email"]
    assert "2 caracteres" in messages["name"]
    assert "8 caracteres" in messages["password"]
    assert "52998224724" not in response.body.decode()
    assert "secret" not in response.body.decode()
    assert all(set(error) == {"loc", "msg", "type"} for error in payload["detail"])


@pytest.mark.asyncio
async def test_required_fields_and_unknown_errors_are_safe():
    response = await validation_exception_handler(Request({"type": "http"}), RequestValidationError([
        {"loc": ("body", "organization_id"), "type": "missing"},
        {"loc": ("body", "unknown"), "type": "value_error", "msg": "private internals"},
    ]))
    payload = json.loads(response.body)
    assert payload["detail"][0]["msg"] == "Secretaria: preenchimento obrigatório."
    assert "private internals" not in response.body.decode()
