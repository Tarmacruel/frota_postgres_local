import os
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Force a hermetic application configuration before importing ``app.main``.
# An explicit TEST_DATABASE_URL may point at a disposable PostgreSQL database;
# production values from backend/.env must never leak into the test process.
os.environ["APP_ENV"] = "testing"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "sqlite+aiosqlite:///./test.db",
)
os.environ["SECRET_KEY"] = "testsecret"
os.environ["CORS_ORIGINS"] = '["http://test", "http://localhost:8000"]'
os.environ["CSRF_TRUSTED_ORIGINS"] = '["http://localhost:8000"]'
os.environ["TRUSTED_HOSTS"] = '["test", "localhost", "127.0.0.1"]'

from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
