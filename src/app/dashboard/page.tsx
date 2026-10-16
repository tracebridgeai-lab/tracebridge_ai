"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
    BarChart3,
    FileText,
    Upload,
    ArrowRight,
    Shield,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Search,
    Loader2,
    Trash2,
    HelpCircle,
    X
} from "lucide-react";

interface Upload {
    id: string;
    deviceName: string;
    standards: string[];
    status: string;
    createdAt: any;
    documentCount: number;
    gapResultsCount: number;
}

export default function DashboardPage() {
    const [submissions, setSubmissions] = useState<Upload[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { user } = useAuth();
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [showGuide, setShowGuide] = useState(false);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                const token = await user.getIdToken();
                const r = await fetch("/api/reports", {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                const data = await r.json();
                if (data.success && data.data.uploads) {
                    setSubmissions(data.data.uploads);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const stats = {
        total: submissions.length,
        complete: submissions.filter((s) => s.status === "complete").length,
        pending: submissions.filter((s) => s.status === "pending").length,
        analyzing: submissions.filter((s) => s.status === "analyzing").length,
    };

    const handleSeedBackdoor = async () => {
        if (submissions.length > 10) {
            alert("Demo dataset has already been loaded. Please delete existing audits to load again.");
            return;
        }
        if (!user || !window.confirm("This will populate your workspace with Q-Sub Demo Data. Proceed?")) return;
        try {
            setLoading(true);
            const token = await user.getIdToken();
            const res = await fetch("/api/admin/run-golden-dataset", {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ userId: user.uid })
            });
            const data = await res.json();
            if (data.success) {
                window.location.reload();
            } else {
                alert("Failed to seed: " + data.error);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user || !window.confirm("Are you sure you want to permanently delete this audit record?")) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/reports?uploadId=${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setSubmissions(prev => prev.filter(s => s.id !== id));
            } else {
                alert("Failed to delete: " + data.error);
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred while deleting.");
        }
    };

    let sortedSubmissions = [...submissions];
    if (sortConfig !== null) {
        sortedSubmissions.sort((a, b) => {
            let aVal: any = a[sortConfig.key as keyof Upload];
            let bVal: any = b[sortConfig.key as keyof Upload];
            
            if (sortConfig.key === 'createdAt') {
                aVal = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
                bVal = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
            }
            if (sortConfig.key === 'deviceName') {
                aVal = a.deviceName.toLowerCase();
                bVal = b.deviceName.toLowerCase();
            }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return (
        <div className="flex flex-col gap-6">
            
            {/* Enterprise Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[var(--border)] pb-4">
                <div>
                    <h1 
                        className="text-3xl font-black text-slate-900 mb-2 tracking-tight flex items-center gap-3 cursor-default select-none"
                        onDoubleClick={handleSeedBackdoor}
                    >
                        <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                            <BarChart3 className="w-4 h-4 text-indigo-600" />
                        </span>
                        510(k) Submission Readiness Dashboard
                        <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-200">
                            Overview
                        </span>
                    </h1>
                    <p className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 tracking-tight">
                        Master index of active 510(k) gap analyses.
                    </p>
                    <p className="text-slate-500 mt-2 text-sm max-w-3xl leading-relaxed">
                        Manage your enterprise compliance portfolio. Monitor the overall alignment status of your active device submissions and launch new gap analysis scans against FDA feedback.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                    <button
                        onClick={() => setShowGuide(true)}
                        className="bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 shadow-sm"
                    >
                        <HelpCircle className="w-4 h-4" />
                        User Guide
                    </button>
                    <button
                        onClick={handleSeedBackdoor}
                        disabled={loading || submissions.length > 10}
                        className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title={submissions.length > 10 ? "Dataset already loaded. Please delete existing audits to load again." : ""}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                        Populate Demo Data
                    </button>
                    <Link
                        href="/dashboard/upload"
                        className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 shadow-sm"
                    >
                        <Upload className="w-4 h-4" />
                        Initiate Alignment Audit
                    </Link>
                </div>
            </div>

            {/* Educational Workflow Component */}
            <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 shadow-xl mb-2 relative overflow-hidden hidden xl:block">
                <div className="absolute top-0 right-0 p-40 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none"></div>
                <h2 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 mb-6">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Your TraceBridge AI Workflow
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
                    {/* Step 1 */}
                    <Link href="/dashboard/upload" className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 hover:border-slate-500 transition-colors p-4 rounded-lg flex gap-3 items-start relative group cursor-pointer block">
                        <div className="w-8 h-8 rounded bg-slate-700 text-white flex items-center justify-center font-bold shrink-0 shadow-sm group-hover:bg-slate-600 transition-colors">1</div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">510(k) Gap Analysis</h3>
                            <p className="text-[11px] text-slate-400 leading-relaxed">Drop in your DHF and FDA minutes. We'll automatically build a semantic knowledge graph of your entire device architecture.</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-600 absolute -right-3 top-1/2 -translate-y-1/2 z-20 hidden md:block" />
                    </Link>
                    {/* Step 2 */}
                    <Link href="/dashboard/results" className="bg-indigo-900/40 backdrop-blur-sm border border-indigo-500/30 hover:border-indigo-400/60 transition-colors p-4 rounded-lg flex gap-3 items-start relative group cursor-pointer block">
                        <div className="w-8 h-8 rounded bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md group-hover:bg-indigo-500 transition-colors">2</div>
                        <div>
                            <h3 className="text-sm font-bold text-indigo-100 mb-1">Gap Findings</h3>
                            <p className="text-[11px] text-indigo-300 leading-relaxed">Our specialized Gemini models flag missing or inconsistent evidence against FDA 510(k) requirements.</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-600 absolute -right-3 top-1/2 -translate-y-1/2 z-20 hidden md:block" />
                    </Link>
                    {/* Step 3 */}
                    <Link href="/dashboard/pipeline" className="bg-emerald-900/40 backdrop-blur-sm border border-emerald-500/30 hover:border-emerald-400/60 transition-colors p-4 rounded-lg flex gap-3 items-start relative group cursor-pointer block">
                        <div className="w-8 h-8 rounded bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md group-hover:bg-emerald-500 transition-colors">3</div>
                        <div>
                            <h3 className="text-sm font-bold text-emerald-100 mb-1">Remediation Pipeline</h3>
                            <p className="text-[11px] text-emerald-300 leading-relaxed">Triage the flagged gaps. We automatically sync with your Jira board to seamlessly assign fixes directly to your engineering team.</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-600 absolute -right-3 top-1/2 -translate-y-1/2 z-20 hidden md:block" />
                    </Link>
                    {/* Step 4 */}
                    <Link href="/dashboard/traceability" className="bg-blue-900/40 backdrop-blur-sm border border-blue-500/30 hover:border-blue-400/60 transition-colors p-4 rounded-lg flex gap-3 items-start relative group cursor-pointer block">
                        <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-sm group-hover:bg-blue-500 transition-colors">4</div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">Traceability Matrix</h3>
                            <p className="text-[11px] text-blue-200 leading-relaxed">Watch your live matrix turn green as engineers ship code, guaranteeing 100% compliance before your final eSTAR export.</p>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Top Stat Ribbon & Search */}
            <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Compact Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 border border-[var(--border)] rounded bg-white shadow-sm flex-1">
                    <div className="p-4 border-r border-[var(--border)]">
                        <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <BarChart3 className="w-4 h-4 text-[var(--primary)]" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Total Audits</span>
                        </div>
                        <span className="text-xl font-bold text-slate-900">{stats.total}</span>
                    </div>
                    <div className="p-4 border-r border-[var(--border)]">
                        <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Approved Scans</span>
                        </div>
                        <span className="text-xl font-bold text-slate-900">{stats.complete}</span>
                    </div>
                    <div className="p-4 border-r border-[var(--border)]">
                        <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <Clock className="w-4 h-4 text-amber-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Pending</span>
                        </div>
                        <span className="text-xl font-bold text-slate-900">{stats.pending}</span>
                    </div>
                    <div className="p-4">
                        <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Active Processing</span>
                        </div>
                        <span className="text-xl font-bold text-slate-900">{stats.analyzing}</span>
                    </div>
                </div>

            </div>

            {/* Master Audit List - Formal Table */}
            <div className="bg-white border border-[var(--border)] rounded shadow-sm">
                <div className="bg-slate-50 border-b border-[var(--border)] px-4 py-3 flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[var(--primary)]" />
                        Master System Query List
                    </h4>
                </div>
                
                <div className="overflow-x-auto w-full">
                    {loading ? (
                        <div className="p-12 text-center text-[var(--muted)] text-sm font-medium">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--primary)]" />
                            Querying Database...
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="p-12 text-center">
                            <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 text-sm font-medium mb-4">No audit records found in the current index.</p>
                            <Link href="/dashboard/upload" className="text-[var(--primary)] text-sm font-bold hover:underline">
                                Start Initial Record Ingestion &rarr;
                            </Link>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-slate-100 select-none">
                                    <th onClick={() => handleSort('deviceName')} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors">Audit Target / Device {sortConfig?.key === 'deviceName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Regulated Protocol</th>
                                    <th onClick={() => handleSort('documentCount')} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell cursor-pointer hover:bg-slate-200 transition-colors">Documents Ingested {sortConfig?.key === 'documentCount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th onClick={() => handleSort('createdAt')} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell cursor-pointer hover:bg-slate-200 transition-colors">Execution Date {sortConfig?.key === 'createdAt' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors">Current Status {sortConfig?.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {sortedSubmissions.map((sub) => (
                                    <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="font-bold text-sm text-slate-900 block max-w-[250px] leading-tight">
                                                    {sub.deviceName}
                                                </span>
                                                <span className="bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-widest uppercase shadow-sm">
                                                    v1.1
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">ID: {sub.id.substring(0, 8)}</span>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <div className="flex flex-wrap gap-1">
                                                {sub.standards?.slice(0,2).map(std => (
                                                    <span key={std} className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium">{std.split(':')[0]}</span>
                                                )) || <span className="text-xs text-slate-400">N/A</span>}
                                                {sub.standards?.length > 2 && <span className="text-[10px] text-slate-500">+{sub.standards.length - 2}</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600 font-medium hidden lg:table-cell">
                                            {sub.documentCount || 0} Files
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600 font-mono hidden md:table-cell">
                                            {sub.createdAt?.toDate ? new Date(sub.createdAt.toDate()).toISOString().split('T')[0] : (typeof sub.createdAt === 'string' ? new Date(sub.createdAt).toISOString().split('T')[0] : "Pending")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                                                sub.status === "complete" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                sub.status === "analyzing" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                "bg-red-50 text-red-700 border-red-200"
                                            }`}>
                                                {sub.status === "analyzing" && <Loader2 className="w-3 h-3 animate-spin inline" />}
                                                {sub.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                {sub.status === "complete" ? (
                                                    <Link 
                                                        href={`/dashboard/results?id=${sub.id}`}
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
                                                    >
                                                        View Matrix <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-slate-400 font-medium">Processing...</span>
                                                )}
                                                <button 
                                                    onClick={(e) => handleDelete(e, sub.id)}
                                                    className="text-slate-400 hover:text-rose-500 transition-colors p-1.5 rounded-md hover:bg-rose-50"
                                                    title="Delete Audit"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Quick Start Guide Modal */}
            {showGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-[var(--primary)]" />
                                TraceBridge Quick Start Guide
                            </h2>
                            <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6 text-slate-600 max-h-[70vh] overflow-y-auto">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-2">
                                <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
                                    <Shield className="w-4 h-4" /> Enterprise-Grade Security
                                </h3>
                                <p className="text-sm text-blue-800">
                                    Your data is protected by a <strong>Zero-Trust Architecture</strong>. All uploads are processed in ephemeral, isolated containers, and system activities are permanently recorded in our <strong>Secure Audit Log</strong> to ensure strict <strong>FDA 21 CFR Part 11 Compliance</strong>.
                                </p>
                            </div>

                            <p className="text-sm font-medium">
                                Welcome to the TraceBridge 510(k) Readiness Beta! This is a closed beta - your feedback directly shapes the product. Use the feedback button in the bottom right to flag anything unexpected. Here is how to evaluate the platform:
                            </p>
                            
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">1</div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">Run a 510(k) Gap Analysis</h3>
                                        <p className="text-sm text-slate-500 mt-1">Click <strong>Initiate Alignment Audit</strong> to upload your own Design History File, Risk Management, or V&V documents. We will instantly build a semantic knowledge graph of your device.</p>
                                        <p className="text-sm text-slate-500 mt-2"><em>Don't have a document ready?</em> Click <strong>Populate Demo Data</strong> on the dashboard to safely load a pre-configured Q-Sub alignment example.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">2</div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">Review AI Intelligence & Remediate</h3>
                                        <p className="text-sm text-slate-500 mt-1">Navigate to the <strong>Remediation Pipeline</strong>. Watch how TraceBridge automatically flags missing ISO 13485 or FDA requirements and allows you to seamlessly assign fixes directly to Jira.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">3</div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">Monitor the Traceability Matrix</h3>
                                        <p className="text-sm text-slate-500 mt-1">Go to the <strong>Traceability Matrix</strong> to watch your real-time FDA compliance status. As your engineers close Jira tickets, the AI will automatically lower the "Drift Risk" and turn the matrix green.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">4</div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">Export to eSTAR</h3>
                                        <p className="text-sm text-slate-500 mt-1">When your matrix is green, go to <strong>Saved Reports</strong> to generate a deterministic, FDA-ready Part 11 compliant eSTAR payload with zero manual spreadsheet work.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button 
                                onClick={() => {
                                    setShowGuide(false);
                                    router.push('/dashboard/upload');
                                }}
                                className="bg-[var(--primary)] text-white px-6 py-2 rounded font-bold shadow hover:bg-blue-800 transition-colors"
                            >
                                Get Started
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
