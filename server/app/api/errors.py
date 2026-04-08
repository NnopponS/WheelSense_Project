"""Standardized API error helpers and exception handlers."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class APIError(BaseModel):
    code: str = Field(..., description="Machine-readable error code.")
    message: str = Field(..., description="Human-readable error description.")
    details: Any | None = Field(default=None, description="Optional structured error context.")


class APIErrorEnvelope(BaseModel):
    error: APIError


def build_error(
    *,
    code: str,
    message: str,
    details: Any | None = None,
) -> dict[str, Any]:
    payload = APIErrorEnvelope(error=APIError(code=code, message=message, details=details))
    return jsonable_encoder(
        payload.model_dump(exclude_none=True),
        custom_encoder={BaseException: str},
    )


def raise_api_error(
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=build_error(code=code, message=message, details=details),
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=build_error(
                code="validation_error",
                message="Request validation failed",
                details=exc.errors(),
            ),
        )

    @app.exception_handler(HTTPException)
    async def _http_exception_handler(
        _request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            content = exc.detail
        elif isinstance(exc.detail, str):
            content = build_error(code="http_error", message=exc.detail)
        else:
            content = build_error(code="http_error", message="Request failed", details=exc.detail)
        return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)
