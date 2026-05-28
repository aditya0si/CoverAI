from sqlalchemy.types import TypeDecorator, String
from core.encryption import encrypt, decrypt

class EncryptedString(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that automatically encrypts string fields
    on write and decrypts them on read.
    """
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt(str(value))
