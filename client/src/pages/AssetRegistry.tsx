import React, { useState, useEffect } from "react";

// Types matching database schema and API response
interface Category {
  id: number;
  name: string;
  warranty_months?: number;
}

interface Department {
  id: number;
  name: string;
  parent_name?: string;
  head_name?: string;
  is_active: boolean;
}

interface Asset {
  id: number;
  tag: string;
  name: string;
  serial_number?: string;
  category_id?: number;
  category_name?: string;
  cost?: number;
  acquisition_date?: string;
  condition: "new" | "good" | "fair" | "poor" | "damaged";
  location?: string;
  photo_url?: string;
  is_bookable: boolean;
  status: "available" | "allocated" | "under_maintenance" | "retired" | "lost" | "disposed";
}

interface AllocationRecord {
  id: number;
  allocated_to: string; // Employee name or department name
  allocated_by_name?: string;
  allocated_at: string;
  expected_return_date?: string;
  returned_at?: string;
  notes?: string;
}

interface MaintenanceRecord {
  id: number;
  issue: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "technician_assigned" | "in_progress" | "resolved" | "rejected";
  technician_name?: string;
  resolution?: string;
  created_at: string;
  resolved_at?: string;
}

const API_BASE = "http://localhost:8000/api";

export default function AssetRegistry() {
  // State for Lists & Master Data
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filtering & Search
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Drawer & History
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [allocationHistory, setAllocationHistory] = useState<AllocationRecord[]>([]);
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceRecord[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: "",
    category_id: "",
    serial_number: "",
    cost: "",
    acquisition_date: "",
    condition: "good" as Asset["condition"],
    location: "",
    photo_url: "",
    is_bookable: false,
  });
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch initial master data
  useEffect(() => {
    async function fetchMasterData() {
      try {
        const [catRes, deptRes] = await Promise.all([
          fetch(`${API_BASE}/categories`),
          fetch(`${API_BASE}/departments`)
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (deptRes.ok) setDepartments(await deptRes.json());
      } catch (err) {
        console.error("Failed to load master filters:", err);
      }
    }
    fetchMasterData();
  }, []);

  // Fetch Assets based on search & filters
  useEffect(() => {
    async function fetchAssets() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search) params.append("search", search);
        if (selectedCategory) params.append("category", selectedCategory);
        if (selectedStatus) params.append("status", selectedStatus);
        if (selectedDepartment) params.append("department", selectedDepartment);

        const response = await fetch(`${API_BASE}/assets?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to load asset directory.");
        }
        const data = await response.json();
        setAssets(data);
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    }

    const delayDebounce = setTimeout(() => {
      fetchAssets();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, selectedCategory, selectedStatus, selectedDepartment]);

  // Fetch asset details & histories when an asset is selected
const handleSelectAsset = async (asset: Asset) => {
  setSelectedAsset(asset);
  setLoadingDetails(true);
  setAllocationHistory([]);
  setMaintenanceHistory([]);
  try {
    const response = await fetch(API_BASE + "/assets/" + asset.id);
    if (response.ok) {
      const data = await response.json();
      setAllocationHistory(data.allocation_history || []);
      setMaintenanceHistory(data.maintenance_history || []);
    }
  } catch (err) {
    console.error("Failed to load asset details/history:", err);
  } finally {
    setLoadingDetails(false);
  }
};

  // Submit asset registration
  const handleRegisterAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setRegisterError(null);
    setRegisterSuccess(null);

    const costNum = parseFloat(newAsset.cost);

    try {
      const response = await fetch(`${API_BASE}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newAsset,
          category_id: newAsset.category_id ? parseInt(newAsset.category_id) : null,
          cost: isNaN(costNum) ? null : costNum,
          acquisition_date: newAsset.acquisition_date || null,
          serial_number: newAsset.serial_number || null,
          photo_url: newAsset.photo_url || null,
          location: newAsset.location || null,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to register asset.");
      }

      const createdAsset = await response.json();
      setRegisterSuccess(`Asset registered successfully with tag ${createdAsset.tag}!`);
      setAssets((prev) => [createdAsset, ...prev]);
      
      // Reset form
      setNewAsset({
        name: "",
        category_id: "",
        serial_number: "",
        cost: "",
        acquisition_date: "",
        condition: "good",
        location: "",
        photo_url: "",
        is_bookable: false,
      });

      setTimeout(() => {
        setIsRegisterOpen(false);
        setRegisterSuccess(null);
      }, 1500);

    } catch (err: any) {
      setRegisterError(err.message || "An error occurred during registration.");
    } finally {
      setSubmitting(false);
    }
  };

  // Get status badge colors
  const getStatusPillClass = (status: Asset["status"]) => {
    switch (status) {
      case "available":
        return "bg-emerald-950/40 text-emerald-400 border border-emerald-800/60";
      case "allocated":
        return "bg-blue-950/40 text-blue-400 border border-blue-800/60";
      case "under_maintenance":
        return "bg-amber-950/40 text-amber-400 border border-amber-800/60";
      case "retired":
      case "lost":
      case "disposed":
        return "bg-rose-950/40 text-rose-400 border border-rose-800/60";
      default:
        return "bg-neutral-800 text-neutral-400 border border-neutral-700";
    }
  };

  // Get condition badge colors
  const getConditionPillClass = (cond: Asset["condition"]) => {
    switch (cond) {
      case "new":
      case "good":
        return "bg-emerald-950/30 text-emerald-400";
      case "fair":
        return "bg-amber-950/30 text-amber-400";
      case "poor":
      case "damaged":
        return "bg-rose-950/30 text-rose-400";
      default:
        return "bg-neutral-800 text-neutral-400";
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] p-6 font-sans">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Asset Registry
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Manage and track company assets and equipment</p>
        </div>
        <button
          onClick={() => setIsRegisterOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          Register Asset
        </button>
      </div>

      {/* Directory Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assets List & Filters */}
        <div className="lg:col-span-2 space-y-6">
          {/* Search and Filters Card */}
          <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-5 shadow-md">
            {/* Search Input */}
            <div className="relative mb-5">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-neutral-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search by tag, serial, or QR code.."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-500 transition-colors"
              />
            </div>

            {/* Filter Pills Row */}
            <div className="flex flex-wrap gap-4 items-center">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Filters:</span>
              
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value)}
                className="bg-[#1c222b] border border-[#2d3746] text-neutral-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedStatus(e.target.value)}
                className="bg-[#1c222b] border border-[#2d3746] text-neutral-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="allocated">Allocated</option>
                <option value="under_maintenance">Under Maintenance</option>
                <option value="retired">Retired</option>
                <option value="lost">Lost</option>
                <option value="disposed">Disposed</option>
              </select>

              {/* Department Filter */}
              <select
                value={selectedDepartment}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDepartment(e.target.value)}
                className="bg-[#1c222b] border border-[#2d3746] text-neutral-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>

              {/* Clear Filters */}
              {(selectedCategory || selectedStatus || selectedDepartment || search) && (
                <button
                  onClick={() => {
                    setSelectedCategory("");
                    setSelectedStatus("");
                    setSelectedDepartment("");
                    setSearch("");
                  }}
                  className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold underline ml-auto cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Directory Table */}
          <div className="bg-[#15191f] border border-[#232a35] rounded-2xl overflow-hidden shadow-md">
            {loading ? (
              <div className="p-12 text-center text-neutral-400">
                <svg className="animate-spin h-8 w-8 text-emerald-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p>Loading asset directory...</p>
              </div>
            ) : error ? (
              <div className="p-12 text-center text-rose-400">
                <p className="text-lg font-bold mb-2">Error Loading Assets</p>
                <p className="text-sm text-neutral-400">{error}</p>
              </div>
            ) : assets.length === 0 ? (
              <div className="p-16 text-center text-neutral-500">
                <svg className="w-12 h-12 text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-base font-semibold">No assets found</p>
                <p className="text-xs text-neutral-600 mt-1">Try refining your search or adding a new asset.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#1c222b] border-b border-[#232a35] text-neutral-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4">Tag</th>
                      <th className="p-4">Name</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2530] text-sm">
                    {assets.map((asset) => (
                      <tr
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset)}
                        className={`hover:bg-[#1a2029] cursor-pointer transition-colors ${
                          selectedAsset?.id === asset.id ? "bg-[#1d242e]" : ""
                        }`}
                      >
                        <td className="p-4 font-mono font-bold text-emerald-400">{asset.tag}</td>
                        <td className="p-4 font-medium text-white">{asset.name}</td>
                        <td className="p-4 text-neutral-400">{asset.category_name || "Uncategorized"}</td>
                        <td className="p-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusPillClass(asset.status)}`}>
                            {asset.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-4 text-neutral-400">{asset.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Selected Asset Details & History Drawer */}
        <div className="lg:col-span-1">
          {selectedAsset ? (
            <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-6 shadow-lg space-y-6 sticky top-6">
              {/* Drawer Header */}
              <div className="flex justify-between items-start border-b border-[#232a35] pb-4">
                <div>
                  <span className="font-mono text-xs font-bold text-emerald-400 tracking-wide">{selectedAsset.tag}</span>
                  <h2 className="text-xl font-bold text-white mt-1">{selectedAsset.name}</h2>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Core Details Panel */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-[#1c222b] p-4 rounded-xl border border-[#2d3746]">
                <div>
                  <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Status</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${getStatusPillClass(selectedAsset.status)}`}>
                    {selectedAsset.status.replace("_", " ")}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Condition</span>
                  <span className={`inline-block px-2 py-0.5 rounded font-semibold ${getConditionPillClass(selectedAsset.condition)}`}>
                    {selectedAsset.condition}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Serial No</span>
                  <span className="text-white font-mono">{selectedAsset.serial_number || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Location</span>
                  <span className="text-white">{selectedAsset.location || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Cost</span>
                  <span className="text-white">{selectedAsset.cost ? `$${selectedAsset.cost.toFixed(2)}` : "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase font-bold tracking-wider mb-0.5">Shared/Bookable</span>
                  <span className="text-white">{selectedAsset.is_bookable ? "Yes" : "No"}</span>
                </div>
              </div>

              {/* Asset Photo Preview */}
              {selectedAsset.photo_url && (
                <div className="rounded-xl overflow-hidden border border-[#2d3746]">
                  <img
                    src={selectedAsset.photo_url}
                    alt={selectedAsset.name}
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* History Lists */}
              <div className="space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 border-b border-[#232a35] pb-2">
                  Lifecycle History
                </h3>

                {loadingDetails ? (
                  <div className="text-center py-6 text-xs text-neutral-400">
                    <svg className="animate-spin h-5 w-5 text-emerald-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Fetching histories...</span>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {/* Allocation Section */}
                    <div>
                      <h4 className="text-xs font-bold text-neutral-400 mb-2">Allocation Log</h4>
                      {allocationHistory.length === 0 ? (
                        <p className="text-xs text-neutral-600 italic">No allocation history records found.</p>
                      ) : (
                        <div className="space-y-2">
                          {allocationHistory.map((rec) => (
                            <div key={rec.id} className="bg-[#1c222b] p-3 rounded-lg border border-[#232a35] text-xs">
                              <div className="flex justify-between font-semibold">
                                <span className="text-emerald-400">{rec.allocated_to}</span>
                                <span className="text-neutral-500">
                                  {new Date(rec.allocated_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="text-neutral-400 mt-1">
                                {rec.returned_at ? (
                                  <span>Returned: {new Date(rec.returned_at).toLocaleDateString()}</span>
                                ) : (
                                  <span className="text-amber-400">Active Loan</span>
                                )}
                              </div>
                              {rec.notes && <p className="text-neutral-500 mt-1 italic">"{rec.notes}"</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Maintenance Section */}
                    <div>
                      <h4 className="text-xs font-bold text-neutral-400 mb-2">Maintenance Log</h4>
                      {maintenanceHistory.length === 0 ? (
                        <p className="text-xs text-neutral-600 italic">No maintenance tickets reported.</p>
                      ) : (
                        <div className="space-y-2">
                          {maintenanceHistory.map((rec) => (
                            <div key={rec.id} className="bg-[#1c222b] p-3 rounded-lg border border-[#232a35] text-xs">
                              <div className="flex justify-between font-semibold">
                                <span className="text-amber-400 truncate max-w-[120px]">{rec.issue}</span>
                                <span className="text-neutral-500">
                                  {new Date(rec.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="text-neutral-400 mt-1 flex justify-between items-center">
                                <span>Status: {rec.status}</span>
                                <span className="capitalize text-neutral-500">Priority: {rec.priority}</span>
                              </div>
                              {rec.resolution && (
                                <p className="text-neutral-500 mt-1 font-mono">Res: {rec.resolution}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#15191f] border border-[#232a35] rounded-2xl p-8 text-center text-neutral-500 sticky top-6">
              <svg className="w-10 h-10 text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-bold text-neutral-400 mb-1">No asset selected</h3>
              <p className="text-xs text-neutral-600">Select an asset from the list to view its complete properties and logs.</p>
            </div>
          )}
        </div>
      </div>

      {/* Register Asset Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#15191f] border border-[#232a35] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-[#1c222b] p-5 border-b border-[#232a35]">
              <h2 className="text-lg font-bold text-white">Register New Asset</h2>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRegisterAsset} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {registerError && (
                <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-3 text-xs text-rose-400 font-semibold">
                  {registerError}
                </div>
              )}
              {registerSuccess && (
                <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3 text-xs text-emerald-400 font-semibold">
                  {registerSuccess}
                </div>
              )}

              {/* Asset Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Asset Name *</label>
                <input
                  type="text"
                  required
                  value={newAsset.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, name: e.target.value })}
                  placeholder="e.g. Dell Latitude 7420"
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Category Selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Category *</label>
                  <select
                    required
                    value={newAsset.category_id}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewAsset({ ...newAsset, category_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Serial Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Serial Number</label>
                  <input
                    type="text"
                    value={newAsset.serial_number}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, serial_number: e.target.value })}
                    placeholder="e.g. SN-82937402"
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Acquisition Cost */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newAsset.cost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, cost: e.target.value })}
                    placeholder="e.g. 1200.00"
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                  />
                </div>

                {/* Acquisition Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Acquisition Date</label>
                  <input
                    type="date"
                    value={newAsset.acquisition_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, acquisition_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Initial Condition */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Condition *</label>
                  <select
                    value={newAsset.condition}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewAsset({ ...newAsset, condition: e.target.value as Asset["condition"] })}
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                  >
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>

                {/* Physical Location */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Location</label>
                  <input
                    type="text"
                    value={newAsset.location}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, location: e.target.value })}
                    placeholder="e.g. HQ Floor 3"
                    className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                  />
                </div>
              </div>

              {/* Photo URL */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Photo URL</label>
                <input
                  type="url"
                  value={newAsset.photo_url}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, photo_url: e.target.value })}
                  placeholder="https://example.com/asset-photo.jpg"
                  className="w-full px-3.5 py-2.5 bg-[#1c222b] border border-[#2d3746] rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600"
                />
              </div>

              {/* Shared/Bookable Toggle */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="is_bookable"
                  checked={newAsset.is_bookable}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset({ ...newAsset, is_bookable: e.target.checked })}
                  className="w-4.5 h-4.5 accent-emerald-500 cursor-pointer rounded"
                />
                <label htmlFor="is_bookable" className="text-sm font-semibold text-neutral-300 cursor-pointer select-none">
                  This asset is a shared resource (bookable by users)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-6 border-t border-[#232a35]">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-900 font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Registering..." : "Submit Registration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
