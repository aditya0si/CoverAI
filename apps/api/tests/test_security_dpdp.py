import pytest
from core.encryption import encrypt, decrypt, hash_phone

def test_field_encryption_decryption():
    """
    Test that symmetric at-rest encryption and decryption works correctly.
    Encrypted value should be different from plaintext, and decryption should return original value.
    """
    plaintext = "+91 98765 43210"
    
    # Encrypt
    encrypted = encrypt(plaintext)
    assert encrypted != plaintext
    assert len(encrypted) > len(plaintext)
    
    # Decrypt
    decrypted = decrypt(encrypted)
    assert decrypted == plaintext

def test_field_decryption_fallback():
    """
    Test that decryption falls back gracefully to raw values if the data was not encrypted
    (ensures complete backwards compatibility with pre-encryption data).
    """
    raw_unencrypted = "MH-12-QN-4920"
    decrypted = decrypt(raw_unencrypted)
    assert decrypted == raw_unencrypted

def test_phone_hashing_normalization():
    """
    Test that phone hashing correctly normalizes whitespace and non-digits
    so that matching hashes are generated for identical phone numbers.
    """
    phone1 = "+91 98765 43210"
    phone2 = "9876543210"
    
    hash1 = hash_phone(phone1)
    hash2 = hash_phone(phone2)
    
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 hex digest length
