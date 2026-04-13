from __future__ import annotations

import threading
import time
from collections import defaultdict
from fastapi import HTTPException, status


class LoginSecurityService:
    USER_WINDOW_SECONDS = 15 * 60
    USER_MAX_ATTEMPTS = 5
    USER_LOCK_SECONDS = 15 * 60

    IP_WINDOW_SECONDS = 5 * 60
    IP_MAX_ATTEMPTS = 30
    IP_LOCK_SECONDS = 10 * 60

    IP_RATE_WINDOW_SECONDS = 60
    IP_RATE_MAX_REQUESTS = 120

    _lock = threading.Lock()
    _user_attempts: dict[str, list[float]] = defaultdict(list)
    _user_blocked_until: dict[str, float] = {}

    _ip_attempts: dict[str, list[float]] = defaultdict(list)
    _ip_blocked_until: dict[str, float] = {}

    _ip_request_hits: dict[str, list[float]] = defaultdict(list)

    @classmethod
    def _prune(cls, values: list[float], *, now: float, window: int) -> None:
        while values and now - values[0] > window:
            values.pop(0)

    @classmethod
    def enforce_request_rate(cls, *, ip_address: str) -> None:
        now = time.time()
        with cls._lock:
            hits = cls._ip_request_hits[ip_address]
            cls._prune(hits, now=now, window=cls.IP_RATE_WINDOW_SECONDS)
            if len(hits) >= cls.IP_RATE_MAX_REQUESTS:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Muitas requisicoes de login deste IP. Tente novamente em instantes.",
                )
            hits.append(now)

    @classmethod
    def enforce_login_allowed(cls, *, ip_address: str, email: str) -> None:
        now = time.time()
        with cls._lock:
            ip_until = cls._ip_blocked_until.get(ip_address)
            if ip_until and ip_until > now:
                wait_seconds = int(ip_until - now)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"IP temporariamente bloqueado por excesso de tentativas. Aguarde {wait_seconds}s.",
                )

            user_until = cls._user_blocked_until.get(email)
            if user_until and user_until > now:
                wait_seconds = int(user_until - now)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Conta temporariamente bloqueada por seguranca. Aguarde {wait_seconds}s.",
                )

    @classmethod
    def register_failure(cls, *, ip_address: str, email: str) -> None:
        now = time.time()
        with cls._lock:
            user_fails = cls._user_attempts[email]
            cls._prune(user_fails, now=now, window=cls.USER_WINDOW_SECONDS)
            user_fails.append(now)
            if len(user_fails) >= cls.USER_MAX_ATTEMPTS:
                cls._user_blocked_until[email] = now + cls.USER_LOCK_SECONDS
                cls._user_attempts[email] = []

            ip_fails = cls._ip_attempts[ip_address]
            cls._prune(ip_fails, now=now, window=cls.IP_WINDOW_SECONDS)
            ip_fails.append(now)
            if len(ip_fails) >= cls.IP_MAX_ATTEMPTS:
                cls._ip_blocked_until[ip_address] = now + cls.IP_LOCK_SECONDS
                cls._ip_attempts[ip_address] = []

    @classmethod
    def register_success(cls, *, ip_address: str, email: str) -> None:
        with cls._lock:
            cls._user_attempts.pop(email, None)
            cls._user_blocked_until.pop(email, None)
