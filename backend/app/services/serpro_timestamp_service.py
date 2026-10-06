from __future__ import annotations

import asyncio
import math
import time
from urllib.parse import urlsplit

import httpx
from asn1crypto import tsp
from pyhanko.sign.timestamps import HTTPTimeStamper, TimestampRequestError


SERPRO_TOKEN_URL = "https://gateway.apiserpro.serpro.gov.br/token"
SERPRO_TIMESTAMP_URL = (
    "https://gateway.apiserpro.serpro.gov.br/apitimestamp/v1/stamps-asn1"
)


class SerproTimestampService(HTTPTimeStamper):
    """OAuth2 client-credentials adapter for the SERPRO timestamp authority.

    Credentials and access tokens stay in memory. The only injectable transport
    is ``httpx.MockTransport``, used by unit tests without weakening the fixed
    production endpoints.
    """

    MAX_TOKEN_RESPONSE_BYTES = 64 * 1024
    MAX_TIMESTAMP_QUERY_BYTES = 1024 * 1024
    MAX_TIMESTAMP_REPLY_BYTES = 4 * 1024 * 1024
    MAX_ACCESS_TOKEN_CHARS = 8192
    TOKEN_EXPIRY_SKEW_SECONDS = 30.0

    def __init__(
        self,
        *,
        consumer_key: str,
        consumer_secret: str,
        timeout_seconds: float = 10.0,
        token_url: str = SERPRO_TOKEN_URL,
        timestamp_url: str = SERPRO_TIMESTAMP_URL,
        test_transport: httpx.MockTransport | None = None,
    ) -> None:
        self._require_official_endpoint(
            token_url,
            expected=SERPRO_TOKEN_URL,
            label="token",
        )
        self._require_official_endpoint(
            timestamp_url,
            expected=SERPRO_TIMESTAMP_URL,
            label="timestamp",
        )
        self._validate_credential(consumer_key, label="consumer key", forbid_colon=True)
        self._validate_credential(consumer_secret, label="consumer secret")
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)):
            raise TypeError("SERPRO timeout must be numeric")
        timeout_value = float(timeout_seconds)
        if not math.isfinite(timeout_value) or not 0.5 <= timeout_value <= 60.0:
            raise ValueError("SERPRO timeout must be between 0.5 and 60 seconds")
        if test_transport is not None and not isinstance(test_transport, httpx.MockTransport):
            raise TypeError("Only httpx.MockTransport may be injected")

        super().__init__(timestamp_url, https=True, timeout=timeout_value)
        self._token_url = token_url
        self._consumer_key = consumer_key
        self._consumer_secret = consumer_secret
        self._access_token: str | None = None
        self._access_token_expires_at = 0.0
        self._token_lock = asyncio.Lock()
        self._client = httpx.AsyncClient(
            transport=test_transport,
            timeout=httpx.Timeout(
                timeout_value,
                connect=timeout_value,
                read=timeout_value,
                write=timeout_value,
                pool=timeout_value,
            ),
            limits=httpx.Limits(
                max_connections=4,
                max_keepalive_connections=2,
                keepalive_expiry=30.0,
            ),
            follow_redirects=False,
            trust_env=False,
        )

    async def __aenter__(self) -> SerproTimestampService:
        return self

    async def __aexit__(self, *_args) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def async_request_tsa_response(
        self,
        req: tsp.TimeStampReq,
    ) -> tsp.TimeStampResp:
        request_der = req.dump()
        if not request_der or len(request_der) > self.MAX_TIMESTAMP_QUERY_BYTES:
            raise TimestampRequestError("Timestamp query size is invalid.")

        token = await self._get_access_token()
        response = await self._post_timestamp(request_der, token)
        if response.status_code == 401:
            await self._discard_access_token(token)
            token = await self._get_access_token()
            response = await self._post_timestamp(request_der, token)

        if response.status_code != 200:
            raise TimestampRequestError(
                f"SERPRO timestamp request failed with HTTP {response.status_code}."
            )
        if self._media_type(response) != "application/timestamp-reply":
            raise TimestampRequestError("SERPRO timestamp response media type is invalid.")
        response_der = response.content
        if not response_der or len(response_der) > self.MAX_TIMESTAMP_REPLY_BYTES:
            raise TimestampRequestError("SERPRO timestamp response size is invalid.")

        try:
            timestamp_response = tsp.TimeStampResp.load(response_der, strict=True)
            timestamp_response["status"]["status"].native
            if timestamp_response.dump() != response_der:
                raise ValueError("Timestamp response is not canonical DER")
        except (KeyError, TypeError, ValueError) as exc:
            raise TimestampRequestError(
                "SERPRO timestamp response is not valid DER."
            ) from exc
        return timestamp_response

    async def _get_access_token(self) -> str:
        now = time.monotonic()
        if self._access_token and now < self._access_token_expires_at:
            return self._access_token

        async with self._token_lock:
            now = time.monotonic()
            if self._access_token and now < self._access_token_expires_at:
                return self._access_token
            token, ttl_seconds = await self._request_access_token()
            skew = min(self.TOKEN_EXPIRY_SKEW_SECONDS, max(1.0, ttl_seconds * 0.1))
            self._access_token = token
            self._access_token_expires_at = time.monotonic() + max(
                0.0,
                ttl_seconds - skew,
            )
            return token

    async def _request_access_token(self) -> tuple[str, float]:
        try:
            response = await self._client.post(
                self._token_url,
                data={"grant_type": "client_credentials"},
                auth=httpx.BasicAuth(self._consumer_key, self._consumer_secret),
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise TimestampRequestError(
                "Could not communicate with SERPRO OAuth2 token endpoint."
            ) from exc

        if response.status_code != 200:
            raise TimestampRequestError(
                f"SERPRO OAuth2 token request failed with HTTP {response.status_code}."
            )
        if not response.content or len(response.content) > self.MAX_TOKEN_RESPONSE_BYTES:
            raise TimestampRequestError("SERPRO OAuth2 token response size is invalid.")
        try:
            payload = response.json()
        except ValueError as exc:
            raise TimestampRequestError("SERPRO OAuth2 token response is invalid.") from exc
        if not isinstance(payload, dict):
            raise TimestampRequestError("SERPRO OAuth2 token response is invalid.")

        token = payload.get("access_token")
        if (
            not isinstance(token, str)
            or not token
            or len(token) > self.MAX_ACCESS_TOKEN_CHARS
            or any(character.isspace() for character in token)
        ):
            raise TimestampRequestError("SERPRO OAuth2 access token is invalid.")
        token_type = payload.get("token_type")
        if token_type is not None and (
            not isinstance(token_type, str) or token_type.casefold() != "bearer"
        ):
            raise TimestampRequestError("SERPRO OAuth2 token type is invalid.")

        expires_in = payload.get("expires_in")
        if isinstance(expires_in, bool):
            raise TimestampRequestError("SERPRO OAuth2 token expiration is invalid.")
        try:
            ttl_seconds = float(expires_in)
        except (TypeError, ValueError) as exc:
            raise TimestampRequestError(
                "SERPRO OAuth2 token expiration is invalid."
            ) from exc
        if not math.isfinite(ttl_seconds) or ttl_seconds <= 0:
            raise TimestampRequestError("SERPRO OAuth2 token expiration is invalid.")
        return token, ttl_seconds

    async def _post_timestamp(
        self,
        request_der: bytes,
        access_token: str,
    ) -> httpx.Response:
        try:
            return await self._client.post(
                self.url,
                content=request_der,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/timestamp-query",
                    "Accept": "application/timestamp-reply",
                },
            )
        except httpx.HTTPError as exc:
            raise TimestampRequestError(
                "Could not communicate with SERPRO timestamp endpoint."
            ) from exc

    async def _discard_access_token(self, rejected_token: str) -> None:
        async with self._token_lock:
            if self._access_token == rejected_token:
                self._access_token = None
                self._access_token_expires_at = 0.0

    @staticmethod
    def _media_type(response: httpx.Response) -> str:
        return response.headers.get("Content-Type", "").partition(";")[0].strip().lower()

    @staticmethod
    def _require_official_endpoint(actual: str, *, expected: str, label: str) -> None:
        if actual != expected:
            raise ValueError(f"SERPRO {label} endpoint must match the official URL")
        parsed = urlsplit(actual)
        if (
            parsed.scheme != "https"
            or parsed.hostname != "gateway.apiserpro.serpro.gov.br"
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(f"SERPRO {label} endpoint must be an exact HTTPS URL")

    @staticmethod
    def _validate_credential(
        value: str,
        *,
        label: str,
        forbid_colon: bool = False,
    ) -> None:
        if (
            not isinstance(value, str)
            or not value
            or len(value) > 4096
            or "\r" in value
            or "\n" in value
            or (forbid_colon and ":" in value)
        ):
            raise ValueError(f"SERPRO {label} is invalid")


SerproOAuth2TimeStamper = SerproTimestampService

__all__ = [
    "SERPRO_TIMESTAMP_URL",
    "SERPRO_TOKEN_URL",
    "SerproOAuth2TimeStamper",
    "SerproTimestampService",
]
