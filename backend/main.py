"""FastAPI application factory — wires middleware, exception handlers, and routes.

Usage (via uvicorn)::

    uvicorn main:app --host 0.0.0.0 --port 8000

Or via the CLI::

    python cli.py serve
"""

import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_ORIGINS

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hr_profile_matcher")

app = FastAPI(
    title="HR Profile Matcher",
    description="AI-powered candidate matching — parses job descriptions, scrapes LinkedIn, "
    "and semantically ranks candidates against your hiring criteria.",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """Return structured JSON for known HTTP errors."""
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    """Return validation error details as JSON."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    """Catch-all — logs the error and returns a generic 500 response."""
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Unexpected server error"},
    )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

from api.routes import router

app.include_router(router)
