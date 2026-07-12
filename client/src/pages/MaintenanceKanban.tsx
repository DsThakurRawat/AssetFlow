import React, { useState, useEffect } from "react";

interface Asset {
  id: number;
  tag: string;
  name: string;
}

interface MaintenanceRequest {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  raised_by_name: string;
  issue: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "technician_assigned" | "in_progress" | "resolved" | "rejected";
  photo_url?: string;
  technician_name?: string;
  resolution?: string;
  created_at: string;
}

const API_BASE = "http://localhost:8000/api";

export default function MaintenanceKanban() {
  // Master lists
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  // Loading & errors
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State: New Request
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [issue, setIssue] = useState("");
  const [priority, setPriority] = useState<MaintenanceRequest["priority"]>("medium");
  const [photoUrl, setPhotoUrl] = useState("");

  // Modals / Actions states
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Technician assignment state
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [techName, setTechName] = useState("");

  // Resolution state
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolutionText, setResolutionText] = useState("");

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [reqRes, assetRes] = await Promise.all([
          fetch(`${API_BASE}/maintenance`),
          fetch(`${API_BASE}/assets`)
        ]);

        if (reqRes.ok) setRequests(await reqRes.json());
        if (assetRes.ok) setAssets(await assetRes.json());
      } catch (err: any) {
        setError(err.message || "Failed to load maintenance dashboard.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Submit new request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestFeedback(null);

    if (!selectedAssetId) {
      setRequestFeedback({ type: "error", message: "Please select an asset." });
      return;
    }

    setSubmittingRequest(true);

    try {
      const response = await fetch(`${API_BASE}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: parseInt(selectedAssetId),
          issue,
          priority,
          photo_url: photoUrl || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to raise request.");
      }

      setRequestFeedback({ type: "success", message: "Maintenance request raised successfully!" });
      setIssue("");
      setPhotoUrl("");
      setSelectedAssetId("");
      
      // Refresh list
      const reqRes = await fetch(`${API_BASE}/maintenance`);
      if (reqRes.ok) setRequests(await reqRes.json());

      setTimeout(() => {
        setIsRequestOpen(false);
        setRequestFeedback(null);
      }, 1500);
    } catch (err: any) {
      setRequestFeedback({ type: "error", message: err.message || "Failed to submit request." });
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Status transitions
  const handleUpdateStatus = async (
    reqId: number,
    payload: Partial<MaintenanceRequest>
  ) => {
    try {
      const response = await fetch(`${API_BASE}/maintenance/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Refresh list
        const reqRes = await fetch(`${API_BASE}/maintenance`);
        if (reqRes.ok) setRequests(await reqRes.json());
        
        // Reset action popups
        setAssigningId(null);
        setTechName("");
        setResolvingId(null);
        setResolutionText("");
      } else {
        const data = await response.json();
        alert(data.detail || "Transition failed.");
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Filter columns
  const getColumnRequests = (status: MaintenanceRequest["status"]) => {
    return requests.filter((r) => r.status === status);
  };

  const getPriorityPill = (pri: MaintenanceRequest["priority"]) => {
    switch (pri) {
      case "low":
        return "bg-neutral-800 text-neutral-400";
      case "medium":
        return "bg-blue-950/40 text-blue-400 border border-blue-900/40";
      case "high":
        return "bg-amber-950/40 text-amber-400 border border-amber-900/40";
      case "critical":
        return "bg-rose-950/40 text-rose-400 border border-rose-900/40";
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] p-6 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Maintenance Requests
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Track asset issues, allocate technicians, and resolve equipment failures</p>
        </div>
        <button
          onClick={() => setIsRequestOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          Raise Request
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-neutral-400">
          <svg className="animate-spin h-8 w-8 text-emerald-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p>Loading kanban board...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-6 text-center text-rose-400">
          <p className="font-bold">Error Loading Kanban</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        /* Kanban Board columns */
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start overflow-x-auto pb-6">
          
          {/* COLUMN 1: PENDING */}
          <div className="bg-[#12161c] border border-[#232a35] rounded-2xl p-4 flex flex-col min-w-[220px]">
            <div className="flex justify-between items-center mb-4 border-b border-[#232a35] pb-2">
              <span className="font-bold text-sm text-neutral-300">Pending</span>
              <span className="text-xs bg-[#1c222b] text-neutral-400 px-2 py-0.5 rounded-full font-bold">
                {getColumnRequests("pending").length}
              </span>
            </div>
            <div className="space-y-3 min-h-[300px]">
              {getColumnRequests("pending").map((r) => (
                <div key={r.id} className="bg-[#15191f] border border-[#232a35] p-4 rounded-xl space-y-3 text-xs">
                  <div>
                    <span className="font-mono text-emerald-400 font-bold block">{r.asset_tag}</span>
                    <span className="text-[10px] text-neutral-500 block">{r.asset_name}</span>
                  </div>
                  <p className="text-neutral-300 font-medium">"{r.issue}"</p>
                  <div className="flex justify-between items-center">
                    <span className={`inline-block px-2 py-0.5 rounded uppercase font-bold text-[9px] ${getPriorityPill(r.priority)}`}>
                      {r.priority}
                    </span>
                    <span className="text-[10px] text-neutral-500">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#232a35]">
                    <button
                      onClick={() => handleUpdateStatus(r.id, { status: "approved" })}
                      className="bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 font-bold py-1 rounded cursor-pointer text-center"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(r.id, { status: "rejected" })}
                      className="bg-rose-950/40 hover:bg-rose-900 border border-rose-800 text-rose-400 font-bold py-1 rounded cursor-pointer text-center"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 2: APPROVED */}
          <div className="bg-[#12161c] border border-[#232a35] rounded-2xl p-4 flex flex-col min-w-[220px]">
            <div className="flex justify-between items-center mb-4 border-b border-[#232a35] pb-2">
              <span className="font-bold text-sm text-neutral-300">Approved</span>
              <span className="text-xs bg-[#1c222b] text-neutral-400 px-2 py-0.5 rounded-full font-bold">
                {getColumnRequests("approved").length}
              </span>
            </div>
            <div className="space-y-3 min-h-[300px]">
              {getColumnRequests("approved").map((r) => (
                <div key={r.id} className="bg-[#15191f] border border-[#232a35] p-4 rounded-xl space-y-3 text-xs">
                  <div>
                    <span className="font-mono text-emerald-400 font-bold block">{r.asset_tag}</span>
                    <span className="text-[10px] text-neutral-500 block">{r.asset_name}</span>
                  </div>
                  <p className="text-neutral-300">"{r.issue}"</p>
                  <span className={`inline-block px-2 py-0.5 rounded uppercase font-bold text-[9px] ${getPriorityPill(r.priority)}`}>
                    {r.priority}
                  </span>
                  
                  {assigningId === r.id ? (
                    <div className="space-y-2 pt-2 border-t border-[#232a35]">
                      <input
                        type="text"
                        placeholder="Tech Name"
                        value={techName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTechName(e.target.value)}
                        className="w-full bg-[#1c222b] border border-[#2d3746] rounded px-2 py-1 text-white text-xs focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateStatus(r.id, { status: "technician_assigned", technician_name: techName })}
                          className="bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-bold px-2 py-1 rounded cursor-pointer text-[10px]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setAssigningId(null)}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-400 font-bold px-2 py-1 rounded cursor-pointer text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAssigningId(r.id)}
                      className="w-full bg-blue-950/40 hover:bg-blue-900 border border-blue-800 text-blue-400 font-bold py-1.5 rounded cursor-pointer text-center"
                    >
                      Assign Tech
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 3: TECHNICIAN ASSIGNED */}
          <div className="bg-[#12161c] border border-[#232a35] rounded-2xl p-4 flex flex-col min-w-[220px]">
            <div className="flex justify-between items-center mb-4 border-b border-[#232a35] pb-2">
              <span className="font-bold text-sm text-neutral-300">Tech Assigned</span>
              <span className="text-xs bg-[#1c222b] text-neutral-400 px-2 py-0.5 rounded-full font-bold">
                {getColumnRequests("technician_assigned").length}
              </span>
            </div>
            <div className="space-y-3 min-h-[300px]">
              {getColumnRequests("technician_assigned").map((r) => (
                <div key={r.id} className="bg-[#15191f] border border-[#232a35] p-4 rounded-xl space-y-3 text-xs">
                  <div>
                    <span className="font-mono text-emerald-400 font-bold block">{r.asset_tag}</span>
                    <span className="text-[10px] text-neutral-500 block">{r.asset_name}</span>
                  </div>
                  <p className="text-neutral-300">"{r.issue}"</p>
                  <div className="text-neutral-400">
                    <span className="text-neutral-500 block font-bold uppercase text-[9px] mb-0.5">Technician</span>
                    <span className="text-white font-semibold">{r.technician_name}</span>
                  </div>
                  <button
                    onClick={() => handleUpdateStatus(r.id, { status: "in_progress" })}
                    className="w-full bg-[#1c222b] hover:bg-[#232a35] border border-[#2d3746] text-neutral-300 font-bold py-1.5 rounded cursor-pointer text-center"
                  >
                    Start Progress
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 4: IN PROGRESS */}
          <div className="bg-[#12161c] border border-[#232a35] rounded-2xl p-4 flex flex-col min-w-[220px]">
            <div className="flex justify-between items-center mb-4 border-b border-[#232a35] pb-2">
              <span className="font-bold text-sm text-neutral-300">In Progress</span>
              <span className="text-xs bg-[#1c222b] text-neutral-400 px-2 py-0.5 rounded-full font-bold">
                {getColumnRequests("in_progress").length}
              </span>
            </div>
            <div className="space-y-3 min-h-[300px]">
              {getColumnRequests("in_progress").map((r) => (
                <div key={r.id} className="bg-[#15191f] border border-[#232a35] p-4 rounded-xl space-y-3 text-xs">
                  <div>
                    <span className="font-mono text-emerald-400 font-bold block">{r.asset_tag}</span>
                    <span className="text-[10px] text-neutral-500 block">{r.asset_name}</span>
                  </div>
                  <p className="text-neutral-300">"{r.issue}"</p>
                  <div className="text-neutral-400">
                    <span className="text-neutral-500 block font-bold uppercase text-[9px] mb-0.5">Technician</span>
                    <span className="text-white font-semibold">{r.technician_name}</span>
                  </div>

                  {resolvingId === r.id ? (
                    <div className="space-y-2 pt-2 border-t border-[#232a35]">
                      <textarea
                        placeholder="Resolution details..."
                        rows={2}
                        value={resolutionText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setResolutionText(e.target.value)}
                        className="w-full bg-[#1c222b] border border-[#2d3746] rounded p-2 text-white text-xs focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateStatus(r.id, { status: "resolved", resolution: resolutionText })}
                          className="bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-bold px-2 py-1 rounded cursor-pointer text-[10px]"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => setResolvingId(null)}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-400 font-bold px-2 py-1 rounded cursor-pointer text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setResolvingId(r.id)}
                      className="w-full bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 font-bold py-1.5 rounded cursor-pointer text-center"
                    >
                      Resolve ticket
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 5: RESOLVED */}
          <div className="bg-[#12161c] border border-[#232a35] rounded-2xl p-4 flex flex-col min-w-[220px]">
            <div className="flex justify-between items-center mb-4 border-b border-[#232a35] pb-2">
              <span className="font-bold text-sm text-neutral-300">Resolved</span>
              <span className="text-xs bg-[#1c222b] text-neutral-400 px-2 py-0.5 rounded-full font-bold">
                {getColumnRequests("resolved").length}
              </span>
            </div>
            <div className="space-y-3 min-h-[300px]">
              {getColumnRequests("resolved").map((r) => (
                <div key={r.id} className="bg-[#15191f] border border-[#232a35] p-4 rounded-xl space-y-3 text-xs opacity-65">
                  <div>
                    <span className="font-mono text-neutral-500 font-bold block">{r.asset_tag}</span>
                    <span className="text-[10px] text-neutral-600 block">{r.asset_name}</span>
                  </div>
                  <p className="text-neutral-400 italic">"{r.issue}"</p>
                  {r.resolution && (
                    <div className="text-[10px] text-neutral-500 bg-[#1c222b] p-2 rounded border border-[#232a35] font-mono">
                      {r.resolution}
                    </div>
                  )}
                  <span className="text-[9px] text-neutral-600 block">Tech: {r.technician_name || "—"}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Raise Request Modal */}
      {isRequestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#15191f] border border-[#232a35] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-[#1c222b] p-5 border-b border-[#232a35]">
              <h2 className="text-lg font-bold text-white">Raise Maintenance Ticket</h2>
              <button
                onClick={() => setIsRequestOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateRequest} className="p-6 space-y-4">
              {requestFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold border ${
                    requestFeedback.type === "success"
                      ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-400"
                      : "bg-rose-950/40 border-rose-800/80 text-rose-400"
                  }`}
                >
                  {requestFeedback.message}
                </div>
              )}

              {/* Asset selection */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Asset *</label>
                <select
                  required
                  value={selectedAssetId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAssetId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                >
                  <option value="">Select Asset</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      [{asset.tag}] {asset.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Issue */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Issue / Fault Description *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe the failure or damage..."
                  value={issue}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setIssue(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                />
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Priority *</label>
                <select
                  value={priority}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPriority(e.target.value as MaintenanceRequest["priority"])}
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Photo URL */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Damage Photo URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/damage-preview.jpg"
                  value={photoUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhotoUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t border-[#232a35]">
                <button
                  type="button"
                  onClick={() => setIsRequestOpen(false)}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingRequest ? "Submitting..." : "Raise Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
