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
    ExternalLink,
    X,
    ChevronLeft,
    ChevronRight,
    Eye,
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
    estimatedCost?: string;
    estimatedTimeline?: string;
    remediationSteps?: string[];
}

interface ReportData {
    upload: {
        id: string;
        deviceName: string;
        standards: string[];
        status: string;
        createdAt: any;
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

// Severity-based cost/timeline estimates — uses AI values when available
function getEstimates(result: GapResult) {
    if (result.status === "compliant") return { cost: "—", timeline: "—" };
    // Prefer AI-generated estimates
    if (result.estimatedCost && result.estimatedCost !== "—") {
        return { cost: result.estimatedCost, timeline: result.estimatedTimeline || "4–8 weeks" };
    }
    // Fallback to severity-based
    switch (result.severity) {
        case "critical":
            return { cost: "$5,000 – $10,000", timeline: "8–12 weeks" };
        case "major":
            return { cost: "$2,000 – $5,000", timeline: "4–8 weeks" };
        case "minor":
            return { cost: "$500 – $2,000", timeline: "2–4 weeks" };
        default:
            return { cost: "$1,000 – $5,000", timeline: "4–8 weeks" };
    }
}

// Get category from standard
function getCategory(standard: string): string {
    if (standard.includes("62304")) return "V&V Documentation";
    if (standard.includes("14971")) return "Risk Management";
    if (standard.includes("13485")) return "Quality Systems";
    if (standard.includes("10993")) return "Biocompatibility";
    if (standard.includes("eStar")) return "eStar Template";
    return "General";
}

// Get priority label and color
function getPriority(status: string, severity?: string) {
    if (status === "compliant") {
        return { label: "PASSED", color: "#10b981", bg: "rgba(16,185,129,0.1)" };
    }
    if (severity === "critical" || status === "gap_detected") {
        return { label: "CRITICAL", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
    }
    if (severity === "major") {
        return { label: "MODERATE", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
    }
    return { label: "LOW", color: "#6366f1", bg: "rgba(99,102,241,0.1)" };
}

function ResultsContent() {
    const searchParams = useSearchParams();
    const uploadId = searchParams.get("id");
    const [report, setReport] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "gap_detected" | "needs_review" | "compliant">("all");
    const [selectedResult, setSelectedResult] = useState<GapResult | null>(null);

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

    const exportJSON = () => {
        if (!report) return;
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tracebridge-report-${uploadId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportPDF = async () => {
        if (!report) return;
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 40, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("TraceBridge AI", 14, 18);
        doc.setFontSize(10);
        doc.text("Regulatory Compliance Gap Analysis Report", 14, 26);
        doc.setFontSize(8);
        doc.text(`Device: ${report.upload.deviceName}  |  Generated: ${new Date().toLocaleDateString()}`, 14, 34);

        // Summary
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.text("Summary", 14, 52);
        doc.setFontSize(10);
        doc.text(`Compliance Score: ${report.summary.complianceScore}%`, 14, 60);
        doc.text(`Total: ${report.summary.total}  |  Compliant: ${report.summary.compliant}  |  Gaps: ${report.summary.gaps}  |  Review: ${report.summary.needsReview}`, 14, 67);

        // Table
        const tableData = report.upload.gapResults.map((r: GapResult) => {
            const priority = getPriority(r.status, r.severity);
            const estimates = getEstimates(r);
            return [
                priority.label,
                getCategory(r.standard),
                `${r.standard} \u00a7${r.section}`,
                r.requirement.length > 55 ? r.requirement.substring(0, 52) + "..." : r.requirement,
                r.status === "compliant" ? "\u2713 Compliant" : r.status === "gap_detected" ? "\u2717 Gap" : "\u26a0 Review",
                estimates.cost,
                estimates.timeline,
            ];
        });

        autoTable(doc, {
            startY: 75,
            head: [["Priority", "Category", "Standard", "Requirement", "Status", "Est. Cost", "Timeline"]],
            body: tableData,
            theme: "grid",
            headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 7 },
            bodyStyles: { fontSize: 6.5 },
            columnStyles: { 0: { cellWidth: 18 }, 3: { cellWidth: 50 } },
        });

        // Gap detail pages
        const gaps = report.upload.gapResults.filter((r: GapResult) => r.status !== "compliant");
        for (const gap of gaps) {
            doc.addPage();
            const est = getEstimates(gap);
            doc.setFontSize(14);
            doc.setTextColor(239, 68, 68);
            doc.text(`Gap: ${gap.standard} \u00a7${gap.section}`, 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text("What FDA Requires:", 14, 32);
            doc.setFontSize(9);
            const reqLines = doc.splitTextToSize(gap.requirement, pageWidth - 28);
            doc.text(reqLines, 14, 39);
            let y = 39 + reqLines.length * 5 + 8;
            doc.setFontSize(10);
            doc.text("Citations:", 14, y);
            y += 7;
            doc.setFontSize(9);
            if (gap.citations?.length) {
                for (const c of gap.citations) {
                    const line = doc.splitTextToSize(`\u2022 ${c.source} \u2014 ${c.section}: \"${c.quote}\"`, pageWidth - 28);
                    doc.text(line, 14, y);
                    y += line.length * 5 + 2;
                }
            } else {
                doc.text("No evidence found.", 14, y);
                y += 6;
            }
            y += 4;
            doc.setFontSize(10);
            doc.text("Remediation:", 14, y);
            y += 7;
            doc.setFontSize(9);
            if (gap.remediationSteps?.length) {
                for (const step of gap.remediationSteps) {
                    const sl = doc.splitTextToSize(`\u2022 ${step}`, pageWidth - 28);
                    doc.text(sl, 14, y);
                    y += sl.length * 5 + 2;
                }
            }
            y += 4;
            doc.text(`Cost: ${est.cost}  |  Timeline: ${est.timeline}`, 14, y);
        }

        // Footer
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`TraceBridge AI \u2014 Confidential  |  Page ${i}/${pages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
        }

        doc.save(`TraceBridge-Report-${report.upload.deviceName.replace(/\s+/g, "-")}.pdf`);
    };

    // Navigate between gaps in modal
    const navigateGap = (direction: "prev" | "next") => {
        if (!selectedResult || !report) return;
        const results = report.upload.gapResults;
        const currentIdx = results.findIndex(r => r.id === selectedResult.id);
        const nextIdx = direction === "next"
            ? Math.min(currentIdx + 1, results.length - 1)
            : Math.max(currentIdx - 1, 0);
        setSelectedResult(results[nextIdx]);
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
                        {(() => {
                            const d = upload.createdAt;
                            if (!d) return "";
                            const date = typeof d === "string" ? new Date(d)
                                : d._seconds ? new Date(d._seconds * 1000)
                                    : new Date(d);
                            return isNaN(date.getTime()) ? "" : date.toLocaleDateString();
                        })()}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={exportPDF} className="btn-primary flex items-center gap-2 text-sm">
                        <Download className="w-4 h-4" /> Export PDF
                    </button>
                    <button onClick={exportJSON} className="btn-secondary flex items-center gap-2 text-sm">
                        <Download className="w-4 h-4" /> JSON
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
                {/* Score Ring */}
                <div className="glass-card p-6 flex items-center gap-4">
                    <svg width="80" height="80" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
                        <circle
                            cx="50" cy="50" r="45" fill="none"
                            stroke={summary.complianceScore >= 80 ? "var(--success)" : summary.complianceScore >= 50 ? "var(--warning)" : "var(--danger)"}
                            strokeWidth="6"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                            style={{ transition: "stroke-dashoffset 1s ease" }}
                        />
                        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="20" fontWeight="bold">
                            {summary.complianceScore}%
                        </text>
                    </svg>
                    <div>
                        <p className="text-sm text-[var(--muted)]">Completion</p>
                        <p className="font-bold text-lg">{summary.complianceScore}%</p>
                    </div>
                </div>

                {/* Gaps Detected */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-2">
                        <XCircle className="w-5 h-5" style={{ color: "var(--danger)" }} />
                        <span className="text-3xl font-bold" style={{ color: "var(--danger)" }}>
                            {summary.gaps}
                        </span>
                    </div>
                    <p className="text-sm text-[var(--muted)]">Gaps Detected</p>
                </div>

                {/* Needs Review */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-2">
                        <AlertTriangle className="w-5 h-5" style={{ color: "var(--warning)" }} />
                        <span className="text-3xl font-bold" style={{ color: "var(--warning)" }}>
                            {summary.needsReview}
                        </span>
                    </div>
                    <p className="text-sm text-[var(--muted)]">Needs Review</p>
                </div>

                {/* Compliant */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-2">
                        <CheckCircle2 className="w-5 h-5" style={{ color: "var(--success)" }} />
                        <span className="text-3xl font-bold" style={{ color: "var(--success)" }}>
                            {summary.compliant}
                        </span>
                    </div>
                    <p className="text-sm text-[var(--muted)]">Compliant</p>
                </div>
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
            <div className="glass-card overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[100px_1fr_1fr_120px_100px] gap-4 px-6 py-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                    <span>Priority</span>
                    <span>Gap Category</span>
                    <span>FDA Requirement</span>
                    <span>Status</span>
                    <span>Action</span>
                </div>

                {/* Table rows */}
                {filteredResults.map((result) => {
                    const priority = getPriority(result.status, result.severity);
                    const category = getCategory(result.standard);

                    return (
                        <div
                            key={result.id}
                            className="grid grid-cols-[100px_1fr_1fr_120px_100px] gap-4 px-6 py-4 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--card-hover)] transition-colors items-center"
                        >
                            {/* Priority badge */}
                            <div>
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                    style={{ color: priority.color, backgroundColor: priority.bg }}
                                >
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: priority.color }} />
                                    {priority.label}
                                </span>
                            </div>

                            {/* Category */}
                            <div>
                                <p className="text-sm font-medium">{category}</p>
                                <p className="text-xs text-[var(--muted)]">{result.standard}</p>
                            </div>

                            {/* FDA Requirement */}
                            <div>
                                <p className="text-sm truncate">{result.missingRequirement || result.requirement}</p>
                                <p className="text-xs text-[var(--muted)]">§ {result.section}</p>
                            </div>

                            {/* Status */}
                            <div>
                                <span className={`text-xs font-medium ${result.status === "compliant" ? "text-[var(--success)]" :
                                    result.status === "gap_detected" ? "text-[var(--danger)]" :
                                        "text-[var(--warning)]"
                                    }`}>
                                    {result.status === "compliant" ? "Complete" :
                                        result.status === "gap_detected" ? "Missing" : "Incomplete"}
                                </span>
                            </div>

                            {/* Action */}
                            <div>
                                <button
                                    onClick={() => setSelectedResult(result)}
                                    className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                    View Details
                                </button>
                            </div>
                        </div>
                    );
                })}

                {filteredResults.length === 0 && (
                    <div className="p-12 text-center text-[var(--muted)]">
                        No results match the current filter.
                    </div>
                )}
            </div>

            {/* ==================== VIEW DETAILS MODAL ==================== */}
            {selectedResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-[#1a1f3d] rounded-t-2xl px-6 py-5 flex items-start justify-between border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-xl font-bold mb-1">
                                    Gap Analysis: {getCategory(selectedResult.standard)} — {selectedResult.section}
                                </h2>
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                    style={{
                                        color: getPriority(selectedResult.status, selectedResult.severity).color,
                                        backgroundColor: getPriority(selectedResult.status, selectedResult.severity).bg,
                                    }}
                                >
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getPriority(selectedResult.status, selectedResult.severity).color }} />
                                    {getPriority(selectedResult.status, selectedResult.severity).label}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedResult(null)}
                                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body — 3 Columns */}
                        <div className="grid md:grid-cols-3 gap-0 md:gap-0">
                            {/* Column 1: What FDA Requires */}
                            <div className="p-6 border-r border-[var(--border)]">
                                <h3 className="text-sm font-semibold text-[var(--primary)] mb-4 uppercase tracking-wider">
                                    What FDA Requires
                                </h3>
                                <p className="text-sm font-medium mb-2">
                                    {selectedResult.standard} § {selectedResult.section}
                                </p>
                                <p className="text-sm text-[var(--muted)] leading-relaxed mb-4">
                                    {selectedResult.requirement}
                                </p>
                                <p className="text-xs text-[var(--muted)] italic">
                                    Source: {selectedResult.standard}
                                </p>
                            </div>

                            {/* Column 2: What You Submitted */}
                            <div className="p-6 border-r border-[var(--border)]">
                                <h3 className="text-sm font-semibold text-[var(--primary)] mb-4 uppercase tracking-wider">
                                    What You Submitted
                                </h3>
                                {selectedResult.citations && selectedResult.citations.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedResult.citations.map((cite, i) => (
                                            <div key={i} className="flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-medium">{cite.source}</p>
                                                    <p className="text-xs text-[var(--muted)]">{cite.section}</p>
                                                    {cite.quote && (
                                                        <p className="text-xs text-[var(--muted)] italic mt-1">
                                                            &ldquo;{cite.quote}&rdquo;
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-2">
                                        <XCircle className="w-4 h-4 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-[var(--danger)]">
                                            No matching evidence found in submitted documents.
                                        </p>
                                    </div>
                                )}

                                {/* View Submitted Document button */}
                                {upload.documents.length > 0 && (
                                    <div className="mt-6">
                                        <button className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5" />
                                            View Submitted Documents
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Column 3: Gap Identified */}
                            <div className="p-6">
                                <h3 className="text-sm font-semibold text-[var(--primary)] mb-4 uppercase tracking-wider">
                                    Gap Identified
                                </h3>

                                {selectedResult.status === "compliant" ? (
                                    <div className="p-4 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
                                            <p className="text-sm font-semibold text-[var(--success)]">
                                                REQUIREMENT MET
                                            </p>
                                        </div>
                                        <p className="text-xs text-[var(--muted)]">
                                            Your submission adequately addresses this requirement.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 mb-4">
                                            <p className="text-xs font-semibold text-[var(--danger)] uppercase mb-2">
                                                {selectedResult.status === "gap_detected" ? "MISSING REQUIREMENT:" : "NEEDS REVIEW:"}
                                            </p>
                                            <p className="text-sm text-[var(--muted)] leading-relaxed">
                                                {selectedResult.missingRequirement || "Evidence insufficient for this requirement."}
                                            </p>
                                        </div>

                                        {/* Remediation */}
                                        <div className="mb-4">
                                            <p className="text-xs font-semibold text-[var(--muted)] uppercase mb-2">
                                                REMEDIATION:
                                            </p>
                                            <ol className="text-sm text-[var(--muted)] space-y-1 list-decimal list-inside">
                                                <li>Review {selectedResult.standard} § {selectedResult.section}</li>
                                                <li>Prepare documentation addressing the requirement</li>
                                                <li>Include evidence in your submission package</li>
                                                <li>Re-run gap analysis to verify compliance</li>
                                            </ol>
                                        </div>

                                        {/* Estimates */}
                                        <div className="space-y-2 pt-4 border-t border-[var(--border)]">
                                            <div className="flex justify-between">
                                                <span className="text-sm font-medium">Estimated Timeline:</span>
                                                <span className="text-sm text-[var(--muted)]">
                                                    {getEstimates(selectedResult).timeline}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm font-medium">Estimated Cost:</span>
                                                <span className="text-sm text-[var(--muted)]">
                                                    {getEstimates(selectedResult).cost}
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer — Navigation */}
                        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
                            <div />
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => navigateGap("prev")}
                                    className="btn-secondary text-sm px-4 py-2 flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Previous Gap
                                </button>
                                <button
                                    onClick={() => navigateGap("next")}
                                    className="btn-secondary text-sm px-4 py-2 flex items-center gap-1"
                                >
                                    Next Gap <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
