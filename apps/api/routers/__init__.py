from .users import users_router
from .vehicles import vehicles_router
from .policies import policies_router
from .claims import claims_router
from .conversations import conversations_router
from .auth import auth_router
from .advisors import advisors_router
from .admin import admin_router
from .consent import consent_router

__all__ = [
    "users_router",
    "vehicles_router",
    "policies_router",
    "claims_router",
    "conversations_router",
    "auth_router",
    "advisors_router",
    "admin_router",
    "consent_router",
]
