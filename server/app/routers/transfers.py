from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection
from psycopg.errors import UniqueViolation
from server.app.core.database import get_db
from server.app.core.dependencies import require_roles, get_current_user
from server.app.schemas import (
    TransferCreate, TransferResponse, TransferDecision, TransferStatus
)

router = APIRouter(prefix="/transfers", tags=["Transfers"])

@router.post("", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
def create_transfer_request(
    transfer_in: TransferCreate,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """
    Request to transfer a currently allocated asset to another employee or department.
    (Any authenticated user can request).
    """
    # Enforce target XOR check
    emp_set = transfer_in.to_employee_id is not None
    dept_set = transfer_in.to_department_id is not None
    if (emp_set and dept_set) or (not emp_set and not dept_set):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transfer target must be exactly one of to_employee_id or to_department_id."
        )

    try:
        with db.cursor() as cur:
            # Check asset existence and status
            cur.execute("SELECT id, tag, name, status FROM assets WHERE id = %s", (transfer_in.asset_id,))
            asset = cur.fetchone()
            if not asset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Asset with ID {transfer_in.asset_id} not found."
                )

            # Check if asset has an active allocation
            cur.execute(
                "SELECT id, employee_id, department_id FROM allocations WHERE asset_id = %s AND returned_at IS NULL",
                (transfer_in.asset_id,)
            )
            active_alloc = cur.fetchone()
            if not active_alloc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Asset must be currently allocated to be transferred."
                )

            # Insert transfer request
            cur.execute(
                """
                INSERT INTO transfers (
                    asset_id, to_employee_id, to_department_id, requested_by, status, reason
                )
                VALUES (%s, %s, %s, %s, 'requested', %s)
                RETURNING id, asset_id, to_employee_id, to_department_id, requested_by, 
                          status, reason, requested_at, decided_by, decided_at
                """,
                (
                    transfer_in.asset_id, transfer_in.to_employee_id, transfer_in.to_department_id,
                    current_user["id"], transfer_in.reason
                )
            )
            transfer = cur.fetchone()

            # Notify admins and asset managers about the pending approval request
            notification_msg = f"New transfer request for asset {asset['name']} ({asset['tag']}) raised by {current_user['name']}."
            cur.execute(
                """
                INSERT INTO notifications (user_id, type, message)
                SELECT id, 'approval', %s FROM users 
                WHERE role IN ('admin', 'asset_manager') AND is_active = TRUE
                """,
                (notification_msg,)
            )

            db.commit()

            # Retrieve populated response
            cur.execute(
                """
                SELECT 
                    t.*,
                    ast.name AS asset_name,
                    ast.tag AS asset_tag,
                    u.name AS to_employee_name,
                    dept.name AS to_department_name,
                    req.name AS requested_by_name
                FROM transfers t
                JOIN assets ast ON t.asset_id = ast.id
                LEFT JOIN users u ON t.to_employee_id = u.id
                LEFT JOIN departments dept ON t.to_department_id = dept.id
                LEFT JOIN users req ON t.requested_by = req.id
                WHERE t.id = %s
                """,
                (transfer["id"],)
            )
            return cur.fetchone()

    except UniqueViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active transfer request already exists for this asset."
        )

@router.patch("/{id}", response_model=TransferResponse)
def decide_transfer_request(
    id: int,
    decision: TransferDecision,
    current_user: dict = Depends(require_roles("admin", "asset_manager")),
    db: Connection = Depends(get_db)
):
    """
    Approve or reject a transfer request. If approved, automatically return the 
    current allocation and create a new allocation to the target.
    (Admin and Asset Manager only).
    """
    status_choice = decision.status.lower()
    if status_choice not in ("approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Decision status must be either 'approved' or 'rejected'."
        )

    with db.cursor() as cur:
        # Check transfer request existence
        cur.execute(
            """
            SELECT 
                t.*,
                ast.tag AS asset_tag,
                ast.name AS asset_name
            FROM transfers t
            JOIN assets ast ON t.asset_id = ast.id
            WHERE t.id = %s
            FOR UPDATE
            """,
            (id,)
        )
        transfer = cur.fetchone()
        if not transfer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transfer request with ID {id} not found."
            )
        if transfer["status"] != "requested":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Transfer request has already been resolved (current status: {transfer['status']})."
            )

        if status_choice == "rejected":
            # Update status to rejected
            cur.execute(
                """
                UPDATE transfers 
                SET status = 'rejected', decided_by = %s, decided_at = now()
                WHERE id = %s
                """,
                (current_user["id"], id)
            )

            # Notify request initiator
            msg = f"Transfer request for asset {transfer['asset_name']} ({transfer['asset_tag']}) was rejected."
            cur.execute(
                "INSERT INTO notifications (user_id, type, message) VALUES (%s, 'alert', %s)",
                (transfer["requested_by"], msg)
            )

            db.commit()

        else:  # Approved -> Automate return and new allocation
            # 1. Find active allocation and lock it
            cur.execute(
                "SELECT id FROM allocations WHERE asset_id = %s AND returned_at IS NULL FOR UPDATE",
                (transfer["asset_id"],)
            )
            active_alloc = cur.fetchone()
            
            # Close active allocation (return it)
            if active_alloc:
                cur.execute(
                    """
                    UPDATE allocations 
                    SET returned_at = now(), notes = %s 
                    WHERE id = %s
                    """,
                    (f"Returned via transfer request approval #{id}.", active_alloc["id"])
                )

            # 2. Create new allocation
            cur.execute(
                """
                INSERT INTO allocations (
                    asset_id, employee_id, department_id, allocated_by, notes
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    transfer["asset_id"], transfer["to_employee_id"], transfer["to_department_id"],
                    current_user["id"], f"Allocated via transfer request approval #{id}."
                )
            )
            new_alloc_id = cur.fetchone()["id"]

            # Keep the denormalized asset status consistent with the new active
            # allocation (it should already be 'allocated', but a prior return or
            # status flip could have left it stale).
            cur.execute(
                "UPDATE assets SET status = 'allocated' WHERE id = %s AND status <> 'allocated'",
                (transfer["asset_id"],)
            )

            # Update transfer status to completed (or approved, we use 'completed' as defined in schema)
            cur.execute(
                """
                UPDATE transfers 
                SET status = 'completed', decided_by = %s, decided_at = now()
                WHERE id = %s
                """,
                (current_user["id"], id)
            )

            # 3. Add to asset history
            target_desc = ""
            if transfer["to_employee_id"]:
                cur.execute("SELECT name FROM users WHERE id = %s", (transfer["to_employee_id"],))
                target_desc = f"employee '{cur.fetchone()['name']}'"
            else:
                cur.execute("SELECT name FROM departments WHERE id = %s", (transfer["to_department_id"],))
                target_desc = f"department '{cur.fetchone()['name']}'"

            cur.execute(
                """
                INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                VALUES (%s, 'transferred', %s, %s)
                """,
                (
                    transfer["asset_id"],
                    f"Asset transferred to {target_desc} via request #{id}.",
                    current_user["id"]
                )
            )

            # 4. Notify requester
            msg_requester = f"Transfer request for asset {transfer['asset_name']} ({transfer['asset_tag']}) has been approved and completed."
            cur.execute(
                "INSERT INTO notifications (user_id, type, message) VALUES (%s, 'alert', %s)",
                (transfer["requested_by"], msg_requester)
            )

            # 5. Notify new holder
            if transfer["to_employee_id"]:
                msg_holder = f"Asset {transfer['asset_name']} ({transfer['asset_tag']}) has been transferred and allocated to you."
                cur.execute(
                    "INSERT INTO notifications (user_id, type, message) VALUES (%s, 'alert', %s)",
                    (transfer["to_employee_id"], msg_holder)
                )
            elif transfer["to_department_id"]:
                # Notify department head if set
                cur.execute("SELECT head_user_id, name FROM departments WHERE id = %s", (transfer["to_department_id"],))
                dept = cur.fetchone()
                if dept and dept["head_user_id"]:
                    msg_holder = f"Asset {transfer['asset_name']} ({transfer['asset_tag']}) has been transferred and allocated to department '{dept['name']}'."
                    cur.execute(
                        "INSERT INTO notifications (user_id, type, message) VALUES (%s, 'alert', %s)",
                        (dept["head_user_id"], msg_holder)
                    )

            db.commit()

        # Retrieve updated populated response
        cur.execute(
            """
            SELECT 
                t.*,
                ast.name AS asset_name,
                ast.tag AS asset_tag,
                u.name AS to_employee_name,
                dept.name AS to_department_name,
                req.name AS requested_by_name
            FROM transfers t
            JOIN assets ast ON t.asset_id = ast.id
            LEFT JOIN users u ON t.to_employee_id = u.id
            LEFT JOIN departments dept ON t.to_department_id = dept.id
            LEFT JOIN users req ON t.requested_by = req.id
            WHERE t.id = %s
            """,
            (id,)
        )
        return cur.fetchone()
