from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from psycopg import Connection
from pydantic import BaseModel
from server.app.core.database import get_db
from server.app.core.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationResponse(BaseModel):
    id: int
    type: str
    message: str
    is_read: bool
    created_at: datetime


@router.get("", response_model=List[NotificationResponse])
def list_notifications(
    type: Optional[str] = Query(None, pattern="^(alert|approval|booking)$"),
    limit: int = Query(20, ge=1, le=100),
    page: int = Query(1, ge=1),
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Current user's bell feed, newest first. Optional type filter maps 1:1 to the
    Screen 10 pills (All | Alerts | Approvals | Bookings). Also powers the dashboard
    Recent Activity feed (call with limit=5)."""
    conditions = ["user_id = %s"]
    params: list = [current_user["id"]]
    if type is not None:
        conditions.append("type = %s")
        params.append(type)

    where = " AND ".join(conditions)
    params.extend([limit, (page - 1) * limit])
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, type, message, is_read, created_at
            FROM notifications
            WHERE {where}
            ORDER BY created_at DESC, id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params),
        )
        return cur.fetchall()


@router.patch("/{id}/read", response_model=NotificationResponse)
def mark_read(
    id: int,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Mark one of YOUR notifications read. 404 if it isn't yours (no cross-user leak)."""
    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE notifications SET is_read = TRUE
            WHERE id = %s AND user_id = %s
            RETURNING id, type, message, is_read, created_at
            """,
            (id, current_user["id"]),
        )
        row = cur.fetchone()
        db.commit()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    return row
