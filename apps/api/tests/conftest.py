import os, tempfile
from uuid import uuid4

# Must run before any app module reads DATABASE_URL.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
# Never reach real file storage from tests, even if apps/api/.env has R2 credentials.
for name in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"): os.environ[name] = ""
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STORAGE_DIR"] = os.path.join(tempfile.mkdtemp(), "storage")

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


@pytest.fixture
def academy(client, make_user):
    """Owner-side helpers: create a course with teachers and enroll students through the API."""
    _, owner_headers = make_user("owner")
    class Academy:
        headers = owner_headers
        def course(self, name, *teachers):
            course = client.post("/api/owner/courses", json={"name": f"{name} {uuid4().hex[:6]}"}, headers=owner_headers).json()
            client.put(f"/api/owner/courses/{course['id']}/teachers", json={"teacher_ids": [t["id"] for t in teachers]}, headers=owner_headers)
            return course
        def enroll(self, student, course, teacher):
            response = client.post("/api/owner/enrollments", json={"student_id": student["id"], "course_id": course["id"], "teacher_id": teacher["id"]}, headers=owner_headers)
            assert response.status_code == 201, response.text
            return response.json()
    return Academy()
