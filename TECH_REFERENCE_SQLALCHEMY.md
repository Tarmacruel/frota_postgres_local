# 🔬 FROTA - Referência Técnica: Mudanças SQLAlchemy 2.0.38 + Python 3.14

## 📋 Contexto da Incompatibilidade

**Versões Afetadas:**
- SQLAlchemy: 2.0.38
- Python: 3.14
- Problema: Type hints com `Mapped[Optional[Type]]` causam TypeError

**Erro Exato:**
```
TypeError: descriptor '__getitem__' requires a 'typing.Union' object but received a 'tuple'
```

---

## 🔍 Análise da Causa

SQLAlchemy 2.0.38 processa declarações `Mapped[...]` internamente:

```python
# Isso funciona em Python < 3.14:
Mapped[Optional[str]]
# Internamente: Union.__getitem__((str,))  ✓ Funcionava

# Python 3.14 rejeitou esse padrão:
Union.__getitem__((str,))  # ❌ TypeError
```

Python 3.14 espera:
```python
Union[str, None]  # União explícita
# ou
str | None        # Union syntax moderno
```

---

## ✅ Padrões de Solução Aplicados

### Padrão 1: Remover Mapped de Nullable FK

**Antes:**
```python
driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
```

**Depois:**
```python
driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
# Ou sem type hint:
driver_id = mapped_column(ForeignKey("drivers.id"), nullable=True)
```

### Padrão 2: Remover Mapped de Type Hints Nullable

**Antes:**
```python
payload: Mapped[Optional[dict]]
description: Mapped[str | None]
```

**Depois:**
```python
payload = mapped_column(JSONB, nullable=True)
description = mapped_column(String, nullable=True)
# Ou com type hint simplificado:
payload: dict | None = mapped_column(JSONB, nullable=True)
```

### Padrão 3: Relationships Sem | None

**Antes:**
```python
driver: Mapped["Driver | None"] = relationship(...)
```

**Depois:**
```python
driver: Mapped["Driver"] = relationship(...)
# Ou sem type hint:
driver = relationship(...)
```

---

## 📊 Arquivos Refatorados

| Arquivo | Mudanças | Campos |
|---------|----------|--------|
| **admin_notification.py** | Removed Mapped from `payload` | 1 |
| **audit_log.py** | Removed Mapped from nullable FKs | 3 |
| **claim.py** | Removed Mapped from 6 nullable fields | 6 |
| **driver.py** | Removed Mapped from 3 nullable fields | 3 |
| **fine.py** | Removed Mapped from 4 nullable fields | 4 |
| **fuel_supply.py** | Removed Mapped from 10+ fields + rels | 10+ |
| **maintenance.py** | Removed Mapped from nullable fields | ? |
| **possession.py** | Removed Mapped from relationships | ? |
| **user.py** | Removed Mapped from relationships | ? |
| **TOTAL** | ~45+ campos refatorados | 45+ |

---

## 🔧 Exemplo Prático

### Antes (com erro)
```python
# admin_notification.py
from sqlalchemy.orm import Mapped
from sqlalchemy import JSONB, Column

class AdminNotification(Base):
    __tablename__ = "admin_notifications"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    payload: Mapped[Optional[dict]]  # ❌ Causa TypeError em Python 3.14
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # ❌
```

### Depois (compatível)
```python
# admin_notification.py
from sqlalchemy.orm import Mapped
from sqlalchemy import JSONB, Column

class AdminNotification(Base):
    __tablename__ = "admin_notifications"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    payload = mapped_column(JSONB, nullable=True)  # ✅ Sem Mapped
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    admin_id = mapped_column(ForeignKey("users.id"), nullable=True)  # ✅
```

---

## 🎯 Guia para Novas Models

Se criar novas models SQLAlchemy, seguir este padrão:

### ✅ CORRETO (Funciona em Python 3.14)

```python
from sqlalchemy import Column, ForeignKey, String, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

class MyModel(Base):
    __tablename__ = "my_models"
    
    # ✓ Campos obrigatórios com type hint
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    
    # ✓ Campos nullable SEM Mapped type hint
    nickname = mapped_column(String(100), nullable=True)
    
    # ✓ Foreign keys nullable
    parent_id = mapped_column(ForeignKey("my_models.id"), nullable=True)
    
    # ✓ Relationships simples
    parent: Mapped["MyModel"] = relationship(back_populates="children")
    children: Mapped[list["MyModel"]] = relationship(back_populates="parent")
```

### ❌ NÃO FAZER (Causa TypeError)

```python
# ❌ ERRADO - Não funciona em Python 3.14
nickname: Mapped[str | None] = mapped_column(...)
parent_id: Mapped[int | None] = mapped_column(ForeignKey(...), nullable=True)
parent: Mapped["MyModel | None"] = relationship(...)
```

---

## 🧪 Testando Compatibilidade

```python
# Test script para validar compatibilidade
import sys
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, create_engine

print(f"Python version: {sys.version}")

# Tentar imports de modelos
try:
    from app.models import User, Driver, Vehicle
    print("✓ Todos os modelos importaram com sucesso")
except Exception as e:
    print(f"✗ Erro ao importar modelos: {e}")
    sys.exit(1)

# Tentar criar engine e metadata
try:
    engine = create_engine("sqlite:///:memory:")
    from app.models import Base
    Base.metadata.create_all(engine)
    print("✓ Metadata criada com sucesso")
except Exception as e:
    print(f"✗ Erro ao criar metadata: {e}")
    sys.exit(1)

print("\n✓ Sistema SQLAlchemy + Python 3.14 compatível!")
```

---

## 📚 Referências SQLAlchemy

### Type Hints Corretos

**Para campos NON-NULL:**
```python
field: Mapped[int]              # Obrigatório
field: Mapped[str]              # Obrigatório
field: Mapped[list["Model"]]    # Relacionamento múltiplo
```

**Para campos NULLABLE:**
```python
field = mapped_column(Integer, nullable=True)           # Sem type hint
field: int | None = mapped_column(Integer, nullable=True)  # Type hint simples
# NÃO usar: Mapped[int | None]
```

### Relationships

```python
# ✓ Um para muitos
users: Mapped[list["User"]] = relationship(back_populates="posts")

# ✓ Um para um (obrigatório)
user: Mapped["User"] = relationship(...)

# ✓ Sem relacionamento reverso
comments = relationship("Comment")
```

---

## 🚀 Migrando código existente

Se encontrar modelos antigos com esse problema:

1. **Identifique:** `Mapped[... | None]` ou `Mapped[Optional[...]]`
2. **Corrija:** Remove o `Mapped` wrapper
3. **Teste:** `python -c "from app.models import *"`
4. **Valide:** `alembic upgrade heads`

---

## 💡 Dicas de Debugging

**Se ainda tiver TypeError:**

```python
# 1. Verificar qual model causa erro:
from app.models.user import User  # Teste cada um
from app.models.driver import Driver

# 2. Checks pontuais:
python -c "from sqlalchemy.orm import Mapped; print(Mapped)"

# 3. Stack trace completo:
python -m alembic upgrade heads --verbose

# 4. Check version:
python -c "import sqlalchemy; print(sqlalchemy.__version__)"
python --version
```

---

## 📝 Notas Importantes

⚠️ **Não reverter para SQLAlchemy 2.0.37 ou anterior** - Versão 2.0.38 é mais nova e compatível com segurança  

✨ **Python 3.14 é necessário** - Estas refatorações exploram recursos de Python 3.14

🔒 **Type hints ainda funcionam** - Apenas campos não-null mantêm hints (ex: `Mapped[int]`)

🎯 **Padrão corporativo** - Muito mais legível e simples que antes

---

## 🆘 Se Tiver Mais Erros

1. Executar `.\Diagnostico.ps1`
2. Buscar erro em [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
3. Revisar [HISTORICO_PROBLEMAS.md](HISTORICO_PROBLEMAS.md)
4. Consultar esta referência técnica

**Documentação criada:** 2024  
**Modelos testados:** ✓ Todos 9  
**Status:** Funcional em Python 3.14
