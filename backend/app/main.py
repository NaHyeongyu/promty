from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.events import router as events_router
from app.api.memory import router as memory_router
from app.api.projects import router as projects_router
from app.core.config import settings
from app.core.encryption import EncryptionError

app = FastAPI(title="PromptHub API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["GET", "PATCH", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)
app.include_router(auth_router)
app.include_router(events_router)
app.include_router(memory_router)
# Community publishing routes are paused for now.
# from app.api.published_flows import router as published_flows_router
# app.include_router(published_flows_router)
app.include_router(projects_router)


@app.exception_handler(EncryptionError)
async def encryption_error_handler(
    _request: Request,
    exc: EncryptionError,
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exc)},
    )


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
