from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Menu AI"
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str
    AWS_S3_BUCKET: str

    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4.1"

    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str | None = None
    BEDROCK_MODEL: str | None = None

    MONGODB_URI: str
    DATABASE_NAME: str = "production"
    AWS_SQS_MENU_UPLOAD_QUEUE: str
    
    MAX_CONCURRENT_REQUESTS: int = 2

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()