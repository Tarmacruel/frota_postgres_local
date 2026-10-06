"""Fixed templates and personal usage. Never commits an operation on its own."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from app.api.deps import require_permission
from app.models.justification_suggestion import JustificationSuggestion as Suggestion

PRESETS = json.loads((Path(__file__).resolve().parents[1] / "core/justification_presets.json").read_text(encoding="utf-8"))
# Served through the authenticated API; a single versioned catalogue.
CONTEXTS = {
    "fuel_supply": ("fuel_supplies", "edit", 10, 1000, True),
    "possession": ("possession", "edit", 8, 500, True),
    "vehicle_edit": ("vehicles", "edit", 8, 500, False),
    "possession_replace": ("possession", "create", 8, 1000, True),
    "possession_return": ("possession", "edit", 8, 1000, True),
    "trip_cancel": ("possession", "edit", 8, 1000, True),
    "order_cancel": ("fuel_supply_orders", "edit", 1, 500, False),
    "order_reopen": ("fuel_supply_orders", "edit", 10, 1000, True),
    "order_extend": ("fuel_supply_orders", "edit", 10, 1000, True),
    "claim_close": ("claims", "write", 1, 1000, False),
    "payment_delete": ("payment_processes", "delete", 8, 500, False),
    "loan_create": ("vehicle_loans", "create", 8, 1000, False),
    "loan_proposal": ("vehicle_loans", "edit", 8, 1000, False),
    "loan_regularization": ("vehicle_loans", "create", 15, 1000, True),
    **{f"loan_{action}": ("vehicle_loans", "edit", 8, 1000, False)
       for action in ("submit", "accept", "reject", "cancel", "request-return", "accept-return", "reject-return", "cancel-return")},
}


async def authorize(db, user, context):
    config = CONTEXTS.get(context)
    if config is None:
        raise HTTPException(422, "Finalidade de justificativa desconhecida")
    module, action, _, _, writer = config
    role = getattr(user.role, "value", user.role)
    if writer and role not in {"ADMIN", "PRODUCAO"}:
        raise HTTPException(403, "Permissão insuficiente")
    if context == "loan_regularization" and role != "ADMIN":
        raise HTTPException(403, "Acesso restrito a administradores")
    if action == "write":
        try:
            await require_permission(module, "edit")(db=db, current_user=user)
        except HTTPException as exc:
            if exc.status_code != 403:
                raise
            await require_permission(module, "create")(db=db, current_user=user)
    else:
        await require_permission(module, action)(db=db, current_user=user)


def normalize(value):
    return " ".join(value.split()) if isinstance(value, str) else ""


def ranked(user_id, context):
    return select(Suggestion).where(Suggestion.user_id == user_id, Suggestion.context == context).order_by(
        Suggestion.use_count.desc(), Suggestion.last_used_at.desc(), Suggestion.id.asc())


async def lock_context(db, user_id, context):
    # Serializes upsert/pruning/forget for this account and purpose, including first use.
    # A transaction lock avoids the race where two new texts both see 49 rows.
    if db.get_bind().dialect.name == "postgresql":
        key = int.from_bytes(hashlib.sha256(f"{user_id}:{context}".encode()).digest()[:8], "big", signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


async def remember(db, user_id, context, value):
    cleaned = normalize(value)
    _, _, minimum, maximum, _ = CONTEXTS[context]
    if not cleaned or not minimum <= len(value.strip()) <= maximum:
        return
    await lock_context(db, user_id, context)
    statement = insert(Suggestion).values(id=uuid4(), user_id=user_id, context=context,
        text=value.strip(), normalized_key=hashlib.sha256(cleaned.lower().encode()).hexdigest(),
        use_count=1, last_used_at=datetime.now(timezone.utc))
    statement = statement.on_conflict_do_update(index_elements=[Suggestion.user_id, Suggestion.context, Suggestion.normalized_key],
        set_={"text": statement.excluded.text, "use_count": Suggestion.use_count + 1, "last_used_at": statement.excluded.last_used_at})
    await db.execute(statement)
    obsolete = ranked(user_id, context).with_only_columns(Suggestion.id).offset(50)
    await db.execute(delete(Suggestion).where(Suggestion.id.in_(obsolete)).execution_options(synchronize_session=False))


async def list_suggestions(db, user, context):
    await authorize(db, user, context)
    rows = (await db.scalars(ranked(user.id, context))).all()
    return {"presets": PRESETS[context], "history": [
        {"id": row.id, "text": row.text, "count": row.use_count, "lastUsed": row.last_used_at} for row in rows]}


async def forget(db, user, suggestion_id):
    row = await db.scalar(select(Suggestion).where(Suggestion.id == suggestion_id, Suggestion.user_id == user.id))
    if row is None:
        raise HTTPException(404, "Sugestão não encontrada")
    await authorize(db, user, row.context)
    await lock_context(db, user.id, row.context)
    await db.execute(delete(Suggestion).where(Suggestion.id == suggestion_id, Suggestion.user_id == user.id))
    await db.commit()
