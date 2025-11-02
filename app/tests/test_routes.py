import pytest
from app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_index_page(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"AI Document Search" in resp.data
