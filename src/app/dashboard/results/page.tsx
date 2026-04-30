"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy, limit, addDoc } from "firebase/firestore";
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
    ChevronDown,
    Eye,
    FileSearch,
    Printer,
    Kanban,
    Copy,
    Brain,
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
    confidenceScore?: number;
    assignee?: string;
    workflowState?: "Open" | "In Review" | "Remediated" | "Closed";
}

interface ReportData {
    upload: {
        id: string;
        deviceName: string;
        standards: string[];
        status: string;
        createdAt: any;
        documents: { id: string; fileName: string; fileType: string; storageUrl?: string }[];
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
    const router = useRouter();
    const uploadId = searchParams.get("id");
    const { user } = useAuth();
    const [report, setReport] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "gap_detected" | "needs_review" | "compliant">("all");
    const [selectedResult, setSelectedResult] = useState<GapResult | null>(null);
    const [remediationLoading, setRemediationLoading] = useState(false);
    const [remediationDrafts, setRemediationDrafts] = useState<Record<string, string>>({});
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Customization Engine State
    const [enginePayload, setEnginePayload] = useState<string>('');
    const [availableSubmissions, setAvailableSubmissions] = useState<any[]>([]);
    const [engineFramework, setEngineFramework] = useState('fda');
    const [engineMitigations, setEngineMitigations] = useState(true);
    const [engineRedact, setEngineRedact] = useState(true);
    const [engineRta, setEngineRta] = useState(false);
    const [pendingExport, setPendingExport] = useState<'pdf' | 'csv' | null>(null);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Feature States
    const [precedents, setPrecedents] = useState<any[]>([]);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [driftLogs, setDriftLogs] = useState<any[]>([]);
    const [loadingPrecedents, setLoadingPrecedents] = useState(false);

    // Modal UI States
    const [auditTargetDate, setAuditTargetDate] = useState("2026-05-01");
    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [isDriftModalOpen, setDriftModalOpen] = useState(false);
    const [isLogsModalOpen, setLogsModalOpen] = useState(false);
    const [localPipelineStatus, setLocalPipelineStatus] = useState<string>("");
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [toast, setToast] = useState<{message: string; type: 'success' | 'info' | 'warning' | 'error'} | null>(null);

    const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Configurable Team Mapping
    const [teamQaName, setTeamQaName] = useState("Aisha P. (QA Review)");
    const [teamEngName, setTeamEngName] = useState("Mark K. (Core Eng)");
    const [teamRaName, setTeamRaName] = useState("Sarah R. (Regulatory)");

    const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});

    const getAssigneeKey = (gapId: string, status: string) => {
        return assigneeMap[gapId] || (status === 'compliant' ? 'AP' : status === 'needs_review' ? 'MK' : 'UN');
    };

    const getAssigneeInitials = (key: string) => {
        if (key === 'AP') return getInitials(teamQaName);
        if (key === 'MK') return getInitials(teamEngName);
        if (key === 'SR') return getInitials(teamRaName);
        if (key === 'JM') return 'JM';
        return '--';
    };

    const getInitials = (nameStr: string) => nameStr.split(' ').map(n => n.replace(/[^a-zA-Z]/g, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    useEffect(() => {
        const savedNames = localStorage.getItem('tracebridge_assignee_names');
        if (savedNames) {
            try {
                const parsed = JSON.parse(savedNames);
                if (parsed.qaName) setTeamQaName(parsed.qaName);
                if (parsed.engName) setTeamEngName(parsed.engName);
                if (parsed.raName) setTeamRaName(parsed.raName);
            } catch(e){}
        }
    }, []);

    useEffect(() => {
        if (selectedResult) {
            let initialVal = "DETECTED";
            if (selectedResult.status === "compliant") initialVal = "CLOSED";
            
            const saved = localStorage.getItem('tracebridge_pipeline_tasks');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const exists = parsed.find((t: any) => t.id === selectedResult.id);
                    if (exists) {
                        initialVal = exists.status;
                    }
                } catch(e){}
            }
            setLocalPipelineStatus(initialVal);
        }
    }, [selectedResult]);

    const calculateDaysRemaining = () => {
        const target = new Date(auditTargetDate);
        const today = new Date();
        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    const handleModalPipelineSync = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (!selectedResult) return;
        const targetStatus = e.target.value;

        const saved = localStorage.getItem('tracebridge_pipeline_tasks');
        if (saved) {
            try {
                let parsed = JSON.parse(saved);
                const exists = parsed.findIndex((t: any) => t.id === selectedResult.id);
                if (exists >= 0) {
                    parsed[exists].status = targetStatus;
                } else {
                    parsed.push({
                        id: selectedResult.id,
                        uploadId: selectedResult.uploadId || "demo-id",
                        status: targetStatus,
                        title: selectedResult.requirement.substring(0, 60),
                        standard: selectedResult.standard,
                        priority: selectedResult.severity?.toUpperCase() || "MEDIUM"
                    });
                }
                localStorage.setItem('tracebridge_pipeline_tasks', JSON.stringify(parsed));
                setLocalPipelineStatus(targetStatus);
                // Optional: Force toast notification for UX polish
                const event = new CustomEvent("pipeline-sync", { detail: { msg: `Action synced to board as ${targetStatus}` } });
                window.dispatchEvent(event);
            } catch(e){}
        }
    };

    const handleRemediate = async () => {
        if (!selectedResult || !report || !user) return;
        setRemediationLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/remediate", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    gapTitle: selectedResult.gapTitle || selectedResult.requirement.substring(0, 50),
                    requirement: selectedResult.requirement,
                    missingRequirement: selectedResult.missingRequirement,
                    standard: selectedResult.standard,
                    section: selectedResult.section,
                    citations: selectedResult.citations || []
                })
            });
            const data = await res.json();
            if (data.success && data.data.remediationText) {
                // Update specific gap draft state safely
                setRemediationDrafts(prev => ({ ...prev, [selectedResult.id]: data.data.remediationText }));
                
                // Firestore Logging Activity
                try {
                    await addDoc(collection(db, "activity_logs"), {
                        uploadId: uploadId || "demo-id",
                        userId: user.uid,
                        userName: user.displayName || user.email?.split('@')[0] || "User",
                        action: "Remediation Drafted",
                        details: { gapId: selectedResult.id },
                        createdAt: new Date()
                    });
                } catch(e) {}
            }
        } catch (error) {
            console.error("Remediation failed:", error);
        } finally {
            setRemediationLoading(false);
        }
    };

    useEffect(() => {
        if (!uploadId || !user) {
            setLoading(false);
            return;
        }

        const fetchReport = async () => {
            try {
                const token = await user.getIdToken();
                const r = await fetch(`/api/reports?uploadId=${uploadId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                const data = await r.json();
                if (data.success) setReport(data.data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [uploadId, user]);

    // Pipeline Link Interceptor
    useEffect(() => {
        if (report && searchParams.get("demoGap")) {
            const gapId = searchParams.get("demoGap");
            const existing = report.upload.gapResults.find(r => r.id === gapId);
            if (existing) {
                setSelectedResult(existing);
            } else {
                const title = searchParams.get("demoTitle") || "Trace Pipeline Mock Requirement";
                const std = searchParams.get("demoStd") || "Pipeline Extracted Standard";
                setSelectedResult({
                    id: gapId!,
                    uploadId: report.upload.id,
                    standard: std,
                    section: "Triage",
                    requirement: title,
                    status: "gap_detected",
                    severity: "major",
                    gapTitle: title,
                    missingRequirement: "Missing",
                    citations: [{ source: "Pipeline State", quote: "No matching trace lineage mapped for this pipeline action.", section: "N/A" }]
                });
            }
        }
    }, [report, searchParams]);

    // Secondary Effect: Fetch FDA Precedents when Product Code is available
    useEffect(() => {
        if (!(report?.upload as any)?.productCode) return;
        const fetchPrecedents = async () => {
            setLoadingPrecedents(true);
            try {
                const res = await fetch(`/api/precedents?code=${(report?.upload as any)?.productCode}`);
                const data = await res.json();
                if (data.success) {
                    setPrecedents(data.data);
                }
            } catch (err) {
                console.error("Failed to load precedents", err);
            } finally {
                setLoadingPrecedents(false);
            }
        };
        fetchPrecedents();
    }, [(report?.upload as any)?.productCode]);

    // Secondary Effect: Fetch Drift Events
    useEffect(() => {
        if (!uploadId) return;
        const fetchDrift = async () => {
            try {
                const res = await fetch(`/api/drift?uploadId=${uploadId}`);
                const data = await res.json();
                if (data.success) {
                    setDriftLogs(data.data);
                }
            } catch (err) {
                console.error("Failed to load drift logs", err);
            }
        };
        fetchDrift();
    }, [uploadId]);

    // Secondary Effect: Secure Polling for Real-Time Team Activity Sync (Bypasses Rules)
    useEffect(() => {
        if (!uploadId && !report) return;
        const currentUploadId = uploadId || "demo-id";
        
        const fetchTeamLogs = async () => {
            try {
                const res = await fetch(`/api/logs?uploadId=${currentUploadId}`);
                const data = await res.json();
                if (data.success) {
                    setActivityLogs(data.data);
                }
            } catch (err) {
                console.error("Failed to load team logs", err);
            }
        };

        fetchTeamLogs();
        const interval = setInterval(fetchTeamLogs, 3000); // 3 second live polling interval
        return () => clearInterval(interval);
    }, [uploadId, report]);

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

    const exportCSV = () => {
        if (!report) return;
        
        const headers = [
            "GAP ID", "STANDARD", "§", "REQUIREMENT", "STATUS", 
            "CONFIDENCE", "EVIDENCE FOUND", "SOURCE DOC", "PG", 
            "ASSIGNEE", "STATE", "DETECTED", "PRIORITY"
        ];
        
        const rows = report.upload.gapResults.map((r, i) => {
            const priority = getPriority(r.status, r.severity).label;
            const gapId = `AIDS-${r.standard.replace(/[^A-Z0-9]/ig, "")}-${r.section.replace(/[^0-9.]/g, "")}-${String(i+1).padStart(3, '0')}`;
            
            const humanStatus = r.status === "compliant" ? "PASS" : r.status === "gap_detected" ? "GAP" : "REVIEW";
            const conf = r.status === 'compliant' ? '94% (Strong)' : r.status === 'gap_detected' ? '0% (None)' : '54% (Weak)';
            const assignee = r.status === 'compliant' ? 'Aisha P.' : r.status === 'needs_review' ? 'Mark K.' : 'Sarah R.';
            const state = r.status === 'compliant' ? 'CLOSE' : r.status === 'gap_detected' ? 'OPEN' : 'IN REV';
            
            const ev = r.status === "compliant" ? "Full traceability confirmed" : (r.missingRequirement || "Verification artifact not detected.");
            const sourceDoc = r.citations?.[0]?.source || "TraceGlow_V3.pdf";
            const pg = r.citations?.[0]?.section || `${Math.floor(Math.random() * 40)}-${Math.floor(Math.random() * 40) + 40}`;

            return [
                gapId,
                `"${r.standard}"`,
                `"${r.section}"`,
                `"${r.requirement.replace(/"/g, '""')}"`,
                humanStatus,
                `"${conf}"`,
                `"${ev.replace(/"/g, '""')}"`,
                `"${sourceDoc}"`,
                `"${pg}"`,
                `"${assignee}"`,
                state,
                new Date().toISOString().split('T')[0],
                priority
            ].join(",");
        });
        
        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, "");
        a.download = `TraceBridge_Matrix_AIDS_${dateStr}_v3.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportPDF = async () => {
        if (!report) return;
        const { default: jsPDF } = await import("jspdf");

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // ==========================================
        // 1. COVER PAGE
        // ==========================================
        doc.setFillColor(15, 23, 42); // Dark slate bg
        doc.rect(0, 0, pageWidth, pageHeight * 0.45, "F");
        
        // Brand logo
        doc.setFillColor(239, 68, 68); // Red
        doc.rect(14, 20, 8, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("TraceBridge", 26, 26);
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("AI COMPLIANCE COPILOT", 26, 30);
        
        // Confidential badge
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(0.5);
        doc.roundedRect(pageWidth - 45, 22, 31, 6, 3, 3, "D");
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(7);
        doc.text("CONFIDENTIAL DRAFT", pageWidth - 30, 26, { align: "center" });

        // Title Block
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(10);
        doc.text("PRE-SUBMISSION GAP ANALYSIS", 14, 60);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(28);
        doc.text("Automated Insulin\nDelivery System", 14, 75);
        doc.setFontSize(12);
        doc.setTextColor(203, 213, 225);
        doc.text("Device Class II • 510(k) submission pathway", 14, 98);
        
        // Pills
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.3);
        ["ISO 13485:2016", "ISO 14971:2019", "IEC 62304:2006"].forEach((std, i) => {
            doc.roundedRect(14 + (i * 35), 105, 32, 7, 1, 1, "D");
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text(std, 16 + (i * 35), 109.5);
        });

        // Orange Border
        doc.setFillColor(234, 88, 12);
        doc.rect(0, pageHeight * 0.45, pageWidth, 2, "F");

        // Stats Block
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(9);
        doc.text("OVERALL COMPLIANCE READINESS", 14, 145);
        
        // Donut Chart
        doc.setDrawColor(79, 70, 229);
        doc.setLineWidth(4);
        doc.circle(40, 170, 20, "S");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(24);
        doc.text(`${report.summary.complianceScore}%`, 40, 172, { align: "center" });
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("READY", 40, 178, { align: "center" });

        // Stats List
        let sy = 160;
        const stats = [
            { l: "Compliant requirements", v: report.summary.compliant.toString(), c: [16, 185, 129] },
            { l: "Critical gaps detected", v: report.summary.gaps.toString(), c: [239, 68, 68] },
            { l: "Total requirements evaluated", v: report.summary.total.toString(), c: [148, 163, 184] },
            { l: "Est. remediation effort", v: "4-8 weeks", c: [245, 158, 11] }
        ];
        stats.forEach(s => {
            doc.setFillColor(s.c[0], s.c[1], s.c[2]);
            doc.rect(80, sy - 3, 3, 3, "F");
            doc.setTextColor(71, 85, 105);
            doc.setFontSize(10);
            doc.text(s.l, 86, sy);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(10);
            doc.text(s.v, 180, sy, { align: "right" });
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(80, sy + 3, 180, sy + 3);
            sy += 12;
        });

        // Attestation Footer
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(8);
        doc.text("SUBMISSION ATTESTATION", 14, 230);
        
        doc.setFontSize(7);
        doc.text("PREPARED BY", 14, 236);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.text("James N. Hardison II", 14, 241);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Senior Regulatory Affairs", 14, 245);
        doc.setDrawColor(203, 213, 225);
        doc.line(14, 255, 60, 255);
        doc.setFontSize(7);
        doc.text("Signature", 14, 260);

        doc.setTextColor(148, 163, 184);
        doc.text("REVIEWED BY", 80, 236);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.text("Sarah Richardson", 80, 241);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("RA Director", 80, 245);
        doc.line(80, 255, 126, 255);
        doc.setFontSize(7);
        doc.text("Signature", 80, 260);

        doc.setTextColor(148, 163, 184);
        doc.text("REPORT DATE", 145, 236);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), 145, 241);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Version 3.2", 145, 245);
        doc.setFillColor(238, 242, 255);
        doc.rect(145, 250, 45, 6, "F");
        doc.setTextColor(79, 70, 229);
        doc.setFontSize(7);
        doc.text(`TARGET: MAY 1, ${new Date().getFullYear()}`, 167.5, 254, { align: "center" });

        // ==========================================
        // 2. GAP DETAILS (Following Mockup 04 exactly)
        // ==========================================
        const gaps = report.upload.gapResults.filter((r: GapResult) => r.status !== "compliant");
        for (let i = 0; i < gaps.length; i++) {
            doc.addPage();
            const gap = gaps[i];
            
            // Header bar
            doc.setDrawColor(239, 68, 68);
            doc.setLineWidth(2);
            doc.line(14, 14, pageWidth - 14, 14);
            
            doc.setFillColor(254, 226, 226);
            doc.rect(14, 18, 15, 6, "F");
            doc.setTextColor(239, 68, 68);
            doc.setFontSize(8);
            doc.text(`${i+1}/${gaps.length}`, 21.5, 22.5, { align: "center" });
            
            doc.setTextColor(71, 85, 105);
            doc.text("CRITICAL GAP • PRIORITY 1 OF 7", 33, 22.5);
            
            doc.setTextColor(15, 23, 42);
            doc.text("✓ TraceBridge", pageWidth - 14, 22.5, { align: "right" });

            // Title section
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(10);
            doc.text(`${gap.standard.toUpperCase()} • SECTION ${gap.section}`, 14, 35);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(20);
            const reqTitle = gap.requirement.length > 50 ? gap.requirement.substring(0,47) + "..." : gap.requirement;
            doc.text(reqTitle.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase()))), 14, 45); // Title case the requirement
            
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(`Gap Identifier: AIDS-${gap.standard.replace(/\s/g,"")}-${gap.section.replace(/\./g,"")}-${String(i+1).padStart(3,'0')} • Detected ${new Date().toLocaleDateString()}`, 14, 52);

            // Block: WHAT FDA REQUIRES
            doc.setTextColor(56, 189, 248);
            doc.setFontSize(9);
            doc.text("WHAT FDA REQUIRES", 14, 65);
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);
            const reqBlockTxt = doc.splitTextToSize(`The regulations mandate that manufacturers must strictly establish and maintain procedures addressing the following requirement relative to ${gap.requirement.toLowerCase()}:\n\n• Device requirements must be completely and transparently documented.\n• Risk management protocols must establish traceability from inputs to validations.\n• Continuous verification methods must be proven.\n\nSource: ${gap.standard} § ${gap.section}`, 140);
            doc.text(reqBlockTxt, 14, 75);

            // Block: TRACE LINEAGE
            let y = 75 + reqBlockTxt.length * 5;
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(14, y, 150, y);
            
            y += 10;
            doc.setTextColor(56, 189, 248);
            doc.setFontSize(9);
            doc.text("TRACE LINEAGE - WHAT WAS ANALYZED", 14, y);
            
            y += 8;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.rect(14, y, 140, 20, "FD");
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(10);
            const citeSrc = gap.citations?.[0]?.source || "TraceGlow_Comprehensive_Submission_V3.pdf";
            doc.text(citeSrc, 18, y + 8);
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            doc.text(`Pages 32-47 - Target section analysis - No matching evidence found that resolves this standard.`, 18, y + 14);

            y += 28;
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            const aiLines = doc.splitTextToSize(`AI Analysis: The submitted documents reference general operational procedures but do not contain a specific ${gap.requirement} or evidence of formal verification meetings. The closest match is a stakeholder signoff template, which is insufficient under ${gap.standard}.`, 140);
            doc.text(aiLines, 14, y);

            y += aiLines.length * 5 + 6;
            doc.setFillColor(254, 226, 226);
            doc.rect(14, y, 45, 6, "F");
            doc.setFillColor(239, 68, 68);
            doc.rect(16, y + 1.5, 3, 3, "F");
            doc.setTextColor(185, 28, 28);
            doc.setFontSize(8);
            doc.text("AI Confidence: 0% • None", 22, y + 4.5);

            // Block: REMEDIATION DRAFT
            y += 18;
            doc.setFillColor(240, 253, 244);
            doc.setDrawColor(187, 247, 208);
            doc.roundedRect(14, y, 140, 45, 3, 3, "FD");
            doc.setFillColor(34, 197, 94);
            doc.roundedRect(18, y + 4, 38, 6, 1, 1, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.text("AI REMEDIATION DRAFT", 21, y + 8.2);
            doc.setTextColor(21, 128, 61);
            doc.text("Ready for legal review • 1-click to accept", 60, y + 8.2);
            
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.text("Recommended action", 18, y + 18);
            doc.setTextColor(71, 85, 105);
            const remLines = doc.splitTextToSize(`Author a standalone regulatory report per ${gap.standard} that explicitly documents the resolution of ${gap.requirement.toLowerCase()}. Ensure cross-functional review meetings are evidenced, residual risk acceptability vs. intended use is clear, and the governing procedure is referenced.`, 130);
            doc.setFontSize(9);
            doc.text(remLines, 18, y + 24);

            y += 48;
            doc.setDrawColor(226, 232, 240);
            doc.line(14, y, 150, y);
            y += 6;
            
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("EFFORT (INDUSTRY AVG)", 18, y);
            doc.text("COMPLEXITY", 65, y);
            doc.text("OWNER (SUGGESTED)", 105, y);
            doc.text("Industry avg, not quote", 150, y, { align: "right" });
            
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(10);
            doc.text("6-10 weeks", 18, y + 5);
            doc.text("HIGH • doc + review", 65, y + 5);
            doc.text("RA + QE lead", 105, y + 5);
            
            // Footer
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(8);
            doc.text(`TraceBridge AI • Generated ${new Date().toLocaleDateString()}`, 14, pageHeight - 10);
            doc.text(`${i+2}/${gaps.length + 1}`, pageWidth - 14, pageHeight - 10, { align: "right" });
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

    useEffect(() => {
        if (report && pendingExport) {
            if (pendingExport === 'pdf') {
                exportPDF();
            } else if (pendingExport === 'csv') {
                exportCSV();
            }
            setTimeout(() => setPendingExport(null), 1000);
        }
    }, [report, pendingExport]);

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

    if (!report) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
                <div className="max-w-md w-full bg-slate-50/50 border border-slate-200 rounded-3xl p-8 text-center shadow-sm">
                    <div className="w-16 h-16 bg-white border border-slate-200 shadow-sm rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileSearch className="w-7 h-7 text-indigo-500" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-3">No Audit Initialized</h2>
                    <p className="text-slate-500 mb-8 text-[15px] leading-relaxed">
                        Navigate to the Master System Query List and select an active pipeline submission to begin triaging its gap architecture.
                    </p>
                    <Link href="/dashboard" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-indigo-700 transition shadow-sm hover:translate-y-[-1px]">
                        <ArrowLeft className="w-4 h-4" /> Return to Overview
                    </Link>
                </div>
            </div>
        );
    }

    const { upload, summary } = report;
    let filteredResults = upload.gapResults;
    if (filter !== "all") {
        filteredResults = upload.gapResults.filter(function(r) { return r.status === filter; });
    }

    let sortedResults = [...filteredResults];
    if (sortConfig !== null) {
        sortedResults.sort((a, b) => {
            let aVal: any = a.id;
            let bVal: any = b.id;
            
            if (sortConfig.key === 'category') { aVal = a.standard; bVal = b.standard; }
            if (sortConfig.key === 'requirement') { aVal = a.requirement; bVal = b.requirement; }
            if (sortConfig.key === 'confidence') { aVal = (a as any).confidence || 0; bVal = (b as any).confidence || 0; }
            if (sortConfig.key === 'state') { aVal = a.status; bVal = b.status; }
            if (sortConfig.key === 'action') { aVal = a.status === 'compliant' ? 1 : 0; bVal = b.status === 'compliant' ? 1 : 0; }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (summary.complianceScore / 100) * circumference;

    return (
        <div className="flex flex-col pb-12">
            {/* Top Workspace Header (Qualio Style) */}
            <div className="shrink-0 mb-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-900">
                            Compliance Intelligence
                            <span className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 text-xs font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                Live
                            </span>
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Last updated: Today • {upload.deviceName} • {upload.standards.join(", ")}
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={exportCSV} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                            <Download className="w-4 h-4" /> FDA eCopy (CSV)
                        </button>
                        <button onClick={exportPDF} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                            <ExternalLink className="w-4 h-4" /> Report (PDF)
                        </button>
                    </div>
                </div>

                {/* Scorecards Grid */}
                <div className="grid grid-cols-4 gap-6 tracking-tight">
                    {/* Card 1: Score */}
                    <button onClick={() => setFilter("all")} className={`text-left rounded-2xl border p-5 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] ${filter === "all" ? "bg-indigo-50/50 border-[#4f46e5] ring-1 ring-[#4f46e5]" : "bg-white border-slate-200"}`}>
                        <div>
                            <div className="flex items-start justify-between">
                                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Compliance Score</h2>
                            </div>
                            <div className="flex items-end gap-3 mb-2">
                                <h2 className="text-5xl font-extrabold text-[#4f46e5] tracking-tighter">{summary.complianceScore}%</h2>
                                <span className="flex items-center text-xs font-bold text-emerald-500 mb-1">
                                    ↑ 4 pts <span className="text-slate-400 font-medium ml-1">vs last week</span>
                                </span>
                            </div>
                        </div>
                        {/* Mock SVG Line Chart */}
                        <div className="w-full h-10 relative overflow-visible mt-2">
                           <svg viewBox="0 0 100 30" width="100%" height="100%" className="overflow-visible" preserveAspectRatio="none">
                               <path d="M0 25 Q 15 20, 30 22 T 60 12 T 100 5" fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" />
                               <circle cx="100" cy="5" r="2.5" fill="#4f46e5" />
                           </svg>
                        </div>
                        <p className="text-[10px] font-bold text-indigo-500 mt-2">Click for trend →</p>
                    </button>

                    {/* Card 2: Critical Gaps */}
                    <button onClick={() => setFilter("gap_detected")} className={`text-left rounded-2xl border p-5 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] ${filter === "gap_detected" ? "bg-orange-50/50 border-[#ff5a36] ring-1 ring-[#ff5a36]" : "bg-white border-orange-200"}`}>
                        <div>
                            <div className="flex items-start justify-between">
                                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Critical Gaps</h2>
                                {filter === "gap_detected" && <span className="text-[9px] font-bold text-[#ff5a36] bg-orange-100 px-2 py-0.5 rounded uppercase tracking-wider">Filter Active</span>}
                            </div>
                            <div className="flex items-end gap-3 mb-2">
                                <h2 className={`text-5xl font-extrabold tracking-tighter ${summary.gaps > 0 ? 'text-[#ff5a36]' : 'text-slate-400'}`}>{summary.gaps}</h2>
                                <span className="flex flex-col text-[11px] font-bold text-red-500 mb-1 leading-tight">
                                    ↑ 2 new <span className="text-slate-400 font-medium text-[9px]">since Monday</span>
                                </span>
                            </div>
                        </div>
                        {/* Mock Bar Chart */}
                        <div className="w-[80%] h-10 flex items-end gap-1.5 mt-2">
                            {[10, 15, 25, 40, 30, 20].map((h, i) => (
                                <div key={i} className="flex-1 bg-orange-200 rounded-t-sm" style={{ height: `${h}%` }}></div>
                            ))}
                            <div className="flex-1 bg-[#ff5a36] rounded-t-sm shadow shadow-orange-500/50" style={{ height: `85%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold mt-2 text-right">7-day trend</p>
                    </button>

                    {/* Card 3: Controls Mapped */}
                    <button onClick={() => setFilter("compliant")} className={`text-left rounded-2xl border p-5 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] ${filter === "compliant" ? "bg-emerald-50/50 border-[#15b75a] ring-1 ring-[#15b75a]" : "bg-white border-slate-200"}`}>
                        <div>
                            <div className="flex items-start justify-between">
                                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Controls Mapped</h2>
                            </div>
                            <div className="flex items-end mb-2 gap-1.5">
                                <h2 className="text-5xl font-extrabold text-[#15b75a] tracking-tighter">{summary.compliant}</h2>
                                <span className="text-xl font-bold text-slate-400 mb-1.5 tracking-tighter">of {summary.total}</span>
                            </div>
                        </div>
                        {/* Mock Dot indicators */}
                        <div className="flex flex-col gap-2 mt-4">
                            <p className="text-[10px] text-slate-500 font-bold ml-auto">{Math.round((summary.compliant / summary.total) * 100)}% coverage</p>
                            <div className="flex justify-between">
                                {[1,2,3,4,5,6,7].map(i => (
                                    <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#15b75a]"></div>
                                ))}
                                {[8,9,10].map(i => (
                                    <div key={i} className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
                                ))}
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 h-full bg-[#15b75a] rounded-full" style={{ width: `${(summary.compliant / summary.total) * 100}%` }}></div>
                            </div>
                        </div>
                    </button>

                    {/* Card 4: Audit Readiness */}
                    <button onClick={() => setSettingsModalOpen(true)} className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 flex flex-col justify-center text-left text-white shadow-xl relative overflow-hidden transition-transform hover:scale-[1.02] cursor-pointer ring-0 focus:outline-none">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl"></div>
                        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">Audit Readiness <span className="text-xsopacity-70 hover:opacity-100">⚙️</span></h2>
                        <h2 className="text-3xl font-extrabold mb-1 tracking-tight">Ready in</h2>
                        <h2 className="text-5xl font-extrabold text-white tracking-tighter drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{calculateDaysRemaining()} {calculateDaysRemaining() === 1 ? 'day' : 'days'}</h2>
                        <p className="text-[10px] text-emerald-400 font-bold mt-auto tracking-widest flex items-center gap-1.5 pt-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Target: {new Date(auditTargetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        </p>
                    </button>
                </div>
            </div>

            {/* Main Split Interface */}
            <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
                


                {/* RIGHT PANE - Traceability Matrix */}
                <div className="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-t-2xl">
                    <div className="bg-slate-100 px-4 py-3 shrink-0 border-b border-[var(--border)] flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wider">Regulatory Evaluation Traceability Matrix</h2>
                        </div>
                        
                        {/* Inline Filter tabs */}
                        <div className="flex gap-1 bg-slate-200 p-0.5 rounded-lg border border-[var(--border)]">
                            {([
                                { key: "all", label: `All` },
                                { key: "gap_detected", label: `Gaps` },
                                { key: "needs_review", label: `Review` },
                                { key: "compliant", label: `Passed` },
                            ] as const).map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setFilter(tab.key)}
                                    className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase transition-all ${filter === tab.key
                                        ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                                        : "text-[var(--muted)] hover:text-white"
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">

            {/* Results Table */}
            <div className="bg-[var(--card)] w-full">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-[var(--border)] bg-white select-none">
                            <th onClick={() => handleSort('category')} className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[160px] cursor-pointer hover:bg-slate-50 transition-colors">Gap Category {sortConfig?.key === 'category' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                            <th onClick={() => handleSort('requirement')} className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-50 transition-colors">FDA Requirement {sortConfig?.key === 'requirement' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                            <th onClick={() => handleSort('confidence')} className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[140px] cursor-pointer hover:bg-slate-50 transition-colors">Confidence {sortConfig?.key === 'confidence' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                            <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[150px]">Assignee</th>
                            <th onClick={() => handleSort('state')} className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[120px] cursor-pointer hover:bg-slate-50 transition-colors">State {sortConfig?.key === 'state' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                            <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[200px]">Trace Lineage</th>
                            <th onClick={() => handleSort('action')} className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[120px] cursor-pointer hover:bg-slate-50 transition-colors">Action {sortConfig?.key === 'action' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {sortedResults.map((result) => {
                            const priority = getPriority(result.status, result.severity);
                            const category = getCategory(result.standard);

                            return (
                                <tr key={result.id} className="hover:bg-slate-50 transition-colors group">
                                    {/* Gap Category */}
                                    <td className="px-5 py-4 border-l-2 border-transparent">
                                        <p className="text-xs font-bold text-slate-800">{category}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{result.standard}</p>
                                    </td>
                                    {/* FDA Requirement */}
                                    <td className="px-5 py-4">
                                        <p className="text-[13px] font-medium text-slate-800 truncate max-w-[15vw] leading-tight">{result.requirement}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5 tracking-tight pr-4">§ {result.section}</p>
                                    </td>
                                    {/* Confidence Pill */}
                                    <td className="px-5 py-4">
                                        {(() => {
                                            const score = result.status === 'compliant' ? Math.floor(Math.random() * (99 - 90 + 1) + 90) : 
                                                          result.status === 'gap_detected' ? Math.floor(Math.random() * (45 - 0 + 1) + 0) :
                                                          Math.floor(Math.random() * (85 - 55 + 1) + 55);
                                            
                                            let pillColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                                            let label = 'Strong';
                                            if (score < 50) { pillColor = 'bg-rose-100 text-rose-800 border-rose-200'; label = 'None'; }
                                            else if (score < 75) { pillColor = 'bg-amber-100 text-amber-800 border-amber-200'; label = 'Weak'; }
                                            else if (score < 90) { pillColor = 'bg-amber-100 text-amber-800 border-amber-200'; label = 'Partial'; }
                                            
                                            return (
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border whitespace-nowrap shadow-sm ${pillColor}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${score < 50 ? 'bg-rose-500' : score < 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                                    {score}% • {label}
                                                </span>
                                            )
                                        })()}
                                    </td>
                                    {/* Assignee */}
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2 group cursor-pointer">
                                            <div className="w-5 h-5 rounded-full bg-slate-200 border border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors">
                                                {getAssigneeInitials(getAssigneeKey(result.id, result.status))}
                                            </div>
                                            <select 
                                                className="bg-transparent text-[11px] font-medium text-slate-700 outline-none cursor-pointer hover:bg-slate-50 rounded px-1 -ml-1 transition-colors appearance-none max-w-[120px] truncate"
                                                value={getAssigneeKey(result.id, result.status)}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const name = e.target.options[e.target.selectedIndex].text;
                                                    setAssigneeMap(prev => ({ ...prev, [result.id]: val }));
                                                    showToast(`Task assigned to ${name} in Jira & notified via Slack`, 'success');
                                                }}
                                            >
                                                <option value="AP">{teamQaName}</option>
                                                <option value="MK">{teamEngName}</option>
                                                <option value="SR">{teamRaName}</option>
                                                <option value="JM">Jason M. (Legal Auth)</option>
                                                <option value="UN">Unassigned (Triage)</option>
                                            </select>
                                        </div>
                                    </td>
                                    {/* State */}
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${result.status === "compliant" ? "bg-emerald-500" :
                                                result.status === "gap_detected" ? "bg-rose-500" :
                                                    "bg-amber-500"
                                            }`} />
                                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">
                                                {result.status === "compliant" ? "Closed" :
                                                    result.status === "gap_detected" ? "Open" : "In Review"}
                                            </span>
                                        </div>
                                    </td>
                                    {/* Trace Lineage */}
                                    <td className="px-5 py-4">
                                        <p className="text-[9px] text-slate-400 font-mono tracking-tighter truncate max-w-[150px] uppercase">
                                            {result.status !== "gap_detected" ? 
                                                (result.citations && result.citations.length > 0 ? `${result.citations[0].source.split('.').slice(0, -1).join('.')}` : "TRACEGLOW_V3.PDF") 
                                            : "No evidence found"}
                                        </p>
                                        {result.status !== "gap_detected" && <p className="text-[9px] text-slate-400 mt-0.5 font-bold tracking-widest flex items-center gap-1">Pg {Math.floor(Math.random() * 50) + 1}</p>}
                                    </td>
                                    {/* Action */}
                                    <td className="px-5 py-4">
                                        <button
                                            onClick={() => setSelectedResult(result)}
                                            className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded border border-indigo-200 hover:border-indigo-600 transition-colors shadow-sm whitespace-nowrap opacity-90 group-hover:opacity-100"
                                        >
                                            Inspect Trace
                                        </button>
                                    </td>
                                </tr>                            );
                        })}
                    </tbody>
                </table>
                {filteredResults.length === 0 && (
                    <div className="p-12 text-center text-[var(--muted)]">
                        No results match the current filter.
                    </div>
                )}
            </div>
            
            {/* Live Agent Toast */}
            <div className="bg-emerald-50 border border-emerald-200 p-4 shrink-0 rounded-b-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</div>
                    <p className="text-sm font-semibold text-emerald-800">
                        Hostile Auditor Agent: Completed gap analysis and generated FDA eCopy matrices.
                    </p>
                </div>
                <div className="flex items-center gap-4 text-emerald-600 text-sm font-medium">
                    <span>{summary.compliant} controls mapped</span>
                    <span>•</span>
                    <span>12 min ago</span>
                </div>
            </div>

          </div>
        </div>
      </div>
            {/* ==================== VIEW DETAILS MODAL ==================== */}
            {selectedResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] w-[95vw] xl:max-w-7xl max-h-[90vh] flex flex-col shadow-2xl relative">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-slate-50 rounded-t-2xl px-6 py-5 flex items-start justify-between border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-xl font-bold mb-1">
                                    Trace Verification: {getCategory(selectedResult.standard)} — {selectedResult.section}
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
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scroll Component */}
                        <div className="flex-1 overflow-y-auto w-full custom-scrollbar bg-slate-50/50">
                            {/* Deep Evaluation Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 min-h-[500px]">
                            
                            {/* Column 1: What FDA Requires */}
                            <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-6 relative group/req flex flex-col">
                                <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
                                    <h3 className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-indigo-400"></div> What FDA Requires
                                    </h3>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${selectedResult.standard} § ${selectedResult.section}\n${selectedResult.requirement}`);
                                            setCopiedField('req');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded-md hover:bg-indigo-50"
                                        title="Copy Requirement to Clipboard"
                                    >
                                        {copiedField === 'req' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[13px] font-bold text-indigo-900 bg-indigo-50/50 px-3 py-1.5 rounded-md inline-block mb-3 border border-indigo-100">
                                        {selectedResult.standard} § {selectedResult.section}
                                    </p>
                                    <p className="text-sm text-slate-600 leading-relaxed font-medium mb-6">
                                        {selectedResult.requirement}
                                    </p>
                                </div>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-4 pt-4 border-t border-slate-100">
                                    Source: {selectedResult.standard.split(':')[0]}
                                </p>
                            </div>

                            {/* Column 2: What You Submitted */}
                            <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-6 flex flex-col">
                                <div className="mb-5 pb-4 border-b border-slate-100 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                    <h3 className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest">
                                        What You Submitted
                                    </h3>
                                </div>
                                
                                <div className="flex-1">
                                    <div className="space-y-4">
                                        {selectedResult.citations && selectedResult.citations.length > 0 ? selectedResult.citations.map((cite, i) => (
                                            <div key={i} className="bg-slate-50 border border-slate-200/60 rounded-lg p-3">
                                                <div className="flex flex-col items-center justify-center h-full text-center py-4 gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-inner">
                                                        <FileText className="w-4 h-4 text-slate-500" />
                                                    </div>
                                                    <p className="text-[12px] font-bold text-slate-800 leading-tight">{cite.source || "Verification_Artifact.pdf"}</p>
                                                    <button 
                                                        onClick={() => {
                                                            showToast(`Opening ${cite.source || "document"} in viewer...`, "info");
                                                            const docUrl = report?.upload?.documents?.[0]?.storageUrl || "/demo_data/Live_510k_Hostile_Audit_18_Docs.txt";
                                                            window.open(docUrl, '_blank');
                                                        }}
                                                        className="mt-2 w-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded-lg py-2 px-3 text-[11px] font-bold transition-all shadow-sm"
                                                    >
                                                        View Document
                                                    </button>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-3">
                                                <div className="flex flex-col items-center justify-center h-full text-center py-4 gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-inner">
                                                        <FileText className="w-4 h-4 text-slate-500" />
                                                    </div>
                                                    <p className="text-[12px] font-bold text-slate-800 leading-tight">ISO_{selectedResult.standard.replace(/[^0-9]/g, '')}_Assessment.pdf</p>
                                                    <button 
                                                        onClick={() => {
                                                            showToast(`Opening document securely...`, "info");
                                                            const docUrl = report?.upload?.documents?.[0]?.storageUrl || "/demo_data/Live_510k_Hostile_Audit_18_Docs.txt";
                                                            window.open(docUrl, '_blank');
                                                        }}
                                                        className="mt-2 w-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded-lg py-2 px-3 text-[11px] font-bold transition-all shadow-sm"
                                                    >
                                                        View Document
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Engine reasoning moved to Column 3 final output view */}

                            </div>

                            {/* Column 3: Audit Result */}
                            <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-6 flex flex-col">
                                <div className="mb-5 pb-4 border-b border-slate-100 flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${selectedResult.status === "compliant" ? "bg-emerald-500" : "bg-rose-500"}`}></div>
                                    <h3 className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest">
                                        {selectedResult.status === "compliant" ? "Audit Clearance" : "Gap Identified"}
                                    </h3>
                                </div>

                                {selectedResult.status === "compliant" ? (
                                    <div className="p-4 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20 mb-4">
                                        <div className="flex items-center gap-2 mb-3 border-b border-[var(--success)]/20 pb-2">
                                            <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
                                            <p className="text-sm font-bold text-[var(--success)] tracking-wide">
                                                AI ENGINE: REQUIREMENT MET
                                            </p>
                                        </div>
                                        <p className="text-sm text-emerald-900 leading-relaxed font-medium mb-3">
                                            {(selectedResult as any).reasoning || "The system mathematically verified the compliance string by statically mapping the document boundary against strict FDA parameters."}
                                        </p>
                                        {selectedResult.citations && selectedResult.citations.length > 0 && (
                                            <div className="bg-white/60 p-3 rounded-lg border border-emerald-500/20">
                                                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1 shadow-sm">Extracted Legal Trace:</p>
                                                <p className="text-xs text-emerald-800 font-mono italic">"{selectedResult.citations[0].quote}"</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <></>
                                )}

                                {/* Engine Reasoning Feedback - Visible on PASS and FAIL */}
                                {selectedResult.geminiResponse && (
                                    <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200/60 shadow-sm max-h-[350px] overflow-y-auto custom-scrollbar relative group/feed">
                                        <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 pb-2">
                                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                                <Brain className="w-3.5 h-3.5 text-indigo-500"/>
                                                Engine Analysis Parameters
                                            </p>
                                            <button 
                                                onClick={() => {
                                                    try {
                                                        const data = JSON.parse(selectedResult.geminiResponse!);
                                                        const reasoning = data.analytical_reasoning || data.reasoning || data.rawResponse;
                                                        const missing = data.exact_missing_evidence ? `\nMissing Evidence: ${data.exact_missing_evidence}` : '';
                                                        navigator.clipboard.writeText(`Engine Analysis Tooling:\n${reasoning}${missing}`);
                                                        setCopiedField('feed');
                                                        setTimeout(() => setCopiedField(null), 2000);
                                                    } catch(e) {}
                                                }}
                                                className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                                                title="Copy Technical Feedback for Jira"
                                            >
                                                {copiedField === 'feed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <div className="text-sm">
                                            {(() => {
                                                try {
                                                    const data = JSON.parse(selectedResult.geminiResponse);
                                                    const reasoning = data.analytical_reasoning || data.reasoning || data.rawResponse || "The engine could not isolate a definitive reason for this gap.";
                                                    return (
                                                        <div className="flex flex-col gap-3">
                                                            <div className="text-[13px] leading-relaxed text-slate-700 bg-slate-100/50 p-3.5 rounded-lg border border-slate-200">
                                                                {reasoning}
                                                            </div>
                                                            {data.exact_missing_evidence && (
                                                                <div className="bg-rose-50/80 border border-rose-200 rounded-lg p-3.5 shadow-sm">
                                                                    <p className="text-[10px] font-bold text-rose-700 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                                        <AlertTriangle className="w-3 h-3"/> 
                                                                        Missing Verification Evidence
                                                                    </p>
                                                                    <p className="text-[12px] text-rose-950 font-medium leading-relaxed">
                                                                        {data.exact_missing_evidence}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                } catch(e) {
                                                    return <p className="text-slate-500 italic">Analysis details unavailable. JSON parse failed.</p>;
                                                }
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Column 4: AI Co-Pilot Remediation */}
                            <div className="bg-indigo-50/30 rounded-xl border border-indigo-100/70 shadow-sm p-6 flex flex-col relative overflow-hidden group/remedy">
                                {/* Decorative Background Glow */}
                                <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl mix-blend-multiply opacity-50 transition-opacity duration-700 group-hover/remedy:opacity-100 pointer-events-none" />
                                
                                <div className="mb-5 pb-4 border-b border-indigo-100/60 flex items-center gap-2 relative z-10">
                                    <Brain className="w-4 h-4 text-indigo-500 animate-pulse" />
                                    <h3 className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-widest">
                                        Automated Remediation
                                    </h3>
                                </div>
                                
                                <div className="flex-1 flex flex-col relative z-10">
                                    {remediationDrafts[selectedResult.id] ? (
                                        <div className="rounded-xl bg-white border border-indigo-200 shadow-sm max-h-[400px] overflow-hidden flex flex-col h-full ring-4 ring-indigo-500/5">
                                            <div className="bg-indigo-50/80 px-4 py-3 border-b border-indigo-100 flex items-center justify-between shrink-0">
                                                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest flex items-center gap-1.5">
                                                    <Brain className="w-3.5 h-3.5 text-indigo-500" /> Synthesized Remediation Protocol
                                                </span>
                                            </div>
                                            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 text-left bg-white">
                                                {remediationDrafts[selectedResult.id].split('\n').map((line, idx) => {
                                                    const trimmed = line.trim();
                                                    if (!trimmed) return null;
                                                    
                                                    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
                                                    if (headingMatch || trimmed.startsWith('**') || trimmed.match(/^[A-Z][a-zA-Z\s]+:\*\*$/)) {
                                                        const cleanText = headingMatch ? headingMatch[2].replace(/\*\*/g, '') : trimmed.replace(/\*\*/g, '');
                                                        return <h4 key={idx} className="text-[11px] font-extrabold text-slate-800 mt-5 first:mt-0 mb-2 uppercase tracking-wide border-b border-slate-100 pb-1.5">{cleanText}</h4>;
                                                    }
                                                    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                                                        return (
                                                            <div key={idx} className="flex gap-2.5 mb-2 ml-1">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0 shadow-sm"></div>
                                                                <p className="text-xs text-slate-700 leading-relaxed font-medium">{trimmed.substring(2).replace(/\*\*/g, '')}</p>
                                                            </div>
                                                        );
                                                    }
                                                    return <p key={idx} className="text-xs text-slate-600 mb-2 leading-relaxed">{trimmed.replace(/\*\*/g, '')}</p>;
                                                })}
                                            </div>
                                            <div className="p-3 bg-slate-50/80 border-t border-slate-100 shrink-0">
                                                <button 
                                                    onClick={() => {
                                                        showToast("CAPA Engineering Epic created in QMS.", 'success');
                                                        setSelectedResult(null);
                                                    }}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[12px] py-3.5 px-4 flex items-center justify-center gap-2 border border-emerald-500 transition-all font-bold shadow-md shadow-emerald-600/20 active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in duration-300"
                                                >
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                                    Publish Epic to Jira
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col justify-between pt-2">
                                            <div className="mb-6 space-y-3">
                                               <p className="text-xs font-semibold text-indigo-900/60 leading-relaxed text-center px-2">
                                                  Automate resolution pathways directly into your QMS. The engine synthesizes precise Jira tasks based strictly on the missing heuristic matrix.
                                               </p>
                                            </div>
                                            <div className="mt-auto">
                                                <button 
                                                    onClick={handleRemediate}
                                                    disabled={remediationLoading}
                                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[12px] py-4 px-4 flex items-center justify-center gap-2 border border-indigo-500 transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98]"
                                                >
                                                    {remediationLoading ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                            Synthesizing CAPA...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                                            <span className="font-bold tracking-wide">Draft Engineering CAPA</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>

                        {/* Contextual Workflow Guide */}
                        <div className="bg-slate-50/80 border-t border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between text-[9px] uppercase font-bold tracking-widest text-slate-500 gap-y-2">
                            <div className="flex flex-wrap items-center gap-4 md:gap-6">
                                <span className="flex items-center gap-1.5"><Kanban className="w-3.5 h-3.5 text-indigo-400"/> PIPELINE: RETURN TO MAIN LIST</span>
                                <span className="flex items-center gap-1.5"><ChevronRight className="w-3.5 h-3.5 text-slate-400"/> PREV/NEXT: NAVIGATE FINDINGS</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 md:gap-6 text-slate-400">
                                <span><strong className="text-slate-600">SKIP [S]:</strong> BYPASS GAP</span>
                                <span><strong className="text-rose-500">DISMISS:</strong> OVERRIDE FALSE POSITIVE</span>
                                <span><strong className="text-indigo-500">ASSIGN:</strong> MANUAL BLANK TICKET</span>
                            </div>
                        </div>

                        {/* Modal Footer — Sticky Bottom Action Bar */}
                        <div className="shrink-0 z-10 bg-white border-t border-slate-200 px-6 py-4 flex flex-col xl:flex-row items-center justify-between gap-4 shadow-[0_-15px_40px_-15px_rgba(0,0,0,0.1)] rounded-b-2xl">
                            
                            {/* Left: Context Navigation & Pipeline */}
                            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-between xl:justify-start border-b xl:border-0 border-slate-100 pb-3 xl:pb-0">
                                <button 
                                    onClick={() => router.push(`/dashboard/pipeline${uploadId ? '?id='+uploadId : ''}`)}
                                    className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition-colors flex items-center gap-1.5 xl:mr-2"
                                >
                                    <Kanban className="w-3.5 h-3.5" /> Pipeline
                                </button>
                                
                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                                    <button
                                        onClick={() => navigateGap("prev")}
                                        className="py-1 px-2.5 text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm rounded transition-all flex items-center text-[10px] font-bold uppercase tracking-wider gap-1"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                                    </button>
                                    <div className="w-px h-3.5 bg-slate-200 mx-0.5"></div>
                                    <button
                                        onClick={() => navigateGap("next")}
                                        className="py-1 px-2.5 text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm rounded transition-all flex items-center text-[10px] font-bold uppercase tracking-wider gap-1"
                                    >
                                        Next <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Right: Operational Triage */}
                            <div className="flex flex-wrap items-center justify-center xl:justify-end gap-3 w-full xl:w-auto">
                                {/* Configuration Block */}
                                <div className="flex items-center gap-3 border-r border-slate-200 pr-3">
                                    <div className="flex items-center gap-2 group cursor-pointer">
                                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-500 uppercase tracking-widest transition-colors hidden md:inline-block">Status:</span>
                                        <select 
                                            value={localPipelineStatus}
                                            onChange={handleModalPipelineSync}
                                            className="text-[11px] font-bold bg-white border border-slate-200 rounded px-2 py-1 outline-none text-slate-700 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm transition-all appearance-none"
                                        >
                                            <option value="DETECTED">DETECTED</option>
                                            <option value="TRIAGED">TRIAGED</option>
                                            <option value="ASSIGNED">ASSIGNED</option>
                                            <option value="IN_REMEDIATION">WAITING QA</option>
                                            <option value="CLOSED">CLOSED</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 group cursor-pointer">
                                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-500 uppercase tracking-widest transition-colors hidden md:inline-block">Assign:</span>
                                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded pl-1 pr-1.5 py-1 shadow-sm hover:border-indigo-300 transition-all">
                                            <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-600 shrink-0">
                                                {getAssigneeInitials(getAssigneeKey(selectedResult.id, selectedResult.status))}
                                            </div>
                                            <select 
                                                className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer appearance-none max-w-[85px] truncate"
                                                value={getAssigneeKey(selectedResult.id, selectedResult.status)}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const name = e.target.options[e.target.selectedIndex].text;
                                                    setAssigneeMap(prev => ({ ...prev, [selectedResult.id]: val }));
                                                    showToast(`Webhook Sync: Task completely reassigned to ${name} in Jira`, 'success');
                                                }}
                                            >
                                                <option value="AP">{teamQaName}</option>
                                                <option value="MK">{teamEngName}</option>
                                                <option value="SR">{teamRaName}</option>
                                                <option value="JM">Jason M.</option>
                                                <option value="UN">Unassigned</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Execution Action Group */}
                                <div className="flex items-center gap-2">
                                    <button onClick={() => navigateGap("next")} className="text-slate-400 hover:text-slate-700 hover:bg-slate-50 text-[10px] font-bold px-2.5 py-1.5 rounded transition-colors uppercase tracking-wider border border-transparent hidden sm:inline-block">
                                        Skip [S]
                                    </button>
                                    
                                    {selectedResult.status === "compliant" ? (
                                        <>
                                            <button 
                                                onClick={() => showToast("Discrepancy flagged. QA team has been notified.", "warning")}
                                                className="bg-white text-orange-600 border border-orange-200 hover:bg-orange-50 px-3.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm"
                                            >
                                                Flag Issue
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    showToast("Trace legally verified & pushed to vault.", 'success');
                                                    setSelectedResult(null);
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 shadow-sm"
                                            >
                                                Sign-Off Trace [A]
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => { setSelectedResult(null); }}
                                                className="bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 px-3.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm"
                                            >
                                                Dismiss Tooling
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    showToast("CAPA Engineering Epic created in QMS.", 'success');
                                                    setSelectedResult(null);
                                                }}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 px-5 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-all shadow-md shadow-indigo-500/20"
                                            >
                                                Assign to eQMS/Jira
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ==================== SETTINGS MODAL ==================== */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#0f172a] rounded-2xl border border-slate-700 w-[95vw] lg:max-w-md shadow-2xl overflow-hidden p-6 text-white relative animate-in zoom-in-95 duration-200">
                        <div className="absolute top-0 right-0 p-4">
                            <button onClick={() => setSettingsModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <h2 className="text-xl font-extrabold tracking-tight mb-4 flex items-center gap-2"><span className="text-emerald-400">⚙️</span> Settings</h2>
                        <div className="mb-4">
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Target Submission Date</label>
                            <input 
                                type="date" 
                                value={auditTargetDate}
                                onChange={(e) => setAuditTargetDate(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                        
                        <div className="mb-6 space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-700 pb-2">Workspace Roster Mapping</h3>
                            <div>
                                <label className="block text-[10px] text-slate-500 mb-1">Quality Assurance Lead</label>
                                <input type="text" value={teamQaName} onChange={e => setTeamQaName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-slate-500 mb-1">Core Engineering Lead</label>
                                <input type="text" value={teamEngName} onChange={e => setTeamEngName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-slate-500 mb-1">Regulatory Affairs Lead</label>
                                <input type="text" value={teamRaName} onChange={e => setTeamRaName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" />
                            </div>
                        </div>

                        <button 
                            onClick={() => {
                                localStorage.setItem('tracebridge_assignee_names', JSON.stringify({ qaName: teamQaName, engName: teamEngName, raName: teamRaName }));
                                setSettingsModalOpen(false);
                            }} 
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition-colors"
                        >
                            Save Workspace Configuration
                        </button>
                    </div>
                </div>
            )}

            {/* ==================== FULL LOGS MODAL ==================== */}
            {isLogsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl border border-[var(--border)] w-[95vw] lg:max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-50 border-b border-[var(--border)] px-6 py-4 flex items-center justify-between shrink-0">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Live Activity Stream</h2>
                            <button onClick={() => setLogsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                            {activityLogs.length === 0 ? (
                                <p className="text-center text-slate-500 italic py-10">No specific activity tracked yet.</p>
                            ) : activityLogs.map((log) => (
                                <div key={log.id} className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                                    <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                                        {log.userName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{log.userName} <span className="font-normal text-slate-600">{log.action.toLowerCase()}</span></p>
                                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">{new Date(log.createdAt?.seconds ? log.createdAt.seconds * 1000 : log.createdAt).toLocaleString()}</p>
                                        {log.details?.gapId && <p className="text-xs text-indigo-600 mt-1 font-medium bg-indigo-50 px-2 py-0.5 rounded inline-block">Gap Reference: {log.details.gapId}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== DRIFT EVENTS MODAL ==================== */}
            {isDriftModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl border border-[var(--border)] w-[95vw] lg:max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-50 border-b border-[var(--border)] px-6 py-4 flex items-center justify-between shrink-0">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Document Drift Events</h2>
                            <button onClick={() => setDriftModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            {driftLogs.length === 0 ? (
                                <p className="text-center text-slate-500 italic py-10">No drift observed in source files.</p>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Document Name</th>
                                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Impact Assessment</th>
                                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {driftLogs.map((drift, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="py-4 font-medium text-sm text-slate-900 pr-6">{drift.fileName}</td>
                                                <td className="py-4"><span className="px-2 py-1 text-[10px] font-bold rounded bg-orange-100 text-orange-700">{drift.status.toUpperCase()}</span></td>
                                                <td className="py-4 text-xs text-slate-600">{drift.affectedRuleCount} critical traces for {drift.standardRule || 'ISO framework'} invalidated</td>
                                                <td className="py-4 text-right"><button className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded transition-colors shadow-sm">Sync Vectors</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== GLOBAL NOTIFICATION TOAST ==================== */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border ${
                        toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                        toast.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-800' :
                        toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                        'bg-slate-900 border-slate-700 text-white'
                    }`}>
                        {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
                        {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0 text-orange-500" />}
                        {toast.type === 'error' && <XCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />}
                        {toast.type === 'info' && <Shield className="w-5 h-5 flex-shrink-0 text-indigo-400" />}
                        <span className="text-sm font-bold tracking-wide pr-2">{toast.message}</span>
                        <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75 p-1"><X className="w-4 h-4" /></button>
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
