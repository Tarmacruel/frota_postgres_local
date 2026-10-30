import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.core.settings_catalog import DEFAULT_SETTINGS, FORM_FIELDS, ICON_KEYS, NAVIGATION, merged_settings


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Identity(StrictModel):
    municipality: str = Field(min_length=3, max_length=180)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(default='BA', pattern=r'^[A-Z]{2}$')
    systemName: str = Field(min_length=2, max_length=60)
    subtitle: str = Field(max_length=180)
    administrationSecretariat: str = Field(max_length=180)
    fleetDepartment: str = Field(max_length=120)
    logoPath: str = Field(max_length=180)
    addressLine: str = Field(max_length=250)
    cnpj: str = Field(max_length=30)

    @model_validator(mode='after')
    def safe_logo(self):
        if self.logoPath != '/brasao-pmtf.png' and not re.fullmatch(r'/api/system-settings/logo/[a-f0-9]{32}\.png', self.logoPath):
            raise ValueError('Envie a logo pelo botão de upload e selecione uma imagem válida.')
        if any('<' in value or '>' in value or any(ord(char) < 32 for char in value)
               for key, value in self.model_dump().items() if key != 'logoPath'):
            raise ValueError('Informe a identidade em texto simples, sem marcação ou caracteres de controle.')
        return self


class Appearance(StrictModel):
    primary: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    sidebar: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    density: Literal['comfortable', 'compact'] = 'comfortable'


class CustomField(StrictModel):
    key: str = Field(pattern=r'^[a-z][a-z0-9_]{1,39}$')
    label: str = Field(min_length=2, max_length=80)
    type: Literal['text', 'number', 'date', 'boolean'] = 'text'
    required: bool = False
    active: bool = True


class FieldRule(StrictModel):
    label: str = Field(min_length=1, max_length=80)
    visible: bool = True
    required: bool = False


class FormConfiguration(StrictModel):
    fields: dict[str, FieldRule] = Field(default_factory=dict)
    custom: list[CustomField] = Field(default_factory=list, max_length=20)


class SettingsValues(StrictModel):
    identity: Identity
    appearance: Appearance
    icons: dict[str, str] = Field(default_factory=dict)
    forms: dict[str, FormConfiguration] = Field(default_factory=dict)

    @model_validator(mode='after')
    def allowed_choices(self):
        if any(key not in NAVIGATION or value not in ICON_KEYS for key, value in self.icons.items()):
            raise ValueError('Selecione um ícone do catálogo para cada módulo.')
        for module, form in self.forms.items():
            if module not in FORM_FIELDS:
                raise ValueError('Formulário desconhecido.')
            allowed = {key: required for key, _, required in FORM_FIELDS[module]}
            for key, rule in form.fields.items():
                if key not in allowed:
                    raise ValueError('Campo desconhecido. Utilize um campo adicional.')
                if allowed[key] and (not rule.visible or not rule.required):
                    raise ValueError(f'O campo {key} identifica o registro e precisa permanecer visível e obrigatório.')
                if module == 'vehicle_loans' and key == 'delivery_condition' and not rule.visible:
                    raise ValueError('Condições de entrega precisa permanecer visível para permitir o envio do empréstimo.')
            keys = [field.key for field in form.custom]
            if len(keys) != len(set(keys)) or set(keys) & set(allowed):
                raise ValueError('Cada campo adicional precisa de um código único.')
        return self


class SettingsUpdate(StrictModel):
    expected_revision: int = Field(ge=0)
    values: SettingsValues
    justification: str = Field(min_length=8, max_length=1000)


class RecordAction(StrictModel):
    expected_revision: int = Field(ge=0)
    expected_updated_at: str | None = None
    justification: str = Field(min_length=8, max_length=1000)
    changes: dict = Field(default_factory=dict)
    custom_fields: dict = Field(default_factory=dict)
    inactive: bool | None = None
    confirmation: str | None = None
    effect_action: Literal['none', 'reverse', 'restore'] = 'none'
    expected_effect_token: str | None = None
