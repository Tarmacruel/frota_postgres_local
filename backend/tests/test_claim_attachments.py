from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi import FastAPI, File, HTTPException, UploadFile
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.request_body_limit import RequestBodyLimitMiddleware
from app.main import app
import app.services.claim_service as claim_service_module
from app.services.claim_service import ClaimService


class TrackedUpload:
    def __init__(self, content: bytes, *, filename: str, content_type: str):
        self._content = content
        self.filename = filename
        self.content_type = content_type
        self.closed = False
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if size < 0:
            return self._content
        return self._content[:size]

    async def close(self) -> None:
        self.closed = True


def _docx_bytes(*, include_document: bool = True) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        if include_document:
            archive.writestr("word/document.xml", "<document />")
    return buffer.getvalue()


@pytest.mark.parametrize(
    ("content", "mime_type"),
    [
        (b"\xff\xd8\xff\xe0photo", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\nphoto", "image/png"),
        (b"RIFF\x04\x00\x00\x00WEBPdata", "image/webp"),
        (b"%PDF-1.7\nbody", "application/pdf"),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1document", "application/msword"),
        (_docx_bytes(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ],
)
def test_content_matches_all_allowed_mime_signatures(content: bytes, mime_type: str):
    assert ClaimService._content_matches_mime(content, mime_type) is True


@pytest.mark.parametrize(
    ("content", "mime_type"),
    [
        (b"GIF89a", "image/jpeg"),
        (b"not-a-png", "image/png"),
        (b"RIFF\x04\x00\x00\x00WAVEdata", "image/webp"),
        (b"plain text", "application/pdf"),
        (b"plain text", "application/msword"),
        (_docx_bytes(include_document=False), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        (b"anything", "application/octet-stream"),
    ],
)
def test_content_rejects_false_or_unsupported_mime_signatures(content: bytes, mime_type: str):
    assert ClaimService._content_matches_mime(content, mime_type) is False


@pytest.mark.asyncio
async def test_attachment_validation_normalizes_mime_builds_metadata_and_closes_upload():
    content = b"%PDF-1.7\nclaim evidence"
    upload = TrackedUpload(
        content,
        filename=r"C:\fakepath\BO:2026?.exe",
        content_type="Application/PDF; charset=binary",
    )

    payloads = await ClaimService(None)._read_and_validate_attachments([upload], current_count=0)

    assert payloads == [
        {
            "content": content,
            "mime_type": "application/pdf",
            "filename": "BO_2026.pdf",
            "size_bytes": len(content),
            "sha256": sha256(content).hexdigest(),
        }
    ]
    assert upload.read_sizes == [claim_service_module.MAX_DOCUMENT_SIZE_BYTES + 1]
    assert upload.closed is True


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type", ["", "application/octet-stream", "image/jpg"])
async def test_attachment_validation_accepts_safe_mime_fallbacks(content_type: str):
    upload = TrackedUpload(
        b"\xff\xd8\xff\xe0photo",
        filename="avaria.jpg",
        content_type=content_type,
    )

    payloads = await ClaimService(None)._read_and_validate_attachments([upload], current_count=0)

    assert payloads[0]["mime_type"] == "image/jpeg"
    assert upload.closed is True


@pytest.mark.asyncio
async def test_attachment_validation_rejects_false_declared_mime_and_closes_every_upload():
    invalid = TrackedUpload(b"GIF89a", filename="fake.jpg", content_type="image/jpeg")
    unread = TrackedUpload(b"%PDF-1.7", filename="later.pdf", content_type="application/pdf")

    with pytest.raises(HTTPException) as exc_info:
        await ClaimService(None)._read_and_validate_attachments([invalid, unread], current_count=0)

    assert exc_info.value.status_code == 400
    assert invalid.closed is True
    assert unread.closed is True
    assert unread.read_sizes == []


@pytest.mark.asyncio
async def test_attachment_validation_rejects_empty_file_and_closes_upload():
    upload = TrackedUpload(b"", filename="empty.pdf", content_type="application/pdf")

    with pytest.raises(HTTPException) as exc_info:
        await ClaimService(None)._read_and_validate_attachments([upload], current_count=0)

    assert exc_info.value.status_code == 400
    assert "vazio" in str(exc_info.value.detail)
    assert upload.closed is True


@pytest.mark.asyncio
async def test_attachment_validation_enforces_individual_size_limit_and_closes_upload(monkeypatch):
    monkeypatch.setattr(claim_service_module, "MAX_IMAGE_SIZE_BYTES", 4)
    upload = TrackedUpload(b"\xff\xd8\xffAB", filename="large.jpg", content_type="image/jpeg")

    with pytest.raises(HTTPException) as exc_info:
        await ClaimService(None)._read_and_validate_attachments([upload], current_count=0)

    assert exc_info.value.status_code == 413
    assert upload.read_sizes == [5]
    assert upload.closed is True


@pytest.mark.asyncio
async def test_attachment_validation_enforces_total_quantity_and_closes_without_reading(monkeypatch):
    monkeypatch.setattr(claim_service_module, "MAX_CLAIM_ATTACHMENTS", 2)
    uploads = [
        TrackedUpload(b"%PDF-1.7", filename="one.pdf", content_type="application/pdf"),
        TrackedUpload(b"%PDF-1.7", filename="two.pdf", content_type="application/pdf"),
    ]

    with pytest.raises(HTTPException) as exc_info:
        await ClaimService(None)._read_and_validate_attachments(uploads, current_count=1)

    assert exc_info.value.status_code == 400
    assert all(upload.closed for upload in uploads)
    assert all(upload.read_sizes == [] for upload in uploads)


@pytest.mark.asyncio
async def test_attachment_validation_enforces_batch_size_and_closes_all_uploads(monkeypatch):
    monkeypatch.setattr(claim_service_module, "MAX_DOCUMENT_SIZE_BYTES", 20)
    monkeypatch.setattr(claim_service_module, "MAX_ATTACHMENT_BATCH_SIZE_BYTES", 12)
    uploads = [
        TrackedUpload(b"%PDF-1.7", filename="one.pdf", content_type="application/pdf"),
        TrackedUpload(b"%PDF-1.7", filename="two.pdf", content_type="application/pdf"),
    ]

    with pytest.raises(HTTPException) as exc_info:
        await ClaimService(None)._read_and_validate_attachments(uploads, current_count=0)

    assert exc_info.value.status_code == 413
    assert all(upload.closed for upload in uploads)


def test_attachment_filename_sanitization_strips_paths_and_enforces_safe_extension():
    service = ClaimService(None)

    assert service._sanitize_attachment_name(r"..\..\BO:2026?.exe", "application/pdf") == "BO_2026.pdf"
    assert service._sanitize_attachment_name(r"C:\fakepath\photo.jpeg", "image/jpeg") == "photo.jpeg"
    assert service._sanitize_attachment_name(". ", "application/pdf") == "anexo.pdf"

    long_name = service._sanitize_attachment_name(f"{'a' * 300}.txt", "application/pdf")
    assert len(long_name) == 180
    assert long_name.endswith(".pdf")
    assert "/" not in long_name
    assert "\\" not in long_name


def test_attachment_storage_paths_are_generated_inside_root_and_block_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_DIR", tmp_path)
    service = ClaimService(None)
    claim_id = uuid4()
    attachment_id = uuid4()

    relative_path, absolute_path = service._build_attachment_storage_paths(
        claim_id,
        attachment_id,
        "application/pdf",
    )

    assert relative_path == f"claim_attachments/{claim_id}/{attachment_id}.pdf"
    assert absolute_path == tmp_path / "claim_attachments" / str(claim_id) / f"{attachment_id}.pdf"
    assert service._resolve_storage_path(relative_path) == absolute_path.resolve()

    with pytest.raises(HTTPException) as parent_error:
        service._resolve_storage_path("claim_attachments/../../secret.pdf")
    assert parent_error.value.status_code == 404

    outside = (tmp_path.parent / "outside.pdf").resolve()
    with pytest.raises(HTTPException) as absolute_error:
        service._resolve_storage_path(str(outside))
    assert absolute_error.value.status_code == 404


def test_attachment_serialization_exposes_only_public_metadata():
    attachment_id = uuid4()
    created_at = datetime(2026, 7, 22, 12, 30, tzinfo=timezone.utc)
    attachment = SimpleNamespace(
        id=attachment_id,
        original_filename="photo.jpg",
        storage_path="claim_attachments/private/photo.jpg",
        mime_type="image/jpeg",
        size_bytes=1234,
        sha256="a" * 64,
        uploaded_by=uuid4(),
        created_at=created_at,
    )

    serialized = ClaimService._serialize_attachment(attachment)

    assert serialized == {
        "id": attachment_id,
        "filename": "photo.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 1234,
        "kind": "PHOTO",
        "created_at": created_at,
    }
    assert "storage_path" not in serialized
    assert "sha256" not in serialized
    assert "uploaded_by" not in serialized


def test_openapi_exposes_protected_claim_attachment_routes_and_multipart_contracts():
    paths = app.openapi()["paths"]

    assert "/api/claims/with-attachments" in paths
    assert "/api/claims/{claim_id}/with-attachments" in paths
    assert "/api/claims/{claim_id}/attachments" in paths
    assert "/api/claims/{claim_id}/attachments/{attachment_id}" in paths

    assert "multipart/form-data" in paths["/api/claims/with-attachments"]["post"]["requestBody"]["content"]
    assert "multipart/form-data" in paths["/api/claims/{claim_id}/with-attachments"]["put"]["requestBody"]["content"]
    assert "multipart/form-data" in paths["/api/claims/{claim_id}/attachments"]["post"]["requestBody"]["content"]
    assert {"get", "delete"}.issubset(paths["/api/claims/{claim_id}/attachments/{attachment_id}"])


@pytest.mark.asyncio
async def test_request_body_limit_stops_stream_without_content_length():
    sent_messages: list[dict] = []
    request_messages = iter(
        [
            {"type": "http.request", "body": b"1234", "more_body": True},
            {"type": "http.request", "body": b"5678", "more_body": False},
        ]
    )

    async def receive():
        return next(request_messages)

    async def send(message):
        sent_messages.append(message)

    async def consume_body(_scope, inner_receive, inner_send):
        while True:
            message = await inner_receive()
            if not message.get("more_body"):
                break
        await inner_send({"type": "http.response.start", "status": 204, "headers": []})
        await inner_send({"type": "http.response.body", "body": b""})

    middleware = RequestBodyLimitMiddleware(consume_body, max_body_bytes=6)
    await middleware(
        {"type": "http", "method": "POST", "headers": [], "state": {}},
        receive,
        send,
    )

    assert sent_messages[0]["status"] == 413
    assert b"REQUEST_BODY_TOO_LARGE" in sent_messages[1]["body"]


@pytest.mark.asyncio
async def test_request_body_limit_preserves_413_through_real_multipart_parser():
    test_app = FastAPI()
    test_app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=64)

    @test_app.post("/upload")
    async def upload_file(attachment: UploadFile = File(...)):
        return {"filename": attachment.filename}

    boundary = "claim-boundary"
    multipart_body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="attachment"; filename="evidence.pdf"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
        "%PDF-1.7 evidence\r\n"
        f"--{boundary}--\r\n"
    ).encode()

    async def stream_body():
        midpoint = len(multipart_body) // 2
        yield multipart_body[:midpoint]
        yield multipart_body[midpoint:]

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.post(
            "/upload",
            content=stream_body(),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    assert "content-length" not in response.request.headers
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_BODY_TOO_LARGE"
