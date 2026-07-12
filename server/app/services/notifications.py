"""Notification write helper — called INSIDE the caller's transaction.

Every mandated event (allocate, transfer approve, booking confirm/cancel, maintenance
approve/resolve, overdue sweep, audit discrepancy) writes its notification row in the
SAME transaction as the triggering action, so the feed can never drift from reality.

Usage (from an asset-engine service, before its own db.commit()):
    from server.app.services.notifications import notify
    notify(cur, user_id, "approval", f"Laptop {tag} assigned to {name}")

`ntype` must be one of the DB-enforced categories: 'alert' | 'approval' | 'booking'
(mirrors the Screen 10 filter pills). A bad value raises a CHECK violation.
"""

VALID_TYPES = ("alert", "approval", "booking")


def notify(cur, user_id: int, ntype: str, message: str) -> None:
    """Insert one notification using an EXISTING cursor (no commit here)."""
    cur.execute(
        "INSERT INTO notifications (user_id, type, message) VALUES (%s, %s, %s)",
        (user_id, ntype, message),
    )
