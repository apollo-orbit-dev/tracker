from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SESSION_SECRET = "dev-secret-do-not-use-in-prod"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+psycopg://tracker:changeme@localhost:5432/tracker",
        alias="DATABASE_URL",
    )
    test_database_url: str = Field(
        default="postgresql+psycopg://tracker:changeme@localhost:5432/tracker_test",
        alias="TEST_DATABASE_URL",
    )
    session_secret: str = Field(
        default=DEV_SESSION_SECRET,
        alias="SESSION_SECRET",
    )
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    allowed_origins: str = Field(
        default="http://localhost:5181",
        alias="ALLOWED_ORIGINS",
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [
            o.strip().rstrip("/")
            for o in self.allowed_origins.split(",")
            if o.strip()
        ]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @model_validator(mode="after")
    def _refuse_default_secret_in_production(self) -> "Settings":
        if self.is_production and self.session_secret == DEV_SESSION_SECRET:
            raise ValueError(
                "SESSION_SECRET must be set to a non-default value when "
                "APP_ENV=production"
            )
        return self


settings = Settings()
