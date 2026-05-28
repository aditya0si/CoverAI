import asyncio
from core.database import SessionLocal
import models
from sqlalchemy import delete

async def main():
    async with SessionLocal() as db:
        r = await db.execute(
            delete(models.User).where(
                models.User.email.in_(['qa@coverai.in', 'officer@coverai.in'])
            )
        )
        await db.commit()
        print(f'Deleted {r.rowcount} users')

asyncio.run(main())
