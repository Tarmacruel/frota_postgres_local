from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

AlertStatus = Literal['NEW', 'IN_REVIEW', 'RESOLVED', 'IGNORED']
AlertRule = Literal['capacity', 'odometer', 'close', 'consumption', 'price']
AlertSeverity = Literal['LOW', 'MEDIUM', 'HIGH']


class AlertStatusChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['IN_REVIEW', 'RESOLVED', 'IGNORED']
    reason: str | None = Field(default=None, max_length=2000)

    @field_validator('reason')
    @classmethod
    def normalize_reason(cls, value):
        if value is None:
            return None
        return ' '.join(value.split()) or None
