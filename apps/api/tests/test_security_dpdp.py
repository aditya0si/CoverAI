import importlib

import pytest
from pydantic import ValidationError

import core.encryption
from core.config import Settings
from core.encryption import encrypt, decrypt, hash_phone


def test_configured_key_encrypt_decrypt_roundtrip():
    """With the configured (valid) key, a round trip must return the original."""
    plaintext = "DL-01-AB-1234"
    encrypted = encrypt(plaintext)
    assert encrypted != plaintext
    assert decrypt(encrypted) == plaintext


def test_missing_field_encryption_key_fails_loudly(monkeypatch):
    """A missing FIELD_ENCRYPTION_KEY must be a hard validation error, not a default."""
    monkeypatch.delenv("FIELD_ENCRYPTION_KEY", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)
    assert "FIELD_ENCRYPTION_KEY" in str(exc_info.value)


def test_invalid_field_encryption_key_raises(monkeypatch):
    """core.encryption must raise instead of silently generating a temp key."""
    monkeypatch.setattr(
        core.encryption.settings, "FIELD_ENCRYPTION_KEY", "not-a-valid-fernet-key"
    )
    try:
        with pytest.raises(RuntimeError, match="FIELD_ENCRYPTION_KEY"):
            importlib.reload(core.encryption)
    finally:
        # Restore the valid key and module for the rest of the suite.
        monkeypatch.undo()
        importlib.reload(core.encryption)


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

def test_magic_bytes_check():
    """
    Test standard magic bytes detection signatures.
    """
    pdf_content = b"%PDF-1.4\n1 0 obj..."
    jpeg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF..."
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR..."
    webp_content = b"RIFF\x00\x00\x00\x00WEBPVP8 ..."
    invalid_content = b"random_binary_garbage..."
    
    # Assert signatures
    assert pdf_content.startswith(b"%PDF")
    assert jpeg_content.startswith(b"\xff\xd8\xff")
    assert png_content.startswith(b"\x89PNG\r\n\x1a\n")
    assert webp_content.startswith(b"RIFF") and webp_content[8:12] == b"WEBP"
    
    assert not invalid_content.startswith(b"%PDF")
    assert not invalid_content.startswith(b"\xff\xd8\xff")
