import os
import hashlib
from cryptography.fernet import Fernet

# Field encryption key should be a base64-encoded 32-byte key.
# We will check the environment directly first, then fall back to a standard dev key if not set.
FIELD_ENCRYPTION_KEY = os.getenv(
    "FIELD_ENCRYPTION_KEY", 
    "T-Bf6tYh6Xw46U_ZtZ-0X1UjWvTjQk-mUf0Vw1Z4X4o="
)

try:
    _fernet = Fernet(FIELD_ENCRYPTION_KEY.encode())
except Exception:
    # If the key is invalid or not base64, generate a temporary one for safety
    import base64
    temp_key = base64.urlsafe_b64encode(hashlib.sha256(FIELD_ENCRYPTION_KEY.encode()).digest())
    _fernet = Fernet(temp_key)

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
