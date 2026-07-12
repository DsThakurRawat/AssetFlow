import csv
import io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from psycopg import Connection
from server.app.core.database import get_db
from server.app.core.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])

# All reports are pure SQL aggregations (GROUP BY) — no stored counters.


@router.get("/utilization")
def utilization(current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    """Allocations attributed to each department (direct dept holder, or holder's dept)."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT d.name AS department, count(*) AS count
            FROM allocations a
            JOIN departments d
              ON d.id = COALESCE(a.department_id,
                                 (SELECT department_id FROM users WHERE id = a.employee_id))
            GROUP BY d.name
            ORDER BY count DESC
            """
        )
        return cur.fetchall()


@router.get("/maintenance-frequency")
def maintenance_frequency(current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    """Maintenance requests raised per month."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
                   count(*) AS count
            FROM maintenance_requests
            GROUP BY date_trunc('month', created_at)
            ORDER BY date_trunc('month', created_at)
            """
        )
        return cur.fetchall()


@router.get("/most-used")
def most_used(current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    """Top assets by booking count."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT a.tag || ' — ' || a.name AS asset,
                   count(b.id) || ' bookings' AS usage
            FROM assets a
            JOIN bookings b ON b.asset_id = a.id
            GROUP BY a.id, a.tag, a.name
            ORDER BY count(b.id) DESC
            LIMIT 5
            """
        )
        return cur.fetchall()


@router.get("/idle")
def idle(current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    """Assets with no bookings and no active allocation — idle candidates."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT a.tag || ' — ' || a.name AS asset,
                   COALESCE((CURRENT_DATE - a.acquisition_date)::text, 'unknown')
                     || ' days since acquisition' AS idle_days
            FROM assets a
            WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.asset_id = a.id)
              AND NOT EXISTS (SELECT 1 FROM allocations al
                              WHERE al.asset_id = a.id AND al.returned_at IS NULL)
              AND a.status NOT IN ('retired', 'disposed', 'lost')
            ORDER BY a.acquisition_date ASC NULLS LAST
            LIMIT 5
            """
        )
        return cur.fetchall()


@router.get("/export.csv")
def export_csv(current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    """Export the asset registry as CSV."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT a.tag, a.name, c.name AS category, a.status, a.condition,
                   a.location, a.cost, a.is_bookable
            FROM assets a LEFT JOIN categories c ON a.category_id = c.id
            ORDER BY a.tag
            """
        )
        rows = cur.fetchall()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Tag", "Name", "Category", "Status", "Condition", "Location", "Cost", "Bookable"])
    for r in rows:
        writer.writerow([r["tag"], r["name"], r["category"], r["status"], r["condition"],
                         r["location"], r["cost"], r["is_bookable"]])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=assetflow_report.csv"},
    )
