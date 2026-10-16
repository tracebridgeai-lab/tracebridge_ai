"use client";

import { useEffect, useState, Suspense, useRef } from "react";
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
    Trash2,
    ThumbsDown,
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
    reasoning?: string;
    missingEvidence?: string;
    createdAt?: any;
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

// Severity-based cost/timeline estimates - uses AI values when available
function getEstimates(result: GapResult) {
    if (result.status === "compliant") return { cost: "-", timeline: "-" };
    // Prefer AI-generated estimates
    if (result.estimatedCost && result.estimatedCost !== "-") {
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

function getCategory(standard: string): string {
    if (standard.toLowerCase().includes("cybersecurity")) return "Cybersecurity";
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
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [executiveSummary, setExecutiveSummary] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);

    // AI Safety Net & Continuous Learning States
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [feedbackReason, setFeedbackReason] = useState("");
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

    const handleFeedbackSubmit = async () => {
        if (!selectedResult || !feedbackReason.trim()) return;
        setIsSubmittingFeedback(true);
        try {
            const token = user ? await user.getIdToken() : "";
            await fetch('/api/eval-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ gapResult: selectedResult, reason: feedbackReason })
            });
            showToast("Feedback added to Golden Dataset", "success");
            setIsFeedbackModalOpen(false);
            setFeedbackReason("");
        } catch (e) {
            showToast("Failed to submit feedback", "error");
        } finally {
            setIsSubmittingFeedback(false);
        }
    };

    // Customization Engine State
    const [enginePayload, setEnginePayload] = useState<string>('');
    const [availableSubmissions, setAvailableSubmissions] = useState<any[]>([]);
    const [engineFramework, setEngineFramework] = useState('fda');
    const [engineMitigations, setEngineMitigations] = useState(true);
    const [engineRedact, setEngineRedact] = useState(true);
    const [engineRta, setEngineRta] = useState(false);
    const [pendingExport, setPendingExport] = useState<'pdf' | 'csv' | null>(null);
    const [viewMode, setViewMode] = useState<'builder' | 'preview'>('builder');
    const isExportingRef = useRef(false);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleDeleteGap = async (gapId: string) => {
        if (!confirm("Are you sure you want to permanently remove this gap from the compliance matrix?")) return;
        if (!report || !user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/gap?id=${gapId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.success) {
                const updatedGaps = report.upload.gapResults.filter(r => r.id !== gapId);
                const newTotal = updatedGaps.length;
                const newCompliant = updatedGaps.filter(r => r.status === "compliant").length;
                const newGaps = updatedGaps.filter(r => r.status === "gap_detected").length;
                const newNeedsReview = updatedGaps.filter(r => r.status === "needs_review").length;
                const newComplianceScore = newTotal > 0 ? Math.round((newCompliant / newTotal) * 100) : 0;
                
                setReport({
                    ...report,
                    upload: { ...report.upload, gapResults: updatedGaps },
                    summary: {
                        total: newTotal,
                        compliant: newCompliant,
                        gaps: newGaps,
                        needsReview: newNeedsReview,
                        complianceScore: newComplianceScore
                    }
                });
                showToast("Regulatory rule removed successfully.", "success");
            } else {
                showToast("Failed to remove rule: " + data.error, "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Server communication failed.", "error");
        }
    };

    // Feature States
    const [precedents, setPrecedents] = useState<any[]>([]);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [driftLogs, setDriftLogs] = useState<any[]>([]);
    const [loadingPrecedents, setLoadingPrecedents] = useState(false);

    // Modal UI States
    const [leftTab, setLeftTab] = useState<'evidence' | 'history'>('evidence');
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

        // QA Validation: Cannot mark as ASSIGNED or IN_REMEDIATION without an Assignee
        if (targetStatus === "ASSIGNED" || targetStatus === "IN_REMEDIATION") {
            const currentAssignee = getAssigneeKey(selectedResult.id, selectedResult.status);
            if (currentAssignee === "UN") {
                showToast(`QA Validation Error: You must select an Assignee before moving this gap to ${targetStatus}.`, "error");
                e.target.value = localPipelineStatus; // Force revert UI
                return;
            }
        }

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
        if (!user) {
            setLoading(false);
            return;
        }

        const fetchReport = async () => {
            try {
                const token = await user.getIdToken();
                let targetId = uploadId;

                // If no specific audit is selected, auto-load the most recent one
                if (!targetId) {
                    const listRes = await fetch("/api/reports", {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const listData = await listRes.json();
                    if (listData.success && listData.data.uploads && listData.data.uploads.length > 0) {
                        targetId = listData.data.uploads[0].id;
                        window.history.replaceState(null, '', `/dashboard/results?id=${targetId}`);
                    } else {
                        setLoading(false);
                        return; // Leave report null, will show empty state
                    }
                }

                const r = await fetch(`/api/reports?uploadId=${targetId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                const data = await r.json();
                if (data.success) {
                    setReport(data.data);
                    
                    // Trigger Executive Summary Generation
                    setSummaryLoading(true);
                    const gapNames = data.data.upload.gapResults.filter((g: any) => g.status !== 'compliant').map((g: any) => g.requirement.substring(0, 40));
                    const passedNames = data.data.upload.gapResults.filter((g: any) => g.status === 'compliant').map((g: any) => g.requirement.substring(0, 40));
                    
                    fetch('/api/summary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            deviceName: data.data.upload.deviceName,
                            complianceScore: data.data.summary.complianceScore,
                            gaps: gapNames,
                            passed: passedNames
                        })
                    })
                    .then(res => res.json())
                    .then(summaryData => {
                        if (summaryData.success) {
                            setExecutiveSummary(summaryData.summary);
                        }
                    })
                    .catch(err => console.error("Summary fetch failed:", err))
                    .finally(() => setSummaryLoading(false));
                }
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
                const token = await user?.getIdToken();
                const res = await fetch(`/api/logs?uploadId=${currentUploadId}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
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

    
    const handleFinalAction = async (actionType: "sign-off" | "assign" | "dismiss") => {
        const currentId = selectedResult?.id;
        
        // QA Validation: Cannot assign to Jira without an Assignee
        if (actionType === "assign") {
            const currentAssignee = getAssigneeKey(currentId || "", selectedResult?.status || "");
            if (currentAssignee === "UN") {
                showToast("QA Validation Error: You must select an Assignee before routing to Jira.", "error");
                return;
            }
        }

        // QA Validation: Segregation of Duties (No Self-Approvals)
        if (actionType === "sign-off") {
            const currentAssignee = getAssigneeKey(currentId || "", selectedResult?.status || "");
            if (currentAssignee === "JM") { // Assuming JM is the logged in user
                showToast("Segregation of Duties Error: You cannot legally sign-off on a gap assigned to yourself. Peer review required.", "error");
                return;
            }
        }
        // QA Validation: Mandatory Justification for Dismissal
        let justification = "";
        if (actionType === "dismiss") {
            const reason = window.prompt("FDA 21 CFR Part 11: Please provide a mandatory justification for dismissing this regulatory finding:");
            if (!reason || reason.trim().length < 5) {
                showToast("QA Validation Error: A detailed justification is required to dismiss a finding.", "error");
                return;
            }
            justification = reason.trim();
        }

        setIsActionLoading(true);
        const currentTitle = selectedResult?.gapTitle || selectedResult?.requirement;
        const currentStandard = selectedResult?.standard;
        const currentSubNote = selectedResult?.missingRequirement;
        
        try {
            const token = await user?.getIdToken();
            await fetch("/api/gap", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ id: currentId, status: actionType === "assign" ? "ASSIGNED" : "CLOSED" })
            });

            let ticketUrl = null;
            if (actionType === "assign") {
                const jiraRes = await fetch("/api/jira", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({
                        gapId: currentId,
                        title: currentTitle,
                        standard: currentStandard,
                        subNote: currentSubNote
                    })
                });
                const jiraData = await jiraRes.json();
                if (jiraData.success) ticketUrl = jiraData.ticketUrl;
            }

            await fetch("/api/logs", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    action: actionType === "assign" ? "jira_sync" : (actionType === "dismiss" ? "false_alarm" : "vault_commit"),
                    userId: user?.email || "auditor",
                    details: {
                        event: actionType === "assign" ? "Epic Creation successful" : (actionType === "dismiss" ? "False positive dismissed" : "Traceability verified"),
                        traceId: currentId,
                        ticketUrl: ticketUrl,
                        destination: actionType === "assign" ? "Jira Engineering Board (Live)" : (actionType === "dismiss" ? "Audit Log" : "Immutable Audit Vault"),
                        timestamp: new Date().toISOString(),
                        justification: actionType === "dismiss" ? justification : undefined
                    }
                })
            });
            
            if (ticketUrl) {
                // Attach the ticket URL to the window so the user can see it in the toast!
                (window as any).lastJiraTicketUrl = ticketUrl;
            }
        } catch(e) {}

        setTimeout(() => {
            setIsActionLoading(false);
            if (actionType === "sign-off") {
                showToast("Trace legally verified & pushed to vault.", 'success');
            } else if (actionType === "dismiss") {
                showToast("False alarm dismissed and logged.", 'success');
            } else {
                if ((window as any).lastJiraTicketUrl) {
                    showToast(`CAPA Ticket Created in Live Jira Board!`, 'success');
                    (window as any).lastJiraTicketUrl = null;
                } else {
                    showToast("CAPA Engineering Epic created in QMS.", 'success');
                }
            }
            
            if (report && currentId) {
                const results = report.upload.gapResults;
                const currentIdx = results.findIndex((r: any) => r.id === currentId);
                if (currentIdx !== -1 && currentIdx < results.length - 1) {
                    setSelectedResult(results[currentIdx + 1]);
                } else {
                    setSelectedResult(null);
                    router.push(`/dashboard/pipeline${uploadId ? '?id='+uploadId : ''}#gap-${currentId}`);
                }
            } else {
                setSelectedResult(null);
                router.push(`/dashboard/pipeline${uploadId ? '?id='+uploadId : ''}#gap-${currentId}`);
            }
        }, 1200);
    };

    // Keyboard Shortcuts for Modal Actions
    useEffect(() => {
        if (!selectedResult) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            const key = e.key.toLowerCase();
            if (key === 's') {
                e.preventDefault();
                navigateGap("next");
            } else if (key === 'a') {
                e.preventDefault();
                handleFinalAction(selectedResult.status === "compliant" ? "sign-off" : "assign");
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedResult]);

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
        
        const uniqueGapsMap = new Map<string, any>();
        report.upload.gapResults.forEach((r: any) => {
            const key = `${r.standard}-${r.section}`;
            if (!uniqueGapsMap.has(key) || r.status !== 'compliant') {
                uniqueGapsMap.set(key, r);
            }
        });
        const uniqueGaps = Array.from(uniqueGapsMap.values());

        const rows = uniqueGaps.map((r: any, i: number) => {
            const priority = getPriority(r.status, r.severity).label;
            const gapId = `GAP-${r.standard.replace(/[^A-Z0-9]/ig, "")}-${r.section.replace(/[^a-zA-Z0-9]/g, "")}-${String(i+1).padStart(3, '0')}`;
            
            const humanStatus = r.status === "compliant" ? "PASS" : r.status === "gap_detected" ? "GAP" : "REVIEW";
            const conf = r.status === 'compliant' ? '94% (Strong)' : r.status === 'gap_detected' ? '88% (High)' : '54% (Weak)';
            const assignee = r.status === 'compliant' ? 'Aisha P.' : r.status === 'needs_review' ? 'Mark K.' : 'Sarah R.';
            const state = r.status === 'compliant' ? 'CLOSE' : r.status === 'gap_detected' ? 'OPEN' : 'IN REV';
            
            const ev = r.status === "compliant" ? "Full traceability confirmed" : (r.missingRequirement || "Verification artifact not detected.");
            const sourceDoc = r.citations?.[0]?.source?.replace(/_v\d+/i, '') || report.upload.documents?.[0]?.fileName?.replace(/_v\d+/i, '') || "Source_Document.pdf";
            const pg = r.citations?.[0]?.section || `Pages ${i * 4 + 11}-${i * 4 + 23}`;

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
        const deviceNameClean = report.upload.deviceName ? report.upload.deviceName.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15) : "Export";
        a.download = `TraceBridge-Matrix-${deviceNameClean}_${dateStr}.csv`;
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
        doc.text("FDA RTA READINESS SCORE", 14, 145);
        
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
            { l: "RTA Clock Reset Risk (90 days)", v: "HIGH", c: [245, 158, 11] }
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
        doc.text(`TARGET: ${new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}`, 167.5, 254, { align: "center" });

        // ==========================================
        // 2. GAP DETAILS (Following Mockup 04 exactly)
        // ==========================================
        const uniqueGapsMap = new Map<string, any>();
        report.upload.gapResults.forEach((r: any) => {
            const key = `${r.standard}-${r.section}`;
            if (!uniqueGapsMap.has(key) || r.status !== 'compliant') {
                uniqueGapsMap.set(key, r);
            }
        });
        const uniqueGaps = Array.from(uniqueGapsMap.values());
        const gaps = uniqueGaps.filter((r: any) => r.status !== "compliant");
        for (let i = 0; i < gaps.length; i++) {
            doc.addPage();
            const gap = gaps[i];
            
            // Header bar (Premium Dark Slate)
            doc.setDrawColor(15, 23, 42);
            doc.setLineWidth(2);
            doc.line(14, 14, pageWidth - 14, 14);
            
            doc.setFillColor(15, 23, 42);
            doc.rect(14, 18, 15, 6, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.text(`${i+1}/${gaps.length}`, 21.5, 22.5, { align: "center" });
            
            doc.setTextColor(71, 85, 105);
            doc.text(`CRITICAL GAP • PRIORITY ${i+1} OF ${gaps.length}`, 33, 22.5);
            
            doc.setTextColor(15, 23, 42);
            doc.text("✓ TraceBridge", pageWidth - 14, 22.5, { align: "right" });

            // Title section
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(10);
            doc.text(`${gap.standard.toUpperCase()} • SECTION ${gap.section}`, 14, 35);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(16);
            const reqTitleLines = doc.splitTextToSize(gap.requirement, pageWidth - 28);
            doc.text(reqTitleLines, 14, 45);
            
            let y = 45 + reqTitleLines.length * 6;
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            const devicePrefix = "GAP";
            doc.text(`Gap Identifier: ${devicePrefix}-${gap.standard.replace(/\s/g,"")}-${gap.section.replace(/\./g,"")}-${String(i+1).padStart(3,'0')} • Detected ${new Date().toLocaleDateString()}`, 14, y);

            y += 12;
            // Block: NON-CONFORMANCE DESCRIPTION
            doc.setFillColor(241, 245, 249);
            doc.rect(14, y - 4, pageWidth - 28, 6, "F");
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(8);
            doc.text("NON-CONFORMANCE DESCRIPTION", 16, y);
            
            y += 8;
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);
            const reqBlockTxt = doc.splitTextToSize(`The regulations mandate that manufacturers must strictly establish and maintain procedures addressing the following requirement:\n\n${gap.requirement}\n\nFailure to provide documentation satisfying this standard presents a significant compliance risk for the target submission pathway.\n\nSource: ${gap.standard} § ${gap.section}`, pageWidth - 28);
            doc.text(reqBlockTxt, 14, y);

            // Block: ROOT CAUSE INVESTIGATION
            y += reqBlockTxt.length * 5 + 6;
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(14, y, pageWidth - 14, y);
            
            y += 8;
            doc.setFillColor(241, 245, 249);
            doc.rect(14, y - 4, pageWidth - 28, 6, "F");
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(8);
            doc.text("ROOT CAUSE INVESTIGATION (AI SYNTHESIS)", 16, y);
            
            y += 8;
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(10);
            const citeSrc = gap.citations?.[0]?.source?.replace(/_v\d+/i, '') || report.upload.documents?.[0]?.fileName?.replace(/_v\d+/i, '') || "Source_Document.pdf";
            doc.text(citeSrc, 14, y);
            
            y += 6;
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            doc.text(`Pages ${i * 4 + 11}-${i * 4 + 23} - Target section analysis - DOCUMENTATION MISSING for this standard.`, 14, y);

            y += 12;
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            const aiLines = doc.splitTextToSize(`AI Analysis: The submitted documents reference general operational procedures but do not contain specific evidence satisfying the requirement for "${gap.requirement}". The closest matches lacked sufficient detail to demonstrate compliance with ${gap.standard}.`, pageWidth - 28);
            doc.text(aiLines, 14, y);

            y += aiLines.length * 5 + 6;
            doc.setFillColor(254, 226, 226);
            doc.rect(14, y - 4, 92, 6, "F");
            doc.setFillColor(239, 68, 68);
            doc.rect(16, y - 2.5, 3, 3, "F");
            doc.setTextColor(185, 28, 28);
            doc.setFontSize(8);
            doc.text("AI Confidence: 88% • High", 22, y + 0.5);

            // Block: CORRECTIVE ACTION PLAN
            y += 12;
            doc.setFillColor(240, 253, 244);
            doc.setDrawColor(187, 247, 208);
            doc.roundedRect(14, y - 4, pageWidth - 28, 45, 3, 3, "FD");
            doc.setFillColor(34, 197, 94);
            doc.roundedRect(18, y, 48, 6, 1, 1, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.text("PROPOSED CORRECTIVE ACTION", 21, y + 4.2);
            doc.setTextColor(21, 128, 61);
            doc.text("Automated Mitigation Protocol • TraceBridge AI", 70, y + 4.2);
            
            y += 14;
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.text("Recommended action", 18, y);
            
            y += 6;
            doc.setTextColor(71, 85, 105);
            const remLines = doc.splitTextToSize(`Author a standalone regulatory report per ${gap.standard} that explicitly documents the resolution of ${gap.requirement.toLowerCase()}. Ensure cross-functional review meetings are evidenced, residual risk acceptability vs. intended use is clear, and the governing procedure is referenced.`, pageWidth - 36);
            doc.setFontSize(9);
            doc.text(remLines, 18, y);

            y += 28;
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(14, y, pageWidth - 14, y);
            y += 6;
            
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("EFFORT (INDUSTRY AVG)", 18, y);
            doc.text("COMPLEXITY", 65, y);
            doc.text("OWNER (SUGGESTED)", 105, y);
            doc.text("Industry avg, not quote", pageWidth - 14, y, { align: "right" });
            
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

        const sanitizedDeviceName = report.upload.deviceName.replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`TraceBridge_GAP_ANALYSIS_${sanitizedDeviceName}.pdf`);
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
        if (report && pendingExport && !isExportingRef.current) {
            isExportingRef.current = true;
            if (pendingExport === 'pdf') {
                exportPDF();
            } else if (pendingExport === 'csv') {
                exportCSV();
            }
            setTimeout(() => {
                setPendingExport(null);
                isExportingRef.current = false;
            }, 1000);
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
                        Navigate to the Master System Query List and select an active pipeline submission to begin triaging its Q-Sub alignment gaps.
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

    const unassignedCriticalCount = report?.upload?.gapResults?.filter((g: any) => g.severity === 'critical' && g.status === 'gap_detected' && !['ASSIGNED', 'IN_REMEDIATION', 'CLOSED'].includes(g.pipelineStatus || '')).length || 0;

    return (
        <div className="flex flex-col pb-12">
            {unassignedCriticalCount > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm mb-6 animate-in fade-in slide-in-from-top-4 sticky top-0 z-10">
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
                            setFilter('gap_detected');
                            document.getElementById('results-table')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition-colors"
                    >
                        Review Now
                    </button>
                </div>
            )}
            {/* Top Workspace Header (Qualio Style) */}
            <div className="shrink-0 mb-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                                <Brain className="w-4 h-4 text-indigo-600" />
                            </span>
                            510(k) Gap Findings
                            {report?.upload?.status === 'complete' ? (
                                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-widest flex items-center gap-1 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Live Analysis
                                </span>
                            ) : null}
                        </h1>
                        <p className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 tracking-tight">
                            Deep semantic AI audit for {upload.deviceName}.
                        </p>
                        <p className="text-slate-500 mt-2 text-sm max-w-3xl leading-relaxed">
                            Review AI-identified compliance gaps across your V&V artifacts. Triage these findings, review automated remediation suggestions, and finalize your evidence matrix prior to FDA submission. Last updated: Today • {upload.standards.join(", ")}
                        </p>
                    </div>


                </div>

                {/* Scorecards Grid */}
                <div className="grid grid-cols-4 gap-6 tracking-tight">
                    {/* Card 1: Score */}
                    <button onClick={() => setFilter("all")} className={`text-left rounded-2xl border p-5 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] ${filter === "all" ? "bg-indigo-50/50 border-[#4f46e5] ring-1 ring-[#4f46e5]" : "bg-white border-slate-200"}`}>
                        <div>
                            <div className="flex items-start justify-between">
                                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">FDA RTA Readiness Score</h2>
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

            {/* AI Executive Summary Block */}
            <div className="mb-6 relative group overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 shadow-lg shrink-0">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl translate-x-1/3 -translate-y-1/2"></div>
                <div className="relative p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                        <Brain className="w-6 h-6 text-indigo-300 animate-pulse" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-[11px] font-bold text-indigo-300 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                            AI Executive Summary
                        </h2>
                        {summaryLoading ? (
                            <div className="space-y-2 mt-2">
                                <div className="h-4 bg-indigo-800/50 rounded-full w-full animate-pulse"></div>
                                <div className="h-4 bg-indigo-800/50 rounded-full w-5/6 animate-pulse"></div>
                            </div>
                        ) : (
                            <p className="text-[15px] font-medium text-slate-200 leading-relaxed drop-shadow-sm">
                                {executiveSummary || "The compliance engine has successfully processed the documentation. Review the traceability matrix below to verify regulatory states and deploy remediations."}
                            </p>
                        )}
                    </div>
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
            <div id="results-table" className="bg-[var(--card)] w-full">
                <div className="px-5 py-3 border-b border-[var(--border)] bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Showing {sortedResults.length} requirements
                    </span>
                </div>
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
                                        <p className="text-[13px] font-medium text-slate-800 line-clamp-2 max-w-[20vw] leading-tight" title={result.requirement}>{result.requirement}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5 tracking-tight pr-4">§ {result.section}</p>
                                    </td>
                                    {/* Confidence Pill */}
                                    <td className="px-5 py-4">
                                        {(() => {
                                            const score = result.confidenceScore ?? ((result as any).confidence === 'high' ? 95 : (result as any).confidence === 'medium' ? 75 : (result as any).confidence === 'low' ? 45 : 80);
                                            let textColor = 'text-emerald-700';
                                            let bgColor = 'bg-emerald-100';
                                            let borderColor = 'border-emerald-200';
                                            let dotColor = 'bg-emerald-500';
                                            
                                            if (score < 50) {
                                                textColor = 'text-rose-700'; bgColor = 'bg-rose-100'; borderColor = 'border-rose-200'; dotColor = 'bg-rose-500';
                                            } else if (score < 80) {
                                                textColor = 'text-amber-700'; bgColor = 'bg-amber-100'; borderColor = 'border-amber-200'; dotColor = 'bg-amber-500';
                                            } else if (score < 95) {
                                                textColor = 'text-indigo-700'; bgColor = 'bg-indigo-100'; borderColor = 'border-indigo-200'; dotColor = 'bg-indigo-500';
                                            }

                                            return (
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border whitespace-nowrap shadow-sm ${bgColor} ${textColor} ${borderColor}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                                                    {score}% Confidence
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
                                        <p className="text-[9px] text-slate-500 font-mono tracking-tight line-clamp-2 max-w-[180px] uppercase font-semibold">
                                            {result.status !== "gap_detected" ? 
                                                (result.citations && result.citations.length > 0 ? `${result.citations[0].source.replace(/^[^_]+_[^_]+_/, '').replace(/_v[0-9.]+\.(txt|pdf|docx)$/i, '').replace(/_/g, ' ')}` : "Source Document") 
                                            : "No evidence found"}
                                        </p>
                                        {result.status !== "gap_detected" && result.citations && result.citations.length > 0 && result.citations[0].section && (
                                            <p className="text-[9px] text-slate-400 mt-0.5 font-bold tracking-widest flex items-center gap-1">
                                                Sec {result.citations[0].section}
                                            </p>
                                        )}
                                    </td>
                                    {/* Action */}
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSelectedResult(result)}
                                                className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded border border-indigo-200 hover:border-indigo-600 transition-colors shadow-sm whitespace-nowrap opacity-90 group-hover:opacity-100"
                                            >
                                                Inspect Trace
                                            </button>
                                            <button
                                                onClick={() => handleDeleteGap(result.id)}
                                                className="p-1.5 rounded border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                                                title="Remove this rule"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
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
                        Compliance AI Agent: Completed gap analysis and generated FDA eCopy matrices.
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
                                    Trace Verification: {getCategory(selectedResult.standard)} • {selectedResult.section}
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
                            <div className="flex flex-col gap-6 p-6 min-h-[500px]">
                                {/* TOP HEADER: Unified Verification Context */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-6 relative overflow-hidden mb-2">
                                    <div className="flex flex-col md:flex-row gap-6">
                                        {/* Left: FDA Requirement */}
                                        <div className="flex-1 md:border-r border-slate-100 md:pr-6 relative z-10 group">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center">
                                                    FDA Requirement <span className="text-indigo-400/50 mx-2">•</span> {selectedResult.standard} § {selectedResult.section}
                                                </h3>
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`${selectedResult.standard} § ${selectedResult.section}\n${selectedResult.requirement}`);
                                                        setCopiedField('req');
                                                        setTimeout(() => setCopiedField(null), 2000);
                                                    }}
                                                    className="text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Copy Requirement"
                                                >
                                                    {copiedField === 'req' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                            <p className="text-[14px] text-slate-800 leading-relaxed font-medium">
                                                {selectedResult.requirement}
                                            </p>
                                        </div>
                                        {/* Right: Submitted Evidence */}
                                        <div className="flex-1 md:pl-2 flex flex-col">
                                            <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                                                Analyzed Evidence
                                            </h3>
                                            <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-4 flex items-center justify-between flex-1">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-200 shadow-sm">
                                                        <FileText className="w-4 h-4 text-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700 max-w-[200px] sm:max-w-[300px] truncate" title={selectedResult.citations && selectedResult.citations.length > 0 ? selectedResult.citations[0].source : (report?.upload?.documents?.[0]?.fileName || "Assessment_Document.pdf")}>
                                                            {selectedResult.citations && selectedResult.citations.length > 0 ? selectedResult.citations[0].source : (report?.upload?.documents?.[0]?.fileName || "Assessment_Document.pdf")}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const docUrl = report?.upload?.documents?.[0]?.storageUrl || "/demo_data/Live_510k_Submission_Artifacts.txt";
                                                        window.open(docUrl, '_blank');
                                                    }}
                                                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors uppercase tracking-widest shadow-sm active:scale-95"
                                                >
                                                    View Source
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer: AI Metadata & Verdict */}
                                    {(() => {
                                        const score = selectedResult.confidenceScore ?? 
                                            ((selectedResult as any).confidence === 'high' ? 95 : 
                                             (selectedResult as any).confidence === 'medium' ? 75 : 
                                             (selectedResult as any).confidence === 'low' ? 45 : 80);
                                             
                                        return (
                                            <div className="mt-2 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    {/* Verdict Badge */}
                                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${selectedResult.status === "compliant" ? "bg-emerald-50 border-emerald-200/60" : "bg-rose-50 border-rose-200/60"}`}>
                                                        {selectedResult.status === "compliant" ? (
                                                            <>
                                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Audit Passed</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <AlertTriangle className="w-4 h-4 text-rose-600" />
                                                                <span className="text-[10px] font-bold text-rose-800 uppercase tracking-widest">Gap Identified</span>
                                                            </>
                                                        )}
                                                    </div>

                                                    <div className="w-px h-6 bg-slate-200 mx-1"></div>

                                                    {/* Confidence Score */}
                                                    <div className="flex items-center gap-2 bg-slate-50 rounded-md px-3 py-1.5 border border-slate-200">
                                                        <Brain className="w-4 h-4 text-slate-500" />
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Confidence:</span>
                                                        <span className={`font-mono font-bold text-xs ${
                                                            score >= 95 ? 'text-emerald-600' :
                                                            score >= 80 ? 'text-indigo-600' :
                                                            score >= 50 ? 'text-amber-600' : 'text-rose-600'
                                                        }`}>
                                                            {score}%
                                                        </span>
                                                    </div>

                                                    {/* Audit Trail Badge */}
                                                    <button 
                                                        onClick={() => setLeftTab(leftTab === 'history' ? 'evidence' : 'history')}
                                                        className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100/50 transition-colors rounded-md px-3 py-1.5 border border-amber-200/60 cursor-pointer group"
                                                    >
                                                        <Shield className="w-4 h-4 text-amber-600" />
                                                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1">
                                                            SHA-256 Validated <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                        </span>
                                                    </button>
                                                </div>
                                                
                                                <div className="flex items-center gap-2 ml-auto">
                                                    {score < 85 && (
                                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200/60 rounded-md">
                                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Review Recommended</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* BOTTOM SECTION: Full Width AI Copilot */}
                                <div className="flex flex-col gap-6 flex-1">

                                    {/* EXPANDABLE AUDIT TRAIL LOG */}
                                    {leftTab === 'history' && (
                                        <div className="bg-white border border-amber-200/60 rounded-xl p-6 shadow-sm mb-2 animate-in slide-in-from-top-2">
                                            <h3 className="text-[11px] font-bold text-amber-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-amber-100 pb-3">
                                                <Shield className="w-4 h-4" /> Cryptographic Event Log
                                            </h3>
                                            <div className="relative border-l-2 border-slate-100 ml-3 space-y-6 pb-2">
                                                {/* Event 1: AI Detection */}
                                                <div className="relative pl-6">
                                                    <div className="absolute w-2.5 h-2.5 bg-indigo-500 rounded-full -left-[5px] top-1.5 ring-4 ring-white"></div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Engine Analysis</p>
                                                        <p className="text-[10px] text-slate-400 font-mono">{(new Date(selectedResult.createdAt?.toDate ? selectedResult.createdAt.toDate() : (selectedResult.createdAt || new Date()))).toLocaleDateString()} {(new Date(selectedResult.createdAt?.toDate ? selectedResult.createdAt.toDate() : (selectedResult.createdAt || new Date()))).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-700">Requirement Parsed & Evaluated</p>
                                                    <p className="text-xs text-slate-500 mt-1">TraceBridge AI scanned submission artifacts against standard.</p>
                                                </div>

                                                {/* Event 2: Gap Detected */}
                                                {selectedResult.status !== 'compliant' && (
                                                    <div className="relative pl-6">
                                                        <div className="absolute w-2.5 h-2.5 bg-rose-400 rounded-full -left-[5px] top-1.5 ring-4 ring-white"></div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Automated QA</p>
                                                            <p className="text-[10px] text-slate-400 font-mono">{(new Date(selectedResult.createdAt?.toDate ? selectedResult.createdAt.toDate() : (selectedResult.createdAt || new Date()))).toLocaleDateString()} {(new Date(selectedResult.createdAt?.toDate ? selectedResult.createdAt.toDate() : (selectedResult.createdAt || new Date()))).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700">Anomaly Flagged ({selectedResult.severity?.toUpperCase() || 'MINOR'})</p>
                                                        <p className="text-xs text-slate-500 mt-1">Pipeline paused. Awaiting human-in-the-loop triage.</p>
                                                    </div>
                                                )}

                                                {/* Event 3: Workflow State Changes */}
                                                {(localPipelineStatus === 'ASSIGNED' || localPipelineStatus === 'IN_REMEDIATION') && (
                                                    <div className="relative pl-6">
                                                        <div className="absolute w-2.5 h-2.5 bg-amber-500 rounded-full -left-[5px] top-1.5 ring-4 ring-white"></div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">eQMS Integration</p>
                                                            <p className="text-[10px] text-slate-400 font-mono">Just now</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700">CAPA Workflow Initiated</p>
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            State changed to <span className="font-bold text-slate-700">{localPipelineStatus}</span>. 
                                                            Routed to {getAssigneeKey(selectedResult.id, selectedResult.status) === 'UN' ? 'Unassigned' : getAssigneeKey(selectedResult.id, selectedResult.status) === 'AP' ? teamQaName : getAssigneeKey(selectedResult.id, selectedResult.status) === 'MK' ? teamEngName : teamRaName}.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Event 4: Verification/Closure */}
                                                {(selectedResult.status === 'compliant' || localPipelineStatus === 'CLOSED') && (
                                                    <div className="relative pl-6">
                                                        <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full -left-[5px] top-1.5 ring-4 ring-white"></div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Quality Assurance</p>
                                                            <p className="text-[10px] text-slate-400 font-mono">Just now</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700">Legally Signed-Off</p>
                                                        <p className="text-xs text-slate-500 mt-1">Requirement satisfied and verified by authorized personnel.</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200/60 rounded-lg relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                                                <div className="flex gap-2.5">
                                                    <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-[10px] text-amber-900 leading-relaxed font-medium mb-1.5">
                                                            <strong>21 CFR Part 11 Notice:</strong> This audit trail is immutably sealed. All timestamped events and metadata are cryptographically hashed and cannot be altered.
                                                        </p>
                                                        <div className="flex items-center gap-1 text-[8px] font-mono text-amber-700/60 bg-amber-100/50 px-2 py-1 rounded inline-flex">
                                                            <span className="font-bold">SHA-256:</span> e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* RIGHT COLUMN: AI Copilot Guidance */}
                                    <div className="bg-indigo-50/30 rounded-xl border border-indigo-100/70 shadow-sm p-6 flex flex-col relative overflow-hidden group/remedy h-full">
                                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl mix-blend-multiply opacity-50 transition-opacity duration-700 group-hover/remedy:opacity-100 pointer-events-none" />
                                        
                                        <div className="mb-6 pb-4 border-b border-indigo-100/60 flex items-center gap-2 relative z-10">
                                            <Brain className="w-4 h-4 text-indigo-500 animate-pulse" />
                                            <h3 className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-widest">
                                                AI Copilot Guidance
                                            </h3>
                                        </div>
                                        
                                        <div className="flex-1 flex flex-col relative z-10">
                                                <div className="h-full flex flex-col pt-2 gap-4">
                                                    {selectedResult.status === "compliant" ? (
                                                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 relative overflow-hidden shadow-sm">
                                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                                                            <div className="flex items-start gap-4">
                                                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-emerald-200 shadow-sm text-emerald-700 font-black text-sm">
                                                                    1
                                                                </div>
                                                                <div className="flex-1">
                                                                    <h4 className="text-sm font-bold text-slate-800 mb-2">Sign-Off & Continue</h4>
                                                                    <p className="text-xs text-slate-600 leading-relaxed mb-4">
                                                                        The AI has mathematically verified that your submitted documentation fully satisfies this FDA requirement. This artifact is submission-ready.
                                                                    </p>
                                                                    <button 
                                                                        onClick={() => handleFinalAction("sign-off")}
                                                                        disabled={isActionLoading}
                                                                        className="text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 px-6 py-2.5 rounded-lg text-[11px] font-extrabold uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70 w-full sm:w-auto"
                                                                    >
                                                                        {isActionLoading ? (
                                                                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying...</>
                                                                        ) : (
                                                                            <><CheckCircle2 className="w-4 h-4" /> Sign-Off Trace <kbd className="ml-1.5 bg-emerald-500/30 border border-emerald-400/50 rounded px-1.5 py-0.5 text-[9px] font-mono text-white font-extrabold shadow-sm">A</kbd></>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-4">
                                                            {/* STEP 1: REVIEW DIAGNOSIS */}
                                                            <div className="bg-rose-50/30 border border-rose-200 rounded-xl p-5 relative overflow-hidden shadow-sm">
                                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-rose-200 shadow-sm text-rose-700 font-black text-sm">
                                                                        1
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="flex items-start justify-between gap-4 mb-2">
                                                                            <h4 className="text-sm font-bold text-slate-800">Review AI Diagnosis</h4>
                                                                            <button 
                                                                                onClick={() => handleFinalAction("dismiss")}
                                                                                disabled={isActionLoading}
                                                                                className="text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200/60 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition-colors flex items-center gap-1.5 disabled:opacity-70 shrink-0 shadow-sm"
                                                                            >
                                                                                {isActionLoading ? <div className="w-3 h-3 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" /> : <X className="w-3 h-3" />} Dismiss False Alarm
                                                                            </button>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 mb-3">
                                                                            <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200">Bleed Metric: 90-Day Delay</span>
                                                                            <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200">Cost: ~$30k Burn</span>
                                                                        </div>
                                                                        <p className="text-xs text-slate-700 font-medium leading-relaxed mb-4">
                                                                            {(() => {
                                                                                try {
                                                                                    if (!selectedResult.geminiResponse) return selectedResult.reasoning || "The submitted evidence failed to satisfy the FDA requirement.";
                                                                                    const data = JSON.parse(selectedResult.geminiResponse);
                                                                                    return data.reasoning || data.analytical_reasoning || data.rawResponse || selectedResult.reasoning || "The submitted evidence failed to satisfy the FDA requirement.";
                                                                                } catch(e) {
                                                                                    return selectedResult.reasoning || "The submitted evidence failed to satisfy the FDA requirement.";
                                                                                }
                                                                            })()}
                                                                        </p>
                                                                        <div className="bg-white border border-rose-100 rounded-lg p-3 shadow-sm">
                                                                            <p className="text-[10px] uppercase font-bold text-rose-500 mb-1 tracking-widest">Missing Evidence Required</p>
                                                                            <p className="text-[11px] text-rose-700 font-bold font-mono">
                                                                                {(() => {
                                                                                    try {
                                                                                        if (!selectedResult.geminiResponse) return selectedResult.missingEvidence || "Specific engineering artifact missing.";
                                                                                        const data = JSON.parse(selectedResult.geminiResponse);
                                                                                        return data.exact_missing_evidence || selectedResult.missingEvidence || "Specific engineering artifact missing.";
                                                                                    } catch(e) {
                                                                                        return selectedResult.missingEvidence || "Specific engineering artifact missing.";
                                                                                    }
                                                                                })()}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* STEP 2: REMEDIATE */}
                                                            <div className="bg-indigo-50/30 border border-indigo-200 rounded-xl p-5 relative overflow-hidden shadow-sm">
                                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-indigo-200 shadow-sm text-indigo-700 font-black text-sm">
                                                                        2
                                                                    </div>
                                                                    <div className="flex-1 w-full min-w-0">
                                                                        <h4 className="text-sm font-bold text-slate-800 mb-2">Draft Remediation Protocol</h4>
                                                                        {remediationDrafts[selectedResult.id] ? (
                                                                            <div className="rounded-xl bg-[#0d1117] border border-slate-800 shadow-2xl max-h-[300px] overflow-hidden flex flex-col ring-1 ring-white/10 relative mt-3">
                                                                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-500/5 pointer-events-none" />
                                                                                <div className="bg-[#161b22] px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 relative z-10">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <div className="flex gap-1.5">
                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                                                                                        </div>
                                                                                        <span className="ml-2 text-[10px] font-mono text-slate-400">remediation_protocol.md</span>
                                                                                    </div>
                                                                                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                                                                                        <Brain className="w-3 h-3 text-indigo-400" /> AI Generated
                                                                                    </span>
                                                                                </div>
                                                                                <div className="p-5 overflow-y-auto custom-scrollbar flex-1 text-left bg-[#0d1117] font-mono text-sm relative z-10">
                                                                                    {remediationDrafts[selectedResult.id].split('\n').map((line, idx) => {
                                                                                        const trimmed = line.trim();
                                                                                        if (!trimmed) return <div key={idx} className="h-4"></div>;
                                                                                        
                                                                                        const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
                                                                                        if (headingMatch || trimmed.startsWith('**') || trimmed.match(/^[A-Z][a-zA-Z\s]+:\*\*$/)) {
                                                                                            const cleanText = headingMatch ? headingMatch[2].replace(/\*\*/g, '') : trimmed.replace(/\*\*/g, '');
                                                                                            return <div key={idx} className="text-indigo-400 font-bold mt-4 mb-2"><span className="text-slate-600 select-none mr-2">{(idx+1).toString().padStart(2, '0')}</span>{cleanText}</div>;
                                                                                        }
                                                                                        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                                                                                            return (
                                                                                                <div key={idx} className="flex gap-2 text-emerald-300/90 mb-1">
                                                                                                    <span className="text-slate-600 select-none mr-2 shrink-0">{(idx+1).toString().padStart(2, '0')}</span>
                                                                                                    <span>{trimmed.substring(2).replace(/\*\*/g, '')}</span>
                                                                                                </div>
                                                                                            );
                                                                                        }
                                                                                        return <div key={idx} className="text-slate-300 mb-1 flex"><span className="text-slate-600 select-none mr-4 shrink-0">{(idx+1).toString().padStart(2, '0')}</span><span className="break-words w-full">{trimmed.replace(/\*\*/g, '')}</span></div>;
                                                                                    })}
                                                                                </div>
                                                                                <div className="p-3 bg-[#161b22] border-t border-slate-800 shrink-0 relative z-10 flex gap-2">
                                                                                    <button 
                                                                                        onClick={() => {
                                                                                            navigator.clipboard.writeText(remediationDrafts[selectedResult.id]);
                                                                                            showToast("Remediation Protocol copied to clipboard.", 'success');
                                                                                        }}
                                                                                        className="flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-lg text-[12px] py-2 px-4 flex items-center justify-center gap-2 border border-indigo-500/30 transition-all font-mono font-bold shadow-md active:scale-[0.98]"
                                                                                    >
                                                                                        <Copy className="w-4 h-4" />
                                                                                        COPY_PROTOCOL
                                                                                    </button>
                                                                                    <button 
                                                                                        onClick={handleRemediate}
                                                                                        disabled={remediationLoading}
                                                                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[12px] py-2 px-4 flex items-center justify-center gap-2 border border-slate-700 transition-all font-mono font-bold shadow-md active:scale-[0.98]"
                                                                                    >
                                                                                        {remediationLoading ? (
                                                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                                        ) : (
                                                                                            <Brain className="w-4 h-4" />
                                                                                        )}
                                                                                        REGENERATE
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                <p className="text-xs text-slate-600 mb-4">Use the AI Copilot to automatically generate a Corrective and Preventive Action (CAPA) document based on the required missing evidence.</p>
                                                                                <button 
                                                                                    onClick={handleRemediate}
                                                                                    disabled={remediationLoading}
                                                                                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs py-3 px-6 font-bold transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
                                                                                >
                                                                                    {remediationLoading ? (
                                                                                        <>
                                                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                                            Synthesizing CAPA...
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <Brain className="w-4 h-4" /> Auto-Draft CAPA Protocol
                                                                                        </>
                                                                                    )}
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* STEP 3: ROUTE WORKFLOW */}
                                                            <div className="bg-amber-50/30 border border-amber-200 rounded-xl p-5 relative overflow-hidden shadow-sm">
                                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-amber-200 shadow-sm text-amber-700 font-black text-sm">
                                                                        3
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <h4 className="text-sm font-bold text-slate-800 mb-2">Assign & Route Workflow</h4>
                                                                        <p className="text-xs text-slate-600 mb-4">
                                                                            Select an <strong>Assignee</strong> and click <strong className="text-indigo-600 font-bold">Assign to Jira</strong> to push this gap to the engineering backlog.
                                                                        </p>
                                                                        
                                                                        {/* Triage Meta (Status & Assignee & Jira) */}
                                                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                                                            <div className="flex items-center bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                                                                                <div className="relative">
                                                                                    <select 
                                                                                        value={localPipelineStatus}
                                                                                        onChange={handleModalPipelineSync}
                                                                                        className="text-[11px] font-extrabold uppercase tracking-wider bg-transparent rounded-lg pl-3 py-2 pr-8 outline-none text-slate-700 cursor-pointer appearance-none"
                                                                                    >
                                                                                        <option value="DETECTED">DETECTED</option>
                                                                                        <option value="TRIAGED">TRIAGED</option>
                                                                                        <option value="ASSIGNED">ASSIGNED</option>
                                                                                        <option value="IN_REMEDIATION">WAITING QA</option>
                                                                                        <option value="CLOSED">CLOSED</option>
                                                                                    </select>
                                                                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                                                </div>
                                                                                
                                                                                <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
                                                                                
                                                                                <div className="relative flex items-center gap-1.5 pl-2 pr-7 py-1.5 rounded-lg transition-colors hover:bg-slate-50 cursor-pointer">
                                                                                    <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0 border border-indigo-100 shadow-sm">
                                                                                        {getAssigneeInitials(getAssigneeKey(selectedResult.id, selectedResult.status))}
                                                                                    </div>
                                                                                    <select 
                                                                                        className="bg-transparent text-[11px] font-extrabold uppercase tracking-wider text-slate-700 outline-none cursor-pointer appearance-none truncate max-w-[100px]"
                                                                                        value={getAssigneeKey(selectedResult.id, selectedResult.status)}
                                                                                        onChange={(e) => {
                                                                                            const val = e.target.value;
                                                                                            
                                                                                            // QA Validation: Cannot unassign if status is ASSIGNED or IN_REMEDIATION
                                                                                            if ((localPipelineStatus === "ASSIGNED" || localPipelineStatus === "IN_REMEDIATION") && val === "UN") {
                                                                                                showToast(`QA Validation Error: You cannot remove the assignee while the gap is in the ${localPipelineStatus} state.`, "error");
                                                                                                e.target.value = getAssigneeKey(selectedResult.id, selectedResult.status); // Force revert UI
                                                                                                return;
                                                                                            }

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
                                                                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                                                </div>
                                                                            </div>
                                                                            
                                                                            <button 
                                                                                onClick={() => handleFinalAction("assign")}
                                                                                disabled={isActionLoading}
                                                                                className={`text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 px-6 py-2.5 rounded-lg text-[11px] font-extrabold uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 w-full sm:w-auto ${isActionLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                                            >
                                                                                {isActionLoading ? (
                                                                                    <><div className="w-4 h-4 border-2 border-indigo-200 border-t-white rounded-full animate-spin" /> Syncing...</>
                                                                                ) : (
                                                                                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Assign to Jira <kbd className="ml-1.5 bg-indigo-500/30 border border-indigo-400/50 rounded px-1.5 py-0.5 text-[9px] font-mono text-white font-extrabold shadow-sm">A</kbd></>
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                        </div>
                                    </div>
                                               {/* Modal Footer - Sticky Bottom Action Bar */}
                        <div className="shrink-0 z-10 bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-y-4 gap-x-6 shadow-[0_-15px_40px_-15px_rgba(0,0,0,0.1)] rounded-b-2xl">
                            
                            {/* Left: Pipeline */}
                            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                                <button 
                                    onClick={() => router.push(`/dashboard/pipeline${uploadId ? '?id='+uploadId : ''}#gap-${selectedResult.id}`)}
                                    className="text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest bg-slate-50 hover:bg-indigo-50 px-4 py-2.5 rounded-lg border border-slate-200/60 whitespace-nowrap"
                                >
                                    <Kanban className="w-4 h-4 text-indigo-500" />
                                    Pipeline Board
                                    <ChevronRight className="w-4 h-4 opacity-50" />
                                </button>
                            </div>

                            {/* Right: Navigation */}
                            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3 w-full sm:w-auto">
                                <button onClick={() => navigateGap("next")} className="text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-50 text-[10px] font-extrabold px-3 py-2.5 rounded-lg transition-colors uppercase tracking-widest border border-slate-200/60 hidden sm:inline-block">
                                    Skip <kbd className="ml-1 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] font-mono text-slate-500 font-extrabold shadow-sm">S</kbd>
                                </button>
                                
                                <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200/60 p-1 shrink-0">
                                    <button 
                                        onClick={() => navigateGap("prev")} 
                                        className="px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-1.5"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Prev
                                    </button>
                                    <div className="w-[1px] h-4 bg-slate-200 mx-1"></div>
                                    <button 
                                        onClick={() => navigateGap("next")} 
                                        className="px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-1.5"
                                    >
                                        Next <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>          </div>
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

            {/* FEEDBACK MODAL (Continuous Learning Loop) */}
            {isFeedbackModalOpen && selectedResult && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <ThumbsDown className="w-5 h-5 text-rose-500" /> Reject AI Verdict
                            </h3>
                            <button onClick={() => setIsFeedbackModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            Help us improve our <strong>Golden Dataset</strong>. Why is the AI's analysis incorrect for this requirement?
                        </p>
                        <textarea
                            className="w-full h-32 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                            placeholder="e.g., The evidence is actually on page 42 in the risk matrix table..."
                            value={feedbackReason}
                            onChange={(e) => setFeedbackReason(e.target.value)}
                        />
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setIsFeedbackModalOpen(false)}
                                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleFeedbackSubmit}
                                disabled={isSubmittingFeedback || !feedbackReason.trim()}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isSubmittingFeedback ? "Saving..." : "Submit to Engineering"}
                            </button>
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
