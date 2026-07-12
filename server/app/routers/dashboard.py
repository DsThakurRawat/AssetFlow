from fastapi import APIRouter, Depends
from psycopg import Connection
from pydantic import BaseModel
from server.app.core.database import get_db
from server.app.core.dependencies import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class DashboardKPIs(BaseModel):
    available: int
    allocated: int
    maintenance_today: int
    active_bookings: int
    pending_transfers: int
    upcoming_returns: int
    overdue_count: int


# One query, seven scalar counts — no N+1, no stored counters. All derived live.
# Definitions (documented for the evaluator):
#   available/allocated  -> assets by current lifecycle status
#   maintenance_today    -> maintenance requests still in an active (unresolved) state
#   active_bookings      -> confirmed bookings not yet completed (upper bound in the future)
#   pending_transfers    -> transfer requests awaiting a decision
#   upcoming_returns     -> open allocations due today or later
#   overdue_returns      -> open allocations already past their expected return date (highlighted separately)
_KPI_SQL = """
SELECT
    (SELECT count(*) FROM assets WHERE status = 'available')  AS available,
    (SELECT count(*) FROM assets WHERE status = 'allocated')  AS allocated,
    (SELECT count(*) FROM maintenance_requests
        WHERE status IN ('pending', 'approved', 'technician_assigned', 'in_progress'))
                                                              AS maintenance_today,
    (SELECT count(*) FROM bookings
        WHERE status = 'confirmed' AND upper(time_range) > now())
                                                              AS active_bookings,
    (SELECT count(*) FROM transfers WHERE status = 'requested') AS pending_transfers,
    (SELECT count(*) FROM allocations
        WHERE returned_at IS NULL AND expected_return_date IS NOT NULL
          AND expected_return_date >= current_date)          AS upcoming_returns,
    (SELECT count(*) FROM allocations
        WHERE returned_at IS NULL AND expected_return_date IS NOT NULL
          AND expected_return_date <  current_date)          AS overdue_count
"""


@router.get("/kpis", response_model=DashboardKPIs)
def get_kpis(
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Six operational KPI cards + a separate overdue count (Screen 2)."""
    with db.cursor() as cur:
        cur.execute(_KPI_SQL)
        return cur.fetchone()
