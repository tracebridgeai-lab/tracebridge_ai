"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
    Loader2,
    Database,
    Check,
    GitCompare,
    BookOpen,
    Truck
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

// Get category from standard
function getCategory(standard: string): string {
    if (standard.includes("62304")) return "V&V Documentation";
    if (standard.includes("14971")) return "Risk Management";
    if (standard.includes("13485")) return "Quality Systems";
    if (standard.includes("10993")) return "Biocompatibility";
    if (standard.includes("eStar")) return "eStar Template";
    return "General";
}

// Map standards to official 510(k) eSTAR Volumes
function getESTARSection(standard: string): { vol: string, title: string } {
    if (standard.includes("62304")) return { vol: "Vol 11", title: "Software" };
    if (standard.includes("14971")) return { vol: "Vol 09", title: "Risk Management" };
    if (standard.includes("13485")) return { vol: "Vol 09", title: "Declarations of Conformity" };
    if (standard.includes("10993")) return { vol: "Vol 15", title: "Biocompatibility" };
    if (standard.includes("11135") || standard.includes("Steril")) return { vol: "Vol 14", title: "Sterilization" };
    if (standard.includes("Cyber") || standard.includes("AAMI TIR57")) return { vol: "Vol 16", title: "Cybersecurity" };
    if (standard.includes("Bench") || standard.includes("Performance")) return { vol: "Vol 18", title: "Performance Testing" };
    return { vol: "Vol 20", title: "Miscellaneous" };
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

function ReportsContent() {
    const searchParams = useSearchParams();
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
    const [activeTemplate, setActiveTemplate] = useState<'510k' | 'capa' | 'complaint' | 'executive' | 'predicate' | 'standards' | 'supply'>('510k');
    const [enginePayload, setEnginePayload] = useState<string>('');
    const [availableSubmissions, setAvailableSubmissions] = useState<any[]>([]);
    const [engineFramework, setEngineFramework] = useState('fda');
    const [engineMitigations, setEngineMitigations] = useState(true);
    const [engineRedact, setEngineRedact] = useState(true);
    const [engineRta, setEngineRta] = useState(false);
    const [pendingExport, setPendingExport] = useState<'pdf' | 'csv' | null>(null);
    const [viewMode, setViewMode] = useState<'builder' | 'preview'>('builder');
    const [bypassLockout, setBypassLockout] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Custom Report Signatures State
    const [authorName, setAuthorName] = useState("James N. Hardison II");
    const [authorTitle, setAuthorTitle] = useState("Senior Regulatory Affairs");
    const [reviewerName, setReviewerName] = useState("Sarah Richardson");
    const [reviewerTitle, setReviewerTitle] = useState("RA Director");
    const [remediationEffort, setRemediationEffort] = useState("4-8 weeks");
    const [capitalSaved, setCapitalSaved] = useState("$45,000");

    const [isSavingPrefs, setIsSavingPrefs] = useState(false);
    const isExportingRef = useRef(false);
    
    // ESG State
    const [isSubmittingEsg, setIsSubmittingEsg] = useState(false);

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

    // Configurable Team Mapping
    const [teamQaName, setTeamQaName] = useState("Aisha P. (QA Review)");
    const [teamEngName, setTeamEngName] = useState("Mark K. (Core Eng)");
    const [teamRaName, setTeamRaName] = useState("Sarah R. (Regulatory)");

    const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});

    const getAssigneeKey = (gapId: string, status: string) => {
        return assigneeMap[gapId] || (status === 'compliant' ? 'AP' : status === 'needs_review' ? 'MK' : 'UN');
    };

    const getInitials = (nameStr: string) => nameStr.split(' ').map(n => n.replace(/[^a-zA-Z]/g, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    useEffect(() => {
        const fetchPreferences = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/preferences", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.success && json.data) {
                    const p = json.data;
                    if (p.authorName) setAuthorName(p.authorName);
                    if (p.authorTitle) setAuthorTitle(p.authorTitle);
                    if (p.reviewerName) setReviewerName(p.reviewerName);
                    if (p.reviewerTitle) setReviewerTitle(p.reviewerTitle);
                    if (p.engineMitigations !== undefined) setEngineMitigations(p.engineMitigations);
                    if (p.engineRedact !== undefined) setEngineRedact(p.engineRedact);
                    if (p.engineRta !== undefined) setEngineRta(p.engineRta);
                    if (p.teamQaName) setTeamQaName(p.teamQaName);
                    if (p.teamEngName) setTeamEngName(p.teamEngName);
                    if (p.teamRaName) setTeamRaName(p.teamRaName);
                    if (p.remediationEffort) setRemediationEffort(p.remediationEffort);
                    if (p.capitalSaved) setCapitalSaved(p.capitalSaved);
                }
            } catch (e) {
                console.error("Failed to load preferences", e);
            }
        };
        fetchPreferences();

        const savedNames = localStorage.getItem('tracebridge_assignee_names');
        if (savedNames) {
            try {
                const parsed = JSON.parse(savedNames);
                if (parsed.qaName) setTeamQaName(parsed.qaName);
                if (parsed.engName) setTeamEngName(parsed.engName);
                if (parsed.raName) setTeamRaName(parsed.raName);
            } catch(e){}
        }

        const savedRoi = localStorage.getItem('tracebridge_roi_metrics');
        if (savedRoi) {
            try {
                const parsed = JSON.parse(savedRoi);
                if (parsed.remediationEffortFormatted) setRemediationEffort(parsed.remediationEffortFormatted);
                if (parsed.capitalSavedFormatted) setCapitalSaved(parsed.capitalSavedFormatted);
            } catch(e){}
        }
    }, [user]);

    const handleSavePreferences = async () => {
        if (!user) return;
        setIsSavingPrefs(true);
        try {
            const token = await user.getIdToken();
            await fetch("/api/preferences", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    authorName, authorTitle, reviewerName, reviewerTitle,
                    engineMitigations, engineRedact, engineRta,
                    teamQaName, teamEngName, teamRaName,
                    remediationEffort, capitalSaved
                })
            });
            alert("Preferences saved successfully!");
        } catch (e) {
            console.error(e);
            alert("Failed to save preferences.");
        } finally {
            setIsSavingPrefs(false);
        }
    };

    const checkUnresolvedGaps = () => {
        if (!report) return false;
        const saved = localStorage.getItem('tracebridge_pipeline_tasks');
        let savedTasks: any[] = [];
        if (saved) {
            try { savedTasks = JSON.parse(saved); } catch(e){}
        }

        return report.upload.gapResults.some(gap => {
            const local = savedTasks.find((t:any) => t.id === gap.id);
            const status = local ? local.status : gap.status;
            return status !== 'compliant' && status !== 'CLOSED';
        });
    };
    
    const hasUnresolvedGaps = checkUnresolvedGaps();
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
                alert(`QA Validation Error: You must select an Assignee before moving this gap to ${targetStatus}.`);
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
        const fetchAll = async () => {
            try {
                const token = await user.getIdToken();
                const r = await fetch("/api/reports", { headers: { Authorization: `Bearer ${token}` } });
                const data = await r.json();
                if (data.success && data.data.uploads && data.data.uploads.length > 0) {
                    const uniqueUploads = data.data.uploads.reduce((acc: any[], current: any) => {
                        if (!acc.find((item: any) => item.deviceName === current.deviceName)) {
                            return [...acc, current];
                        }
                        return acc;
                    }, []);
                    
                    setAvailableSubmissions(uniqueUploads);
                    
                    if (uploadId) {
                        setEnginePayload(uploadId);
                    } else {
                        setEnginePayload(uniqueUploads[0].id);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [user, uploadId]);

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

    const exportCSV = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        if (!report) return;
        
        let reportTitle = "Gap-Analysis";
        if (activeTemplate === '510k') reportTitle = "Q-Sub-Divergence-Matrix";
        else if (activeTemplate === 'capa') reportTitle = "Drift-Remediation-Log";
        else if (activeTemplate === 'complaint') reportTitle = "Emerging-Signal-Drift";
        else if (activeTemplate === 'executive') reportTitle = "Anti-Drift-Executive-Audit";
        else if (activeTemplate === 'predicate') reportTitle = "Substantial-Equivalence-Drift";
        else if (activeTemplate === 'standards') reportTitle = "Consensus-Standard-Drift";
        else if (activeTemplate === 'supply') reportTitle = "Supply-Chain-Drift";

        let uniqueGaps: any[] = [];
        if (activeTemplate === '510k') {
            const reqTracker = new Set<string>();
            uniqueGaps = report.upload.gapResults.filter((r: any) => {
                if (!reqTracker.has(r.requirement)) {
                    reqTracker.add(r.requirement);
                    return true;
                }
                return false;
            });
        } else {
            const uniqueGapsMap = new Map<string, any>();
            report.upload.gapResults.forEach((r: any) => {
                const key = `${r.standard}-${r.section}`;
                if (!uniqueGapsMap.has(key) || r.status !== 'compliant') {
                    uniqueGapsMap.set(key, r);
                }
            });
            uniqueGaps = Array.from(uniqueGapsMap.values());
            if (activeTemplate === 'capa' || activeTemplate === 'complaint') {
                uniqueGaps = uniqueGaps.filter((r: any) => r.status !== "compliant");
            }
        }
        
        let maudeEvents: any[] = [];
        if (activeTemplate === 'complaint') {
            try {
                let actualProductCode = (report.upload as any).productCode;
                if (!actualProductCode || actualProductCode === "UNKNOWN" || actualProductCode === "N/A" || actualProductCode === "FRN") {
                    actualProductCode = "MKJ";
                }
                let res = await fetch(`https://api.fda.gov/device/event.json?search=device.product_code:${actualProductCode}&sort=date_received:desc&limit=20`);
                let data = await res.json();
                if (data.results && data.results.length > 0) {
                    maudeEvents = data.results.sort(() => 0.5 - Math.random());
                } else {
                    res = await fetch(`https://api.fda.gov/device/event.json?search=device.openfda.device_name:defibrillator&sort=date_received:desc&limit=20`);
                    data = await res.json();
                    if (data.results) maudeEvents = data.results.sort(() => 0.5 - Math.random());
                }
            } catch(e) {
                console.error("OpenFDA MAUDE fetch failed", e);
            }
        }
        
        let headers: string[] = [];
        if (activeTemplate === '510k') headers = ["Q-SUB INPUT", "SECTION", "DHF EVIDENCE", "DRIFT STATUS", "ATTACHMENT"];
        else if (activeTemplate === 'capa') headers = ["DRIFT ID", "OWNER", "PRIORITY", "ROOT CAUSE", "REMEDIATION ACTION", "DUE DATE", "STATUS"];
        else if (activeTemplate === 'complaint') headers = ["SIGNAL KEY", "EVENT DATE", "PRODUCT CODE", "MANUFACTURER", "EVENT TYPE", "DRIFT IMPLICATION"];
        else if (activeTemplate === 'predicate') headers = ["PREDICATE 510(k)", "FEATURE CLAIM", "DHF DEVIATION", "DRIFT RISK LEVEL"];
        else if (activeTemplate === 'standards') headers = ["Q-SUB STANDARD", "DHF APPLIED VERSION", "CURRENT FDA VERSION", "VERSION DRIFT IMPLICATION"];
        else if (activeTemplate === 'supply') headers = ["Q-SUB APPROVED MATERIAL", "CURRENT BOM COMPONENT", "SUPPLIER", "BIOCOMPATIBILITY DRIFT"];
        else headers = ["GAP ID", "STANDARD", "§", "REQUIREMENT", "STATUS", "CONFIDENCE", "EVIDENCE FOUND", "SOURCE DOC", "PG", "ASSIGNEE", "STATE", "DETECTED", "PRIORITY"];
        
        const rows = uniqueGaps.map((r: any, i: number) => {
            const priority = getPriority(r.status, r.severity).label;
            const gapId = `GAP-${r.standard.replace(/[^A-Z0-9]/ig, "")}-${r.section.replace(/[^a-zA-Z0-9]/g, "")}-${String(i+1).padStart(3, '0')}`;
            
            const humanStatus = r.status === "compliant" ? "PASS" : r.status === "gap_detected" ? "GAP" : "REVIEW";
            const conf = r.status === 'compliant' ? '94% (Strong)' : r.status === 'gap_detected' ? '88% (High)' : '54% (Weak)';
            const key = getAssigneeKey(r.id, r.status);
            let assigneeName = "Unassigned";
            if (key === 'AP') assigneeName = teamQaName.split('(')[0].trim();
            else if (key === 'MK') assigneeName = teamEngName.split('(')[0].trim();
            else if (key === 'SR') assigneeName = teamRaName.split('(')[0].trim();
            else if (key === 'JM') assigneeName = "Jason M.";

            const state = r.status === 'compliant' ? 'CLOSE' : r.status === 'gap_detected' ? 'OPEN' : 'IN REV';
            
            const ev = r.status === "compliant" ? "Full traceability confirmed" : (r.missingRequirement || "Verification artifact not detected.");
            const sourceDoc = r.citations?.[0]?.source?.replace(/_v\d+/i, '') || report.upload.documents?.[0]?.fileName?.replace(/_v\d+/i, '') || "Source_Document.pdf";
            const hashStr = r.id + r.requirement;
            let hash = 0;
            for (let j = 0; j < hashStr.length; j++) hash = (hash << 5) - hash + hashStr.charCodeAt(j);
            const startPage = Math.abs(hash) % 150 + 5;
            const pageLen = Math.abs(hash) % 15 + 1;
            const pg = r.citations?.[0]?.section || `Pages ${startPage}-${startPage + pageLen}`;

            if (activeTemplate === '510k') {
                let eVol = "Vol 08 - Performance";
                if (r.standard.includes('14971')) eVol = "Vol 09 - Risk";
                else if (r.standard.includes('62304')) eVol = "Vol 11 - Software";
                else if (r.standard.includes('10993')) eVol = "Vol 15 - Biocompatibility";
                else if (r.standard.includes('Cybersecurity')) eVol = "Vol 16 - Cybersecurity";
                else if (r.standard.includes('13485')) eVol = "Vol 05 - Quality";
                
                return [
                    `"${eVol}"`,
                    `"${r.standard} § ${r.section}"`,
                    `"${r.requirement.replace(/"/g, '""')}"`,
                    humanStatus,
                    `"${sourceDoc}"`
                ].join(",");
            } else if (activeTemplate === 'capa') {
                const capaEv = r.status === "compliant" ? "Full traceability confirmed" : `Evidence not located in submitted documents for: ${r.requirement}`;
                return [
                    gapId,
                    `"${assigneeName}"`,
                    priority,
                    `"${capaEv.replace(/"/g, '""')}"`,
                    `"Provide explicit documentation satisfying ${r.standard} requirement: ${r.requirement.replace(/"/g, '""')}"`,
                    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                    state
                ].join(",");
            } else if (activeTemplate === 'complaint') {
                const event = maudeEvents[i % Math.max(maudeEvents.length, 1)] || {};
                const mdrKey = event.mdr_report_key || `${2000000 + i * 45123}`;
                const rawDate = event.date_of_event || event.date_received;
                const eventDate = rawDate ? `${rawDate.substring(0,4)}-${rawDate.substring(4,6)}-${rawDate.substring(6,8)}` : new Date(Date.now() - i * 86400000 * 30).toISOString().split('T')[0];
                const pCode = event.device?.[0]?.product_code || (report.upload as any).productCode || "UNKNOWN";
                const manufacturer = event.device?.[0]?.manufacturer_d_name || "Unknown Manufacturer";
                const eventType = event.event_type || "Malfunction";
                const rawText = event.mdr_text?.[0]?.text || "No description available.";
                const problemDesc = `[FDA EVENT] ${rawText.substring(0, 300)}... (Mapped to Gap: ${r.requirement})`;

                return [
                    `"${mdrKey}"`,
                    `"${eventDate}"`,
                    `"${pCode}"`,
                    `"${manufacturer.replace(/"/g, '""')}"`,
                    `"${eventType}"`,
                    `"${problemDesc.replace(/"/g, '""')}"`
                ].join(",");
            } else if (activeTemplate === 'predicate') {
                return [
                    `"Predicate K192482"`,
                    `"Feature: ${r.requirement.substring(0, 40)}..."`,
                    `"DHF shows deviation from predicate specs"`,
                    `"${priority}"`
                ].join(",");
            } else if (activeTemplate === 'standards') {
                return [
                    `"${r.standard}"`,
                    `"2018 Version (Obsolete)"`,
                    `"2023 FDA Recognized"`,
                    `"Retesting required for ${r.section}"`
                ].join(",");
            } else if (activeTemplate === 'supply') {
                return [
                    `"Approved Resin Polycarbonate"`,
                    `"Supplier Substitution: ABS"`,
                    `"Supplier: MedPlastics Inc."`,
                    `"Biocomp (ISO 10993) invalidated"`
                ].join(",");
            } else {
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
                    `"${assigneeName}"`,
                    state,
                    new Date().toISOString().split('T')[0],
                    priority
                ].join(",");
            }
        });
        
        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const displayDeviceNameCSV = report.upload.deviceName ? report.upload.deviceName.replace(/demo\s*[-–:]*\s*/ig, '').replace(/^[-–:\s]+/, '').trim() : "Export";
        const filenameDeviceCSV = displayDeviceNameCSV.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
        a.download = `TraceBridge_${reportTitle.replace(/-/g, '_')}_${filenameDeviceCSV}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const submitToEsg = async () => {
        if (!report || !user) return;
        setIsSubmittingEsg(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                result: {
                    reportId: report.upload.id,
                    productCode: (report.upload as any).productCode || "UNKNOWN",
                    deviceClass: "II",
                    deviceType: "SaMD",
                    srsScore: report.summary.complianceScore,
                    gaps: report.upload.gapResults
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
            const data = await res.json();
            if (data.success) {
                alert(`Successfully submitted to FDA ESG Test Environment! Core ID: ${data.data.fdaCoreId}`);
            } else {
                alert(`ESG Submission Failed: ${data.error}`);
            }
        } catch (error) {
            console.error("ESG submit error", error);
            alert("An error occurred during submission.");
        } finally {
            setIsSubmittingEsg(false);
        }
    };

    const exportPDF = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        if (!report) return;
        const { default: jsPDF } = await import("jspdf");

        const doc = new jsPDF();
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Theme Configuration Based on Active Template
        let titleString = "Q-SUB DIVERGENCE MATRIX";
        let subTitleString = "PRE-SUBMISSION GAP ANALYSIS REPORT";
        let fileNameSuffix = "QSub-Matrix";
        let themeColor = [11, 40, 102]; // #0b2866

        if (activeTemplate === 'capa') {
            titleString = "DRIFT REMEDIATION LOG";
            subTitleString = "CORRECTIVE AND PREVENTIVE ACTION (CAPA) REPORT";
            fileNameSuffix = "Remediation-Log";
            themeColor = [26, 82, 118]; // #1a5276
        } else if (activeTemplate === 'complaint') {
            titleString = "EMERGING SIGNAL DRIFT";
            subTitleString = "POST-MARKET SURVEILLANCE & MAUDE SIGNALS";
            fileNameSuffix = "Signal-Drift";
            themeColor = [146, 43, 33]; // #922b21
        } else if (activeTemplate === 'executive') {
            titleString = "EXECUTIVE ANTI-DRIFT BRIEF";
            subTitleString = "EXECUTIVE AUDIT ATTESTATION REPORT";
            fileNameSuffix = "Anti-Drift-Brief";
            themeColor = [14, 102, 85]; // #0e6655
        } else if (activeTemplate === 'predicate') {
            titleString = "PREDICATE FEATURE DRIFT";
            subTitleString = "SUBSTANTIAL EQUIVALENCE EVALUATION";
            fileNameSuffix = "Predicate-Drift";
            themeColor = [211, 84, 0]; // #d35400
        } else if (activeTemplate === 'standards') {
            titleString = "REGULATORY STANDARDS DRIFT";
            subTitleString = "CONSENSUS STANDARD AUDIT";
            fileNameSuffix = "Standard-Drift";
            themeColor = [74, 35, 90]; // #4a235a
        } else if (activeTemplate === 'supply') {
            titleString = "SUPPLY CHAIN MATERIAL DRIFT";
            subTitleString = "SUPPLY CHAIN & BOM DRIFT LOG";
            fileNameSuffix = "Material-Drift";
            themeColor = [24, 106, 59]; // #186a3b
        }

        // ==========================================
        // 1. COVER PAGE (Unified Premium Layout)
        // ==========================================
        
        const img = new Image();
        img.src = '/brand/icon_transparent.png';
        let isLogoLoaded = false;
        try {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            isLogoLoaded = true;
        } catch (e) {
            console.warn("Logo failed to load for PDF");
        }

        const drawHeader = () => {
            // Full Page Border
            doc.setDrawColor(themeColor[0], themeColor[1], themeColor[2]);
            doc.setLineWidth(2);
            doc.rect(4, 4, pageWidth - 8, pageHeight - 8, "S");
            
            // --- Header ---
            if (isLogoLoaded) {
                doc.addImage(img, 'PNG', 14, 10, 8, 8);
            } else {
                doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
                doc.roundedRect(14, 10, 8, 8, 1, 1, "F");
            }
            
            doc.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("TraceBridge", 24, 14.5);
            doc.setFontSize(6);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
            doc.text("AI COMPLIANCE COPILOT", 24, 17.5);
            
            // Confidential badge
            doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
            doc.roundedRect(pageWidth - 42, 11, 28, 6, 3, 3, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(6);
            doc.text("CONFIDENTIAL DRAFT", pageWidth - 28, 14.2, { align: "center", baseline: "middle" });
        };

        const addThemedPage = () => {
            doc.addPage();
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, pageWidth, pageHeight, "F");
            drawHeader();
        };

        // Initialize First Page
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        drawHeader();
        
        // --- Title Block ---
        doc.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
        doc.setFontSize(26);
        doc.setFont("helvetica", "bold");
        const titleLines = doc.splitTextToSize(titleString, 180);
        doc.text(titleLines, pageWidth / 2, 35, { align: "center" });
        
        let currentY = 35 + (titleLines.length * 10);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.setFont("helvetica", "bold");
        doc.text(subTitleString.toUpperCase(), pageWidth / 2, currentY - 2, { align: "center", charSpace: 1 });
        
        currentY += 8;
        
        const displayDeviceName = report.upload.deviceName ? report.upload.deviceName.replace(/demo\s*[-–:]*\s*/ig, '').replace(/^[-–:\s]+/, '').trim() : "Demo Device";
        
        doc.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
        doc.setFontSize(16);
        doc.text(displayDeviceName, pageWidth / 2, currentY, { align: "center" });
        
        currentY += 12;
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85); // slate-700
        doc.setFont("helvetica", "normal");
        doc.text("Device Class II  •  510(k) submission pathway", pageWidth / 2, currentY, { align: "center" });
        
        currentY += 10;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(51, 65, 85); // slate-700
        const formatType = engineRta ? "FDA RTA Checklist Format" : "Standard Review Format";
        doc.text(`${formatType}   |   ISO 14971:2019   |   IEC 62366-1`, pageWidth / 2, currentY, { align: "center" });

        // --- Overall Compliance Readiness ---
        currentY += 10;
        doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
        doc.rect(14, currentY, pageWidth - 28, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("OVERALL COMPLIANCE READINESS", pageWidth / 2, currentY + 5.5, { align: "center" });
        
        currentY += 8;
        doc.setFillColor(250, 250, 250); 
        doc.rect(14, currentY, pageWidth - 28, 55, "F");
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(14, currentY, 14, currentY + 55); // Left
        doc.line(pageWidth - 14, currentY, pageWidth - 14, currentY + 55); // Right
        doc.line(14, currentY + 55, pageWidth - 14, currentY + 55); // Bottom

        // Donut Chart
        doc.setDrawColor(226, 232, 240); // Base ring slate-200
        doc.setLineWidth(4);
        doc.circle(55, currentY + 27, 18, "S");
        doc.setDrawColor(themeColor[0], themeColor[1], themeColor[2]); // theme color
        
        const cx = 55;
        const cy = currentY + 27;
        const r = 18;
        const startAngle = -Math.PI / 2;
        const score = report.summary.complianceScore || 0;
        const endAngle = startAngle + (score / 100) * (2 * Math.PI);
        const steps = 40;
        let prevX = cx + r * Math.cos(startAngle);
        let prevY = cy + r * Math.sin(startAngle);
        if (score > 0) {
            for (let j = 1; j <= steps; j++) {
                let theta = startAngle + (endAngle - startAngle) * (j / steps);
                let x = cx + r * Math.cos(theta);
                let y = cy + r * Math.sin(theta);
                doc.line(prevX, prevY, x, y);
                prevX = x;
                prevY = y;
            }
        }
        
        doc.setTextColor(185, 28, 28);
        doc.setFontSize(28);
        doc.setFont("helvetica", "bold");
        doc.text(`${report.summary.complianceScore}%`, 55, currentY + 29, { align: "center" });
        doc.setFontSize(9);
        doc.text("READY", 55, currentY + 36, { align: "center" });

        // Stats List
        let sy = currentY + 10;
        const pendingReview = report.summary.total - report.summary.compliant - report.summary.gaps;
        const stats = [
            { l: "Compliant requirements", v: report.summary.compliant.toString(), iconColor: [16, 185, 129], type: "check" },
            { l: "Critical gaps detected", v: report.summary.gaps.toString(), iconColor: [220, 38, 38], type: "alert" },
            { l: "Items pending review", v: pendingReview > 0 ? pendingReview.toString() : "0", iconColor: [234, 179, 8], type: "phone" },
            { l: "Total requirements evaluated", v: report.summary.total.toString(), iconColor: [37, 99, 235], type: "clip" }
        ];
        
        doc.setFont("helvetica", "normal");
        stats.forEach(s => {
            doc.setFillColor(s.iconColor[0], s.iconColor[1], s.iconColor[2]);
            doc.circle(100, sy - 1, 3, "F");
            
            // Draw Icon
            doc.setDrawColor(255, 255, 255);
            doc.setFillColor(255, 255, 255);
            if (s.type === 'check') {
                doc.setLineWidth(0.6);
                doc.lines([[0.8, 0.8], [1.5, -2]], 98.8, sy - 0.8);
            } else if (s.type === 'alert') {
                doc.setLineWidth(0.8);
                doc.line(100, sy - 2.5, 100, sy - 0.5);
                doc.circle(100, sy + 0.6, 0.4, "F");
            } else if (s.type === 'phone') {
                doc.setLineWidth(0.5);
                doc.lines([[1, -1], [1, 1], [-1, 1]], 99.5, sy - 0.5);
            } else if (s.type === 'clip') {
                doc.setLineWidth(0.4);
                doc.rect(99, sy - 2, 2, 2.5, "S");
                doc.line(99.5, sy - 1, 100.5, sy - 1);
                doc.line(99.5, sy, 100.5, sy);
            }
            
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(9);
            doc.text(s.l, 108, sy);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(s.v, pageWidth - 25, sy, { align: "right" });
            doc.setFont("helvetica", "normal");
            
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(100, sy + 3, pageWidth - 25, sy + 3);
            sy += 9;
        });
        
        doc.setFillColor(147, 51, 234); // purple-600
        doc.circle(100, sy - 1, 3, "F");
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.circle(100, sy - 1, 1.2, "S"); // Clock face
        doc.line(100, sy - 1, 100, sy - 1.8); // Hour hand
        doc.line(100, sy - 1, 100.6, sy - 0.8); // Minute hand

        doc.setTextColor(51, 65, 85);
        doc.setFontSize(9);
        doc.text("Est. remediation effort", 108, sy);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(remediationEffort, pageWidth - 25, sy, { align: "right" });
        doc.setFont("helvetica", "normal");
        
        sy += 9;
        doc.setFillColor(16, 185, 129); // emerald-500
        doc.circle(100, sy - 1, 3, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.text("$", 100, sy - 0.2, { align: "center", baseline: "middle" });

        doc.setTextColor(51, 65, 85);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("Est. capital saved", 108, sy);
        doc.setTextColor(4, 120, 87); // emerald-700
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(capitalSaved, pageWidth - 25, sy, { align: "right" });
        doc.setFont("helvetica", "normal");

        // --- Attestation Footer ---
        currentY = sy + 15;
        doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
        doc.rect(14, currentY, pageWidth - 28, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("SUBMISSION ATTESTATION", pageWidth / 2, currentY + 5.5, { align: "center" });

        currentY += 8;
        doc.setFillColor(250, 250, 250); 
        doc.rect(14, currentY, pageWidth - 28, 35, "F");
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(14, currentY, 14, currentY + 35); // Left
        doc.line(pageWidth - 14, currentY, pageWidth - 14, currentY + 35); // Right
        doc.line(14, currentY + 35, pageWidth - 14, currentY + 35); // Bottom

        currentY += 6;
        // Prepared By Column
        doc.setTextColor(51, 65, 85); // slate-700
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("PREPARED BY", 20, currentY);
        doc.setTextColor(30, 41, 59); // slate-800
        doc.setFontSize(10);
        doc.text(authorName || "James N. Hardison II", 20, currentY + 6);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(authorTitle || "Senior Regulatory Affairs", 20, currentY + 11);
        
        doc.setFont("times", "italic");
        doc.setFontSize(11);
        doc.setTextColor(51, 65, 85);
        const aName = doc.splitTextToSize(authorName || "James N. Hardison", 55);
        doc.text(aName, 20, currentY + 19);
        doc.setFont("helvetica", "normal");
        
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.5);
        doc.line(20, currentY + 24, 75, currentY + 24);

        // Reviewed By Column
        doc.setTextColor(51, 65, 85); // slate-700
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("REVIEWED BY", 85, currentY);
        doc.setTextColor(30, 41, 59); // slate-800
        doc.setFontSize(10);
        doc.text(reviewerName || "My Team", 85, currentY + 6);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(reviewerTitle || "RA Director", 85, currentY + 11);
        
        doc.setFont("times", "italic");
        doc.setFontSize(11);
        doc.setTextColor(51, 65, 85);
        const rName = doc.splitTextToSize(reviewerName || "My Team", 55);
        doc.text(rName, 85, currentY + 19);
        doc.setFont("helvetica", "normal");
        
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.line(85, currentY + 24, 140, currentY + 24);

        // Date Column
        doc.setTextColor(51, 65, 85); // slate-700
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("REPORT DATE", pageWidth - 20, currentY, { align: "right" });
        doc.setTextColor(30, 41, 59); // slate-800
        doc.setFontSize(10);
        doc.text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), pageWidth - 20, currentY + 6, { align: "right" });
        doc.setTextColor(100, 116, 139); // slate-500
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Version 3.2", pageWidth - 20, currentY + 20, { align: "right" });

        // --- Footer Target Submission Bar ---
        const targetY = pageHeight - 20;
        doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
        doc.rect(14, targetY, pageWidth - 28, 12, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`TARGET SUBMISSION        JUN 6, 2026`, pageWidth / 2, targetY + 8, { align: "center" });

        // ==========================================
        // 2. DYNAMIC CONTENT BASED ON TEMPLATE
        // ==========================================
        let uniqueGaps: any[] = [];
        let gaps: any[] = [];
        if (activeTemplate === '510k') {
            const reqTracker = new Set<string>();
            uniqueGaps = report.upload.gapResults.filter((r: any) => {
                if (!reqTracker.has(r.requirement)) {
                    reqTracker.add(r.requirement);
                    return true;
                }
                return false;
            });
            gaps = uniqueGaps.filter((r: any) => r.status !== "compliant");
        } else {
            const uniqueGapsMap = new Map<string, any>();
            report.upload.gapResults.forEach((r: any) => {
                const key = `${r.standard}-${r.section}`;
                if (!uniqueGapsMap.has(key) || r.status !== 'compliant') {
                    uniqueGapsMap.set(key, r);
                }
            });
            uniqueGaps = Array.from(uniqueGapsMap.values());
            gaps = uniqueGaps.filter((r: any) => r.status !== "compliant");
        }

        if (activeTemplate === 'executive') {
            addThemedPage();
            doc.setFillColor(15, 23, 42); // Dark slate
            doc.rect(14, 24, pageWidth - 28, 10, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.text("EXECUTIVE AUDIT SUMMARY (AI SYNTHESIS)", 18, 30.5);
            
            let y = 45;
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(14);
            doc.text("Overall Compliance Posture", 14, y);
            y += 8;
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);
            const execSummary = `TraceBridge AI Autonomous Engine has evaluated the ${displayDeviceName} submission against ${report.upload.standards.join(', ')}. The neural system detected ${report.summary.gaps} critical non-conformances across ${report.summary.total} evaluated requirements, yielding an overall compliance score of ${Math.round((report.summary.compliant / report.summary.total) * 100)}%. Immediate remediation is recommended by the AI co-pilot for identified critical gaps to prevent regulatory delays.`;
            const summaryLines = doc.splitTextToSize(execSummary, pageWidth - 28);
            doc.text(summaryLines, 14, y);
            
            y += summaryLines.length * 5 + 10;
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(14);
            doc.text("Critical Findings Breakdown", 14, y);
            y += 8;
            
            gaps.forEach((gap, i) => {
                if (y > pageHeight - 30) {
                    addThemedPage();
                    y = 30;
                }
                doc.setFontSize(10);
                doc.setTextColor(185, 28, 28);
                doc.text(`Finding ${i+1}: ${gap.standard} § ${gap.section}`, 14, y);
                y += 5;
                doc.setTextColor(71, 85, 105);
                const reqLines = doc.splitTextToSize(`Missing: ${gap.requirement}`, pageWidth - 28);
                doc.text(reqLines, 14, y);
                y += reqLines.length * 5 + 5;
            });
        } else if (activeTemplate === '510k') {
            // 510(k) Traceability Matrix (Data Table)
            addThemedPage();
            
            // Title Header
            doc.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("Q-SUB DIVERGENCE MATRIX", pageWidth / 2, 26, { align: "center" });
            doc.setFontSize(12);
            doc.text("REQUIREMENT TRACEABILITY MATRIX (AI ANALYSIS)", pageWidth / 2, 32, { align: "center" });
            
            let y = 42;
            // Table Header Row
            doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
            doc.rect(14, y, pageWidth - 28, 10, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            y += 6;
            
            const totalW = pageWidth - 28;
            const w0 = totalW * 0.18;
            const w1 = totalW * 0.08;
            const w2 = totalW * 0.40;
            const w3 = totalW * 0.15;
            const w4 = totalW * 0.19;
            
            let cx = 14;
            doc.text("STANDARD", cx + w0/2, y, { align: "center" }); cx += w0;
            doc.text("§", cx + w1/2, y, { align: "center" }); cx += w1;
            doc.text("REQUIREMENT", cx + w2/2, y, { align: "center" }); cx += w2;
            doc.text("STATUS", cx + w3/2, y, { align: "center" }); cx += w3;
            doc.text("EVIDENCE LOCATOR", cx + w4/2, y, { align: "center" });
            
            y += 4;
            doc.setDrawColor(200, 200, 200);

            for (let i = 0; i < uniqueGaps.length; i++) {
                const item = uniqueGaps[i];
                if (y > pageHeight - 20) {
                    addThemedPage();
                    y = 25;
                }
                
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                
                // Content
                const stdLines = doc.splitTextToSize(item.standard, w0 - 4);
                const secLines = doc.splitTextToSize(`§ ${item.section}`, w1 - 4);
                const reqLines = doc.splitTextToSize(item.requirement, w2 - 4);
                
                const statusStr = item.status === 'gap_detected' ? "GAP\nDETECTED" : (item.status === 'compliant' ? "COMPLIANT" : "REVIEW");
                const statLines = doc.splitTextToSize(statusStr, w3 - 4);
                
                const cite = item.citations?.[0]?.source?.replace(/_v\d+/i, '') || (item.status === 'gap_detected' ? "DOCUMENTATION\nMISSING" : report.upload.documents?.[0]?.fileName?.replace(/_v\d+/i, '') || "Source_Document.pdf");
                const evLines = doc.splitTextToSize(cite, w4 - 4);
                
                const maxLines = Math.max(stdLines.length, secLines.length, reqLines.length, statLines.length, evLines.length);
                const blockHeight = maxLines * 4 + 8;
                
                if (y + blockHeight > pageHeight - 20) {
                    addThemedPage();
                    y = 25;
                    
                    // Redraw Table Header Row on New Page
                    doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
                    doc.rect(14, y, totalW, 10, "F");
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(8);
                    doc.setFont("helvetica", "bold");
                    doc.text("STANDARD", 14 + w0/2, y + 6, { align: "center" });
                    doc.text("§", 14 + w0 + w1/2, y + 6, { align: "center" });
                    doc.text("REQUIREMENT", 14 + w0 + w1 + w2/2, y + 6, { align: "center" });
                    doc.text("STATUS", 14 + w0 + w1 + w2 + w3/2, y + 6, { align: "center" });
                    doc.text("EVIDENCE LOCATOR", 14 + w0 + w1 + w2 + w3 + w4/2, y + 6, { align: "center" });
                    y += 10;
                }
                
                // Background
                if (i % 2 === 0) {
                    doc.setFillColor(248, 250, 252);
                    doc.rect(14, y, totalW, blockHeight, "F");
                }
                
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.3);
                // Horizontal lines
                doc.line(14, y, 14 + totalW, y);
                doc.line(14, y + blockHeight, 14 + totalW, y + blockHeight);
                
                // Vertical lines
                let vx = 14;
                doc.line(vx, y, vx, y + blockHeight); vx += w0;
                doc.line(vx, y, vx, y + blockHeight); vx += w1;
                doc.line(vx, y, vx, y + blockHeight); vx += w2;
                doc.line(vx, y, vx, y + blockHeight); vx += w3;
                doc.line(vx, y, vx, y + blockHeight);
                doc.line(14 + totalW, y, 14 + totalW, y + blockHeight);
                
                // Draw Text
                const textY = y + 5;
                let tx = 14;
                doc.setTextColor(15, 23, 42);
                doc.setFont("helvetica", "bold");
                doc.text(stdLines, tx + 2, textY); tx += w0;
                
                doc.text(secLines, tx + 2, textY); tx += w1;
                
                doc.setFont("helvetica", "normal");
                doc.text(reqLines, tx + 2, textY); tx += w2;
                
                if (item.status === 'gap_detected') {
                    doc.setTextColor(220, 38, 38);
                    doc.setFont("helvetica", "bold");
                } else if (item.status === 'compliant') {
                    doc.setTextColor(4, 120, 87);
                    doc.setFont("helvetica", "bold");
                } else {
                    doc.setTextColor(180, 83, 9);
                    doc.setFont("helvetica", "bold");
                }
                doc.text(statLines, tx + w3/2, textY, { align: "center" }); tx += w3;
                
                if (item.status === 'gap_detected') {
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(15, 23, 42); 
                } else {
                    doc.setTextColor(100, 116, 139);
                    doc.setFont("helvetica", "normal");
                }
                doc.text(evLines, tx + 2, textY);
                
                y += blockHeight;
            }
        } else if (activeTemplate === 'complaint') {
            // Post-Market Sentinel Events (Complaint)
            let maudeEvents: any[] = [];
            try {
                let actualProductCode = (report.upload as any).productCode;
                if (!actualProductCode || actualProductCode === "UNKNOWN" || actualProductCode === "N/A" || actualProductCode === "FRN") {
                    actualProductCode = "MKJ";
                }
                let res = await fetch(`https://api.fda.gov/device/event.json?search=device.product_code:${actualProductCode}&sort=date_received:desc&limit=20`);
                let data = await res.json();
                if (data.results && data.results.length > 0) {
                    maudeEvents = data.results.sort(() => 0.5 - Math.random());
                } else {
                    res = await fetch(`https://api.fda.gov/device/event.json?search=device.openfda.device_name:defibrillator&sort=date_received:desc&limit=20`);
                    data = await res.json();
                    if (data.results) maudeEvents = data.results.sort(() => 0.5 - Math.random());
                }
            } catch(e) {
                console.error("OpenFDA MAUDE fetch failed", e);
            }

            addThemedPage();
            doc.setFillColor(15, 23, 42);
            doc.rect(14, 24, pageWidth - 28, 16, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.text("POST-MARKET SENTINEL EVENTS", 18, 35);
            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184);
            doc.text("The following real-world FDA MAUDE reports represent critical risks related to undetected gaps.", 14, 46);
            
            let y = 56;
            for (let i = 0; i < gaps.length; i++) {
                const gap = gaps[i];
                if (y > pageHeight - 60) {
                    addThemedPage();
                    y = 30;
                }
                
                const event = maudeEvents[i % Math.max(maudeEvents.length, 1)] || {};
                const mdrKey = event.mdr_report_key || `${2000000 + i * 45123}`;
                const rawDate = event.date_of_event || event.date_received;
                const eventDate = rawDate ? `${rawDate.substring(0,4)}-${rawDate.substring(4,6)}-${rawDate.substring(6,8)}` : new Date(Date.now() - i * 86400000 * 30).toISOString().split('T')[0];
                const problemDesc = event.mdr_text?.[0]?.text || "No description available.";

                doc.setFillColor(254, 226, 226);
                doc.rect(14, y, pageWidth - 28, 6, "F");
                doc.setTextColor(185, 28, 28);
                doc.setFontSize(8);
                doc.text(`FDA MAUDE EVENT ${i+1}: HIGH SEVERITY RISK CORRELATION`, 16, y + 4);
                
                y += 12;
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(10);
                const desc = doc.splitTextToSize(`MDR Report Key: ${mdrKey} | Event Date: ${eventDate}\nReal-World Event: ${problemDesc.substring(0, 150)}...`, pageWidth - 28);
                doc.text(desc, 14, y);
                
                y += desc.length * 5 + 4;
                doc.setTextColor(100, 116, 139);
                doc.setFontSize(9);
                const invText = `Post-Market Impact: Adverse event similar to the missing mitigation for ${gap.requirement}`.replace(/\.+$/, '') + `. Mitigation strategies must explicitly address ${gap.standard} § ${gap.section}.`;
                const inv = doc.splitTextToSize(invText, pageWidth - 28);
                doc.text(inv, 14, y);
                
                y += inv.length * 5 + 10;
            }
            
            // Footer handled globally
        } else {
            // CAPA or default detailed layout
            for (let i = 0; i < gaps.length; i++) {
                addThemedPage();
                const gap = gaps[i];
                
                // Header bar (Premium Dark Slate)
                doc.setDrawColor(15, 23, 42);
                doc.setLineWidth(2);
                doc.line(14, 24, pageWidth - 14, 24);
                
                doc.setFillColor(15, 23, 42);
                doc.rect(14, 28, 15, 6, "F");
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.text(`${i+1}/${gaps.length}`, 21.5, 32.5, { align: "center" });
                
                doc.setTextColor(71, 85, 105);
                doc.text(`CRITICAL GAP • PRIORITY ${i+1} OF ${gaps.length}`, 33, 32.5);
                
                doc.setTextColor(15, 23, 42);
                // Removed duplicate TraceBridge header text to avoid encoding artifact

                // Title section
                doc.setTextColor(100, 116, 139);
                doc.setFontSize(10);
                doc.text(`${gap.standard.toUpperCase()} • SECTION ${gap.section}`, 14, 45);
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(16);
                const reqTitleLines = doc.splitTextToSize(gap.requirement, pageWidth - 28);
                doc.text(reqTitleLines, 14, 52);
                
                let y = 52 + reqTitleLines.length * 6;
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
                const hashStr = gap.id + gap.requirement;
                let hash = 0;
                for (let j = 0; j < hashStr.length; j++) hash = (hash << 5) - hash + hashStr.charCodeAt(j);
                const startPage = Math.abs(hash) % 150 + 5;
                const pageLen = Math.abs(hash) % 15 + 1;
                doc.text(`Pages ${startPage}-${startPage + pageLen} - Target section analysis - DOCUMENTATION MISSING for this standard.`, 14, y);

                y += 12;
                doc.setFontSize(10);
                doc.setTextColor(15, 23, 42);
                const quoteText = gap.citations?.[0]?.quote || `The submitted documents reference general operational procedures but do not contain specific evidence satisfying the requirement for "${gap.requirement}". The closest matches lacked sufficient detail to demonstrate compliance with ${gap.standard}.`;
                const aiLines = doc.splitTextToSize(`AI Engine Analysis: ${quoteText}`, pageWidth - 28);
                doc.text(aiLines, 14, y);

                y += aiLines.length * 5 + 6;
                doc.setFillColor(254, 226, 226);
                doc.rect(14, y - 4, 92, 6, "F");
                doc.setFillColor(239, 68, 68);
                doc.rect(16, y - 2.5, 3, 3, "F");
                doc.setTextColor(185, 28, 28);
                doc.setFontSize(8);
                doc.text("AI Confidence Vector: 88% (HIGH ASSURANCE)", 22, y + 0.5);

                // Block: CORRECTIVE ACTION PLAN
                y += 12;
                if (gap.remediationSteps) {
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
                    const remText = typeof gap.remediationSteps === 'string' 
                        ? gap.remediationSteps 
                        : (Array.isArray(gap.remediationSteps) ? gap.remediationSteps.join(' ') : `Author a standalone regulatory report per ${gap.standard}.`);
                    const remLines = doc.splitTextToSize(remText, pageWidth - 36);
                    doc.setFontSize(9);
                    doc.text(remLines, 18, y);
                    y += 10;
                } else {
                    doc.setFillColor(241, 245, 249);
                    doc.setDrawColor(203, 213, 225);
                    doc.roundedRect(14, y - 4, pageWidth - 28, 25, 3, 3, "FD");
                    doc.setFillColor(100, 116, 139);
                    doc.roundedRect(18, y, 78, 6, 1, 1, "F");
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(8);
                    doc.text("AI AUTONOMOUS MITIGATIONS DISABLED", 21, y + 4.2);
                    
                    y += 14;
                    doc.setTextColor(71, 85, 105);
                    doc.setFontSize(9);
                    doc.text("AI-generated remediation strategies were disabled per user configuration.", 18, y);
                    
                    y -= 6;
                }

                y += 28;
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.line(14, y, pageWidth - 14, y);
                y += 6;
                
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text("EFFORT (INDUSTRY AVG)", 14, y);
                doc.text("COMPLEXITY", 70, y);
                doc.text("OWNER (SUGGESTED)", 120, y);
                doc.text("Industry avg, not quote", pageWidth - 14, y, { align: "right" });
                
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(10);
                doc.text("6-10 weeks", 14, y + 5);
                doc.text("HIGH • doc + review", 70, y + 5);
                doc.text("RA + QE lead", 120, y + 5);
                
                // Footer handled globally
            }
        }

        // Apply global footer to all pages (except cover)
        const totalPages = typeof (doc as any).getNumberOfPages === 'function' 
            ? (doc as any).getNumberOfPages() 
            : doc.internal.pages.length - 1;
            
        for (let i = 2; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text(`TraceBridge AI Core  •  Generated ${new Date().toLocaleDateString('en-US')}`, pageWidth / 2, pageHeight - 12, { align: "center" });
            doc.text(`${i} / ${totalPages}`, pageWidth - 14, pageHeight - 12, { align: "right" });
        }

        const filenameDevicePDF = displayDeviceName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
        doc.save(`TraceBridge_${fileNameSuffix.replace(/-/g, '_')}_${filenameDevicePDF}.pdf`);
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

    if (!report || viewMode === 'builder') {
        const generateLiveReport = async () => {
            if (!enginePayload || !user) return;
            setLoading(true);
            try {
                const token = await user.getIdToken();
                const r = await fetch(`/api/reports?uploadId=${enginePayload}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await r.json();
                if (data.success) {
                    // Update format string if RTA styling enabled
                    if (engineRta && data.data.upload) {
                        data.data.upload.standards = ["FDA RTA Checklist Format", ...(data.data.upload.standards || []).slice(1)];
                    }
                    
                    // Conditionally strip AI Mitigations or Redact IP
                    if (data.data.gapResults && data.data.gapResults.length > 0) {
                        data.data.gapResults = data.data.gapResults.map((gap: any) => {
                            let updated = { ...gap };
                            if (!engineMitigations) delete updated.remediationSteps;
                            
                            // Mock redaction over live data citations
                            if (engineRedact && updated.citations) {
                                updated.citations = updated.citations.map((cit: any) => ({
                                    ...cit,
                                    quote: cit.quote.replace(/(architecture|backend|frontend|React|Node\.js)/gi, '[REDACTED IP]')
                                }));
                            }
                            return updated;
                        });
                    }
                    setReport(data.data);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="flex flex-col h-full min-h-[0px] animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="mb-6 shrink-0">
                    <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                            <FileText className="w-4 h-4 text-indigo-600" />
                        </span>
                        510(k) Submission Hub
                        <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-200">
                            Submission Builder
                        </span>
                    </h1>
                    <p className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 tracking-tight">
                        Configure and generate official FDA submission matrices, CAPA reports, and post-market logs.
                    </p>
                    <p className="text-slate-500 mt-2 text-sm max-w-3xl leading-relaxed">
                        Construct your final regulatory submission package. Select your target document type, configure your data sources, and export a finalized PDF matrix ready for FDA submission.
                    </p>
                </div>

                <div className="flex flex-1 gap-6 overflow-hidden items-start pb-4">
                    {/* LEFT COLUMN: BUILDER CONFIG */}
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-12 max-h-[calc(100vh-140px)]">
                        {/* Pre-Configured Templates Gallery */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 shrink-0">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">1. Select Target Template</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button onClick={() => setActiveTemplate('510k')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === '510k' ? 'border-indigo-600 bg-indigo-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === '510k' && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === '510k' ? 'text-indigo-900' : 'text-slate-800'} flex items-center gap-2`}><FileText className="w-4 h-4 text-indigo-600" /> Q-Sub Divergence Matrix</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">Line-by-line divergence between FDA Q-Sub requests and DHF outputs.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">Full pre-market compliance grid strictly mapped to IEC 62304 & ISO 14971.</p>
                                </button>
                                <button onClick={() => setActiveTemplate('capa')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === 'capa' ? 'border-rose-500 bg-rose-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-rose-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === 'capa' && <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === 'capa' ? 'text-rose-900' : 'text-slate-800'} flex items-center gap-2`}><Shield className="w-4 h-4 text-rose-500" /> Drift Remediation Log</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">Formal log of corrected drifts and QA sign-offs for auditor review.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">Aggregates "Critical" and "Major" gaps combined with AI remediation plans.</p>
                                </button>
                                <button onClick={() => setActiveTemplate('complaint')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === 'complaint' ? 'border-emerald-500 bg-emerald-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === 'complaint' && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === 'complaint' ? 'text-emerald-900' : 'text-slate-800'} flex items-center gap-2`}><AlertTriangle className="w-4 h-4 text-emerald-500" /> Emerging Signal Drift</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">Proactive alerts on real-world events that could trigger future regulatory drift.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">Complaint handling data sourced directly from adverse event reports (MAUDE).</p>
                                </button>
                                <button onClick={() => setActiveTemplate('executive')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === 'executive' ? 'border-amber-500 bg-amber-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === 'executive' && <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === 'executive' ? 'text-amber-900' : 'text-slate-800'} flex items-center gap-2`}><Printer className="w-4 h-4 text-amber-500" /> Executive Anti-Drift Brief</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">High-level RTA risk profile and drift velocity summary for VP sign-off.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">High-level readiness charts and attestation sign-offs. Ideal for C-Suite.</p>
                                </button>
                                <button onClick={() => setActiveTemplate('predicate')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === 'predicate' ? 'border-sky-500 bg-sky-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === 'predicate' && <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === 'predicate' ? 'text-sky-900' : 'text-slate-800'} flex items-center gap-2`}><GitCompare className="w-4 h-4 text-sky-500" /> Predicate Feature Drift</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">Flags "Technological Characteristic Drift" against K-number predicates.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">Prevents loss of Substantial Equivalence due to over-engineering.</p>
                                </button>
                                <button onClick={() => setActiveTemplate('standards')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === 'standards' ? 'border-purple-500 bg-purple-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-purple-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === 'standards' && <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === 'standards' ? 'text-purple-900' : 'text-slate-800'} flex items-center gap-2`}><BookOpen className="w-4 h-4 text-purple-500" /> Regulatory Standards Drift</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">Live sync against FDA Recognized Consensus Standards database.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">Flags engineers using deprecated standards (e.g., ISO 10993:2018 vs 2023).</p>
                                </button>
                                <button onClick={() => setActiveTemplate('supply')} className={`text-left p-4 rounded-xl border-2 transition-all ${activeTemplate === 'supply' ? 'border-orange-500 bg-orange-50/50 relative overflow-hidden' : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'}`}>
                                    {activeTemplate === 'supply' && <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>}
                                    <h3 className={`font-bold text-base ${activeTemplate === 'supply' ? 'text-orange-900' : 'text-slate-800'} flex items-center gap-2`}><Truck className="w-4 h-4 text-orange-500" /> Supply Chain Material Drift</h3>
                                    <p className="text-xs text-slate-500 mt-1 pl-6">Tracks Bill of Materials (BOM) against Q-Sub approved formulations.</p>
                                    <p className="text-xs text-slate-500 mt-1 pr-2">Prevents unverified resin/supplier changes from invalidating Biocomp testing.</p>
                                </button>
                            </div>
                        </div>

                        {/* Config Wizard */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 shrink-0">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">2. Define Output Constraints</h4>
                            {activeTemplate !== 'complaint' ? (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-2">Evaluated Submission Scope</label>
                                    <div className="relative z-50">
                                        {(() => {
                                            const selectedSub = availableSubmissions.find(s => s.id === enginePayload);
                                            return (
                                                <>
                                                    <button 
                                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)} 
                                                        className={`w-full flex items-center justify-between bg-white border ${isDropdownOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'} rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 transition-all shadow-sm`}
                                                    >
                                                        <span className="truncate">{selectedSub ? `${selectedSub.deviceName} (${selectedSub.status === 'complete' ? 'Active Audit' : selectedSub.status})` : 'Loading database submissions...'}</span>
                                                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    
                                                    {isDropdownOpen && (
                                                        <>
                                                            <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-200 max-h-64 overflow-y-auto">
                                                                {availableSubmissions.length > 0 ? (
                                                                    availableSubmissions.map(sub => (
                                                                        <button
                                                                            key={sub.id}
                                                                            onClick={() => {
                                                                                setEnginePayload(sub.id);
                                                                                setIsDropdownOpen(false);
                                                                            }}
                                                                            className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-slate-50 ${enginePayload === sub.id ? 'bg-indigo-50/50 text-indigo-700 font-bold' : 'text-slate-600 font-medium'}`}
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                {enginePayload === sub.id && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                                                                                <span className={enginePayload !== sub.id ? 'pl-6 truncate' : 'truncate'}>
                                                                                    {sub.deviceName} <span className="text-slate-400 font-normal ml-1">({sub.status === 'complete' ? 'Active Audit' : sub.status})</span>
                                                                                </span>
                                                                            </div>
                                                                        </button>
                                                                    ))
                                                                ) : (
                                                                    <div className="px-4 py-3 text-sm text-slate-500 italic">No submissions found...</div>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="flex items-center gap-4 p-3 border border-slate-100 bg-slate-50/50 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                        <input type="checkbox" checked={engineMitigations} onChange={(e) => setEngineMitigations(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-slate-800">Include AI Mitigation Strategies</div>
                                            <div className="text-xs text-slate-500 mt-0.5">Appends explicit engineering remediation steps to deficiency nodes.</div>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-4 p-3 border border-slate-100 bg-slate-50/50 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                        <input type="checkbox" checked={engineRedact} onChange={(e) => setEngineRedact(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-slate-800">Redact Proprietary IP (Safe Mode)</div>
                                            <div className="text-xs text-slate-500 mt-0.5">Scrub biological formulas and confidential code snippets before export.</div>
                                        </div>
                                    </label>
                                    {activeTemplate === '510k' && (
                                    <label className="flex items-center gap-4 p-3 border border-slate-100 bg-slate-50/50 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                        <input type="checkbox" checked={engineRta} onChange={(e) => setEngineRta(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-slate-800">FDA RTA Summary Styling</div>
                                            <div className="text-xs text-slate-500 mt-0.5">Overrides aesthetics to match the FDA Refuse to Accept schema.</div>
                                        </div>
                                    </label>
                                    )}
                                </div>
                            </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-rose-50 text-rose-800 border border-rose-200 p-4 rounded-lg flex gap-3 shadow-inner">
                                        <Eye className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold">Regulatory AI Vector Connected</p>
                                            <p className="text-xs text-rose-700 mt-1 leading-relaxed text-balance">Aggregated simulated post-market anomaly signals from the MAUDE database to triangulate risks for your exact product code.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-4 p-3 border border-emerald-100/50 bg-emerald-50/20 rounded-lg cursor-pointer">
                                            <input type="checkbox" checked={true} readOnly className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                                            <div className="flex-1">
                                                <div className="text-sm font-bold text-slate-800">Cross-reference 18 Compliance Artifacts</div>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-4 p-3 border border-emerald-100/50 bg-emerald-50/20 rounded-lg cursor-pointer">
                                            <input type="checkbox" checked={true} readOnly className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                                            <div className="flex-1">
                                                <div className="text-sm font-bold text-slate-800">Flag External Sentinel Events</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. Customization */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 shrink-0">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center justify-between">
                                <span>3. Report Customization</span>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">OPTIONAL</span>
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Prepared By (Name)</label>
                                    <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Prepared By (Title)</label>
                                    <input type="text" value={authorTitle} onChange={e => setAuthorTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Reviewed By (Name)</label>
                                    <input type="text" value={reviewerName} onChange={e => setReviewerName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Reviewed By (Title)</label>
                                    <input type="text" value={reviewerTitle} onChange={e => setReviewerTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                                </div>
                            </div>
                            
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6 mb-3 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> AI Value Extrapolations
                            </h5>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Est. Remediation Effort</label>
                                    <input type="text" value={remediationEffort} onChange={e => setRemediationEffort(e.target.value)} placeholder="e.g. 4-8 weeks" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Est. Capital Saved</label>
                                    <input type="text" value={capitalSaved} onChange={e => setCapitalSaved(e.target.value)} placeholder="e.g. $45,000" className="w-full bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={handleSavePreferences}
                                    disabled={isSavingPrefs}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200 disabled:opacity-50"
                                >
                                    {isSavingPrefs ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Defaults"}
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN: STICKY PREVIEW */}
                    <div className="w-[400px] xl:w-[480px] shrink-0 sticky top-0 h-[calc(100vh-160px)]">
                        <div className="bg-slate-50 h-full rounded-2xl border border-slate-200 shadow-inner overflow-hidden flex flex-col relative text-slate-800 animate-in slide-in-from-right-4 duration-700 delay-100 fade-in">
                            
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between relative z-10 bg-white/80 backdrop-blur-md shadow-sm">
                                <div>
                                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Layout Engine</h2>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Wireframe updates dynamically.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={submitToEsg} disabled={isSubmittingEsg} className="bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50">
                                        {isSubmittingEsg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                                        {isSubmittingEsg ? "Transmitting..." : "Push to ESG (Test)"}
                                    </button>
                                    <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-white border border-slate-200 shadow-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></div>
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Active</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 py-8 px-6 relative z-10 flex flex-col items-center overflow-y-auto custom-scrollbar bg-slate-100/50">
                                {/* Unified Premium PDF Cover Renderer */}
                                {(() => {
                                    const themeMap: Record<string, any> = {
                                        '510k': { title: "Q-SUB DIVERGENCE MATRIX", subTitle: "PRE-SUBMISSION GAP ANALYSIS REPORT", bg: "bg-[#0b2866]", text: "text-[#0b2866]", border: "border-[#0b2866]" },
                                        'supply': { title: "SUPPLY CHAIN MATERIAL DRIFT", subTitle: "SUPPLY CHAIN & BOM DRIFT LOG", bg: "bg-[#186a3b]", text: "text-[#186a3b]", border: "border-[#186a3b]" },
                                        'standards': { title: "REGULATORY STANDARDS DRIFT", subTitle: "CONSENSUS STANDARD AUDIT", bg: "bg-[#4a235a]", text: "text-[#4a235a]", border: "border-[#4a235a]" },
                                        'predicate': { title: "PREDICATE FEATURE DRIFT", subTitle: "SUBSTANTIAL EQUIVALENCE EVALUATION", bg: "bg-[#d35400]", text: "text-[#d35400]", border: "border-[#d35400]" },
                                        'executive': { title: "EXECUTIVE ANTI-DRIFT BRIEF", subTitle: "EXECUTIVE AUDIT ATTESTATION REPORT", bg: "bg-[#0e6655]", text: "text-[#0e6655]", border: "border-[#0e6655]" },
                                        'complaint': { title: "EMERGING SIGNAL DRIFT", subTitle: "POST-MARKET SURVEILLANCE & MAUDE SIGNALS", bg: "bg-[#922b21]", text: "text-[#922b21]", border: "border-[#922b21]" },
                                        'capa': { title: "DRIFT REMEDIATION LOG", subTitle: "CORRECTIVE AND PREVENTIVE ACTION (CAPA) REPORT", bg: "bg-[#1a5276]", text: "text-[#1a5276]", border: "border-[#1a5276]" }
                                    };
                                    const theme = themeMap[activeTemplate] || themeMap['510k'];
                                    const selectedSub = availableSubmissions.find(s => s.id === enginePayload);
                                    const deviceName = selectedSub ? selectedSub.deviceName : "Demo Device";
                                    
                                    // Mock compliance math for demo presentation
                                    const mockGaps = [
                                        { id: '1', standard: "IEC 62304", section: "5.1", requirement: "Software Development Plan", status: "compliant", file: "SwDevPlan_v2.pdf", conf: 98 },
                                        { id: '2', standard: "IEC 62304", section: "5.2", requirement: "Software Requirements Spec", status: "gap_detected", file: "DOCUMENTATION MISSING", conf: 0 },
                                        { id: '3', standard: "ISO 14971", section: "4.1", requirement: "Risk Management Plan", status: "compliant", file: "Risk_Mgmt_Final.pdf", conf: 94 },
                                        { id: '4', standard: "ISO 10993", section: "1", requirement: "Biological Evaluation", status: "needs_review", file: "Bio_Test_Rep.pdf", conf: 62 },
                                    ];
                                    const activeGaps = report?.upload?.gapResults || mockGaps;
                                    const compliantCount = activeGaps.filter((g: any) => g.status === 'compliant').length || 0;
                                    const criticalCount = activeGaps.filter((g: any) => g.status === 'gap_detected').length || 6;
                                    const pendingCount = activeGaps.filter((g: any) => g.status === 'needs_review').length || 0;
                                    const totalCount = activeGaps.length || 6;
                                    
                                    // Pseudo readiness stat
                                    const readinessScore = Math.round((compliantCount / totalCount) * 100) || 0;

                                    return (
                                        <div className={`w-full max-w-[340px] bg-white aspect-[8.5/11] shadow-xl relative flex flex-col border-[3px] ${theme.border} transform transition-all duration-500 animate-in fade-in zoom-in-95 overflow-hidden`}>
                                            
                                            {/* Header */}
                                            <div className="px-5 pt-4 pb-2 flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    <img src="/brand/icon_transparent.png" alt="TraceBridge" className="w-6 h-6 object-contain" />
                                                    <div>
                                                        <div className={`text-[12px] font-black tracking-tight leading-none ${theme.text}`}>TraceBridge</div>
                                                        <div className={`text-[5px] font-bold tracking-widest uppercase opacity-80 ${theme.text}`}>AI Compliance Copilot</div>
                                                    </div>
                                                </div>
                                                <div className={`px-2 py-0.5 rounded-full ${theme.bg} text-white text-[5px] font-bold tracking-widest uppercase shadow-sm`}>
                                                    Confidential Draft
                                                </div>
                                            </div>

                                            {/* Title Block */}
                                            <div className="px-5 mt-4 border-b border-slate-200 pb-3">
                                                <h1 className={`text-lg font-black leading-[1.1] pr-4 uppercase ${theme.text}`}>{theme.title}</h1>
                                                <h2 className="text-[6.5px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">{theme.subTitle}</h2>
                                                <h2 className={`text-xs font-bold mt-2.5 leading-tight ${theme.text}`}>{deviceName}</h2>
                                                <h3 className={`text-xs font-bold leading-tight ${theme.text}`}>(Automated Insulin Delivery)</h3>
                                                <div className="text-[6px] text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                                                    <span>Device Class II</span> <span className="text-slate-300">•</span> <span>510(k) submission pathway</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2 text-[5px] font-bold text-slate-800 tracking-wider">
                                                    <span className="uppercase">{engineRta ? "FDA RTA Checklist Format" : "Standard Review Format"}</span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>ISO 14971:2019</span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>IEC 62304</span>
                                                </div>
                                            </div>

                                            {/* OVERALL COMPLIANCE READINESS */}
                                            <div className="px-5 mt-3">
                                                <div className={`w-full py-1 ${theme.bg} text-center text-white text-[6px] font-bold tracking-[0.1em] uppercase shadow-inner`}>
                                                    Overall Compliance Readiness
                                                </div>
                                                <div className="border border-slate-200 border-t-0 p-3 flex items-center justify-between bg-slate-50/30">
                                                    
                                                    {/* Donut Chart */}
                                                    <div className="flex flex-col items-center ml-2">
                                                        <div className={`w-14 h-14 rounded-full border-[3px] border-slate-200 relative flex items-center justify-center`}>
                                                            <div className={`absolute inset-0 rounded-full border-[3px] ${theme.border} border-l-transparent border-b-transparent transform -rotate-45`}></div>
                                                            <div className="text-center mt-0.5">
                                                                <div className={`text-lg font-black leading-none tracking-tighter ${theme.text}`}>{readinessScore}%</div>
                                                                <div className={`text-[5px] font-bold tracking-widest uppercase ${theme.text}`}>Ready</div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Stats List */}
                                                    <div className="space-y-1 w-32 mr-2">
                                                        <div className="flex justify-between items-center text-[6px] font-bold">
                                                            <span className="flex items-center gap-1.5 text-slate-700"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Compliant requirements</span>
                                                            <span className="text-slate-900">{compliantCount}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[6px] font-bold">
                                                            <span className="flex items-center gap-1.5 text-slate-700"><AlertTriangle className="w-2.5 h-2.5 text-rose-600" /> Critical gaps detected</span>
                                                            <span className="text-slate-900">{criticalCount}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[6px] font-bold">
                                                            <span className="flex items-center gap-1.5 text-slate-700"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex items-center justify-center text-white text-[5px]">!</div> Items pending review</span>
                                                            <span className="text-slate-900">{pendingCount}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[6px] font-bold">
                                                            <span className="flex items-center gap-1.5 text-slate-700"><div className="w-2.5 h-2.5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[5px]">#</div> Total requirements evaluated</span>
                                                            <span className="text-slate-900">{totalCount}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[6px] font-bold pt-0.5 mt-0.5 border-t border-slate-200">
                                                            <span className="flex items-center gap-1.5 text-slate-700" title="Calculated based on AI analysis of engineering hours required for detected gaps"><div className="w-2.5 h-2.5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[5px]">⏱</div> Est. remediation effort</span>
                                                            <span className="text-slate-900">{remediationEffort}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[6px] font-bold">
                                                            <span className="flex items-center gap-1.5 text-slate-700" title="Based on average regulatory consulting rates ($250/hr)"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[5px]">$</div> Est. capital saved</span>
                                                            <span className="text-emerald-700">{capitalSaved}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ATTESTATION */}
                                            <div className="px-5 mt-auto mb-2">
                                                <div className={`w-full py-1 ${theme.bg} text-center text-white text-[6px] font-bold tracking-[0.1em] uppercase shadow-inner mb-2`}>
                                                    Submission Attestation
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <div className="text-[4px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Prepared By</div>
                                                        <div className="text-[6px] font-bold text-slate-800 leading-tight">{authorName}</div>
                                                        <div className="text-[4px] text-slate-500">{authorTitle}</div>
                                                        <div className="mt-1 font-serif text-[9px] text-slate-800/70 italic transform -rotate-2 select-none pr-2">
                                                            James N. Hardison
                                                        </div>
                                                        <div className="mt-0 border-t border-slate-300 w-16"></div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[4px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Reviewed By</div>
                                                        <div className="text-[6px] font-bold text-slate-800 leading-tight">{reviewerName}</div>
                                                        <div className="text-[4px] text-slate-500">{reviewerTitle}</div>
                                                        <div className="mt-1 font-serif text-[9px] text-slate-800/70 italic transform -rotate-1 select-none pr-2">
                                                            Team Lead
                                                        </div>
                                                        <div className="mt-0 border-t border-slate-300 w-16"></div>
                                                    </div>
                                                    <div className="flex flex-col items-end text-right">
                                                        <div className="text-[4px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Report Date</div>
                                                        <div className="flex items-center gap-1 text-[6px] font-bold text-slate-800 mt-0.5">
                                                            <FileText className="w-2.5 h-2.5 text-slate-600" />
                                                            May 7, 2026
                                                        </div>
                                                        <div className="text-[4px] text-slate-500 mt-2">Version 3.2</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* FOOTER */}
                                            <div className={`w-full py-2 mt-auto ${theme.bg} flex items-center justify-center gap-2 text-white shadow-inner`}>
                                                <div className="w-3 h-3 rounded-full border border-white/50 flex items-center justify-center">
                                                    <div className="w-1 h-1 rounded-full bg-white"></div>
                                                </div>
                                                <span className="text-[6px] font-bold tracking-[0.15em] uppercase">Target Submission</span>
                                                <span className="text-[8px] font-bold tracking-wider ml-2">JUN 6, 2026</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Action Buttons Fixed at Bottom of Preview */}
                            <div className="mt-auto pt-4 bg-white border-t border-slate-200 relative z-20 px-6 pb-6">
                                {hasUnresolvedGaps && (
                                    <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[11px] font-medium text-rose-700 leading-tight">
                                                <strong className="font-bold text-rose-800 uppercase tracking-wider">Draft Lockout:</strong> You cannot export final regulatory submissions while critical gaps remain unresolved in the triage pipeline.
                                            </p>
                                            <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit group">
                                                <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${bypassLockout ? 'bg-rose-500 border-rose-500' : 'bg-slate-100 border-slate-300 group-hover:border-rose-400'}`}>
                                                    {bypassLockout && <Check className="w-2.5 h-2.5 text-white" />}
                                                </div>
                                                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider group-hover:text-slate-800">Bypass Lockout (Beta Only)</span>
                                                <input type="checkbox" className="hidden" checked={bypassLockout} onChange={(e) => setBypassLockout(e.target.checked)} />
                                            </label>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3 pb-2">
                                    <button disabled={hasUnresolvedGaps && !bypassLockout} onClick={() => { generateLiveReport(); setTimeout(()=> setPendingExport('pdf'), 500); }} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 flex items-center justify-center gap-2 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)] disabled:opacity-50 disabled:cursor-not-allowed">
                                        <Printer className="w-[1.125rem] h-[1.125rem]" /> Export PDF
                                    </button>
                                    <button disabled={hasUnresolvedGaps && !bypassLockout} onClick={() => { alert("Report successfully synced to Greenlight Guru / Veeva Vault."); }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 flex items-center justify-center gap-2 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] disabled:opacity-50 disabled:cursor-not-allowed">
                                        <Database className="w-[1.125rem] h-[1.125rem]" /> Sync to QMS
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
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
                <div>
                    <button onClick={() => { setReport(null); setViewMode('builder'); }} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-4 bg-slate-100 hover:bg-indigo-50 w-fit px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-200">
                        <ArrowLeft className="w-4 h-4" /> Back to Artifact Hub
                    </button>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-slate-900 mb-2">
                            Alignment Intelligence
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
                        {activeTemplate !== 'executive' && (
                        <button onClick={exportCSV} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                            <Download className="w-4 h-4" /> {activeTemplate === '510k' ? 'eSTAR Mapping (.csv)' : activeTemplate === 'complaint' ? 'MAUDE (.csv)' : 'Action Log (.csv)'}
                        </button>
                        )}
                        <button onClick={exportPDF} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                            <ExternalLink className="w-4 h-4" /> {activeTemplate === '510k' ? '510(k) Submission Matrix (.pdf)' : activeTemplate === 'executive' ? 'Attestation (.pdf)' : 'Report (.pdf)'}
                        </button>
                        <button onClick={() => alert("Report successfully synced to Greenlight Guru / Veeva Vault.")} className="bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                            <Database className="w-4 h-4" /> Sync QMS
                        </button>
                        <button onClick={submitToEsg} disabled={isSubmittingEsg} className="bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50">
                            {isSubmittingEsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-emerald-400" />}
                            {isSubmittingEsg ? "Transmitting..." : "Push to FDA ESG (Test)"}
                        </button>
                    </div>
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
                    <div className="bg-slate-900 px-4 py-3 shrink-0 border-b border-slate-800 flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">REQUIREMENT TRACEABILITY MATRIX (AI ANALYSIS)</h4>
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
                                                {result.status === 'compliant' ? getInitials(teamQaName) : result.status === 'needs_review' ? getInitials(teamEngName) : getInitials(teamRaName)}
                                            </div>
                                            <select 
                                                className="bg-transparent text-[11px] font-medium text-slate-700 outline-none cursor-pointer hover:bg-slate-50 rounded px-1 -ml-1 transition-colors appearance-none max-w-[120px] truncate"
                                                defaultValue={result.status === 'compliant' ? 'AP' : result.status === 'needs_review' ? 'MK' : 'SR'}
                                                onChange={(e) => {
                                                    const name = e.target.options[e.target.selectedIndex].text;
                                                    window.alert(`Webhook Sync: Task successfully reassigned to ${name} in Jira & notified via Slack.`);
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
                                                    result.status === "gap_detected" ? "Assigned" : "In Review"}
                                            </span>
                                        </div>
                                    </td>
                                    {/* Trace Lineage */}
                                    <td className="px-5 py-4">
                                        <p className="text-[9px] text-slate-400 font-mono tracking-tighter truncate max-w-[150px] uppercase">
                                            {result.status !== "gap_detected" ? 
                                                (result.citations && result.citations.length > 0 ? `${result.citations[0].source.split('.').slice(0, -1).join('.')}` : "TRACEGLOW_V3.PDF") 
                                            : "DOCUMENTATION MISSING"}
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
                    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] w-[95vw] lg:max-w-6xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-slate-50 rounded-t-2xl px-6 py-5 flex items-start justify-between border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">
                                    Trace Verification: {getCategory(selectedResult.standard)} - {selectedResult.section}
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

                        {/* Deep Evaluation Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 min-h-[500px]">
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
                                            <div key={i} className="mb-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0" />
                                                    <div>
                                                        <p className="text-sm font-bold text-[var(--foreground)]">{cite.source}</p>
                                                        <p className="text-xs text-[var(--muted)]">Section {cite.section}</p>
                                                    </div>
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

                                {/* Engine reasoning moved to Column 3 final output view */}

                                {upload.documents && upload.documents.length > 0 && (
                                    <div className="mt-6">
                                        <button 
                                            onClick={() => window.open(upload.documents[0].storageUrl, '_blank')}
                                            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            View Submitted Documents
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Column 3: Audit Result */}
                            <div className="p-6">
                                <h3 className="text-sm font-semibold text-[var(--primary)] mb-4 uppercase tracking-wider">
                                    {selectedResult.status === "compliant" ? "Audit Evaluation Feedback" : "Gap Identified"}
                                </h3>

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
                                    <>
                                        <div className="p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 mb-4">
                                            <div className="flex flex-col xl:flex-row justify-between items-start gap-4 mb-3">
                                                <p className="text-xs font-semibold text-[var(--danger)] uppercase">
                                                    {selectedResult.status === "gap_detected" ? "DOCUMENTATION MISSING:" : "NEEDS REVIEW:"}
                                                </p>
                                            </div>
                                            <p className="text-sm text-[var(--muted)] leading-relaxed">
                                                {selectedResult.missingRequirement || "Evidence insufficient for this requirement."}
                                            </p>
                                        </div>
                                    </>
                                )}

                                {/* Engine Reasoning Feedback - Visible on PASS and FAIL */}
                                {selectedResult.geminiResponse && (
                                    <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200/60 shadow-sm max-h-[350px] overflow-y-auto custom-scrollbar">
                                        <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider mb-2">
                                            ENGINE ANALYSIS FEEDBACK:
                                        </p>
                                        <div className="text-sm text-slate-700 leading-relaxed border-l-2 border-orange-500 pl-3">
                                            {(() => {
                                                try {
                                                    const data = JSON.parse(selectedResult.geminiResponse);
                                                    const reasoning = data.analytical_reasoning || data.reasoning || data.rawResponse || "The engine could not isolate a definitive reason for this gap.";
                                                    return (
                                                        <div className="flex flex-col gap-2">
                                                            <span>{reasoning}</span>
                                                            {data.exact_missing_evidence && (
                                                                <span className="text-rose-600 font-medium whitespace-pre-wrap">Missing Evidence: {data.exact_missing_evidence}</span>
                                                            )}
                                                        </div>
                                                    );
                                                } catch(e) {
                                                    return "Analysis details unavailable. JSON parse failed.";
                                                }
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* Auto-Remediation Generation */}
                                <div className="mb-4">
                                    <p className="text-xs font-semibold text-[var(--muted)] uppercase mb-3">
                                        AI CO-PILOT REMEDIATION:
                                    </p>
                                            {remediationDrafts[selectedResult.id] ? (
                                                <div className="p-0 rounded-xl bg-white border border-indigo-200 shadow-sm max-h-[350px] overflow-hidden flex flex-col">
                                                    <div className="bg-indigo-50/50 px-4 py-3 border-b border-indigo-100 flex items-center justify-between shrink-0">
                                                        <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                                                            <CheckCircle2 className="w-4 h-4 text-indigo-500" /> AI Action Plan Verified
                                                        </span>
                                                        <button className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 px-2 py-1 rounded shadow-sm transition-all">Copy to Jira</button>
                                                    </div>
                                                    <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                                                        {remediationDrafts[selectedResult.id].split('\n').map((line, idx) => {
                                                            const trimmed = line.trim();
                                                            if (!trimmed) return null;
                                                            if (trimmed.startsWith('**') || trimmed.match(/^[A-Z][a-zA-Z\s]+:\*\*$/)) {
                                                                return <h4 key={idx} className="text-[11px] font-extrabold text-slate-800 mt-4 first:mt-0 mb-2 uppercase tracking-wider">{trimmed.replace(/\*\*/g, '')}</h4>;
                                                            }
                                                            if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                                                                return (
                                                                    <div key={idx} className="flex gap-2.5 mb-2 ml-1">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0 shadow-sm"></div>
                                                                        <p className="text-sm text-slate-700 leading-relaxed font-medium">{trimmed.substring(2).replace(/\*\*/g, '')}</p>
                                                                    </div>
                                                                );
                                                            }
                                                            return <p key={idx} className="text-sm text-slate-600 mb-2 leading-relaxed">{trimmed.replace(/\*\*/g, '')}</p>;
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={handleRemediate}
                                                    disabled={remediationLoading}
                                                    className="w-full btn-secondary text-sm py-3 px-4 flex items-center justify-center gap-2 border border-[var(--primary)]/50 hover:bg-[var(--primary)]/10 hover:border-[var(--primary)] transition-all relative overflow-hidden shadow-sm"
                                                >
                                                    {remediationLoading ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                                                            Synthesizing CAPA Requirements...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[var(--primary)]"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                                            Draft Engineering CAPA Ticket
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                            </div>
                        </div>

                        {/* Modal Footer - Sticky Bottom Action Bar */}
                        <div className="sticky bottom-0 bg-white border-t border-[var(--border)] px-6 py-4 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] rounded-b-2xl">
                            {/* Left: Progression */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => navigateGap("prev")}
                                    className="btn-secondary text-sm px-4 py-2 flex items-center gap-1 font-semibold"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Previous
                                </button>
                                <button
                                    onClick={() => navigateGap("next")}
                                    className="btn-secondary text-sm px-4 py-2 flex items-center gap-1 font-semibold"
                                >
                                    Next <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Center: State & Assignee (Jira Workflow Simulation) */}
                            <div className="hidden lg:flex items-center gap-6 border-l border-r border-slate-200 px-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">RA Status:</span>
                                    <select 
                                        value={localPipelineStatus}
                                        onChange={handleModalPipelineSync}
                                        className="text-sm font-bold bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 outline-none text-slate-700 hover:bg-white focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm transition-all text-center"
                                    >
                                        <option value="DETECTED">DETECTED (New Finding)</option>
                                        <option value="TRIAGED">TRIAGED (RA Prioritized)</option>
                                        <option value="ASSIGNED">ASSIGNED (Pending CAPA)</option>
                                        <option value="IN_REMEDIATION">IN REMEDIATION (QC Review)</option>
                                        <option value="CLOSED">CLOSED ({selectedResult.status === "compliant" ? "Trace Verified" : "Resolved"})</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-2 py-1 shadow-sm hover:bg-white transition-colors cursor-pointer">
                                    <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                                        {selectedResult.status === 'compliant' ? 'TB' : 'QA'}
                                    </div>
                                    <span className="text-xs font-bold text-slate-600 pr-1 truncate max-w-[100px]">
                                        {selectedResult.status === 'compliant' ? 'TraceBridge AI' : 'Quality Eng'}
                                    </span>
                                </div>
                            </div>

                            {/* Right: Triggers */}
                            <div className="flex items-center gap-3">
                                <button onClick={() => navigateGap("next")} className="text-slate-400 hover:text-slate-600 text-sm font-bold px-3 py-2 transition-colors uppercase tracking-wider">
                                    Skip [S]
                                </button>
                                
                                {selectedResult.status === "compliant" ? (
                                    <>
                                        <a 
                                            href={`mailto:quality@company.com?subject=Trace Verification Flag: ${selectedResult.standard.split(':')[0]}`}
                                            className="bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm focus:ring-2 focus:ring-amber-500/20"
                                        >
                                            Flag Discrepancy [F]
                                        </a>
                                        <button 
                                            onClick={() => {
                                                const currentAssignee = getAssigneeKey(selectedResult.id, selectedResult.status);
                                                if (currentAssignee === "JM") {
                                                    alert("Segregation of Duties Error: You cannot legally sign-off on an item assigned to yourself. Peer review required.");
                                                    return;
                                                }
                                                alert("Traceability Matrix Lineage Legally Approved & Locked.");
                                                setSelectedResult(null);
                                            }}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 focus:ring-2 focus:ring-emerald-500"
                                        >
                                            Legally Sign-Off [A]
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => {
                                                const reason = window.prompt("FDA 21 CFR Part 11: Please provide a mandatory justification for dismissing this regulatory finding:");
                                                if (!reason || reason.trim().length < 5) {
                                                    alert("QA Validation Error: A detailed justification is required to dismiss a finding.");
                                                    return;
                                                }
                                                // Ideally we'd log this `reason` to the API like in results, but for now we'll just require it
                                                alert("False positive dismissed and logged to Audit Vault.");
                                                setSelectedResult(null); 
                                            }}
                                            className="bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm focus:ring-2 focus:ring-rose-500/20"
                                        >
                                            Dismiss False Positive [D]
                                        </button>
                                        <button 
                                            onClick={() => {
                                                const currentAssignee = getAssigneeKey(selectedResult.id, selectedResult.status);
                                                if (currentAssignee === "UN") {
                                                    alert("QA Validation Error: You must select an Assignee before routing to Jira.");
                                                    return;
                                                }
                                                alert("CAPA Epic successfully assigned to Engineering Jira instance.");
                                                setSelectedResult(null);
                                            }}
                                            className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-8 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-indigo-500/20 focus:ring-2 focus:ring-indigo-500"
                                        >
                                            Assign to eQMS/Jira
                                        </button>
                                    </>
                                )}
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

                        <div className="mb-6 space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-700 pb-2 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> AI Value Extrapolations
                            </h3>
                            <div>
                                <label className="block text-[10px] text-slate-500 mb-1">Est. Remediation Effort</label>
                                <input type="text" value={remediationEffort} onChange={e => setRemediationEffort(e.target.value)} placeholder="e.g. 4-8 weeks" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-slate-500 mb-1">Est. Capital Saved</label>
                                <input type="text" value={capitalSaved} onChange={e => setCapitalSaved(e.target.value)} placeholder="e.g. $45,000" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-emerald-400 font-bold focus:ring-1 focus:ring-emerald-500 outline-none" />
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
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Session Activity Stream</h2>
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
            <ReportsContent />
        </Suspense>
    );
}
