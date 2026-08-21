from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from core.config import settings

# Detect if using Supabase pooler (port 6542/6543) or direct connection
# Supabase pooler requires pool_size=1, max_overflow=0 (transaction mode)
# Direct connections can use larger pools
_is_supabase_pooler = ":654" in settings.DATABASE_URL

# Setup the async engine.
# Ensure that the DATABASE_URL uses the asyncpg driver (e.g. postgresql+asyncpg://...)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_size=1 if _is_supabase_pooler else 20,
    max_overflow=0 if _is_supabase_pooler else 10,
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=300,    # Recycle connections every 5 minutes
)

# Create an async session factory
SessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

# Modern declarative base for SQLAlchemy 2.0+
class Base(DeclarativeBase):
    pass

# FastAPI dependency for getting DB sessions
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
