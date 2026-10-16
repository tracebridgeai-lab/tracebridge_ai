"use client";

import { useState, useEffect, useMemo } from "react";
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    ExternalLink, 
    ShieldAlert, 
    Network,
    RefreshCw,
    Download,
    Loader2,
    ArrowUpDown,
    Search,
    Filter,
    FileText,
    X,
    Copy
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface TraceabilityItem {
    id: string;
    regulatoryAnchor: {
        id: string;
        topic: string;
        description: string;
    };
    engineeringLink: {
        id: string;
        title: string;
        status: string;
        owner: string;
        url: string;
    };
    aiAnalysis: {
        confidenceScore: number;
        driftRisk: "Low" | "Medium" | "High";
        rationale: string;
    };
    estarStatus: string;
}

export default function TraceabilityMatrixPage() {
    const { user } = useAuth();
    const [data, setData] = useState<TraceabilityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Sorting & Filtering State
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [filterText, setFilterText] = useState("");
    const [riskFilter, setRiskFilter] = useState("All");

    // Modal State
    const [selectedDraftItem, setSelectedDraftItem] = useState<TraceabilityItem | null>(null);
    const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);

    const filteredAndSortedData = useMemo(() => {
        let result = [...data];

        // 1. Text Filter
        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            result = result.filter(item => 
                item.regulatoryAnchor.id.toLowerCase().includes(lowerFilter) ||
                item.regulatoryAnchor.topic.toLowerCase().includes(lowerFilter) ||
                item.engineeringLink.id.toLowerCase().includes(lowerFilter) ||
                item.engineeringLink.title.toLowerCase().includes(lowerFilter)
            );
        }

        // 2. Risk Filter
        if (riskFilter !== "All") {
            result = result.filter(item => item.aiAnalysis.driftRisk === riskFilter);
        }

        // 3. Sorting
        if (sortConfig) {
            result.sort((a, b) => {
                let aVal: any = '';
                let bVal: any = '';
                
                switch (sortConfig.key) {
                    case 'fda':
                        aVal = a.regulatoryAnchor.id;
                        bVal = b.regulatoryAnchor.id;
                        break;
                    case 'jira':
                        aVal = a.engineeringLink.id;
                        bVal = b.engineeringLink.id;
                        break;
                    case 'risk':
                        const riskWeight: Record<string, number> = { "Low": 1, "Medium": 2, "High": 3 };
                        aVal = riskWeight[a.aiAnalysis.driftRisk] || 0;
                        bVal = riskWeight[b.aiAnalysis.driftRisk] || 0;
                        break;
                    case 'status':
                        aVal = a.estarStatus;
                        bVal = b.estarStatus;
                        break;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data, filterText, riskFilter, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                return null;
            }
            return { key, direction: 'asc' };
        });
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/traceability", {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                const json = await res.json();
                if (json.success) {
                    setData(json.data);
                }
            } catch (error) {
                console.error("Failed to fetch traceability data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const handleResync = async () => {
        setIsSyncing(true);
        // Simulate Jira network delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
            if (user) {
                const token = await user.getIdToken();
                const res = await fetch("/api/traceability", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.success) setData(json.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSyncing(false);
        }
    };

    const handlePushEstar = async () => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                result: {
                    reportId: "traceability-matrix-live",
                    productCode: "UNKNOWN",
                    deviceClass: "II",
                    deviceType: "SaMD",
                    srsScore: data.length > 0 ? 50 : 0, 
                    gaps: []
                }
            };
            const res = await fetch("/api/esg/submit", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.success) {
                alert(`Successfully submitted to FDA ESG Test Environment! Core ID: ${json.data.fdaCoreId}`);
            } else {
                alert(`ESG Submission Failed: ${json.error}`);
            }
        } catch (error) {
            console.error("ESG submit error", error);
            alert("An error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const getRiskColor = (risk: string) => {
        if (risk === "Low") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
        if (risk === "Medium") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
        if (risk === "High") return "bg-rose-500/10 text-rose-600 border-rose-500/20";
        return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    };

    const getEstarStatusIcon = (status: string) => {
        if (status === "Ready") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        if (status === "Pending") return <Clock className="w-4 h-4 text-amber-500" />;
        if (status === "Blocked") return <AlertTriangle className="w-4 h-4 text-rose-500" />;
        return null;
    };

    const unassignedCriticalCount = data.filter((item: any) => item.aiAnalysis.driftRisk === "High" && !["ASSIGNED", "IN_REMEDIATION", "Completed", "CLOSED"].includes(item.engineeringLink.status)).length;

    return (
        <div className="space-y-6">
            {unassignedCriticalCount > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm mb-2 animate-in fade-in slide-in-from-top-4 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-4 h-4 text-rose-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold">Action Required</p>
                            <p className="text-xs opacity-90">You have {unassignedCriticalCount} critical gap{unassignedCriticalCount !== 1 ? 's' : ''} unassigned. Review them immediately to prevent submission delays.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => {
                            setRiskFilter('High');
                            document.getElementById('traceability-table')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition-colors"
                    >
                        Review Now
                    </button>
                </div>
            )}
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-[var(--foreground)] flex items-center gap-3 mb-2">
                        <Network className="w-8 h-8 text-indigo-600" />
                        Dynamic Traceability Matrix
                        <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-200">
                            Live Monitor
                        </span>
                    </h1>
                    <p className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 tracking-tight">
                        Real-time AI monitoring of your engineering pipeline against FDA regulatory feedback to keep your 510(k) evidence package coherent.
                    </p>
                    <p className="text-slate-500 mt-2 text-sm max-w-3xl leading-relaxed">
                        Visualize the real-time compliance status of your product's subsystems against established regulatory standards. Use the filters to quickly identify unverified gaps or failing components before final submission.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleResync}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-white border border-[var(--border)] text-sm font-medium rounded-lg hover:bg-slate-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {isSyncing ? "Syncing..." : "Resync Jira"}
                    </button>
                    <button 
                        onClick={handlePushEstar}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--primary-hover)] flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isSubmitting ? "Transmitting..." : "Push to eSTAR"}
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-[var(--border)] shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search requirements, tickets..." 
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <select 
                        value={riskFilter} 
                        onChange={(e) => setRiskFilter(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-slate-700 bg-white w-full sm:w-auto"
                    >
                        <option value="All">All Risks</option>
                        <option value="High">High Risk</option>
                        <option value="Medium">Medium Risk</option>
                        <option value="Low">Low Risk</option>
                    </select>
                </div>
            </div>

            {/* Matrix Table */}
            <div id="traceability-table" className="bg-white rounded-xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-[var(--border)]">
                                <th 
                                    className="px-6 py-4 font-semibold text-sm text-slate-700 w-1/4 cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => handleSort('fda')}
                                >
                                    <div className="flex items-center gap-2">
                                        FDA Requirement (Anchor)
                                        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'fda' ? 'text-indigo-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th 
                                    className="px-6 py-4 font-semibold text-sm text-slate-700 w-1/4 cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => handleSort('jira')}
                                >
                                    <div className="flex items-center gap-2">
                                        Engineering Task (Jira)
                                        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'jira' ? 'text-indigo-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th 
                                    className="px-6 py-4 font-semibold text-sm text-slate-700 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => handleSort('risk')}
                                >
                                    <div className="flex items-center gap-2">
                                        AI Drift Analysis
                                        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'risk' ? 'text-indigo-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th 
                                    className="px-6 py-4 font-semibold text-sm text-slate-700 w-1/6 cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => handleSort('status')}
                                >
                                    <div className="flex items-center gap-2">
                                        eSTAR Status
                                        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'status' ? 'text-indigo-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="w-6 h-6 animate-spin text-[var(--primary)]" />
                                            <span>Analyzing semantic alignment...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredAndSortedData.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                        {data.length === 0 ? "No traceability data available. Connect Jira to begin." : "No results found for current filters."}
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedData.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        {/* 1. FDA Anchor */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                                        {item.regulatoryAnchor.id}
                                                    </span>
                                                    <span className="text-sm font-medium text-slate-900">
                                                        {item.regulatoryAnchor.topic}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-600 mt-2">
                                                    {item.regulatoryAnchor.description}
                                                </p>
                                            </div>
                                        </td>

                                        {/* 2. Engineering Link */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex flex-col gap-2">
                                                <a 
                                                    href={item.engineeringLink.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline w-fit"
                                                >
                                                    {item.engineeringLink.id}
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                                <p className="text-sm text-slate-800 font-medium">
                                                    {item.engineeringLink.title}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-xs text-slate-500">
                                                        Owner: <span className="font-medium text-slate-700">{item.engineeringLink.owner}</span>
                                                    </span>
                                                    <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {item.engineeringLink.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* 3. AI Drift Analysis */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${getRiskColor(item.aiAnalysis.driftRisk)}`}>
                                                        {item.aiAnalysis.driftRisk === "High" && <ShieldAlert className="w-3 h-3" />}
                                                        {item.aiAnalysis.driftRisk} Drift Risk
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-slate-500">Confidence:</span>
                                                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full ${
                                                                    item.aiAnalysis.confidenceScore >= 95 ? 'bg-emerald-500' :
                                                                    item.aiAnalysis.confidenceScore >= 80 ? 'bg-indigo-500' :
                                                                    item.aiAnalysis.confidenceScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                                                }`}
                                                                style={{ width: `${item.aiAnalysis.confidenceScore}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-xs font-bold ${
                                                            item.aiAnalysis.confidenceScore >= 95 ? 'text-emerald-600' :
                                                            item.aiAnalysis.confidenceScore >= 80 ? 'text-indigo-600' :
                                                            item.aiAnalysis.confidenceScore >= 50 ? 'text-amber-600' : 'text-rose-600'
                                                        }`}>
                                                            {item.aiAnalysis.confidenceScore}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-600 bg-white p-3 rounded-lg border border-[var(--border)] shadow-sm">
                                                    <span className="font-semibold text-slate-800">AI Note: </span>
                                                    {item.aiAnalysis.rationale}
                                                </p>
                                                {(item.aiAnalysis.driftRisk === "High" || item.aiAnalysis.driftRisk === "Medium") && (
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedDraftItem(item);
                                                            setIsDraftModalOpen(true);
                                                        }}
                                                        className="mt-2 w-full py-2 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        Draft Q-Sub Addendum
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        {/* 4. eSTAR Status */}
                                        <td className="px-6 py-5 align-top">
                                            <div className="flex items-center gap-2">
                                                {getEstarStatusIcon(item.estarStatus)}
                                                <span className={`text-sm font-medium ${
                                                    item.estarStatus === "Ready" ? "text-emerald-700" :
                                                    item.estarStatus === "Blocked" ? "text-rose-700" : "text-amber-700"
                                                }`}>
                                                    {item.estarStatus}
                                                </span>
                                            </div>
                                            {item.estarStatus === "Blocked" && (
                                                <p className="text-xs text-rose-500 mt-2 font-medium">
                                                    Cannot push to FDA until drift is resolved.
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Q-Sub Addendum Modal */}
            {isDraftModalOpen && selectedDraftItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white/90 backdrop-blur-md border border-white/40 shadow-2xl rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col transform transition-all scale-100">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50 bg-white/50">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800 leading-tight">Auto-Draft Q-Sub Deviation</h2>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Formal "Blue Book" Concurrence Request</p>
                                </div>
                            </div>
                            <button onClick={() => setIsDraftModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar bg-slate-50/30">
                            <div className="space-y-4">
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm relative group">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Context</h3>
                                    <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                        We planned to proceed with <span className="font-bold text-slate-900">{selectedDraftItem.regulatoryAnchor.topic}</span> as agreed. Due to integration constraints, the engineering team has pivoted to <span className="font-bold text-slate-900">{selectedDraftItem.engineeringLink.title}</span>.
                                    </p>
                                </div>
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm relative group">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Rationale</h3>
                                    <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                        As detailed in Appendix A, this approach captures the critical vectors required for safety. Specifically, <span className="text-slate-600 italic">"{selectedDraftItem.aiAnalysis.rationale.split('.')[0]}."</span>
                                    </p>
                                </div>
                                <div className="p-5 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm relative group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-xl"></div>
                                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">The Formal Question</h3>
                                    <p className="text-base text-indigo-900 leading-relaxed font-black">
                                        Does the FDA concur that utilizing the proposed <span className="underline decoration-indigo-300 underline-offset-4">{selectedDraftItem.engineeringLink.title}</span> protocol is adequate to support the requirements of our upcoming 510(k) submission?
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-200/50 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setIsDraftModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(`Context: We planned to proceed with ${selectedDraftItem.regulatoryAnchor.topic} as agreed. Due to integration constraints, the engineering team has pivoted to ${selectedDraftItem.engineeringLink.title}.\n\nRationale: As detailed in Appendix A, this approach captures the critical vectors required for safety. Specifically, ${selectedDraftItem.aiAnalysis.rationale.split('.')[0]}.\n\nThe Formal Question: Does the FDA concur that utilizing the proposed ${selectedDraftItem.engineeringLink.title} protocol is adequate to support the requirements of our upcoming 510(k) submission?`);
                                    alert("Copied to clipboard!");
                                    setIsDraftModalOpen(false);
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2 transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                                Copy to Clipboard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
