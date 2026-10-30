from __future__ import annotations

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request
from app.core.database import AsyncSessionFactory
from app.core import record_visibility  # registers session policies


async def get_db_session(request: Request = None) -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        from app.services.system_settings_service import refresh_runtime
        session.info['presentation_read'] = bool(request and request.method in ('GET', 'HEAD'))
        session.info['request_path'] = request.url.path if request else ''
        await refresh_runtime(session)
        if request:
            from app.core.custom_fields import capture_submission
            await capture_submission(session, request)
        yield session
