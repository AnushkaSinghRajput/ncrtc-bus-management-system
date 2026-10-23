from app.core.security import create_access_token, hash_password, safe_decode, verify_password


def test_password_hash_roundtrip():
    h = hash_password("password")
    assert h != "password"
    assert verify_password("password", h)
    assert not verify_password("nope", h)


def test_jwt_roundtrip():
    token = create_access_token("admin", {"role": "admin"})
    payload = safe_decode(token)
    assert payload["sub"] == "admin"
    assert payload["role"] == "admin"
