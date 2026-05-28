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
    
    # DPDP Field encryption
    FIELD_ENCRYPTION_KEY: str = "T-Bf6tYh6Xw46U_ZtZ-0X1UjWvTjQk-mUf0Vw1Z4X4o="
    
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

settings = Settings()
