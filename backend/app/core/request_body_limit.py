from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any


class RequestBodyTooLarge(Exception):
    """Raised before request parsers can spool an oversized body."""


class RequestBodyLimitMiddleware:
    def __init__(self, app, *, max_body_bytes: int):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        content_length = self._content_length(scope)
        if content_length is not None and content_length > self.max_body_bytes:
            await self._send_too_large(scope, send)
            return

        received_bytes = 0
        limit_exceeded = False
        replacement_sent = False
        response_started = False

        async def limited_receive() -> dict[str, Any]:
            nonlocal limit_exceeded, received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    limit_exceeded = True
                    raise RequestBodyTooLarge
            return message

        async def limited_send(message: dict[str, Any]) -> None:
            nonlocal replacement_sent, response_started
            if not limit_exceeded:
                if message.get("type") == "http.response.start":
                    response_started = True
                await send(message)
                return

            # Starlette converts errors raised while parsing multipart bodies to
            # a generic 400 response. Replace that response with the real limit.
            if not replacement_sent and message.get("type") == "http.response.start":
                await self._send_too_large(scope, send)
                replacement_sent = True

        try:
            await self.app(scope, limited_receive, limited_send)
        except RequestBodyTooLarge:
            if response_started:
                raise
            if not replacement_sent:
                await self._send_too_large(scope, send)

    @staticmethod
    def _content_length(scope: dict[str, Any]) -> int | None:
        for name, value in scope.get("headers", []):
            if name.lower() != b"content-length":
                continue
            try:
                parsed = int(value)
            except (TypeError, ValueError):
                return None
            return parsed if parsed >= 0 else None
        return None

    @staticmethod
    async def _send_too_large(
        scope: dict[str, Any],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        content: dict[str, Any] = {
            "detail": "Corpo da requisição excede o limite permitido",
            "code": "REQUEST_BODY_TOO_LARGE",
        }
        request_context = scope.get("state", {}).get("audit_context")
        request_id = getattr(request_context, "request_id", None)
        if request_id:
            content["request_id"] = request_id
        body = json.dumps(content, ensure_ascii=False).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json; charset=utf-8"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
