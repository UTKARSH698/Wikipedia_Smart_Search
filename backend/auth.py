"""
JWT authentication utilities.

Flow:
  POST /auth/register  →  create user, return JWT
  POST /auth/login     →  verify password, return JWT
  Any protected route  →  Bearer token in Authorization header

Token payload: { "sub": str(user_id), "username": str, "exp": int }
"""

from __future__ import annotations

import os
import secrets
import time
from typing import Optional

import jwt
from passlib.context import CryptContext

# No literal fallback: a hardcoded default would let anyone who reads this file
# forge a token for any user. Unset means a throwaway per-process secret, so
# tokens simply do not survive a restart.
JWT_SECRET    = os.getenv("JWT_SECRET") or secrets.token_urlsafe(32)
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "24"))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_token(user_id: int, username: str) -> str:
    payload = {
        "sub":      str(user_id),
        "username": username,
        "exp":      int(time.time()) + JWT_TTL_HOURS * 3600,
        "iat":      int(time.time()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Return payload dict or None if token is invalid/expired."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
