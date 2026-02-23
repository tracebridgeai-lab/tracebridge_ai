"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Shield,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    FileText,
    ArrowLeft,
    Download,
    ChevronDown,
    ChevronUp,
    ExternalLink,
} from "lucide-react";

interface GapResult {
    id: string;
    uploadId: string;
    standard: string;
    section: string;
    requirement: string;
    status: "compliant" | "gap_detected" | "needs_review";
    severity?: "critical" | "major" | "minor";
    gapTitle: string;
    missingRequirement: string;
    citations?: Array<{
        source: string;
        section: string;
        quote: string;
    }>;
    geminiResponse?: string;
}

interface ReportData {
    upload: {
        id: string;
        deviceName: string;
        standards: string[];
        status: string;
        createdAt: string;
        documents: { id: string; fileName: string; fileType: string }[];
        gapResults: GapResult[];
    };
    summary: {
        total: number;
        compliant: number;
        gaps: number;
        needsReview: number;
        complianceScore: number;
    };
}

function ResultsContent() {
    const searchParams = useSearchParams();
    const uploadId = searchParams.get("id");
    const [report, setReport] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<"all" | "gap_detected" | "needs_review" | "compliant">("all");

    useEffect(() => {
        if (!uploadId) {
            setLoading(false);
            return;
        }
        fetch(`/api/reports?uploadId=${uploadId}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.success) setReport(data.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [uploadId]);

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "compliant":
                return <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />;
            case "gap_detected":
                return <XCircle className="w-5 h-5 text-[var(--danger)]" />;
            case "needs_review":
                return <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />;
            default:
                return null;
        }
    };

    const exportReport = () => {
        if (!report) return;
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gap-report-${report.upload.deviceName.replace(/\s+/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="glass-card p-12 text-center">
                    <div className="w-12 h-12 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-[var(--muted)]">Loading report...</p>
                </div>
            </div>
        );
    }

    if (!uploadId || !report) {
        return (
            <div className="text-center py-20">
                <Shield className="w-16 h-16 text-[var(--muted)] mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">No Report Selected</h2>
                <p className="text-[var(--muted)] mb-6">
                    Select an upload from the dashboard to view its report.
                </p>
                <Link href="/dashboard" className="btn-primary">
                    Go to Dashboard
                </Link>
            </div>
        );
    }

    const { upload, summary } = report;
    const filteredResults =
        filter === "all"
            ? upload.gapResults
            : upload.gapResults.filter((r) => r.status === filter);

    // Compliance score ring
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (summary.complianceScore / 100) * circumference;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    href="/dashboard"
                    className="p-2 rounded-xl hover:bg-[var(--card-hover)] transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold">{upload.deviceName}</h1>
                    <p className="text-[var(--muted)]">
                        {upload.standards.join(", ")} •{" "}
                        {new Date(upload.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <button onClick={exportReport} className="btn-secondary flex items-center gap-2">
                    <Download className="w-4 h-4" /> Export JSON
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
                {/* Score Ring */}
                <div className="glass-card p-6 flex items-center gap-4 md:col-span-1">
                    <svg width="80" height="80" viewBox="0 0 100 100">
                        <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke="var(--border)"
                            strokeWidth="6"
                        />
                        <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke={
                                summary.complianceScore >= 80
                                    ? "var(--success)"
                                    : summary.complianceScore >= 50
                                        ? "var(--warning)"
                                        : "var(--danger)"
                            }
                            strokeWidth="6"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                            style={{ transition: "stroke-dashoffset 1s ease", animation: "scoreIn 1s ease" }}
                        />
                        <text
                            x="50"
                            y="50"
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="white"
                            fontSize="20"
                            fontWeight="bold"
                        >
                            {summary.complianceScore}%
                        </text>
                    </svg>
                    <div>
                        <p className="text-sm text-[var(--muted)]">Compliance</p>
                        <p className="font-bold text-lg">Score</p>
                    </div>
                </div>

                {/* Stat cards */}
                {[
                    {
                        label: "Compliant",
                        value: summary.compliant,
                        color: "var(--success)",
                        icon: CheckCircle2,
                    },
                    {
                        label: "Gaps Found",
                        value: summary.gaps,
                        color: "var(--danger)",
                        icon: XCircle,
                    },
                    {
                        label: "Needs Review",
                        value: summary.needsReview,
                        color: "var(--warning)",
                        icon: AlertTriangle,
                    },
                ].map((stat, i) => (
                    <div key={i} className="glass-card p-6">
                        <div className="flex items-center justify-between mb-2">
                            <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                            <span className="text-3xl font-bold" style={{ color: stat.color }}>
                                {stat.value}
                            </span>
                        </div>
                        <p className="text-sm text-[var(--muted)]">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-6">
                {([
                    { key: "all", label: `All (${upload.gapResults.length})` },
                    { key: "gap_detected", label: `Gaps (${summary.gaps})` },
                    { key: "needs_review", label: `Review (${summary.needsReview})` },
                    { key: "compliant", label: `Compliant (${summary.compliant})` },
                ] as const).map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === tab.key
                                ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30"
                                : "text-[var(--muted)] hover:text-white border border-transparent hover:border-[var(--border)]"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Results Table */}
            <div className="space-y-2">
                {filteredResults.map((result) => (
                    <div key={result.id} className="glass-card overflow-hidden">
                        <button
                            onClick={() => toggleRow(result.id)}
                            className="w-full p-4 flex items-center gap-4 text-left hover:bg-[var(--card-hover)] transition-colors"
                        >
                            {getStatusIcon(result.status)}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-mono text-[var(--primary)]">
                                        {result.standard} § {result.section}
                                    </span>
                                    {result.severity && (
                                        <span className={`badge badge-${result.severity}`}>
                                            {result.severity}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-medium truncate">
                                    {result.missingRequirement}
                                </p>
                            </div>
                            <span
                                className={`badge ${result.status === "compliant"
                                        ? "badge-compliant"
                                        : result.status === "gap_detected"
                                            ? "badge-gap"
                                            : "badge-review"
                                    }`}
                            >
                                {result.status.replace("_", " ")}
                            </span>
                            {expandedRows.has(result.id) ? (
                                <ChevronUp className="w-4 h-4 text-[var(--muted)]" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-[var(--muted)]" />
                            )}
                        </button>

                        {expandedRows.has(result.id) && (
                            <div className="px-4 pb-4 border-t border-[var(--border)] pt-4">
                                <div className="mb-4">
                                    <p className="text-xs text-[var(--muted)] mb-1 uppercase tracking-wider">
                                        Requirement
                                    </p>
                                    <p className="text-sm">{result.requirement}</p>
                                </div>

                                {result.citations &&
                                    Array.isArray(result.citations) &&
                                    result.citations.length > 0 && (
                                        <div className="mt-4">
                                            <p className="text-xs text-[var(--muted)] mb-2 uppercase tracking-wider">
                                                Citations
                                            </p>
                                            <div className="space-y-2">
                                                {result.citations.map((cite, i) => (
                                                    <div
                                                        key={i}
                                                        className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                                                    >
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <FileText className="w-3 h-3 text-[var(--primary)]" />
                                                            <span className="font-medium text-[var(--primary)]">
                                                                {cite.source}
                                                            </span>
                                                            <span className="text-[var(--muted)]">
                                                                — {cite.section}
                                                            </span>
                                                        </div>
                                                        {cite.quote && (
                                                            <p className="text-[var(--muted)] italic text-xs mt-1">
                                                                &ldquo;{cite.quote}&rdquo;
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                            </div>
                        )}
                    </div>
                ))}

                {filteredResults.length === 0 && (
                    <div className="glass-card p-12 text-center text-[var(--muted)]">
                        No results match the current filter.
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ResultsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="glass-card p-12 text-center">
                        <div className="w-12 h-12 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-[var(--muted)]">Loading...</p>
                    </div>
                </div>
            }
        >
            <ResultsContent />
        </Suspense>
    );
}
