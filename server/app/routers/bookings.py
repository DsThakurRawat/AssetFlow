from typing import List, Optional
from datetime import datetime, date, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from psycopg import Connection
from psycopg.errors import ExclusionViolation, ForeignKeyViolation
from server.app.core.database import get_db
from server.app.core.dependencies import require_roles, get_current_user
from server.app.schemas import BookingCreate, BookingResponse, BookingStatus

router = APIRouter(prefix="/bookings", tags=["Bookings"])

@router.get("", response_model=List[BookingResponse])
def get_bookings(
    asset_id: Optional[int] = Query(None, description="Filter by asset ID"),
    booking_date: Optional[date] = Query(None, alias="date", description="Filter by date (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """
    List bookings, optionally filtered by asset and date.
    """
    query = """
        SELECT 
            b.id,
            b.asset_id,
            b.booked_by,
            lower(b.time_range) AS start_time,
            upper(b.time_range) AS end_time,
            b.purpose,
            b.status,
            b.created_at,
            ast.name AS asset_name,
            ast.tag AS asset_tag,
            u.name AS booked_by_name
        FROM bookings b
        JOIN assets ast ON b.asset_id = ast.id
        LEFT JOIN users u ON b.booked_by = u.id
        WHERE 1=1
    """
    params = []

    if asset_id is not None:
        query += " AND b.asset_id = %s"
        params.append(asset_id)

    if booking_date is not None:
        # Check overlaps with the specified day [booking_date, booking_date + 1 day)
        start_day = datetime.combine(booking_date, datetime.min.time(), tzinfo=timezone.utc)
        end_day = start_day + timedelta(days=1)
        query += " AND b.time_range && tstzrange(%s, %s)"
        params.extend([start_day, end_day])

    query += " ORDER BY start_time ASC"

    with db.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()

@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    booking_in: BookingCreate,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """
    Book a bookable resource. Enforces Guard 2 (exclusion overlap block).
    (Any authenticated user can book).
    """
    # 1. Validation: start time must be before end time
    if booking_in.start_time >= booking_in.end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Booking start time must be before end time."
        )

    # 2. Hostile input check: booking in the past
    now_utc = datetime.now(timezone.utc)
    if booking_in.start_time < now_utc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot book a resource in the past."
        )

    try:
        with db.cursor() as cur:
            # Check asset existence and properties
            cur.execute(
                "SELECT id, tag, name, is_bookable, status FROM assets WHERE id = %s",
                (booking_in.asset_id,)
            )
            asset = cur.fetchone()
            if not asset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Asset with ID {booking_in.asset_id} not found."
                )

            if not asset["is_bookable"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This asset is not marked as bookable."
                )

            if asset["status"] in ("retired", "lost", "disposed"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot book a retired, lost, or disposed asset (current status: {asset['status']})."
                )

            # Insert booking utilizing Postgres tstzrange
            cur.execute(
                """
                INSERT INTO bookings (asset_id, booked_by, time_range, purpose, status)
                VALUES (%s, %s, tstzrange(%s, %s), %s, 'confirmed')
                RETURNING id, asset_id, booked_by, created_at, status, purpose
                """,
                (
                    booking_in.asset_id, current_user["id"],
                    booking_in.start_time, booking_in.end_time,
                    booking_in.purpose
                )
            )
            booking = cur.fetchone()

            # Insert history log
            time_str = f"{booking_in.start_time.isoformat()} to {booking_in.end_time.isoformat()}"
            cur.execute(
                """
                INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                VALUES (%s, 'booked', %s, %s)
                """,
                (
                    booking_in.asset_id,
                    f"Asset booked for period {time_str} by {current_user['name']}.",
                    current_user["id"]
                )
            )

            db.commit()

            # Retrieve complete populated response
            cur.execute(
                """
                SELECT 
                    b.id,
                    b.asset_id,
                    b.booked_by,
                    lower(b.time_range) AS start_time,
                    upper(b.time_range) AS end_time,
                    b.purpose,
                    b.status,
                    b.created_at,
                    ast.name AS asset_name,
                    ast.tag AS asset_tag,
                    u.name AS booked_by_name
                FROM bookings b
                JOIN assets ast ON b.asset_id = ast.id
                LEFT JOIN users u ON b.booked_by = u.id
                WHERE b.id = %s
                """,
                (booking["id"],)
            )
            return cur.fetchone()

    except ExclusionViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Booking overlaps with an existing confirmed booking for this asset."
        )
    except ForeignKeyViolation:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Referenced asset or user does not exist."
        )

@router.patch("/{id}/cancel", response_model=BookingResponse)
def cancel_booking(
    id: int,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db)
):
    """
    Cancel an existing booking. Can only be cancelled by the owner or managers.
    """
    with db.cursor() as cur:
        # Check booking existence
        cur.execute(
            """
            SELECT id, asset_id, booked_by, status, lower(time_range) AS start_time, upper(time_range) AS end_time
            FROM bookings WHERE id = %s
            """,
            (id,)
        )
        booking = cur.fetchone()
        if not booking:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Booking with ID {id} not found."
            )

        if booking["status"] == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Booking is already cancelled."
            )

        # Enforce cancellation authorization: owner, asset manager, or admin
        is_owner = booking["booked_by"] == current_user["id"]
        is_manager = current_user["role"] in ("admin", "asset_manager")
        if not (is_owner or is_manager):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: You do not have permission to cancel this booking."
            )

        # Update booking status
        cur.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE id = %s",
            (id,)
        )

        # Get asset details for logging
        cur.execute("SELECT tag FROM assets WHERE id = %s", (booking["asset_id"],))
        asset_tag = cur.fetchone()["tag"]

        # Log to asset history
        time_str = f"{booking['start_time'].isoformat()} to {booking['end_time'].isoformat()}"
        cur.execute(
            """
            INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
            VALUES (%s, 'status_change', %s, %s)
            """,
            (
                booking["asset_id"],
                f"Booking for period {time_str} was cancelled by {current_user['name']}.",
                current_user["id"]
            )
        )

        db.commit()

        # Retrieve updated populated response
        cur.execute(
            """
            SELECT 
                b.id,
                b.asset_id,
                b.booked_by,
                lower(b.time_range) AS start_time,
                upper(b.time_range) AS end_time,
                b.purpose,
                b.status,
                b.created_at,
                ast.name AS asset_name,
                ast.tag AS asset_tag,
                u.name AS booked_by_name
            FROM bookings b
            JOIN assets ast ON b.asset_id = ast.id
            LEFT JOIN users u ON b.booked_by = u.id
            WHERE b.id = %s
            """,
            (id,)
        )
        return cur.fetchone()
