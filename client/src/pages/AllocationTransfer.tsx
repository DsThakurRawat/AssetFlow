import React, { useState, useEffect } from "react";

interface Asset {
  id: number;
  tag: string;
  name: string;
  status: string;
  location?: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department_id?: number;
}

interface Department {
  id: number;
  name: string;
}

interface Transfer {
  id: number;
  asset_tag: string;
  asset_name: string;
  asset_id: number;
  to_holder_name: string;
  to_holder_type: "employee" | "department";
  requested_by_name: string;
  status: "requested" | "approved" | "rejected" | "completed";
  reason?: string;
  requested_at: string;
}

const API_BASE = "http://localhost:8000/api";

export default function AllocationTransfer() {
  // Master lists
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  // Loaders
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State: Allocation
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [allocationTarget, setAllocationTarget] = useState<"employee" | "department">("employee");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetDeptId, setTargetDeptId] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [notes, setNotes] = useState("");

  // Conflict Banner state (409 Double-Allocation info)
  const [conflictInfo, setConflictInfo] = useState<{
    assetId: number;
    assetTag: string;
    assetName: string;
    holderName: string;
    holderContext: string; // Department name or context
  } | null>(null);

  // Form State: Transfer
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferReason, setTransferReason] = useState("");

  // Submission loaders
  const [submittingAllocation, setSubmittingAllocation] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [assetRes, userRes, deptRes, transferRes] = await Promise.all([
          fetch(`${API_BASE}/assets`),
          fetch(`${API_BASE}/users`),
          fetch(`${API_BASE}/departments`),
          fetch(`${API_BASE}/transfers`).catch(() => null) // Fallback if T2 not implemented fully
        ]);

        if (assetRes.ok) setAssets(await assetRes.json());
        if (userRes.ok) setUsers(await userRes.json());
        if (deptRes.ok) setDepartments(await deptRes.json());
        
        if (transferRes && transferRes.ok) {
          setTransfers(await transferRes.json());
        } else {
          // If transfer route fails, mock empty
          setTransfers([]);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load components.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Submit Allocation
  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    setConflictInfo(null);

    // Validate XOR target
    const employee_id = allocationTarget === "employee" ? parseInt(targetUserId) : null;
    const department_id = allocationTarget === "department" ? parseInt(targetDeptId) : null;

    if (!selectedAssetId) {
      setFormFeedback({ type: "error", message: "Please select an asset to allocate." });
      return;
    }

    if (allocationTarget === "employee" && !targetUserId) {
      setFormFeedback({ type: "error", message: "Please select an employee." });
      return;
    }

    if (allocationTarget === "department" && !targetDeptId) {
      setFormFeedback({ type: "error", message: "Please select a target department." });
      return;
    }

    setSubmittingAllocation(true);

    try {
      const response = await fetch(`${API_BASE}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: parseInt(selectedAssetId),
          employee_id,
          department_id,
          expected_return_date: expectedReturnDate || null,
          notes: notes || null
        })
      });

      const data = await response.json();

      if (response.status === 409) {
        // Double-allocation conflict! Extract holder info
        const targetAsset = assets.find(a => a.id === parseInt(selectedAssetId));
        setConflictInfo({
          assetId: parseInt(selectedAssetId),
          assetTag: targetAsset?.tag || "Unknown",
          assetName: targetAsset?.name || "Asset",
          holderName: data.holder_name || "Another User",
          holderContext: data.holder_context || "Organization"
        });
        setFormFeedback({
          type: "error",
          message: "Double-allocation conflict detected. This asset is currently occupied."
        });
      } else if (!response.ok) {
        throw new Error(data.detail || "Failed to create allocation.");
      } else {
        setFormFeedback({ type: "success", message: "Asset allocated successfully!" });
        // Reset form
        setSelectedAssetId("");
        setTargetUserId("");
        setTargetDeptId("");
        setExpectedReturnDate("");
        setNotes("");
        
        // Refresh assets list
        const assetRes = await fetch(`${API_BASE}/assets`);
        if (assetRes.ok) setAssets(await assetRes.json());
      }
    } catch (err: any) {
      setFormFeedback({ type: "error", message: err.message || "An error occurred." });
    } finally {
      setSubmittingAllocation(false);
    }
  };

  // Submit Transfer Request
  const handleRequestTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conflictInfo) return;

    setSubmittingTransfer(true);
    setFormFeedback(null);

    const to_employee_id = allocationTarget === "employee" ? parseInt(targetUserId) : null;
    const to_department_id = allocationTarget === "department" ? parseInt(targetDeptId) : null;

    try {
      const response = await fetch(`${API_BASE}/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: conflictInfo.assetId,
          to_employee_id,
          to_department_id,
          reason: transferReason || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to submit transfer request.");
      }

      setFormFeedback({
        type: "success",
        message: "Transfer request submitted successfully. Waiting for manager approval."
      });
      setIsTransferModalOpen(false);
      setTransferReason("");
      setConflictInfo(null);

      // Refresh transfers list
      const transRes = await fetch(`${API_BASE}/transfers`);
      if (transRes.ok) setTransfers(await transRes.json());
    } catch (err: any) {
      setFormFeedback({ type: "error", message: err.message || "Failed to request transfer." });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // Approve/Reject Transfer (Manager only)
  const handleDecideTransfer = async (transferId: number, approve: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: approve ? "approved" : "rejected"
        })
      });

      if (response.ok) {
        setFormFeedback({
          type: "success",
          message: `Transfer successfully ${approve ? "approved" : "rejected"}.`
        });
        // Refresh transfer and asset list
        const [transRes, assetRes] = await Promise.all([
          fetch(`${API_BASE}/transfers`),
          fetch(`${API_BASE}/assets`)
        ]);
        if (transRes.ok) setTransfers(await transRes.json());
        if (assetRes.ok) setAssets(await assetRes.json());
      } else {
        const errData = await response.json();
        setFormFeedback({ type: "error", message: errData.detail || "Action failed." });
      }
    } catch (err: any) {
      setFormFeedback({ type: "error", message: err.message || "Failed to make decision." });
    }
  };

  const getTransferPillClass = (status: Transfer["status"]) => {
    switch (status) {
      case "requested":
        return "bg-amber-950/40 text-amber-400 border border-amber-800/60";
      case "approved":
      case "completed":
        return "bg-emerald-950/40 text-emerald-400 border border-emerald-800/60";
      case "rejected":
        return "bg-rose-950/40 text-rose-400 border border-rose-800/60";
      default:
        return "bg-neutral-800 text-neutral-400 border border-neutral-700";
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] p-6 font-sans">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
          Asset Allocation & Transfer
        </h1>
        <p className="text-neutral-400 text-sm mt-1">Manage asset assignments, track return cycles, and resolve overlaps</p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-neutral-400">
          <svg className="animate-spin h-8 w-8 text-emerald-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p>Loading components...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-6 text-center text-rose-400">
          <p className="font-bold">Error Loading View</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Allocation Form & Conflict Alerts */}
          <div className="lg:col-span-1 space-y-6">
            {/* Feedback Alerts */}
            {formFeedback && (
              <div
                className={`p-4 rounded-xl text-xs font-semibold border ${
                  formFeedback.type === "success"
                    ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-400"
                    : "bg-rose-950/40 border-rose-800/80 text-rose-400"
                }`}
              >
                {formFeedback.message}
              </div>
            )}

            {/* Double-Allocation Conflict Warning Banner */}
            {conflictInfo && (
              <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-5 text-rose-400 space-y-4 animate-pulse">
                <div className="flex gap-3">
                  <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h4 className="font-extrabold text-sm uppercase">Double Allocation Conflict</h4>
                    <p className="text-xs text-neutral-300 mt-1">
                      {conflictInfo.assetName} (<span className="font-mono text-emerald-400">{conflictInfo.assetTag}</span>) is{" "}
                      <strong>currently held by {conflictInfo.holderName} ({conflictInfo.holderContext})</strong>.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTransferModalOpen(true)}
                  className="w-full bg-rose-900/60 hover:bg-rose-800 text-white font-bold text-xs py-2 rounded-lg border border-rose-700 transition-colors cursor-pointer"
                >
                  Request Transfer
                </button>
              </div>
            )}

            {/* Allocation Form Card */}
            <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-6 shadow-md">
              <h3 className="text-lg font-bold text-white mb-6 border-b border-[#232a35] pb-3">New Allocation</h3>
              <form onSubmit={handleAllocate} className="space-y-4">
                {/* Asset Dropdown */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Select Asset *</label>
                  <select
                    value={selectedAssetId}
                    onChange={(e) => {
                      setSelectedAssetId(e.target.value);
                      setConflictInfo(null);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                  >
                    <option value="">Choose Asset</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        [{asset.tag}] {asset.name} ({asset.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* XOR Target Toggle */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Allocation Target *</label>
                  <div className="grid grid-cols-2 gap-2 bg-[#1c222b] p-1 rounded-xl border border-[#2d3746]">
                    <button
                      type="button"
                      onClick={() => {
                        setAllocationTarget("employee");
                        setTargetDeptId("");
                      }}
                      className={`py-2 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                        allocationTarget === "employee" ? "bg-[#2d3746] text-white" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      Employee
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAllocationTarget("department");
                        setTargetUserId("");
                      }}
                      className={`py-2 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                        allocationTarget === "department" ? "bg-[#2d3746] text-white" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      Department
                    </button>
                  </div>
                </div>

                {/* Target Employee Dropdown */}
                {allocationTarget === "employee" && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Select Employee *</label>
                    <select
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                    >
                      <option value="">Choose Employee</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Target Department Dropdown */}
                {allocationTarget === "department" && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Select Department *</label>
                    <select
                      value={targetDeptId}
                      onChange={(e) => setTargetDeptId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white cursor-pointer"
                    >
                      <option value="">Choose Department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Expected Return Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Expected Return Date</label>
                  <input
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Notes</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Assigned for Q3 project deployment"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submittingAllocation}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold py-3 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 cursor-pointer"
                >
                  {submittingAllocation ? "Allocating..." : "Allocate Asset"}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Active Transfers List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-6 shadow-md">
              <h3 className="text-lg font-bold text-white mb-6 border-b border-[#232a35] pb-3">Transfer Requests</h3>
              
              {transfers.length === 0 ? (
                <div className="p-16 text-center text-neutral-500">
                  <svg className="w-12 h-12 text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <p className="text-base font-semibold">No transfers requests logged</p>
                  <p className="text-xs text-neutral-600 mt-1">If a double-allocation conflict happens, users can raise transfer requests here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#1c222b] border-b border-[#232a35] text-neutral-400 text-xs font-semibold uppercase tracking-wider">
                        <th className="p-4">Asset</th>
                        <th className="p-4">Target Holder</th>
                        <th className="p-4">Requested By</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2530] text-sm">
                      {transfers.map((t) => (
                        <tr key={t.id} className="hover:bg-[#1a2029]">
                          <td className="p-4">
                            <span className="font-mono font-bold text-emerald-400 block">{t.asset_tag}</span>
                            <span className="text-xs text-neutral-400">{t.asset_name}</span>
                          </td>
                          <td className="p-4 font-medium text-white">{t.to_holder_name}</td>
                          <td className="p-4 text-neutral-400">{t.requested_by_name}</td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getTransferPillClass(t.status)}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="p-4">
                            {t.status === "requested" ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDecideTransfer(t.id, true)}
                                  className="bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleDecideTransfer(t.id, false)}
                                  className="bg-rose-950/40 hover:bg-rose-900 border border-rose-800 text-rose-400 text-xs font-bold px-2.5 py-1 rounded cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Request Modal */}
      {isTransferModalOpen && conflictInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#15191f] border border-[#232a35] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center bg-[#1c222b] p-5 border-b border-[#232a35]">
              <h2 className="text-lg font-bold text-white">Request Asset Transfer</h2>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleRequestTransfer} className="p-6 space-y-4">
              <p className="text-xs text-neutral-400">
                You are requesting a transfer for <strong className="text-white">{conflictInfo.assetName} ({conflictInfo.assetTag})</strong>, currently held by {conflictInfo.holderName}.
              </p>
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Transfer Reason *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Explain why this asset needs to be reassigned..."
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t border-[#232a35]">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTransfer}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingTransfer ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
