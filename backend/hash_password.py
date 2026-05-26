"""Generate an Argon2 hash for the ADMIN_PASSWORD_HASH env var.

Usage: python hash_password.py
"""
import getpass
from passlib.hash import argon2

pw = getpass.getpass("New password: ")
pw2 = getpass.getpass("Confirm: ")
if pw != pw2:
    print("Mismatch.")
    raise SystemExit(1)
print()
print("Set this in your .env or systemd unit:")
print(f"ADMIN_PASSWORD_HASH='{argon2.hash(pw)}'")
