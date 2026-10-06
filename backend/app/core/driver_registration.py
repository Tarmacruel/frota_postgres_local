from fastapi import HTTPException, status

from app.models.driver import Driver


def ensure_driver_registration(driver: Driver) -> None:
    if not (driver.matricula or "").strip():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Informe a matrícula no cadastro do condutor para prosseguir.",
        )
