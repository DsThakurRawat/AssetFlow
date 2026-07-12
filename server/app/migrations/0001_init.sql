-- =============================================================================
-- AssetFlow — 0001_init.sql
-- Enterprise Asset & Resource Management System — initial schema.
--
-- Design principles (defend these out loud):
--   * All timestamps are UTC (timestamptz). The DB is the source of truth for time.
--   * Business rules are DATABASE FACTS wherever a constraint can express them,
--     not just service-layer checks — so concurrent writers cannot violate them.
--   * Guard 1: an asset can have at most ONE active allocation  -> partial UNIQUE index.
--   * Guard 2: a resource's bookings cannot overlap in time     -> gist EXCLUDE constraint.
--   * Allocation target is employee XOR department              -> num_nonnulls(...) = 1 CHECK.
-- =============================================================================

BEGIN;

-- btree_gist lets a gist index mix an equality column (asset_id) with a range
-- column (time_range) inside one EXCLUDE constraint. Required for Guard 2.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Enumerated types — invalid states are unrepresentable.
-- ---------------------------------------------------------------------------
CREATE TYPE user_role         AS ENUM ('admin', 'asset_manager', 'dept_head', 'employee');
CREATE TYPE asset_condition   AS ENUM ('new', 'good', 'fair', 'poor', 'damaged');
CREATE TYPE asset_status      AS ENUM ('available', 'allocated', 'under_maintenance', 'retired', 'lost', 'disposed');
CREATE TYPE transfer_status   AS ENUM ('requested', 'approved', 'rejected', 'completed');
CREATE TYPE booking_status    AS ENUM ('confirmed', 'cancelled');
-- Kanban columns (Screen 7): Pending | Approved | Technician assigned | In progress | Resolved (+ rejected leaves board)
CREATE TYPE maint_status      AS ENUM ('pending', 'approved', 'technician_assigned', 'in_progress', 'resolved', 'rejected');
CREATE TYPE maint_priority    AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE audit_item_status AS ENUM ('pending', 'verified', 'missing', 'damaged');

-- ---------------------------------------------------------------------------
-- Departments — self-referential hierarchy, optional head.
-- head_user_id FK is added after users exists (circular dependency).
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
    id           SERIAL PRIMARY KEY,
    name         TEXT    NOT NULL,
    parent_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    head_user_id INTEGER,                        -- FK added below
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT dept_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX departments_name_ci_uq ON departments (lower(name));

-- ---------------------------------------------------------------------------
-- Users — signup creates 'employee' only; roles are promoted from the directory.
-- ---------------------------------------------------------------------------
-- email is plain TEXT + a case-insensitive UNIQUE index (avoids the citext
-- extension dependency while still rejecting Alice@x.com vs alice@x.com).
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          TEXT      NOT NULL,
    email         TEXT      NOT NULL,
    password_hash TEXT      NOT NULL,
    role          user_role NOT NULL DEFAULT 'employee',
    department_id INTEGER   REFERENCES departments(id) ON DELETE SET NULL,
    is_active     BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_ci_uq ON users (lower(email));
CREATE INDEX users_department_idx ON users (department_id);

-- Now that users exists, wire the department head FK.
ALTER TABLE departments
    ADD CONSTRAINT departments_head_fk
    FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Categories — optional warranty period (months).
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    warranty_months INTEGER CHECK (warranty_months IS NULL OR warranty_months >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_ci_uq ON categories (lower(name));

-- ---------------------------------------------------------------------------
-- Assets — auto tag AF-0001 via a sequence-backed default.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE asset_tag_seq START 1;

CREATE TABLE assets (
    id            SERIAL PRIMARY KEY,
    tag           TEXT NOT NULL UNIQUE
                    DEFAULT ('AF-' || lpad(nextval('asset_tag_seq')::text, 4, '0')),
    name          TEXT NOT NULL,
    serial_number TEXT,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    cost          NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
    acquisition_date DATE,
    condition     asset_condition NOT NULL DEFAULT 'good',
    location      TEXT,
    photo_url     TEXT,
    is_bookable   BOOLEAN NOT NULL DEFAULT FALSE,
    status        asset_status NOT NULL DEFAULT 'available',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_status_idx      ON assets (status);
CREATE INDEX assets_category_idx    ON assets (category_id);
CREATE UNIQUE INDEX assets_serial_uq ON assets (serial_number) WHERE serial_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Allocations — an asset is held by an employee XOR a department.
--   Guard 1: at most one *active* (returned_at IS NULL) allocation per asset.
--   XOR:     exactly one of employee_id / department_id is set.
-- ---------------------------------------------------------------------------
CREATE TABLE allocations (
    id                   SERIAL PRIMARY KEY,
    asset_id             INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    employee_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    department_id        INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    allocated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    allocated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expected_return_date DATE,
    returned_at          TIMESTAMPTZ,
    return_condition     asset_condition,
    notes                TEXT,
    CONSTRAINT alloc_target_xor CHECK (num_nonnulls(employee_id, department_id) = 1)
);
-- GUARD 1 — exclusivity is binary (no time dimension), so a partial UNIQUE index
-- is exactly right: only rows still on loan (returned_at IS NULL) are constrained.
CREATE UNIQUE INDEX one_active_allocation
    ON allocations (asset_id) WHERE returned_at IS NULL;
CREATE INDEX allocations_asset_idx    ON allocations (asset_id);
CREATE INDEX allocations_employee_idx ON allocations (employee_id);
-- Fast overdue scan: still-out allocations past their expected return date.
CREATE INDEX allocations_overdue_idx
    ON allocations (expected_return_date) WHERE returned_at IS NULL;

-- ---------------------------------------------------------------------------
-- Transfers — request to move a held asset to a new holder, with approval.
-- ---------------------------------------------------------------------------
CREATE TABLE transfers (
    id               SERIAL PRIMARY KEY,
    asset_id         INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    to_employee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    to_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    requested_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status           transfer_status NOT NULL DEFAULT 'requested',
    reason           TEXT,
    requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at       TIMESTAMPTZ,
    CONSTRAINT transfer_target_xor CHECK (num_nonnulls(to_employee_id, to_department_id) = 1)
);
-- Only one open transfer request per asset at a time.
CREATE UNIQUE INDEX one_open_transfer
    ON transfers (asset_id) WHERE status = 'requested';
CREATE INDEX transfers_asset_idx  ON transfers (asset_id);
CREATE INDEX transfers_status_idx ON transfers (status);

-- ---------------------------------------------------------------------------
-- Bookings — time-boxed reservations of a bookable resource.
--   Guard 2: no two non-cancelled bookings of the same asset may overlap.
--   time_range uses [) bounds, so 10:00-11:00 right after 09:00-10:00 is legal.
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
    id         SERIAL PRIMARY KEY,
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    booked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    time_range TSTZRANGE NOT NULL,
    purpose    TEXT,
    status     booking_status NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT booking_range_nonempty CHECK (NOT isempty(time_range)),
    CONSTRAINT booking_range_bounds   CHECK (lower_inc(time_range) AND NOT upper_inc(time_range)),
    -- GUARD 2 — booking conflicts are range overlaps, so an exclusion constraint
    -- is the natural mechanism. Cancelled bookings are excluded from the guard.
    CONSTRAINT no_booking_overlap EXCLUDE USING gist (
        asset_id   WITH =,
        time_range WITH &&
    ) WHERE (status <> 'cancelled')
);
CREATE INDEX bookings_asset_idx ON bookings (asset_id);
CREATE INDEX bookings_range_idx ON bookings USING gist (time_range);

-- ---------------------------------------------------------------------------
-- Maintenance — raise -> approve/reject -> in progress -> resolved.
-- Asset status flips (Under Maintenance / Available) happen in the service layer.
-- ---------------------------------------------------------------------------
CREATE TABLE maintenance_requests (
    id          SERIAL PRIMARY KEY,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    raised_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    issue       TEXT NOT NULL,
    priority    maint_priority NOT NULL DEFAULT 'medium',
    status      maint_status   NOT NULL DEFAULT 'pending',
    photo_url      TEXT,
    technician_name TEXT,
    decided_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolution  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX maint_asset_idx  ON maintenance_requests (asset_id);
CREATE INDEX maint_status_idx ON maintenance_requests (status);

-- ---------------------------------------------------------------------------
-- Asset history — append-only per-asset event log.
-- ---------------------------------------------------------------------------
CREATE TABLE asset_history (
    id         SERIAL PRIMARY KEY,
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,       -- registered | allocated | returned | transferred | maintenance | booked | status_change
    detail     TEXT,
    actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX asset_history_asset_idx ON asset_history (asset_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Notifications — per-user bell feed.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Screen 10 filter pills (All | Alerts | Approvals | Bookings) map 1:1 to these.
    type       TEXT NOT NULL CHECK (type IN ('alert', 'approval', 'booking')),
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audit cycles (Tier 2) — scope a set of assets, assign an auditor, mark each.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_cycles (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    scope       TEXT,               -- free text / category / location scope note
    auditor_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    start_date  DATE,
    end_date    DATE,
    is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_date_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE audit_items (
    id         SERIAL PRIMARY KEY,
    cycle_id   INTEGER NOT NULL REFERENCES audit_cycles(id) ON DELETE CASCADE,
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    status     audit_item_status NOT NULL DEFAULT 'pending',
    note       TEXT,
    checked_at TIMESTAMPTZ,
    UNIQUE (cycle_id, asset_id)
);
CREATE INDEX audit_items_cycle_idx ON audit_items (cycle_id);

COMMIT;
