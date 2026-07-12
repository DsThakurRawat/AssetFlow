from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection
from pydantic import BaseModel
from server.app.core.database import get_db
from server.app.core.dependencies import get_current_user, require_roles

router = APIRouter(tags=["Audit"])


class AuditCreate(BaseModel):
    name: str
    scope: Optional[str] = None
    auditor_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class AuditItemUpdate(BaseModel):
    status: str  # verified | missing | damaged | pending
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# GET /audits — cycle list with progress counts
# ---------------------------------------------------------------------------
@router.get("/audits")
def list_cycles(current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT ac.id, ac.name, ac.scope, ac.start_date, ac.end_date, ac.is_closed,
                   u.name AS auditor_name,
                   count(ai.id) AS total_items,
                   count(ai.id) FILTER (WHERE ai.status IN ('missing', 'damaged')) AS flagged_count
            FROM audit_cycles ac
            LEFT JOIN users u ON ac.auditor_id = u.id
            LEFT JOIN audit_items ai ON ai.cycle_id = ac.id
            GROUP BY ac.id, u.name
            ORDER BY ac.created_at DESC
            """
        )
        return cur.fetchall()


# ---------------------------------------------------------------------------
# POST /audits — create a cycle and auto-populate one item per asset
# ---------------------------------------------------------------------------
@router.post("/audits", status_code=status.HTTP_201_CREATED)
def create_cycle(
    body: AuditCreate,
    current_user: dict = Depends(require_roles("admin", "asset_manager")),
    db: Connection = Depends(get_db),
):
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO audit_cycles (name, scope, auditor_id, start_date, end_date)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
            """,
            (body.name, body.scope, body.auditor_id, body.start_date, body.end_date),
        )
        cycle_id = cur.fetchone()["id"]
        # auto-populate: one checklist item per active (non-retired) asset
        cur.execute(
            """
            INSERT INTO audit_items (cycle_id, asset_id)
            SELECT %s, id FROM assets WHERE status NOT IN ('retired', 'disposed')
            """,
            (cycle_id,),
        )
        db.commit()
    return {"id": cycle_id}


# ---------------------------------------------------------------------------
# GET /audits/{id} — cycle detail + checklist items
# ---------------------------------------------------------------------------
@router.get("/audits/{id}")
def get_cycle(id: int, current_user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT ac.id, ac.name, ac.scope, ac.start_date, ac.end_date, ac.is_closed,
                   u.name AS auditor_name
            FROM audit_cycles ac LEFT JOIN users u ON ac.auditor_id = u.id
            WHERE ac.id = %s
            """,
            (id,),
        )
        cycle = cur.fetchone()
        if not cycle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit cycle not found.")

        cur.execute(
            """
            SELECT ai.id, ai.asset_id, a.tag AS asset_tag, a.name AS asset_name,
                   a.location AS expected_location, ai.status, ai.note
            FROM audit_items ai
            JOIN assets a ON ai.asset_id = a.id
            WHERE ai.cycle_id = %s
            ORDER BY a.tag
            """,
            (id,),
        )
        items = cur.fetchall()
    return {**cycle, "items": items}


# ---------------------------------------------------------------------------
# PATCH /audit-items/{id} — auditor marks Verified / Missing / Damaged
# ---------------------------------------------------------------------------
@router.patch("/audit-items/{id}")
def update_item(
    id: int,
    body: AuditItemUpdate,
    current_user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    if body.status not in ("pending", "verified", "missing", "damaged"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status.")
    with db.cursor() as cur:
        # block edits on a closed cycle
        cur.execute(
            """SELECT ac.is_closed FROM audit_items ai
               JOIN audit_cycles ac ON ai.cycle_id = ac.id WHERE ai.id = %s""",
            (id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit item not found.")
        if row["is_closed"]:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This audit cycle is closed.")
        cur.execute(
            "UPDATE audit_items SET status = %s, note = %s, checked_at = now() WHERE id = %s "
            "RETURNING id, asset_id, status, note",
            (body.status, body.note, id),
        )
        item = cur.fetchone()
        db.commit()
    return item


# ---------------------------------------------------------------------------
# PATCH /audits/{id}/close — lock the cycle; confirmed-missing assets -> Lost
# ---------------------------------------------------------------------------
@router.patch("/audits/{id}/close")
def close_cycle(
    id: int,
    current_user: dict = Depends(require_roles("admin", "asset_manager")),
    db: Connection = Depends(get_db),
):
    with db.cursor() as cur:
        cur.execute("SELECT is_closed FROM audit_cycles WHERE id = %s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit cycle not found.")
        # missing assets become Lost
        cur.execute(
            """
            UPDATE assets SET status = 'lost'
            WHERE id IN (SELECT asset_id FROM audit_items WHERE cycle_id = %s AND status = 'missing')
              AND status NOT IN ('retired', 'disposed')
            """,
            (id,),
        )
        cur.execute("UPDATE audit_cycles SET is_closed = TRUE WHERE id = %s", (id,))
        db.commit()
    return {"id": id, "is_closed": True}
