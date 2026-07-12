from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from psycopg import Connection
from psycopg.errors import UniqueViolation, ForeignKeyViolation
from server.app.core.database import get_db
from server.app.core.dependencies import require_roles
from server.app.schemas import (
    AllocationCreate, AllocationResponse, AllocationReturn,
    AssetCondition, AssetStatus
)

router = APIRouter(prefix="/allocations", tags=["Allocations"])

@router.post("", response_model=AllocationResponse, status_code=status.HTTP_201_CREATED)
def create_allocation(
    alloc_in: AllocationCreate,
    current_user: dict = Depends(require_roles("admin", "asset_manager")),
    db: Connection = Depends(get_db)
):
    """
    Allocate an asset to an employee OR a department. (Admin and Asset Manager only).
    """
    # Enforce XOR target check
    emp_set = alloc_in.employee_id is not None
    dept_set = alloc_in.department_id is not None
    if (emp_set and dept_set) or (not emp_set and not dept_set):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Allocation must target exactly one of employee_id or department_id."
        )

    try:
        with db.cursor() as cur:
            # Check asset existence & status
            cur.execute(
                "SELECT id, tag, name, status FROM assets WHERE id = %s",
                (alloc_in.asset_id,)
            )
            asset = cur.fetchone()
            if not asset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Asset with ID {alloc_in.asset_id} not found."
                )
            
            if asset["status"] in (AssetStatus.RETIRED, AssetStatus.LOST, AssetStatus.DISPOSED):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Asset is retired, lost, or disposed and cannot be allocated (current status: {asset['status']})."
                )
            if asset["status"] == AssetStatus.UNDER_MAINTENANCE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Asset is currently under maintenance and cannot be allocated."
                )

            # Check if employee exists and is active
            if alloc_in.employee_id:
                cur.execute(
                    "SELECT id, name, is_active FROM users WHERE id = %s",
                    (alloc_in.employee_id,)
                )
                emp = cur.fetchone()
                if not emp:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Employee with ID {alloc_in.employee_id} not found."
                    )
                if not emp["is_active"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot allocate asset to an inactive employee."
                    )
                holder_display = f"{emp['name']}"
            else:
                # Check department existence and status
                cur.execute(
                    "SELECT id, name, is_active FROM departments WHERE id = %s",
                    (alloc_in.department_id,)
                )
                dept = cur.fetchone()
                if not dept:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Department with ID {alloc_in.department_id} not found."
                    )
                if not dept["is_active"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot allocate asset to an inactive department."
                    )
                holder_display = f"Department '{dept['name']}'"

            # Check if already allocated before trying to insert to get better conflict info
            cur.execute(
                """
                SELECT 
                    a.id,
                    u.name AS employee_name,
                    d.name AS department_name,
                    u_dept.name AS employee_dept_name
                FROM allocations a
                LEFT JOIN users u ON a.employee_id = u.id
                LEFT JOIN departments d ON a.department_id = d.id
                LEFT JOIN departments u_dept ON u.department_id = u_dept.id
                WHERE a.asset_id = %s AND a.returned_at IS NULL
                """,
                (alloc_in.asset_id,)
            )
            existing_alloc = cur.fetchone()
            if existing_alloc:
                holder_name = existing_alloc["employee_name"] or existing_alloc["department_name"]
                holder_context = existing_alloc["employee_dept_name"] or "Department"
                return JSONResponse(
                    status_code=status.HTTP_409_CONFLICT,
                    content={
                        "detail": f"currently held by {holder_name} ({holder_context})",
                        "holder_name": holder_name,
                        "holder_context": holder_context
                    }
                )

            # Insert allocation
            cur.execute(
                """
                INSERT INTO allocations (
                    asset_id, employee_id, department_id, allocated_by, expected_return_date, notes
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, asset_id, employee_id, department_id, allocated_by, 
                          allocated_at, expected_return_date, returned_at, return_condition, notes
                """,
                (
                    alloc_in.asset_id, alloc_in.employee_id, alloc_in.department_id,
                    current_user["id"], alloc_in.expected_return_date, alloc_in.notes
                )
            )
            alloc = cur.fetchone()

            # Update asset status
            cur.execute(
                "UPDATE assets SET status = 'allocated' WHERE id = %s",
                (alloc_in.asset_id,)
            )

            # Add to asset history
            cur.execute(
                """
                INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                VALUES (%s, 'allocated', %s, %s)
                """,
                (
                    alloc_in.asset_id,
                    f"Asset allocated to {holder_display} by {current_user['name']}",
                    current_user["id"]
                )
            )

            db.commit()

            # Fetch the populated response
            cur.execute(
                """
                SELECT 
                    a.*,
                    ast.name AS asset_name,
                    ast.tag AS asset_tag,
                    u.name AS employee_name,
                    dept.name AS department_name
                FROM allocations a
                JOIN assets ast ON a.asset_id = ast.id
                LEFT JOIN users u ON a.employee_id = u.id
                LEFT JOIN departments dept ON a.department_id = dept.id
                WHERE a.id = %s
                """,
                (alloc["id"],)
            )
            return cur.fetchone()

    except UniqueViolation:
        db.rollback()
        # Fallback conflict block if race condition occurred
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    u.name AS employee_name,
                    d.name AS department_name,
                    u_dept.name AS employee_dept_name
                FROM allocations a
                LEFT JOIN users u ON a.employee_id = u.id
                LEFT JOIN departments d ON a.department_id = d.id
                LEFT JOIN departments u_dept ON u.department_id = u_dept.id
                WHERE a.asset_id = %s AND a.returned_at IS NULL
                """,
                (alloc_in.asset_id,)
            )
            holder = cur.fetchone()
            if holder:
                holder_name = holder["employee_name"] or holder["department_name"]
                holder_context = holder["employee_dept_name"] or "Department"
            else:
                holder_name = "Unknown"
                holder_context = "Unknown"

        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": f"currently held by {holder_name} ({holder_context})",
                "holder_name": holder_name,
                "holder_context": holder_context
            }
        )
    except ForeignKeyViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Referenced asset, employee, or department does not exist."
        )

@router.patch("/{id}/return", response_model=AllocationResponse)
def return_asset(
    id: int,
    return_in: AllocationReturn,
    current_user: dict = Depends(require_roles("admin", "asset_manager")),
    db: Connection = Depends(get_db)
):
    """
    Record the return of an allocated asset. (Admin and Asset Manager only).
    """
    with db.cursor() as cur:
        # Check allocation existence & active status
        cur.execute(
            """
            SELECT id, asset_id, employee_id, department_id, returned_at 
            FROM allocations WHERE id = %s
            """,
            (id,)
        )
        alloc = cur.fetchone()
        if not alloc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Allocation with ID {id} not found."
            )
        if alloc["returned_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Asset has already been returned for this allocation."
            )

        # Update allocation record
        cur.execute(
            """
            UPDATE allocations 
            SET returned_at = now(), return_condition = %s, notes = %s
            WHERE id = %s
            RETURNING id, asset_id, employee_id, department_id, allocated_by, 
                      allocated_at, expected_return_date, returned_at, return_condition, notes
            """,
            (return_in.return_condition.value, return_in.notes, id)
        )
        updated_alloc = cur.fetchone()

        # Revert asset status to available and update its condition
        cur.execute(
            """
            UPDATE assets 
            SET status = 'available', condition = %s 
            WHERE id = %s
            """,
            (return_in.return_condition.value, alloc["asset_id"])
        )

        # Log to asset history
        cur.execute(
            """
            INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
            VALUES (%s, 'returned', %s, %s)
            """,
            (
                alloc["asset_id"],
                f"Asset returned in {return_in.return_condition.value} condition by {current_user['name']}.",
                current_user["id"]
            )
        )

        db.commit()

        # Fetch the response
        cur.execute(
            """
            SELECT 
                a.*,
                ast.name AS asset_name,
                ast.tag AS asset_tag,
                u.name AS employee_name,
                dept.name AS department_name
            FROM allocations a
            JOIN assets ast ON a.asset_id = ast.id
            LEFT JOIN users u ON a.employee_id = u.id
            LEFT JOIN departments dept ON a.department_id = dept.id
            WHERE a.id = %s
            """,
            (updated_alloc["id"],)
        )
        return cur.fetchone()
