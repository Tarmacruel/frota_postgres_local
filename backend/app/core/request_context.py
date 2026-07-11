from __future__ import annotations

import ipaddress
import re
from contextvars import ContextVar, Token
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Iterable
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Request

from app.core.config import settings


REQUEST_ID_HEADER = "X-Request-ID"
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$")
MAX_FORWARDED_HOPS = 20
MAX_PATH_LENGTH = 512


@dataclass(frozen=True, slots=True)
class RequestAuditContext:
    request_id: str
    ip_address: str
    user_agent: str
    method: str
    path: str
    timestamp: datetime

    def as_dict(self) -> dict[str, str]:
        data = asdict(self)
        data["timestamp"] = self.timestamp.isoformat()
        return data


_request_audit_context: ContextVar[RequestAuditContext | None] = ContextVar(
    "request_audit_context",
    default=None,
)


def normalize_request_id(value: str | None) -> str:
    candidate = (value or "").strip()
    if REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return str(uuid4())


def _parse_ip(value: str | None) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    if not value:
        return None
    candidate = value.strip()
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1 : candidate.index("]")]
    elif candidate.count(":") == 1 and "." in candidate:
        candidate = candidate.rsplit(":", 1)[0]
    try:
        return ipaddress.ip_address(candidate)
    except ValueError:
        return None


def _trusted_networks(values: Iterable[str]) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    networks = []
    for value in values:
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def _is_trusted_proxy(
    address: ipaddress.IPv4Address | ipaddress.IPv6Address,
    networks: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...],
) -> bool:
    return any(address.version == network.version and address in network for network in networks)


def resolve_client_ip(request: Request, trusted_proxy_networks: Iterable[str] | None = None) -> str:
    peer = _parse_ip(request.client.host if request.client else None)
    if peer is None:
        return "unknown"

    networks = _trusted_networks(
        settings.TRUSTED_PROXY_NETWORKS if trusted_proxy_networks is None else trusted_proxy_networks
    )
    if not networks or not _is_trusted_proxy(peer, networks):
        return peer.compressed

    forwarded = request.headers.get("X-Forwarded-For", "")
    hops = [_parse_ip(item) for item in forwarded.split(",")[:MAX_FORWARDED_HOPS]]
    valid_hops = [hop for hop in hops if hop is not None]
    if not valid_hops:
        return peer.compressed

    # Percorre da borda conhecida para o cliente e remove somente proxies confiaveis.
    for hop in reversed(valid_hops):
        if not _is_trusted_proxy(hop, networks):
            return hop.compressed
    return valid_hops[0].compressed


def _normalize_limited_text(value: str | None, limit: int) -> str:
    cleaned = "".join(character for character in (value or "") if character >= " " and character != "\x7f")
    return cleaned.strip()[:limit]


def build_request_audit_context(request: Request) -> RequestAuditContext:
    return RequestAuditContext(
        request_id=normalize_request_id(request.headers.get(REQUEST_ID_HEADER)),
        ip_address=resolve_client_ip(request),
        user_agent=_normalize_limited_text(request.headers.get("User-Agent"), settings.MAX_USER_AGENT_LENGTH),
        method=request.method.upper()[:10],
        path=_normalize_limited_text(request.url.path, MAX_PATH_LENGTH) or "/",
        timestamp=datetime.now(timezone.utc),
    )


def set_request_audit_context(context: RequestAuditContext) -> Token:
    return _request_audit_context.set(context)


def reset_request_audit_context(token: Token) -> None:
    _request_audit_context.reset(token)


def get_request_audit_context() -> RequestAuditContext | None:
    return _request_audit_context.get()


def is_allowed_request_origin(request: Request) -> bool:
    configured = settings.CSRF_TRUSTED_ORIGINS or settings.CORS_ORIGINS
    allowed = {_normalized_origin(value) for value in configured}
    allowed.discard(None)

    origin = request.headers.get("Origin")
    normalized = _normalized_origin(origin) if origin else _normalized_origin(request.headers.get("Referer"), allow_path=True)
    return normalized is not None and normalized in allowed


def _normalized_origin(value: str | None, *, allow_path: bool = False) -> str | None:
    if not value:
        return None
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        return None
    if not allow_path and (parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
