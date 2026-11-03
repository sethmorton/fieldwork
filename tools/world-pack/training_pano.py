"""Canonical Google Street View identity. Photospheres are not training material."""
import re


def official_id(value):
    if not isinstance(value, str):
        return None
    if re.fullmatch(r'[0-9a-fA-F]{44}', value):
        try:
            value = bytes.fromhex(value).decode('ascii')
        except (UnicodeDecodeError, ValueError):
            return None
    return value if re.fullmatch(r'[A-Za-z0-9_-]{22}', value) else None
