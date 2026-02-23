"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BarChart3,
    FileText,
    Upload,
    ArrowRight,
    Shield,
    AlertTriangle,
    CheckCircle2,
    Clock,
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

    useEffect(() => {
        fetch("/api/reports")
            .then((r) => r.json())
            .then((data) => {
                if (data.success && data.data.uploads) {
                    setSubmissions(data.data.uploads);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const stats = {
        total: submissions.length,
        complete: submissions.filter((s) => s.status === "complete").length,
        pending: submissions.filter((s) => s.status === "pending").length,
        analyzing: submissions.filter((s) => s.status === "analyzing").length,
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
                <p className="text-[var(--muted)]">
                    Overview of your regulatory gap analysis submissions.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    {
                        label: "Total Analyses",
                        value: stats.total,
                        icon: BarChart3,
                        color: "var(--primary)",
                    },
                    {
                        label: "Completed",
                        value: stats.complete,
                        icon: CheckCircle2,
                        color: "var(--success)",
                    },
                    {
                        label: "Pending",
                        value: stats.pending,
                        icon: Clock,
                        color: "var(--warning)",
                    },
                    {
                        label: "In Progress",
                        value: stats.analyzing,
                        icon: AlertTriangle,
                        color: "var(--accent)",
                    },
                ].map((stat, i) => (
                    <div key={i} className="glass-card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                            <span
                                className="text-2xl font-bold"
                                style={{ color: stat.color }}
                            >
                                {stat.value}
                            </span>
                        </div>
                        <p className="text-sm text-[var(--muted)]">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="grid md:grid-cols-2 gap-4 mb-8">
                <Link
                    href="/dashboard/upload"
                    className="glass-card p-6 flex items-center gap-4 hover:border-[var(--primary)]/30 transition-all group"
                >
                    <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                        <Upload className="w-6 h-6 text-[var(--primary)]" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold mb-1">New Analysis</h3>
                        <p className="text-sm text-[var(--muted)]">
                            Upload documents and run gap detection
                        </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--primary)] transition-colors" />
                </Link>
                <Link
                    href="/dashboard/results"
                    className="glass-card p-6 flex items-center gap-4 hover:border-[var(--primary)]/30 transition-all group"
                >
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold mb-1">View Reports</h3>
                        <p className="text-sm text-[var(--muted)]">
                            Browse your gap analysis reports
                        </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors" />
                </Link>
            </div>

            {/* Recent Submissions */}
            <div>
                <h2 className="text-xl font-bold mb-4">Recent Submissions</h2>
                {loading ? (
                    <div className="glass-card p-12 text-center text-[var(--muted)]">
                        Loading...
                    </div>
                ) : submissions.length === 0 ? (
                    <div className="glass-card p-12 text-center">
                        <Shield className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
                        <p className="text-[var(--muted)] mb-4">No submissions yet</p>
                        <Link href="/dashboard/upload" className="btn-primary text-sm">
                            Start Your First Analysis
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {submissions.map((sub) => (
                            <Link
                                key={sub.id}
                                href={
                                    sub.status === "complete"
                                        ? `/dashboard/results?id=${sub.id}`
                                        : "#"
                                }
                                className="glass-card p-5 flex items-center gap-4 hover:border-[var(--primary)]/20 transition-all block"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-semibold truncate">{sub.deviceName}</h3>
                                        <span
                                            className={`badge ${sub.status === "complete"
                                                    ? "badge-compliant"
                                                    : sub.status === "analyzing"
                                                        ? "badge-review"
                                                        : "badge-gap"
                                                }`}
                                        >
                                            {sub.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[var(--muted)]">
                                        {sub.standards?.join(", ") || "No standards"} •{" "}
                                        {sub.documentCount || 0} documents •{" "}
                                        {sub.createdAt?.toDate ? new Date(sub.createdAt.toDate()).toLocaleDateString() : "N/A"}
                                    </p>
                                </div>
                                {sub.status === "complete" && (
                                    <ArrowRight className="w-5 h-5 text-[var(--muted)]" />
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
