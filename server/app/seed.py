"""AssetFlow seed data — makes a fresh clone look ALIVE for the evaluator.

Mirrors UI_SPEC Appendix A: the Priya/Raj double-allocation setup, Room B2 booked
9-10 today, one 3-day-overdue allocation, maintenance across all five kanban columns,
a pending transfer, a closed audit cycle, and Screen-10 notifications.

Idempotent: truncates every table (RESTART IDENTITY CASCADE) then reinserts.
Run from the repo root:   python -m server.app.seed
"""
import psycopg
from psycopg.rows import dict_row

from server.app.core.config import settings
from server.app.core.security import get_password_hash

DEMO_PASSWORD = "password123"  # every seeded account (documented in README demo logins)


def seed() -> None:
    pwd = get_password_hash(DEMO_PASSWORD)  # hash once; bcrypt is deliberately slow
    with psycopg.connect(settings.DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # ---- wipe (child-safe via CASCADE) ------------------------------
            cur.execute("""
                TRUNCATE audit_items, audit_cycles, notifications, asset_history,
                         maintenance_requests, bookings, transfers, allocations,
                         assets, categories, users, departments
                RESTART IDENTITY CASCADE
            """)

            # ---- categories -------------------------------------------------
            cat = {}
            for name, warranty in [("Electronics", 24), ("Furniture", None), ("Vehicles", None)]:
                cur.execute(
                    "INSERT INTO categories (name, warranty_months) VALUES (%s, %s) RETURNING id",
                    (name, warranty),
                )
                cat[name] = cur.fetchone()["id"]

            # ---- users (department_id filled in after departments exist) ----
            users = {}
            people = [
                ("Admin User",      "admin@assetflow.com",   "admin"),
                ("Meera Krishnan",  "manager@assetflow.com", "asset_manager"),
                ("Aditi Rao",       "aditi@assetflow.com",   "dept_head"),
                ("Rohan Mehta",     "rohan@assetflow.com",   "dept_head"),
                ("Sana Iqbal",      "sana@assetflow.com",    "dept_head"),
                ("Priya Shah",      "priya@assetflow.com",   "employee"),
                ("Arjun Nair",      "arjun@assetflow.com",   "employee"),
                ("R. Varma",        "varma@assetflow.com",   "employee"),
                ("Neha Gupta",      "neha@assetflow.com",    "employee"),
                ("Procurement Team","procurement@assetflow.com", "employee"),
            ]
            for name, email, role in people:
                cur.execute(
                    "INSERT INTO users (name, email, password_hash, role) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    (name, email, pwd, role),
                )
                users[name] = cur.fetchone()["id"]

            # ---- departments (hierarchy + heads) ----------------------------
            dept = {}
            cur.execute(
                "INSERT INTO departments (name, head_user_id) VALUES (%s, %s) RETURNING id",
                ("Engineering", users["Aditi Rao"]),
            )
            dept["Engineering"] = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO departments (name, head_user_id) VALUES (%s, %s) RETURNING id",
                ("Facilities", users["Rohan Mehta"]),
            )
            dept["Facilities"] = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO departments (name, head_user_id) VALUES (%s, %s) RETURNING id",
                ("Field Ops", users["Sana Iqbal"]),
            )
            dept["Field Ops"] = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO departments (name, parent_id, head_user_id, is_active) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                ("Field Ops (east)", dept["Field Ops"], users["Sana Iqbal"], False),
            )
            dept["Field Ops (east)"] = cur.fetchone()["id"]

            # assign people to departments
            for name, dname in [
                ("Aditi Rao", "Engineering"), ("Priya Shah", "Engineering"),
                ("Arjun Nair", "Engineering"), ("Rohan Mehta", "Facilities"),
                ("Sana Iqbal", "Field Ops"), ("R. Varma", "Facilities"),
                ("Neha Gupta", "Engineering"), ("Meera Krishnan", "Facilities"),
            ]:
                cur.execute("UPDATE users SET department_id = %s WHERE id = %s",
                            (dept[dname], users[name]))

            # ---- assets (explicit demo tags to match the mockups) -----------
            # (tag, name, category, cost, condition, location, bookable, status)
            asset_rows = [
                ("AF-0114", "Dell Laptop",     "Electronics", 82000, "good",   "Bengaluru",   False, "allocated"),
                ("AF-0012", "Dell Laptop",     "Electronics", 79000, "good",   "Bengaluru",   False, "allocated"),
                ("AF-0062", "Projector",       "Electronics", 45000, "fair",   "HQ Floor 2",  False, "under_maintenance"),
                ("AF-0201", "Office Chair",    "Furniture",    6500, "good",   "Warehouse",   False, "available"),
                ("AF-0301", "Camera",          "Electronics", 55000, "good",   "Studio",      False, "available"),
                ("AF-0410", "Office Chair",    "Furniture",    6500, "fair",   "Warehouse",   False, "available"),
                ("AF-0021", "Monitor",         "Electronics", 18000, "good",   "Bengaluru",   False, "allocated"),
                ("AF-0087", "Forklift",        "Vehicles",   950000, "good",   "Loading Bay", False, "under_maintenance"),
                ("AF-0343", "Delivery Van",    "Vehicles",  1400000, "good",   "Depot",       False, "available"),
                ("AF-0897", "Printer",         "Electronics", 22000, "poor",   "HQ Floor 1",  False, "under_maintenance"),
                ("AF-0303", "AC Unit",         "Electronics", 38000, "fair",   "HQ Floor 3",  False, "under_maintenance"),
                ("AF-0873", "Meeting Chair",   "Furniture",    7000, "good",   "HQ Floor 1",  False, "available"),
                ("AF-0003", "Dell Laptop",     "Electronics", 80000, "good",   "Desk E12",    False, "available"),
                ("AF-9921", "Office Chair",    "Furniture",    6500, "good",   "Desk E14",    False, "available"),
                ("AF-9838", "Monitor",         "Electronics", 17000, "damaged","Desk E15",    False, "available"),
                ("ROOM-B2", "Conference Room B2", None,          None, "good",  "HQ Floor 2",  True,  "available"),
            ]
            asset = {}
            for tag, name, catname, cost, cond, loc, is_book, statuscol in asset_rows:
                cur.execute(
                    """INSERT INTO assets (tag, name, category_id, cost, acquisition_date,
                                           condition, location, is_bookable, status)
                       VALUES (%s, %s, %s, %s, current_date - interval '2 years',
                               %s, %s, %s, %s) RETURNING id""",
                    (tag, name, cat.get(catname) if catname else None, cost,
                     cond, loc, is_book, statuscol),
                )
                asset[tag] = cur.fetchone()["id"]
            # advance the auto-tag sequence past the seeded numbers so new AF-#### don't collide
            cur.execute("SELECT setval('asset_tag_seq', 950, true)")

            # ---- allocations (Priya holds AF-0114; AF-0021 is 3 days OVERDUE)
            cur.execute(
                """INSERT INTO allocations (asset_id, employee_id, allocated_by, allocated_at,
                                            expected_return_date)
                   VALUES (%s, %s, %s, now() - interval '4 days', current_date + interval '20 days')""",
                (asset["AF-0114"], users["Priya Shah"], users["Meera Krishnan"]),
            )
            cur.execute(
                """INSERT INTO allocations (asset_id, department_id, allocated_by, allocated_at,
                                            expected_return_date)
                   VALUES (%s, %s, %s, now() - interval '10 days', current_date + interval '5 days')""",
                (asset["AF-0012"], dept["Engineering"], users["Meera Krishnan"]),
            )
            cur.execute(
                """INSERT INTO allocations (asset_id, employee_id, allocated_by, allocated_at,
                                            expected_return_date)
                   VALUES (%s, %s, %s, now() - interval '30 days', current_date - interval '3 days')""",
                (asset["AF-0021"], users["Arjun Nair"], users["Meera Krishnan"]),
            )
            # a returned allocation, for asset history (condition note comes from check-in)
            cur.execute(
                """INSERT INTO allocations (asset_id, employee_id, allocated_by, allocated_at,
                                            expected_return_date, returned_at, return_condition, notes)
                   VALUES (%s, %s, %s, now() - interval '90 days', current_date - interval '60 days',
                           now() - interval '58 days', 'good', 'Returned in good condition')""",
                (asset["AF-0201"], users["Arjun Nair"], users["Meera Krishnan"]),
            )

            # ---- pending transfer (AF-0114 Priya -> Neha) -------------------
            cur.execute(
                """INSERT INTO transfers (asset_id, to_employee_id, requested_by, status, reason)
                   VALUES (%s, %s, %s, 'requested', 'Priya moving to a new project')""",
                (asset["AF-0114"], users["Neha Gupta"], users["Arjun Nair"]),
            )

            # ---- booking: Room B2 booked 09:00-10:00 today, plus a future one
            # Times are interpreted as IST wall-clock so the demo timeline reads 9-10 / 2-3.
            cur.execute(
                """INSERT INTO bookings (asset_id, booked_by, time_range, purpose)
                   VALUES (%s, %s, tstzrange((current_date + time '09:00') AT TIME ZONE 'Asia/Kolkata',
                                             (current_date + time '10:00') AT TIME ZONE 'Asia/Kolkata', '[)'),
                           'Procurement Team sync')""",
                (asset["ROOM-B2"], users["Procurement Team"]),
            )
            cur.execute(
                """INSERT INTO bookings (asset_id, booked_by, time_range, purpose)
                   VALUES (%s, %s, tstzrange((current_date + time '14:00') AT TIME ZONE 'Asia/Kolkata',
                                             (current_date + time '15:00') AT TIME ZONE 'Asia/Kolkata', '[)'),
                           'Design review')""",
                (asset["ROOM-B2"], users["Priya Shah"]),
            )

            # ---- maintenance across all five kanban columns -----------------
            maint = [
                ("AF-0062", "Projector bulb not turning on", "high",     "pending",             None,        None),
                ("AF-0303", "AC unit noisy compressor",      "medium",   "approved",            None,        None),
                ("AF-0087", "Forklift hydraulics leaking",   "critical", "technician_assigned", "R. Varma",  None),
                ("AF-0897", "Printer jam, parts ordered",    "low",      "in_progress",         "R. Varma",  None),
                ("AF-0873", "Chair wobble repaired",         "low",      "resolved",            "R. Varma",  "Replaced base"),
            ]
            for tag, issue, prio, st, tech, res in maint:
                cur.execute(
                    """INSERT INTO maintenance_requests
                         (asset_id, raised_by, issue, priority, status, technician_name,
                          decided_by, resolution, resolved_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                               CASE WHEN %s = 'resolved' THEN now() ELSE NULL END)""",
                    (asset[tag], users["Priya Shah"], issue, prio, st, tech,
                     (users["Meera Krishnan"] if st != "pending" else None),
                     res, st),
                )

            # ---- audit cycle (closed) with 1 verified / 1 missing / 1 damaged
            cur.execute(
                """INSERT INTO audit_cycles (name, scope, auditor_id, start_date, end_date, is_closed)
                   VALUES ('Q3 audit: Engineering dept', 'Engineering', %s,
                           current_date - interval '15 days', current_date - interval '1 day', TRUE)
                   RETURNING id""",
                (users["Aditi Rao"],),
            )
            cycle_id = cur.fetchone()["id"]
            for tag, st, note in [
                ("AF-0003", "verified", "Present at Desk E12"),
                ("AF-9921", "missing",  "Not found at Desk E14"),
                ("AF-9838", "damaged",  "Cracked panel at Desk E15"),
            ]:
                cur.execute(
                    """INSERT INTO audit_items (cycle_id, asset_id, status, note, checked_at)
                       VALUES (%s, %s, %s, %s, now() - interval '2 days')""",
                    (cycle_id, asset[tag], st, note),
                )

            # ---- notifications (Screen 10 rows) -----------------------------
            notes = [
                (users["Priya Shah"],     "approval", "Laptop AF-0114 assigned to you"),
                (users["Meera Krishnan"], "approval", "Maintenance request AF-0303 approved"),
                (users["Procurement Team"],"booking",  "Booking confirmed: Room B2 · 9:00 to 10:00"),
                (users["Rohan Mehta"],    "approval", "Transfer approved: AF-0033 to Facilities dept"),
                (users["Meera Krishnan"], "alert",    "Overdue return: AF-0021 was due 3 days ago"),
                (users["Aditi Rao"],      "alert",    "Audit discrepancy flagged: AF-9838 damaged"),
                # Admin sees the full activity feed (Screen 10) — the demo account.
                (users["Admin User"], "approval", "Laptop AF-0114 assigned to Priya Shah"),
                (users["Admin User"], "approval", "Maintenance request AF-0303 approved"),
                (users["Admin User"], "booking",  "Booking confirmed: Room B2 · 9:00 to 10:00"),
                (users["Admin User"], "approval", "Transfer approved: AF-0033 to Facilities dept"),
                (users["Admin User"], "alert",    "Overdue return: AF-0021 was due 3 days ago"),
                (users["Admin User"], "alert",    "Audit discrepancy flagged: AF-9838 damaged"),
            ]
            for uid, ntype, msg in notes:
                cur.execute(
                    "INSERT INTO notifications (user_id, type, message) VALUES (%s, %s, %s)",
                    (uid, ntype, msg),
                )

            # ---- a little asset history -------------------------------------
            cur.execute(
                """INSERT INTO asset_history (asset_id, event_type, detail, actor_id)
                   VALUES (%s, 'allocated', 'Allocated to Priya Shah - Engineering', %s)""",
                (asset["AF-0114"], users["Meera Krishnan"]),
            )

        conn.commit()
    print(f"Seed complete. Demo login password for every account: {DEMO_PASSWORD!r}")
    print("  admin@assetflow.com (admin) · manager@assetflow.com (asset_manager) · priya@assetflow.com (employee)")


if __name__ == "__main__":
    seed()
