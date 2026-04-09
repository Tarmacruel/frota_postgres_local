from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.schemas.search import SearchResultOut
from app.services.search_service import SearchService

router = APIRouter(prefix="/api/search", tags=["Search"])


@router.get("", response_model=list[SearchResultOut], dependencies=[Depends(get_current_user)])
async def global_search(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=12, ge=1, le=20),
    db: AsyncSession = Depends(get_db_session),
):
    return await SearchService(db).search(q=q, limit=limit)
