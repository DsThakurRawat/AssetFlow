import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { CalendarClock, Plus, X, Trash2, Clock, AlertCircle } from 'lucide-react'
import { assetsAPI, bookingsAPI } from '../lib/api'
import StatusPill from '../components/StatusPill'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'

// ----- Types -----
interface BookableAsset {
  id: number
  tag: string
  name: string
}

interface Booking {
  id: number
  start_time: string // ISO datetime
  end_time: string // ISO datetime
  purpose: string | null
  status: string // 'confirmed' | 'cancelled'
  booked_by_name: string
  asset_tag: string
}

interface ConflictSlot {
  start: string // "HH:MM"
  end: string // "HH:MM"
}

type BookingPhase = 'upcoming' | 'ongoing' | 'completed' | 'cancelled'

// ----- Timeline constants -----
const DAY_START = 8 // 08:00
const DAY_END = 19 // 19:00
const HOUR_HEIGHT = 56 // px per hour
const HOURS: number[] = Array.from(
  { length: DAY_END - DAY_START + 1 },
  (_: unknown, i: number) => DAY_START + i,
)

// ----- Helpers -----
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Decimal hour of an ISO datetime, in local time (e.g. 9.5 for 09:30). */
function decimalHour(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

/** Formats an ISO time as "9" (on the hour) or "9:30". */
function fmtHour(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}

/** Formats an "HH:MM" input string as "9" or "9:30". */
function fmtTimeStr(t: string): string {
  const [hs, ms] = t.split(':')
  const h = parseInt(hs, 10)
  const m = parseInt(ms, 10)
  if (Number.isNaN(h)) return t
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}

/** Decimal hour from an "HH:MM" input string. */
function decimalFromStr(t: string): number {
  const [hs, ms] = t.split(':')
  return (parseInt(hs, 10) || 0) + (parseInt(ms, 10) || 0) / 60
}

/** Builds a full ISO string from a date (YYYY-MM-DD) + time (HH:MM). */
function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

/** Derives the temporal phase of a booking from now vs its range. */
function bookingPhase(b: Booking): BookingPhase {
  if (b.status === 'cancelled') return 'cancelled'
  const now = Date.now()
  const start = new Date(b.start_time).getTime()
  const end = new Date(b.end_time).getTime()
  if (now < start) return 'upcoming'
  if (now >= end) return 'completed'
  return 'ongoing'
}

const PHASE_LABEL: Record<BookingPhase, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** Formats a YYYY-MM-DD date as "Sun, 12 Jul". */
function fmtDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function Booking() {
  document.title = 'Resource Booking — AssetFlow'

  const queryClient = useQueryClient()

  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [date, setDate] = useState<string>(todayStr())
  const [showForm, setShowForm] = useState<boolean>(false)
  const [startTime, setStartTime] = useState<string>('09:00')
  const [endTime, setEndTime] = useState<string>('10:00')
  const [purpose, setPurpose] = useState<string>('')
  const [conflict, setConflict] = useState<ConflictSlot | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)

  // ----- Bookable assets -----
  const assetsQuery = useQuery({
    queryKey: ['assets', 'bookable'],
    queryFn: () => assetsAPI.list({ bookable: true }).then((r) => r.data as BookableAsset[]),
  })

  // Auto-select the first bookable asset once loaded.
  useEffect(() => {
    if (selectedAssetId === null && assetsQuery.data && assetsQuery.data.length > 0) {
      setSelectedAssetId(assetsQuery.data[0].id)
    }
  }, [assetsQuery.data, selectedAssetId])

  // ----- Bookings for the selected asset + day -----
  const bookingsQuery = useQuery({
    queryKey: ['bookings', selectedAssetId, date],
    queryFn: () =>
      bookingsAPI
        .list({ asset_id: selectedAssetId as number, date })
        .then((r) => r.data as Booking[]),
    enabled: selectedAssetId !== null,
  })

  // ----- Create booking -----
  const createMutation = useMutation({
    mutationFn: () =>
      bookingsAPI.create({
        asset_id: selectedAssetId,
        start_time: toISO(date, startTime),
        end_time: toISO(date, endTime),
        purpose: purpose.trim(),
      }),
    onSuccess: () => {
      setConflict(null)
      setInlineError(null)
      setShowForm(false)
      setPurpose('')
      queryClient.invalidateQueries({ queryKey: ['bookings', selectedAssetId, date] })
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) {
        const status = err.response?.status
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail
        if (status === 409) {
          // Conflict money-shot — surface the requested slot as a red dashed block.
          setConflict({ start: startTime, end: endTime })
          setInlineError(null)
          return
        }
        if (status === 400) {
          setConflict(null)
          setInlineError(detail || 'Cannot book a resource in the past')
          return
        }
        setConflict(null)
        setInlineError(detail || 'Could not create booking. Please try again.')
        return
      }
      setConflict(null)
      setInlineError('Could not create booking. Please try again.')
    },
  })

  // ----- Cancel booking -----
  const cancelMutation = useMutation({
    mutationFn: (id: number) => bookingsAPI.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', selectedAssetId, date] })
    },
  })

  const assets = assetsQuery.data ?? []
  const selectedAsset = assets.find((a: BookableAsset) => a.id === selectedAssetId) ?? null

  const confirmedBookings = useMemo<Booking[]>(
    () =>
      (bookingsQuery.data ?? [])
        .filter((b: Booking) => b.status === 'confirmed')
        .sort(
          (a: Booking, b: Booking) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ),
    [bookingsQuery.data],
  )

  // Reset transient feedback whenever the resource or day changes.
  function handleAssetChange(id: number) {
    setSelectedAssetId(id)
    setConflict(null)
    setInlineError(null)
  }
  function handleDateChange(next: string) {
    setDate(next)
    setConflict(null)
    setInlineError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedAssetId === null) return
    if (decimalFromStr(endTime) <= decimalFromStr(startTime)) {
      setInlineError('End time must be after start time.')
      return
    }
    createMutation.mutate()
  }

  // ----- Loading / error / empty (page-level) -----
  if (assetsQuery.isLoading) return <LoadingState message="Loading bookable resources…" />
  if (assetsQuery.isError)
    return <ErrorState message="Could not load resources" onRetry={() => assetsQuery.refetch()} />
  if (assets.length === 0)
    return (
      <EmptyState
        icon={<CalendarClock size={28} />}
        title="No bookable resources"
        message="No assets are marked bookable yet. Mark an asset bookable to reserve time slots."
      />
    )

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
      {/* Heading */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}
        >
          Resource Booking
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Reserve a shared resource by time slot — overlapping bookings are rejected.
        </p>
      </div>

      {/* Resource picker + date + Book a slot */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ flex: '1 1 260px', minWidth: 200 }}>
          <span style={fieldLabel}>Resource</span>
          <select
            className="select"
            value={selectedAssetId ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              handleAssetChange(Number(e.target.value))
            }
          >
            {assets.map((a: BookableAsset) => (
              <option key={a.id} value={a.id}>
                {a.tag} — {a.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ flex: '0 1 190px', minWidth: 160 }}>
          <span style={fieldLabel}>Date</span>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDateChange(e.target.value)}
          />
        </label>

        <button
          className="btn-primary"
          onClick={() => {
            setShowForm((v: boolean) => !v)
            setConflict(null)
            setInlineError(null)
          }}
          style={{ marginLeft: 'auto' }}
        >
          <Plus size={16} />
          Book a slot
        </button>
      </div>

      {/* Booking form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card animate-fade-in"
          style={{ padding: '18px 20px', marginBottom: 20 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              New booking · {selectedAsset ? selectedAsset.tag : ''} · {fmtDateLabel(date)}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              aria-label="Close form"
              style={iconBtn}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ flex: '0 1 150px', minWidth: 130 }}>
              <span style={fieldLabel}>Start time</span>
              <input
                type="time"
                className="input"
                value={startTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label style={{ flex: '0 1 150px', minWidth: 130 }}>
              <span style={fieldLabel}>End time</span>
              <input
                type="time"
                className="input"
                value={endTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value)}
                required
              />
            </label>
            <label style={{ flex: '1 1 240px', minWidth: 200 }}>
              <span style={fieldLabel}>Purpose</span>
              <input
                type="text"
                className="input"
                placeholder="e.g. Procurement Team sync"
                value={purpose}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPurpose(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isPending}
              style={createMutation.isPending ? { opacity: 0.6, cursor: 'wait' } : undefined}
            >
              {createMutation.isPending ? 'Booking…' : 'Submit'}
            </button>
          </div>

          {/* Inline error (e.g. 400 booking in the past, end<=start) */}
          {inlineError && (
            <div
              className="animate-fade-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-pill-red-bg)',
                color: 'var(--color-pill-red-text)',
                fontSize: '0.82rem',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{inlineError}</span>
            </div>
          )}
        </form>
      )}

      {/* Main: timeline + booking list */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(260px, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* --- Single-day vertical hour timeline --- */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <CalendarClock size={16} style={{ color: 'var(--color-accent-blue)' }} />
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {selectedAsset ? `${selectedAsset.tag} — ${selectedAsset.name}` : 'Resource'}
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
                {'  ·  '}
                {fmtDateLabel(date)}
              </span>
            </h2>
          </div>

          {bookingsQuery.isLoading ? (
            <LoadingState message="Loading day…" />
          ) : bookingsQuery.isError ? (
            <ErrorState message="Could not load bookings" onRetry={() => bookingsQuery.refetch()} />
          ) : (
            <Timeline
              bookings={confirmedBookings}
              conflict={conflict}
              onCancel={(id: number) => cancelMutation.mutate(id)}
              cancellingId={cancelMutation.isPending ? cancelMutation.variables ?? null : null}
            />
          )}
        </div>

        {/* --- Bookings list for the day --- */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14 }}>
            Bookings this day
          </h2>

          {bookingsQuery.isLoading ? (
            <LoadingState message="Loading…" />
          ) : confirmedBookings.length === 0 ? (
            <div
              style={{
                padding: '28px 0',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.82rem',
              }}
            >
              No bookings for this day yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {confirmedBookings.map((b: Booking, i: number) => {
                const phase = bookingPhase(b)
                const canCancel = phase === 'upcoming' || phase === 'ongoing'
                return (
                  <div
                    key={b.id}
                    className="animate-fade-in"
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      background: 'var(--color-bg-input)',
                      animationDelay: `${i * 40}ms`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        <Clock size={13} style={{ color: 'var(--color-text-muted)' }} />
                        {fmtHour(b.start_time)} to {fmtHour(b.end_time)}
                      </span>
                      <StatusPill label={PHASE_LABEL[phase]} />
                    </div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: canCancel ? 8 : 0,
                      }}
                    >
                      {b.purpose || b.booked_by_name}
                      {b.purpose && (
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {'  ·  '}
                          {b.booked_by_name}
                        </span>
                      )}
                    </div>
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(b.id)}
                        disabled={cancelMutation.isPending && cancelMutation.variables === b.id}
                        style={cancelLink}
                      >
                        <Trash2 size={12} />
                        {cancelMutation.isPending && cancelMutation.variables === b.id
                          ? 'Cancelling…'
                          : 'Cancel'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline sub-component
// ---------------------------------------------------------------------------
interface TimelineProps {
  bookings: Booking[]
  conflict: ConflictSlot | null
  onCancel: (id: number) => void
  cancellingId: number | null
}

function Timeline({ bookings, conflict, onCancel, cancellingId }: TimelineProps) {
  const gridHeight = (DAY_END - DAY_START) * HOUR_HEIGHT

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {/* Hour gutter */}
      <div style={{ width: 46, flexShrink: 0, position: 'relative', height: gridHeight }}>
        {HOURS.map((h: number) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: (h - DAY_START) * HOUR_HEIGHT - 7,
              right: 8,
              fontSize: '0.72rem',
              color: 'var(--color-text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Grid + blocks */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: gridHeight,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        {/* Hour gridlines */}
        {HOURS.map((h: number) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: (h - DAY_START) * HOUR_HEIGHT,
              left: 0,
              right: 0,
              borderBottom: '1px solid var(--color-border)',
            }}
          />
        ))}

        {/* Booked blocks (blue) */}
        {bookings.map((b: Booking) => {
          const startDec = Math.max(decimalHour(b.start_time), DAY_START)
          const endDec = Math.min(decimalHour(b.end_time), DAY_END)
          if (endDec <= startDec) return null
          const top = (startDec - DAY_START) * HOUR_HEIGHT
          const height = (endDec - startDec) * HOUR_HEIGHT
          const label = b.purpose || b.booked_by_name
          const isCancelling = cancellingId === b.id
          return (
            <div
              key={b.id}
              className="animate-fade-in"
              title={`Booked – ${label} – ${fmtHour(b.start_time)} to ${fmtHour(b.end_time)}`}
              style={{
                position: 'absolute',
                top: top + 2,
                left: 4,
                right: 8,
                height: Math.max(height - 4, 20),
                background: 'var(--color-accent-blue)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 6,
                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.35)',
                opacity: isCancelling ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {`Booked – ${label} – ${fmtHour(b.start_time)} to ${fmtHour(b.end_time)}`}
              </span>
              <button
                type="button"
                onClick={() => onCancel(b.id)}
                disabled={isCancelling}
                aria-label="Cancel booking"
                title="Cancel booking"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  cursor: isCancelling ? 'wait' : 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}

        {/* Conflict block (red dashed) — the rejected request */}
        {conflict &&
          (() => {
            const startDec = Math.max(decimalFromStr(conflict.start), DAY_START)
            const endDec = Math.min(decimalFromStr(conflict.end), DAY_END)
            const safeEnd = endDec <= startDec ? startDec + 0.5 : endDec
            const top = (startDec - DAY_START) * HOUR_HEIGHT
            const height = (safeEnd - startDec) * HOUR_HEIGHT
            return (
              <div
                className="animate-fade-in"
                style={{
                  position: 'absolute',
                  top: top + 2,
                  left: 4,
                  right: 8,
                  height: Math.max(height - 4, 24),
                  border: '2px dashed var(--color-accent-red)',
                  background: 'var(--color-pill-red-bg)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  zIndex: 2,
                }}
              >
                <span
                  style={{
                    color: 'var(--color-pill-red-text)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  {`Requested ${fmtTimeStr(conflict.start)} to ${fmtTimeStr(
                    conflict.end,
                  )} – conflict – slot is unavailable`}
                </span>
              </div>
            )
          })()}
      </div>
    </div>
  )
}

// ----- Inline style tokens -----
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border-light)',
  background: 'transparent',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
}

const cancelLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 8px',
  fontSize: '0.74rem',
  fontWeight: 600,
  color: 'var(--color-pill-red-text)',
  background: 'var(--color-pill-red-bg)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
}
