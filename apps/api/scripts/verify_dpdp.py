import os
import sys

# Mount the parent apps/api folder onto python's import path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

from core.encryption import encrypt, decrypt, hash_phone

def test_dpdp():
    print("==================================================")
    print("   CoverAI DPDP Verification Script               ")
    print("==================================================")
    
    # 1. Test Field Encryption/Decryption
    phone = "+91 98765 43210"
    encrypted = encrypt(phone)
    decrypted = decrypt(encrypted)
    
    print(f"Plaintext Phone:  {phone}")
    print(f"Encrypted Cipher: {encrypted[:30]}...")
    print(f"Decrypted Phone:  {decrypted}")
    
    assert decrypted == phone, "Decryption does not match original plaintext!"
    print("✔ Field Encryption & Decryption: PASSED")
    
    # 2. Test Fallback
    legacy = "MH-12-QN-4920"
    dec_legacy = decrypt(legacy)
    assert dec_legacy == legacy, "Decryption fallback failed!"
    print("✔ Decryption Backwards Fallback: PASSED")
    
    # 3. Test Phone Hashing
    hash1 = hash_phone("+91 98765 43210")
    hash2 = hash_phone("9876543210")
    print(f"Hash 1: {hash1}")
    print(f"Hash 2: {hash2}")
    assert hash1 == hash2, "Normalizing phone hashes do not match!"
    print("✔ Secure SHA-256 Hashing: PASSED")
    
    print("==================================================")
    print("   ALL VERIFICATIONS PASSED SUCCESSFULLY!         ")
    print("==================================================")

if __name__ == "__main__":
    test_dpdp()
