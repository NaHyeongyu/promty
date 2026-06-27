from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.events import router as events_router
from app.api.projects import router as projects_router
from app.core.config import settings

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
app.include_router(projects_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
