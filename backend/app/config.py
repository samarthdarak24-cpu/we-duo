"""Environment-specific configuration. No secret is hardcoded."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# backend/app/config.py
# parents[0]=app, [1]=backend, [2]=repository root
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_FILE = REPO_ROOT / ".data" / "trustdrive.db"
DEFAULT_UPLOAD_DIR = REPO_ROOT / ".data" / "uploads"
DEFAULT_CHECKPOINT_DB = REPO_ROOT / ".data" / "langgraph-checkpoints.db"
DEFAULT_MODEL_DIR = REPO_ROOT / "services" / "ai" / "shared" / "models"


def _abs(value: str, default: Path) -> Path:
    """Resolve a relative env path against the repository root."""
    path = Path(value)
    return path if path.is_absolute() else (REPO_ROOT / path)


def _db_url() -> str:
    raw = os.getenv("TD_DB_URL")
    return raw or f"sqlite+pysqlite:///{DEFAULT_DB_FILE.as_posix()}"


def _parse_env(path: Path) -> dict[str, str]:
    """Dependency-free `.env` parser used when python-dotenv is unavailable."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def _load_dotenv() -> dict[str, str]:
    """Load repo-root env files for every entrypoint (uvicorn, worker, scripts).

    `python-dotenv` is used when installed; a dependency-free parser is the
    fallback so a minimal install still boots. `.env.local` (Next.js's local
    override file) wins over `.env`, and real process env always wins over both.

    SEC-001 integration fix: the Next.js frontend keeps `JWT_SECRET` (and its
    `TD_*` data paths) ONLY in `frontend/.env.local` -- the backend's root
    `.env`/`.env.local` do not define `JWT_SECRET`. Without scanning that file
    the backend fell back to the `.data/jwt-secret` file and rejected every
    token the frontend minted (401 on all user-authenticated routes). We now
    also load `frontend/.env.local` so both runtimes share one signing secret.
    It is placed LAST so the root files still win for keys they define; only
    `JWT_SECRET` (absent from the root files) is newly contributed.
    """
    paths = (REPO_ROOT / ".env", REPO_ROOT / ".env.local",
             REPO_ROOT / "frontend" / ".env.local")
    merged: dict[str, str] = {}
    try:
        from dotenv import dotenv_values  # type: ignore
        for path in paths:
            if path.is_file():
                merged.update({k: v for k, v in dotenv_values(path).items()
                               if k and v is not None})
    except ImportError:
        for path in paths:
            merged.update(_parse_env(path))
    for key, value in merged.items():
        os.environ.setdefault(key, value)
    return merged


LOADED_ENV_KEYS = tuple(sorted(_load_dotenv()))


@dataclass(frozen=True)
class Settings:
    # One shared DB: local default is the SQLite file the Next.js app owns.
    db_url: str = _db_url()
    upload_dir: Path = _abs(os.getenv("TD_UPLOAD_DIR", ".data/uploads"), DEFAULT_UPLOAD_DIR)
    broker_url: str | None = os.getenv("TD_BROKER_URL")
    service_token: str | None = os.getenv("TD_SERVICE_TOKEN")
    llm_provider: str = os.getenv("TD_LLM_PROVIDER", "none")
    llm_base_url: str | None = os.getenv("TD_LLM_BASE_URL")
    llm_api_key: str | None = os.getenv("TD_LLM_API_KEY")
    llm_model: str = os.getenv("TD_LLM_MODEL", "gpt-4o-mini")
    # A cold transformers load costs minutes; warming at boot keeps the first
    # investigation off the request path. Set to 0 where that RAM is unavailable.
    llm_warm_start: bool = os.getenv("TD_LLM_WARM_START", "1").strip().lower() not in ("0", "false", "no")
    s3_bucket: str | None = os.getenv("TD_S3_BUCKET")
    log_level: str = os.getenv("TD_LOG_LEVEL", "INFO")
    environment: str = os.getenv("TD_ENV", "local")
    job_max_attempts: int = int(os.getenv("TD_JOB_MAX_ATTEMPTS", "3"))
    job_timeout_seconds: int = int(os.getenv("TD_JOB_TIMEOUT_SECONDS", "120"))
    poll_interval_seconds: float = float(os.getenv("TD_WORKER_POLL_SECONDS", "2"))
    model_dir: Path = _abs(os.getenv("TD_MODEL_DIR", "services/ai/shared/models"), DEFAULT_MODEL_DIR)
    # Durable LangGraph checkpoints. `sqlite` is used when
    # langgraph-checkpoint-sqlite is installed; otherwise the investigator
    # reports the in-memory fallback honestly. `memory` forces the old behaviour.
    checkpoint_backend: str = os.getenv("TD_CHECKPOINT_BACKEND", "sqlite").strip().lower()
    checkpoint_db: Path = _abs(
        os.getenv("TD_CHECKPOINT_DB", ".data/langgraph-checkpoints.db"), DEFAULT_CHECKPOINT_DB
    )

    @property
    def local_sqlite(self) -> bool:
        return self.db_url.startswith("sqlite")


settings = Settings()
