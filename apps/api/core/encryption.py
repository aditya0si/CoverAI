import hashlib
from cryptography.fernet import Fernet

from core.config import settings

# Single source of truth for the field encryption key: core.config.settings.
# A missing or invalid key must fail loudly instead of silently generating a
# throwaway key (which would make encrypted data undecryptable across restarts).
try:
    _fernet = Fernet(settings.FIELD_ENCRYPTION_KEY.encode())
except Exception as exc:
    raise RuntimeError(
        "FIELD_ENCRYPTION_KEY is missing or is not a valid Fernet key. "
        "Generate one with: python -c "
        "\"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    ) from exc

def encrypt(val: str) -> str:
    """
    Encrypts a string value using Fernet symmetric encryption.
    """
    if not val:
        return val
    return _fernet.encrypt(val.encode()).decode()

def decrypt(val: str) -> str:
    """
    Decrypts a Fernet encrypted ciphertext. If decryption fails (e.g., if
    the field is stored as unencrypted legacy data), returns the raw value.
    """
    if not val:
        return val
    try:
        return _fernet.decrypt(val.encode()).decode()
    except Exception:
        # Fallback to returning the raw value to ensure backwards compatibility
        return val

def hash_phone(phone: str) -> str:
    """
    Hashes a phone number using SHA-256 to allow exact-match database queries
    for duplicate checking while the phone number itself is encrypted at rest.
    Normalizes by stripping non-digits and keeping only the last 10 digits (standard Indian mobile format).
    """
    if not phone:
        return ""
    # Normalize phone: strip spaces and non-digits
    normalized = "".join(c for c in phone if c.isdigit())
    # Keep the last 10 digits to resolve country code variations (+91, 0, etc.)
    if len(normalized) >= 10:
        normalized = normalized[-10:]
    return hashlib.sha256(normalized.encode()).hexdigest()
