import os
from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine the environment dynamically, defaulting to 'development'
env_name = os.getenv("ENV", "development")

# Build prioritized order of config files
env_files = (
    f".env.{env_name}",
    f"../../.env.{env_name}",
    ".env",
    "../../.env"
)

class Settings(BaseSettings):
    PROJECT_NAME: str = "CoverAI API"
    API_V1_STR: str = "/api/v1"
    
    # Environment status
    ENV: str = "development"
    DEBUG: bool = True
    
    # Required Environment Variables
    DATABASE_URL: str
    REDIS_URL: str
    GEMINI_API_KEY: str
    JWT_SECRET: str
    ALLOWED_ORIGINS: Union[str, List[str]] = "http://localhost:3000"
    STORAGE_BUCKET: str
    STORAGE_BACKEND: str = "local"

    # Google OAuth (optional — set to enable Google Sign-In)
    GOOGLE_CLIENT_ID: Optional[str] = None
    
    # DPDP Field encryption — required, must be a valid Fernet key.
    # Missing values fail loudly at import time rather than silently using a
    # public development key.
    FIELD_ENCRYPTION_KEY: str
    
    model_config = SettingsConfigDict(
        env_file=env_files,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """Accept the plain postgres/``postgresql://`` URL that managed hosts inject.

        Render, Railway and Heroku hand out a psycopg2-style URL, and
        ``create_async_engine`` refuses it because its dialect has no async driver.
        Rewriting the scheme here means the app *and* Alembic (which reads the same
        setting) both get a URL that works, instead of failing at first connect.
        """
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

settings = Settings()
