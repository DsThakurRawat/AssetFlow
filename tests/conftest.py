import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from server.app.main import app
from server.app.core.database import get_db
from server.app.core.dependencies import get_current_user

@pytest.fixture
def db_mock():
    """
    Creates a mock connection and cursor to simulate database interactions.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    
    # Wire the connection context manager to return the mock cursor
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    
    return mock_conn, mock_cur

@pytest.fixture
def client(db_mock):
    """
    FastAPI TestClient with overridden get_db dependency.
    """
    mock_conn, _ = db_mock
    
    def override_get_db():
        yield mock_conn
        
    app.dependency_overrides[get_db] = override_get_db
    
    # Yield client and reset overrides after test
    with TestClient(app) as test_client:
        yield test_client
    
    app.dependency_overrides.clear()
