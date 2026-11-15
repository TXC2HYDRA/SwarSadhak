import os, tempfile
from uuid import uuid4

# Must run before any app module reads DATABASE_URL.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")

import pytest
from fastapi.testclient import TestClient
from app.accounts import create_user
from app.db import connect
from app.main import app
from app.security import issue_token


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture
def make_user():
    """Create a user with the given roles; returns (user, auth headers)."""
    def make(*roles, password="password123"):
        with connect() as c:
            user = create_user(c, f"{'-'.join(roles)}-{uuid4().hex[:8]}", "Test User", password, roles)
        return user, {"Authorization": "Bearer " + issue_token(user["id"], 0)}
    return make
