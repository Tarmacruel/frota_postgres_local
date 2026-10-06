from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user_ready
from app.db.session import get_db_session
from app.models.user import User
from app.services import justification_suggestions as suggestions

router = APIRouter(prefix="/api/justification-suggestions", tags=["JustificationSuggestions"])


@router.get("")
async def list_suggestions(response: Response, context: str = Query(..., max_length=64),
                           db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user_ready)):
    response.headers["Cache-Control"] = "private, no-store"
    return await suggestions.list_suggestions(db, user, context)


@router.delete("/{suggestion_id}", status_code=204)
async def forget_suggestion(suggestion_id: UUID, db: AsyncSession = Depends(get_db_session),
                            user: User = Depends(get_current_user_ready)):
    await suggestions.forget(db, user, suggestion_id)
    return Response(status_code=204, headers={"Cache-Control": "private, no-store"})
