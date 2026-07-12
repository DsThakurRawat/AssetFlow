from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from psycopg import Connection
from server.app.core.database import get_db
from server.app.core.dependencies import require_roles, get_current_user
from server.app.schemas import (
    MaintenanceCreate, MaintenanceResponse, MaintenanceUpdate,
    MaintStatus, AssetStatus
)

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])

@router.get("", response_model=List[MaintenanceResponse])
def get_maintenance_requests(
    status_filter: Optional[MaintStatus] = Query(None, alias="status", description="Filter by status"),
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """
    List all maintenance requests, optionally filtered by status.
    """
    query = """
        SELECT 
            m.*,
            ast.name AS asset_name,
            ast.tag AS asset_tag,
            u.name AS raised_by_name
        FROM maintenance_requests m
        JOIN assets ast ON m.asset_id = ast.id
        LEFT JOIN users u ON m.raised_by = u.id
        WHERE 1=1
    """
    params = []

    if status_filter is not None:
        query += " AND m.status = %s"
        params.append(status_filter.value)

    query += " ORDER BY m.created_at DESC"

    with db.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()

@router.post("", response_model=MaintenanceResponse, status_code=status.HTTP_201_CREATED)
def raise_maintenance_request(
    maint_in: MaintenanceCreate,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """
    Raise a new maintenance request for an asset.
    (Any authenticated user can raise).
    """
    with db.cursor() as cur:
        # Check asset existence and status
        cur.execute("SELECT id, tag, name, status FROM assets WHERE id = %s", (maint_in.asset_id,))
        asset = cur.fetchone()
        if not asset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Asset with ID {maint_in.asset_id} not found."
            )

        if asset["status"] in ("retired", "lost", "disposed"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot raise maintenance for a retired, lost, or disposed asset (current status: {asset['status']})."
            )

        # Create maintenance request
        cur.execute(
            """
            INSERT INTO maintenance_requests (asset_id, raised_by, issue, priority, status, photo_url)
            VALUES (%s, %s, %s, %s, 'pending', %s)
            RETURNING id, asset_id, raised_by, issue, priority, status, photo_url, 
                      technician_name, decided_by, resolution, created_at, resolved_at
            """,
            (
                maint_in.asset_id, current_user["id"], maint_in.issue,
                maint_in.priority.value, maint_in.photo_url
            )
        )
        req = cur.fetchone()

        # Log history event
        cur.execute(
            """
            INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
            VALUES (%s, 'maintenance', %s, %s)
            """,
            (
                maint_in.asset_id,
                f"Maintenance request #{req['id']} raised: '{maint_in.issue}' (Priority: {maint_in.priority.value}) by {current_user['name']}.",
                current_user["id"]
            )
        )

        db.commit()

        # Retrieve populated response
        cur.execute(
            """
            SELECT 
                m.*,
                ast.name AS asset_name,
                ast.tag AS asset_tag,
                u.name AS raised_by_name
            FROM maintenance_requests m
            JOIN assets ast ON m.asset_id = ast.id
            LEFT JOIN users u ON m.raised_by = u.id
            WHERE m.id = %s
            """,
            (req["id"],)
        )
        return cur.fetchone()

@router.patch("/{id}", response_model=MaintenanceResponse)
def update_maintenance_request(
    id: int,
    maint_up: MaintenanceUpdate,
    current_user: dict = Depends(require_roles("admin", "asset_manager")),
    db: Connection = Depends(get_db)
):
    """
    Update a maintenance request's status, assignee, and resolution.
    Handles auto asset status flips (e.g. Under Maintenance ↔ Available/Allocated).
    (Admin and Asset Manager only).
    """
    with db.cursor() as cur:
        # Check maintenance request existence and lock it
        cur.execute(
            "SELECT * FROM maintenance_requests WHERE id = %s FOR UPDATE",
            (id,)
        )
        req = cur.fetchone()
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Maintenance request with ID {id} not found."
            )

        # Enforce role logic: "employee approving their own maintenance request" is blocked since we require "admin" or "asset_manager"
        # However, let's verify if an admin/asset_manager is trying to decide. They are allowed.

        target_status = maint_up.status.value
        technician = maint_up.technician_name or req["technician_name"]
        resolution = maint_up.resolution or req["resolution"]
        resolved_at_val = req["resolved_at"]

        # If transitioning to resolved, mark resolved_at
        if target_status == "resolved" and req["status"] != "resolved":
            resolved_at_val = datetime.now(timezone.utc)

        # Update the request
        cur.execute(
            """
            UPDATE maintenance_requests
            SET status = %s, technician_name = %s, resolution = %s, resolved_at = %s, decided_by = %s
            WHERE id = %s
            """,
            (target_status, technician, resolution, resolved_at_val, current_user["id"], id)
        )

        # Determine asset status flip
        # If approved / technician_assigned / in_progress -> under_maintenance
        # If resolved -> available or allocated (based on active allocation)
        # If rejected -> available or allocated (based on active allocation)
        if target_status in ("approved", "technician_assigned", "in_progress"):
            cur.execute(
                "UPDATE assets SET status = 'under_maintenance' WHERE id = %s",
                (req["asset_id"],)
            )
            # Log history event
            cur.execute(
                """
                INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                VALUES (%s, 'status_change', %s, %s)
                """,
                (
                    req["asset_id"],
                    f"Asset status flipped to under_maintenance via request #{id} status change to '{target_status}'.",
                    current_user["id"]
                )
            )
        elif target_status in ("resolved", "rejected"):
            # Check if there is an active allocation for the asset
            cur.execute(
                "SELECT id FROM allocations WHERE asset_id = %s AND returned_at IS NULL",
                (req["asset_id"],)
            )
            active_alloc = cur.fetchone()
            new_asset_status = "allocated" if active_alloc else "available"

            cur.execute(
                "UPDATE assets SET status = %s WHERE id = %s",
                (new_asset_status, req["asset_id"])
            )
            # Log history event
            cur.execute(
                """
                INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                VALUES (%s, 'status_change', %s, %s)
                """,
                (
                    req["asset_id"],
                    f"Asset status flipped to {new_asset_status} following maintenance request #{id} resolution/rejection.",
                    current_user["id"]
                )
            )

            # If resolved, add a maintenance log entry to history
            if target_status == "resolved":
                cur.execute(
                    """
                    INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                    VALUES (%s, 'maintenance', %s, %s)
                    """,
                    (
                        req["asset_id"],
                        f"Maintenance request #{id} resolved: '{resolution}' by technician {technician}.",
                        current_user["id"]
                    )
                )

        db.commit()

        # Retrieve populated response
        cur.execute(
            """
            SELECT 
                m.*,
                ast.name AS asset_name,
                ast.tag AS asset_tag,
                u.name AS raised_by_name
            FROM maintenance_requests m
            JOIN assets ast ON m.asset_id = ast.id
            LEFT JOIN users u ON m.raised_by = u.id
            WHERE m.id = %s
            """,
            (id,)
        )
        return cur.fetchone()
