from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PLATFORM_NAME: str = "Los Angeles"
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@db:5432/platform"
    SECRET_KEY: str = "change-me-in-env"
    # "development" enables /docs + localhost CORS. Anything else = hardened.
    ENVIRONMENT: str = "production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"
    CORS_ORIGINS: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"
    COINGECKO_API_URL: str = "https://api.coingecko.com/api/v3"
    # Email — Brevo REST API preferred; SMTP kept as fallback
    BREVO_API_KEY: str = ""
    MAIL_FROM: str = ""
    MAIL_FROM_NAME: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT.lower() in ("dev", "development", "local")


settings = Settings()
