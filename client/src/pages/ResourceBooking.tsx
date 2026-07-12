import React, { useState, useEffect } from "react";

interface Asset {
  id: number;
  tag: string;
  name: string;
  is_bookable: boolean;
  status: string;
  location?: string;
}

interface Booking {
  id: number;
  asset_id: number;
  asset_name: string;
  asset_tag: string;
  booked_by_name: string;
  start_time: string;
  end_time: string;
  purpose?: string;
  status: "confirmed" | "cancelled";
}

const API_BASE = "http://localhost:8000/api";

export default function ResourceBooking() {
  // Master lists
  const [bookableAssets, setBookableAssets] = useState<Asset[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Selected state
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State: New Booking
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [purpose, setPurpose] = useState("");

  // Submissions
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingFeedback, setBookingFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fetch bookable assets
  useEffect(() => {
    async function fetchAssets() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/assets?bookable=true`);
        if (!response.ok) {
          throw new Error("Failed to load bookable assets.");
        }
        const data = await response.json();
        // Filter locally just in case backend query parameter differs
        const bookables = data.filter((a: Asset) => a.is_bookable);
        setBookableAssets(bookables);
        
        if (bookables.length > 0) {
          setSelectedAssetId(bookables[0].id.toString());
        }
      } catch (err: any) {
        setError(err.message || "An error occurred.");
      } finally {
        setLoading(false);
      }
    }
    fetchAssets();
  }, []);

  // Fetch Bookings when asset or date changes
  useEffect(() => {
    if (!selectedAssetId) return;

    async function fetchBookings() {
      try {
        const response = await fetch(
          `${API_BASE}/bookings?asset_id=${selectedAssetId}&date=${selectedDate}`
        );
        if (response.ok) {
          setBookings(await response.json());
        }
      } catch (err) {
        console.error("Failed to load bookings:", err);
      }
    }
    fetchBookings();
  }, [selectedAssetId, selectedDate]);

  // Handle New Booking Submission
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingFeedback(null);

    if (!selectedAssetId) {
      setBookingFeedback({ type: "error", message: "Please select a resource to book." });
      return;
    }

    // Build ISO timestamps for time_range bounds [)
    const startIso = `${bookingDate}T${startTime}:00Z`;
    const endIso = `${bookingDate}T${endTime}:00Z`;

    if (new Date(startIso) >= new Date(endIso)) {
      setBookingFeedback({ type: "error", message: "End time must be after start time." });
      return;
    }

    setSubmittingBooking(true);

    try {
      const response = await fetch(`${API_BASE}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: parseInt(selectedAssetId),
          start_time: startIso,
          end_time: endIso,
          purpose: purpose || null
        })
      });

      const data = await response.json();

      if (response.status === 409) {
        setBookingFeedback({
          type: "error",
          message: "Guard 2 Check: Overlapping reservation! Selected slot is already booked."
        });
      } else if (!response.ok) {
        throw new Error(data.detail || "Booking failed.");
      } else {
        setBookingFeedback({ type: "success", message: "Reservation confirmed successfully!" });
        setPurpose("");
        
        // Refresh bookings list
        const refreshedRes = await fetch(
          `${API_BASE}/bookings?asset_id=${selectedAssetId}&date=${selectedDate}`
        );
        if (refreshedRes.ok) setBookings(await refreshedRes.json());
      }
    } catch (err: any) {
      setBookingFeedback({ type: "error", message: err.message || "An unexpected error occurred." });
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Cancel Booking
  const handleCancelBooking = async (bookingId: number) => {
    try {
      const response = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }
      });

      if (response.ok) {
        setBookingFeedback({ type: "success", message: "Booking cancelled." });
        // Refresh
        const refreshedRes = await fetch(
          `${API_BASE}/bookings?asset_id=${selectedAssetId}&date=${selectedDate}`
        );
        if (refreshedRes.ok) setBookings(await refreshedRes.json());
      } else {
        const data = await response.json();
        setBookingFeedback({ type: "error", message: data.detail || "Cancellation failed." });
      }
    } catch (err: any) {
      setBookingFeedback({ type: "error", message: err.message || "An error occurred." });
    }
  };

  const getSelectedAsset = () => {
    return bookableAssets.find((a) => a.id.toString() === selectedAssetId);
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] p-6 font-sans">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
          Resource Booking
        </h1>
        <p className="text-neutral-400 text-sm mt-1">Book shared facilities, meeting rooms, and team hardware devices</p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-neutral-400">
          <svg className="animate-spin h-8 w-8 text-emerald-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p>Loading bookable assets...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-6 text-center text-rose-400">
          <p className="font-bold">Error Loading View</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : bookableAssets.length === 0 ? (
        <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-16 text-center text-neutral-500">
          <svg className="w-12 h-12 text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-base font-semibold">No bookable resources registered</p>
          <p className="text-xs text-neutral-600 mt-1">Make sure you have registered assets with the 'shared/bookable' option enabled.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Form & details */}
          <div className="lg:col-span-1 space-y-6">
            {/* Feedback Alert */}
            {bookingFeedback && (
              <div
                className={`p-4 rounded-xl text-xs font-semibold border ${
                  bookingFeedback.type === "success"
                    ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-400"
                    : "bg-rose-950/40 border-rose-800/80 text-rose-400"
                }`}
              >
                {bookingFeedback.message}
              </div>
            )}

            {/* Selected Resource Details Card */}
            {getSelectedAsset() && (
              <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-5 shadow-md">
                <span className="text-xs font-mono font-bold text-emerald-400 block">{getSelectedAsset()?.tag}</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{getSelectedAsset()?.name}</h3>
                
                <div className="grid grid-cols-2 gap-4 text-xs mt-4 pt-4 border-t border-[#232a35]">
                  <div>
                    <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Location</span>
                    <span className="text-white">{getSelectedAsset()?.location || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Status</span>
                    <span className="text-emerald-400 capitalize">{getSelectedAsset()?.status}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Booking Form Card */}
            <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-6 shadow-md">
              <h3 className="text-base font-bold text-white mb-6 border-b border-[#232a35] pb-3">Request Reservation</h3>
              <form onSubmit={handleCreateBooking} className="space-y-4">
                {/* Resource Selector */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Resource *</label>
                  <select
                    value={selectedAssetId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      setSelectedAssetId(e.target.value);
                      setBookingFeedback(null);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                  >
                    {bookableAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        [{asset.tag}] {asset.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Booking Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Date *</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookingDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>

                {/* Start & End Times */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">End Time *</label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                    />
                  </div>
                </div>

                {/* Purpose */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Purpose / Meeting Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Sync & Sprint Planning"
                    value={purpose}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPurpose(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submittingBooking}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold py-3 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 cursor-pointer"
                >
                  {submittingBooking ? "Checking slot..." : "Confirm Booking"}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Timeline / Booking Slot Directory */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-6 shadow-md">
              {/* Timeline Header & Date Picker */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 border-b border-[#232a35] pb-4">
                <h3 className="text-lg font-bold text-white">Confirmed Schedule</h3>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 uppercase font-semibold">Schedule Date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedDate(e.target.value)}
                    className="px-3 py-1.5 bg-[#1c222b] border border-[#2d3746] rounded-lg text-xs focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                  />
                </div>
              </div>

              {/* Bookings Listing */}
              {bookings.length === 0 ? (
                <div className="p-16 text-center text-neutral-500">
                  <svg className="w-12 h-12 text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-base font-semibold">No bookings scheduled</p>
                  <p className="text-xs text-neutral-600 mt-1">There are no reservations booked for this resource on the selected date.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className={`flex justify-between items-center bg-[#1c222b] border p-4 rounded-xl transition-colors ${
                        booking.status === "cancelled" ? "border-rose-950 opacity-40" : "border-[#232a35] hover:border-[#2d3746]"
                      }`}
                    >
                      {/* Booking Details */}
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white">
                            {new Date(booking.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(booking.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {booking.status === "cancelled" ? (
                            <span className="text-[10px] uppercase font-bold text-rose-500 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-900/60">
                              Cancelled
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-900/60">
                              Confirmed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-300 mt-1 font-semibold">{booking.purpose || "No Purpose Stated"}</p>
                        <span className="text-xs text-neutral-500 block mt-0.5">Booked by: {booking.booked_by_name}</span>
                      </div>

                      {/* Cancel Action */}
                      {booking.status === "confirmed" && (
                        <button
                          onClick={() => handleCancelBooking(booking.id)}
                          className="bg-neutral-800 hover:bg-rose-950/50 hover:text-rose-400 border border-neutral-700 hover:border-rose-900 text-neutral-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
