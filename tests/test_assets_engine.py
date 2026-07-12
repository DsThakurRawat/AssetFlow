import pytest
from datetime import datetime, date, timezone, timedelta
from unittest.mock import MagicMock
from psycopg.errors import UniqueViolation, ExclusionViolation
from fastapi import status
from server.app.core.dependencies import get_current_user
from server.app.schemas import AssetCondition, AssetStatus, MaintStatus

# =============================================================================
# Auth Overrides Helper
# =============================================================================
def set_auth(client, role="admin", user_id=1, name="Test User"):
    from server.app.main import app
    app.dependency_overrides[get_current_user] = lambda: {
        "id": user_id,
        "name": name,
        "email": f"{role}@test.com",
        "role": role,
        "department_id": 1,
        "is_active": True
    }

# =============================================================================
# Assets Tests
# =============================================================================
def test_get_assets(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee")

    # Set mock response
    mock_cur.fetchall.return_value = [
        {
            "id": 1, "tag": "AF-0001", "name": "Laptop", "serial_number": "SN123",
            "category_id": 1, "cost": 1000.0, "acquisition_date": date(2026, 1, 1),
            "condition": "good", "location": "HQ", "photo_url": None,
            "is_bookable": False, "status": "available", "created_at": datetime.now(timezone.utc),
            "category_name": "IT", "current_holder_name": None, "current_holder_type": None
        }
    ]

    response = client.get("/api/assets?search=Laptop&category=1")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Laptop"

def test_create_asset_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "admin")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        # RETURNING id, tag, name, status, etc.
        {
            "id": 10, "tag": "AF-0010", "name": "New Monitor", "serial_number": "MON55",
            "category_id": 2, "cost": 300.0, "acquisition_date": "2026-07-12",
            "condition": "new", "location": "Room A", "photo_url": None,
            "is_bookable": False, "status": "available", "created_at": now_time
        },
        # Fetched asset with category_name
        {
            "id": 10, "tag": "AF-0010", "name": "New Monitor", "serial_number": "MON55",
            "category_id": 2, "cost": 300.0, "acquisition_date": "2026-07-12",
            "condition": "new", "location": "Room A", "photo_url": None,
            "is_bookable": False, "status": "available", "created_at": now_time,
            "category_name": "Electronics", "current_holder_name": None, "current_holder_type": None
        }
    ]

    payload = {
        "name": "New Monitor",
        "serial_number": "MON55",
        "category_id": 2,
        "cost": 300.0,
        "acquisition_date": "2026-07-12",
        "condition": "new",
        "location": "Room A",
        "is_bookable": False
    }

    response = client.post("/api/assets", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["tag"] == "AF-0010"

def test_create_asset_role_gate(client):
    set_auth(client, "employee")
    payload = {"name": "New Monitor"}
    response = client.post("/api/assets", json=payload)
    assert response.status_code == status.HTTP_403_FORBIDDEN

def test_get_asset_detail(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.return_value = {
        "id": 1, "tag": "AF-0001", "name": "Laptop", "serial_number": "SN123",
        "category_id": 1, "cost": 1000.0, "acquisition_date": "2026-01-01",
        "condition": "good", "location": "HQ", "photo_url": None,
        "is_bookable": False, "status": "available", "created_at": now_time,
        "category_name": "IT", "current_holder_name": None, "current_holder_type": None
    }
    
    mock_cur.fetchall.return_value = [
        {"id": 1, "event_type": "registered", "detail": "Asset registered", "created_at": now_time.isoformat(), "actor_name": "Admin User"}
    ]

    response = client.get("/api/assets/1")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == "Laptop"
    assert len(data["history"]) == 1

# =============================================================================
# Allocations Tests (Guard 1)
# =============================================================================
def test_create_allocation_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "asset_manager")

    now_time = datetime.now(timezone.utc)
    # Mocking sequential cursors:
    # 1. SELECT asset -> exists & available
    # 2. SELECT employee -> exists & active
    # 3. SELECT existing active allocation -> None
    # 4. INSERT allocation -> returns record
    # 5. SELECT populated allocation -> returns complete record
    mock_cur.fetchone.side_effect = [
        {"id": 1, "tag": "AF-0001", "name": "Laptop", "status": "available"}, # Asset
        {"id": 2, "name": "Priya Shah", "is_active": True}, # Employee
        None, # Existing allocation check
        {"id": 100}, # INSERT RETURNING id
        { # Populated response
            "id": 100, "asset_id": 1, "employee_id": 2, "department_id": None,
            "allocated_by": 1, "allocated_at": now_time, "expected_return_date": "2026-08-12",
            "returned_at": None, "return_condition": None, "notes": "Project work",
            "asset_name": "Laptop", "asset_tag": "AF-0001", "employee_name": "Priya Shah", "department_name": None
        }
    ]

    payload = {
        "asset_id": 1,
        "employee_id": 2,
        "expected_return_date": "2026-08-12",
        "notes": "Project work"
    }

    response = client.post("/api/allocations", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["employee_name"] == "Priya Shah"
    assert data["asset_tag"] == "AF-0001"

def test_create_allocation_double_allocation_conflict(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "admin")

    # Mocking sequential cursors:
    # 1. SELECT asset -> exists & available
    # 2. SELECT employee -> exists & active
    # 3. SELECT existing active allocation -> returns active holder
    mock_cur.fetchone.side_effect = [
        {"id": 1, "tag": "AF-0001", "name": "Laptop", "status": "available"}, # Asset
        {"id": 2, "name": "Priya Shah", "is_active": True}, # Employee
        { # Existing allocation
            "id": 99, "employee_name": "Priya Shah", "department_name": None, "employee_dept_name": "Engineering"
        }
    ]

    payload = {
        "asset_id": 1,
        "employee_id": 2
    }

    response = client.post("/api/allocations", json=payload)
    assert response.status_code == status.HTTP_409_CONFLICT
    data = response.json()
    # Confirm exact structured layout required
    assert "currently held by Priya Shah (Engineering)" in data["detail"]
    assert data["holder_name"] == "Priya Shah"
    assert data["holder_context"] == "Engineering"

def test_create_allocation_xor_violation(client):
    set_auth(client, "admin")
    
    # Both set
    response1 = client.post("/api/allocations", json={"asset_id": 1, "employee_id": 2, "department_id": 3})
    assert response1.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Neither set
    response2 = client.post("/api/allocations", json={"asset_id": 1})
    assert response2.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_create_allocation_retired_asset(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "admin")

    mock_cur.fetchone.return_value = {"id": 1, "tag": "AF-0001", "name": "Laptop", "status": "retired"}

    payload = {"asset_id": 1, "employee_id": 2}
    response = client.post("/api/allocations", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "retired, lost, or disposed" in response.json()["detail"]

def test_return_allocation_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "admin")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        {"id": 100, "asset_id": 1, "employee_id": 2, "department_id": None, "returned_at": None}, # Active Allocation
        {"id": 100, "asset_id": 1, "employee_id": 2, "returned_at": now_time}, # UPDATE returning
        { # Populated response
            "id": 100, "asset_id": 1, "employee_id": 2, "department_id": None,
            "allocated_by": 1, "allocated_at": now_time, "expected_return_date": None,
            "returned_at": now_time, "return_condition": "good", "notes": "Returned",
            "asset_name": "Laptop", "asset_tag": "AF-0001", "employee_name": "Priya Shah", "department_name": None
        }
    ]

    response = client.patch("/api/allocations/100/return", json={"return_condition": "good", "notes": "Returned"})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["returned_at"] is not None
    assert response.json()["return_condition"] == "good"

# =============================================================================
# Transfers Tests
# =============================================================================
def test_create_transfer_request_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee", user_id=2, name="Priya Shah")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        {"id": 1, "tag": "AF-0001", "name": "Laptop", "status": "allocated"}, # Asset exists
        {"id": 100, "employee_id": 2, "department_id": None}, # Active allocation exists
        { # INSERT RETURNING
            "id": 5, "asset_id": 1, "to_employee_id": 3, "to_department_id": None,
            "requested_by": 2, "status": "requested", "reason": "Moving teams", "requested_at": now_time,
            "decided_by": None, "decided_at": None
        },
        { # Populated response
            "id": 5, "asset_id": 1, "to_employee_id": 3, "to_department_id": None,
            "requested_by": 2, "status": "requested", "reason": "Moving teams", "requested_at": now_time,
            "decided_by": None, "decided_at": None, "asset_name": "Laptop", "asset_tag": "AF-0001",
            "to_employee_name": "Raj Patel", "to_department_name": None, "requested_by_name": "Priya Shah"
        }
    ]

    payload = {"asset_id": 1, "to_employee_id": 3, "reason": "Moving teams"}
    response = client.post("/api/transfers", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["status"] == "requested"

def test_approve_transfer_request_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "admin", user_id=1, name="Admin User")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        { # Transfer Request Exists
            "id": 5, "asset_id": 1, "to_employee_id": 3, "to_department_id": None,
            "requested_by": 2, "status": "requested", "asset_tag": "AF-0001", "asset_name": "Laptop"
        },
        {"id": 99}, # Active allocation locked & fetched
        {"id": 101}, # New allocation created returning ID
        {"name": "Raj Patel"}, # To employee name
        { # Populated response
            "id": 5, "asset_id": 1, "to_employee_id": 3, "to_department_id": None,
            "requested_by": 2, "status": "completed", "reason": "Moving teams", "requested_at": now_time,
            "decided_by": 1, "decided_at": now_time, "asset_name": "Laptop", "asset_tag": "AF-0001",
            "to_employee_name": "Raj Patel", "to_department_name": None, "requested_by_name": "Priya Shah"
        }
    ]

    response = client.patch("/api/transfers/5", json={"status": "approved"})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "completed"

# =============================================================================
# Bookings Tests (Guard 2)
# =============================================================================
def test_create_booking_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee", user_id=2, name="Priya Shah")

    now_time = datetime.now(timezone.utc)
    start_time = now_time + timedelta(hours=2)
    end_time = now_time + timedelta(hours=3)

    mock_cur.fetchone.side_effect = [
        {"id": 1, "tag": "AF-0001", "name": "Conference Room B2", "is_bookable": True, "status": "available"}, # Asset Check
        { # INSERT RETURNING
            "id": 50, "asset_id": 1, "booked_by": 2, "created_at": now_time, "status": "confirmed", "purpose": "Meeting"
        },
        { # Populated response
            "id": 50, "asset_id": 1, "booked_by": 2, "start_time": start_time, "end_time": end_time,
            "purpose": "Meeting", "status": "confirmed", "created_at": now_time,
            "asset_name": "Conference Room B2", "asset_tag": "AF-0001", "booked_by_name": "Priya Shah"
        }
    ]

    payload = {
        "asset_id": 1,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "purpose": "Meeting"
    }

    response = client.post("/api/bookings", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["status"] == "confirmed"
    assert data["asset_name"] == "Conference Room B2"

def test_create_booking_overlap_conflict(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee")

    now_time = datetime.now(timezone.utc)
    start_time = now_time + timedelta(hours=2)
    end_time = now_time + timedelta(hours=3)

    # Mock asset properties check
    mock_cur.fetchone.return_value = {"id": 1, "tag": "AF-0001", "name": "Conference Room B2", "is_bookable": True, "status": "available"}
    # Mock Exclusion Violation on INSERT execution
    mock_cur.execute.side_effect = [
        None, # SELECT asset check
        ExclusionViolation() # INSERT throws ExclusionViolation (Guard 2)
    ]

    payload = {
        "asset_id": 1,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat()
    }

    response = client.post("/api/bookings", json=payload)
    assert response.status_code == status.HTTP_409_CONFLICT
    assert "overlaps with an existing confirmed booking" in response.json()["detail"]

def test_create_booking_past_time_error(client):
    set_auth(client, "employee")

    now_time = datetime.now(timezone.utc)
    past_start = now_time - timedelta(hours=2)
    past_end = now_time - timedelta(hours=1)

    payload = {
        "asset_id": 1,
        "start_time": past_start.isoformat(),
        "end_time": past_end.isoformat()
    }

    response = client.post("/api/bookings", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "in the past" in response.json()["detail"]

def test_create_booking_non_bookable_error(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee")

    now_time = datetime.now(timezone.utc)
    start_time = now_time + timedelta(hours=1)
    end_time = now_time + timedelta(hours=2)

    mock_cur.fetchone.return_value = {"id": 1, "tag": "AF-0001", "name": "Laptop", "is_bookable": False, "status": "available"}

    payload = {
        "asset_id": 1,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat()
    }

    response = client.post("/api/bookings", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "not marked as bookable" in response.json()["detail"]

def test_cancel_booking_success(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee", user_id=2, name="Priya Shah")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        {"id": 50, "asset_id": 1, "booked_by": 2, "status": "confirmed", "start_time": now_time, "end_time": now_time + timedelta(hours=1)}, # Fetch booking
        {"tag": "AF-0001"}, # Fetch asset tag
        { # Populated response
            "id": 50, "asset_id": 1, "booked_by": 2, "start_time": now_time, "end_time": now_time + timedelta(hours=1),
            "purpose": None, "status": "cancelled", "created_at": now_time,
            "asset_name": "Laptop", "asset_tag": "AF-0001", "booked_by_name": "Priya Shah"
        }
    ]

    response = client.patch("/api/bookings/50/cancel")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "cancelled"

# =============================================================================
# Maintenance Tests
# =============================================================================
def test_create_maintenance_request(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "employee", user_id=2, name="Priya Shah")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        {"id": 1, "tag": "AF-0001", "name": "Printer", "status": "available"}, # Asset check
        { # INSERT RETURNING
            "id": 10, "asset_id": 1, "raised_by": 2, "issue": "Paper jam", "priority": "medium",
            "status": "pending", "photo_url": None, "technician_name": None, "decided_by": None,
            "resolution": None, "created_at": now_time, "resolved_at": None
        },
        { # Populated response
            "id": 10, "asset_id": 1, "raised_by": 2, "issue": "Paper jam", "priority": "medium",
            "status": "pending", "photo_url": None, "technician_name": None, "decided_by": None,
            "resolution": None, "created_at": now_time, "resolved_at": None,
            "asset_name": "Printer", "asset_tag": "AF-0001", "raised_by_name": "Priya Shah"
        }
    ]

    payload = {"asset_id": 1, "issue": "Paper jam", "priority": "medium"}
    response = client.post("/api/maintenance", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["status"] == "pending"

def test_resolve_maintenance_flips_asset_status(client, db_mock):
    mock_conn, mock_cur = db_mock
    set_auth(client, "asset_manager")

    now_time = datetime.now(timezone.utc)
    mock_cur.fetchone.side_effect = [
        # 1. Fetch maintenance request
        {"id": 10, "asset_id": 1, "raised_by": 2, "status": "pending", "technician_name": None, "resolution": None, "resolved_at": None},
        # 2. Check active allocations to determine new asset status (None -> available)
        None,
        # 3. Populated response
        {
            "id": 10, "asset_id": 1, "raised_by": 2, "issue": "Paper jam", "priority": "medium",
            "status": "resolved", "photo_url": None, "technician_name": "John Doe", "decided_by": 1,
            "resolution": "Fixed the jam", "created_at": now_time, "resolved_at": now_time,
            "asset_name": "Printer", "asset_tag": "AF-0001", "raised_by_name": "Priya Shah"
        }
    ]

    payload = {
        "status": "resolved",
        "technician_name": "John Doe",
        "resolution": "Fixed the jam"
    }
    response = client.patch("/api/maintenance/10", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "resolved"
    assert response.json()["resolution"] == "Fixed the jam"
