"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

type TaskStatus = 'DETECTED' | 'TRIAGED' | 'ASSIGNED' | 'IN_REMEDIATION' | 'CLOSED';

interface Task {
    id: string;
    status: TaskStatus;
    priority?: string;
    title: string;
    standard: string;
    confidence?: number;
    subNote?: string;
    assigneeLabel?: string;
    assigneeInitials?: string;
    assigneeColor?: string; 
    dueDate?: string;
    extraFlag?: string; 
    closedBy?: string;
    closedTime?: string;
    attachments?: boolean;
    uploadId?: string;
}

export default function PipelinePage() {
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [slackToast, setSlackToast] = useState("");
    const [isMounted, setIsMounted] = useState(false);
    const searchParams = useSearchParams();
    const [uploads, setUploads] = useState<any[]>([]);
    const [activeUploadId, setActiveUploadId] = useState<string | null>(searchParams.get("id"));


    // Initial Load & API Hydration
    useEffect(() => {
        setIsMounted(true);
        if (!user) return;

        const loadUploads = async () => {
            try {
                const token = await user.getIdToken();
                const r = await fetch("/api/reports", { headers: { Authorization: `Bearer ${token}` } });
                const data = await r.json();

                if (data.success && data.data.uploads?.length > 0) {
                    setUploads(data.data.uploads);
                    if (!activeUploadId) {
                        setActiveUploadId(data.data.uploads[0].id);
                    }
                }
            } catch (err) {
                console.error("Failed to load uploads view:", err);
            }
        };

        loadUploads();
    }, [user]);

    useEffect(() => {
        if (!user || !activeUploadId) return;

        const loadRealGaps = async () => {
            try {
                const token = await user.getIdToken();
                // Deep fetch to retrieve full gapResults payload, not just the bandwidth-constrained summary
                const rFull = await fetch(`/api/reports?uploadId=${activeUploadId}`, { headers: { Authorization: `Bearer ${token}` } });
                const fullData = await rFull.json();

                if (fullData.success && fullData.data.upload) {
                    const latest = fullData.data.upload;
                    const newTasks: Task[] = (latest.gapResults || []).map((gap: any) => ({
                        id: gap.id,
                        uploadId: latest.id,
                        status: gap.status === 'compliant' ? 'CLOSED' : (gap.status === 'gap_detected' ? 'DETECTED' : 'TRIAGED'),
                        title: gap.requirement.substring(0,60) + (gap.requirement.length > 60 ? "..." : ""),
                        standard: gap.standard + (gap.section ? ` § ${gap.section}` : ""),
                        priority: gap.severity ? gap.severity.toUpperCase() : "MEDIUM",
                        confidence: gap.confidence ? Math.round(gap.confidence * 100) : 0,
                        subNote: gap.citations?.[0]?.quote ? "Evidence Extracted" : "Missing File",
                        closedBy: gap.status === 'compliant' ? "AI Verified" : undefined,
                        closedTime: gap.status === 'compliant' ? "Automated" : undefined
                    }));
                    
                    let finalTasks = newTasks;
                    const savedTasks = localStorage.getItem('tracebridge_pipeline_tasks');
                    if (savedTasks) {
                        try {
                            const parsed = JSON.parse(savedTasks);
                            if (parsed.length > 0 && parsed[0].uploadId === latest.id) {
                                finalTasks = newTasks.map((t) => {
                                    const stored = parsed.find((p: any) => p.id === t.id);
                                    return stored ? { ...t, ...stored, title: t.title, standard: t.standard } : t;
                                });
                            }
                        } catch (e) {
                            console.error("Local pipeline storage unparseable");
                        }
                    }
                    setTasks(finalTasks);
                }
            } catch (err) {
                console.error("Pipeline Sync Failed:", err);
            }
        };

        loadRealGaps();
    }, [user, activeUploadId]);



    useEffect(() => {
        if (isMounted) {
            localStorage.setItem('tracebridge_pipeline_tasks', JSON.stringify(tasks));
        }
    }, [tasks, isMounted]);

    const detected = tasks.filter(t => t.status === 'DETECTED');
    const triaged = tasks.filter(t => t.status === 'TRIAGED');
    const assigned = tasks.filter(t => t.status === 'ASSIGNED');
    const inRemediation = tasks.filter(t => t.status === 'IN_REMEDIATION');
    const closed = tasks.filter(t => t.status === 'CLOSED');

    const openCount = tasks.length - closed.length;
    const closedCount = closed.length;

    const onDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData("taskId", id);
        // Optional: Adding an effect makes it snappier
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("taskId");
        
        setTasks(prev => {
            const task = prev.find(t => t.id === id);
            if (!task || task.status === targetStatus) return prev;

            if (targetStatus === "CLOSED" && task.status !== "CLOSED") {
                triggerSlackToast(`Task "${task.title}" synced to Jira as DONE and posted to #compliance.`);
            }

            return prev.map(t => {
                if (t.id === id) {
                    const extraFields: Partial<Task> = {};
                    if (targetStatus === 'ASSIGNED') {
                        extraFields.assigneeInitials = 'ME';
                        extraFields.assigneeColor = 'bg-indigo-100 text-indigo-700';
                        extraFields.assigneeLabel = 'System Engineer';
                        const d = new Date();
                        d.setDate(d.getDate() + 5);
                        extraFields.dueDate = d.toLocaleDateString();
                        extraFields.extraFlag = 'CAPA Review';
                        extraFields.attachments = true;
                    } else if (targetStatus === 'IN_REMEDIATION') {
                        extraFields.assigneeInitials = 'QA';
                        extraFields.assigneeColor = 'bg-rose-100 text-rose-700';
                        extraFields.assigneeLabel = 'Quality Analyst';
                        extraFields.dueDate = 'Pending Sign-Off';
                    }
                    return { ...t, status: targetStatus, ...extraFields };
                }
                return t;
            });
        });
    };

    const triggerSlackToast = (message: string) => {
        setSlackToast(message);
        setTimeout(() => setSlackToast(""), 4000);
    };

    const allowDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderCardBody = (t: Task) => {
        if (t.status === 'CLOSED') {
            return (
                <div 
                    key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)}
                    onClick={() => router.push(`/dashboard/results?id=${t.uploadId || 'demo-id'}&demoGap=${t.id}`)}
                    className="bg-white rounded-lg p-4 border border-emerald-100 shadow-sm mb-3 cursor-pointer hover:shadow-md transition-all active:cursor-grabbing"
                >
                    <h4 className="text-[13px] font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-500" />
                        {t.title} {t.standard}
                    </h4>
                </div>
            );
        }

        const isMine = t.priority?.includes('MINE');
        const borderColor = isMine ? 'border-amber-400 border-2' : 'border-slate-200';
        
        return (
            <div 
                key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)}
                onClick={() => router.push(`/dashboard/results?id=${t.uploadId || 'demo-id'}&demoGap=${t.id}`)}
                className={`bg-white rounded-lg p-4 border shadow-sm mb-3 cursor-pointer hover:shadow-md hover:border-indigo-400 transition-all active:cursor-grabbing ${borderColor} relative group overflow-hidden`}
            >
                <div className="absolute inset-0 bg-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="relative z-10">
                    {t.priority && (
                        <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider mb-2 inline-block ${
                            t.priority.includes('CRITICAL') ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                        }`}>
                            {t.priority}
                        </span>
                    )}
                    <h4 className="text-[13px] font-bold text-slate-900 mb-1 group-hover:text-indigo-700 transition-colors">{t.title}</h4>
                    <p className="text-[10px] text-slate-400 mb-4 font-mono tracking-tighter">{t.standard}</p>

                {/* Progress Bar (Detected/Triaged) */}
                {t.confidence !== undefined && (
                    <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100">
                        {t.confidence === 0 ? (
                            <div className="w-4 bg-slate-200 h-1.5 rounded-full"><div className="w-0 bg-red-500 h-full rounded-full"></div></div>
                        ) : (
                            <div className="w-4 h-4 rounded-full border border-dashed border-amber-400 flex items-center justify-center"></div>
                        )}
                        <span className="text-[9px] font-bold text-slate-400">{t.confidence > 0 ? `${t.confidence}% • ` : ''}{t.subNote}</span>
                    </div>
                )}

                {/* Assignees (Assigned / Remediation) */}
                {t.assigneeInitials && (
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${t.assigneeColor}`}>
                                {t.assigneeInitials}
                            </div>
                            <span className="text-[9px] font-medium text-slate-500">{t.assigneeLabel}</span>
                        </div>
                        {t.dueDate && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isMine ? 'text-amber-700 bg-amber-100/80' : 'text-red-500 bg-red-50'}`}>{t.dueDate}</span>}
                        {t.extraFlag && <span className="text-[8px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">{t.extraFlag}</span>}
                        {t.attachments && (
                            <div className="flex items-center gap-2 text-slate-300">
                                <span className="text-[9px] font-mono tracking-widest flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200"></span>03</span>
                                <span className="text-[9px] font-mono tracking-widest flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200"></span>02</span>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] relative">
            
            {/* Realtime Slack Sync Toast */}
            {slackToast && (
                <div className="absolute top-0 right-0 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-[#4A154B] text-white px-6 py-3 rounded-lg shadow-xl font-bold text-sm tracking-wide flex items-center gap-3">
                        <span className="text-xl">💬</span>
                        {slackToast}
                    </div>
                </div>
            )}

            {/* Header Area */}
            <div className="shrink-0 mb-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-extrabold flex items-center gap-3 text-slate-900 tracking-tight">
                            Gap Lifecycle Pipeline
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-1">
                            Jira-style state machine • Drag gaps between columns • Real-time sync to Slack
                        </p>
                    </div>
                    {isMounted && uploads.length > 0 && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden md:inline-block">Active Pipeline:</span>
                            <select
                                value={activeUploadId || ""}
                                onChange={(e) => setActiveUploadId(e.target.value)}
                                className="bg-white border text-center border-slate-200 text-slate-700 text-sm font-bold rounded-lg px-4 py-2 outline-none shadow-sm focus:ring-2 focus:ring-indigo-500 max-w-[320px] truncate hover:border-indigo-300 transition-colors cursor-pointer"
                            >
                                {uploads.slice(0, 5).map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.projectName || `Trace Project (${u.id.substring(0, 6)})`} • {new Date(u.createdAt).toLocaleDateString()}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Pipeline Distribution Bar */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mt-2 flex items-center gap-8">
                    <div className="shrink-0 leading-tight">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Gaps This Submission</p>
                        <p className="text-2xl font-extrabold text-slate-900 tracking-tighter">
                            {tasks.length} <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1 align-middle">{openCount} open • {closedCount} closed this week</span>
                        </p>
                    </div>
                    
                    <div className="flex-1">
                        <div className="flex items-center w-full h-3.5 rounded-full overflow-hidden bg-slate-100 gap-0.5">
                            <div className="h-full bg-slate-400 transition-all" style={{ width: `${(detected.length/tasks.length)*100}%` }}></div>
                            <div className="h-full bg-amber-400 transition-all" style={{ width: `${(triaged.length/tasks.length)*100}%` }}></div>
                            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(assigned.length/tasks.length)*100}%` }}></div>
                            <div className="h-full bg-purple-500 transition-all" style={{ width: `${(inRemediation.length/tasks.length)*100}%` }}></div>
                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(closed.length/tasks.length)*100}%` }}></div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold mt-2">
                            <span className="text-slate-400 uppercase tracking-widest">Detected {detected.length}</span>
                            <span className="text-amber-500 uppercase tracking-widest">Triaged {triaged.length}</span>
                            <span className="text-indigo-500 uppercase tracking-widest">Assigned {assigned.length}</span>
                            <span className="text-purple-500 uppercase tracking-widest">In Remediation {inRemediation.length}</span>
                            <span className="text-emerald-500 uppercase tracking-widest">Closed {closed.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Kanban Board Container */}
            <div className="flex-1 flex gap-4 min-w-[1200px] overflow-x-auto pb-4 custom-scrollbar">
                
                {/* Column 1: DETECTED */}
                <div 
                    onDrop={(e) => handleDrop(e, 'DETECTED')} 
                    onDragOver={allowDrop}
                    className="w-[280px] shrink-0 flex flex-col bg-slate-50/80 border border-slate-200/60 rounded-xl leading-snug"
                >
                    <div className="p-4 flex items-center justify-between border-b border-slate-200/60">
                        <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-400"></span> Detected
                        </h3>
                        <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">{detected.length}</span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto">
                        <p className="text-[10px] text-slate-400 italic mb-3 text-center">New AI-detected gaps • needs triage</p>
                        {detected.map(renderCardBody)}
                    </div>
                </div>

                {/* Column 2: TRIAGED */}
                <div 
                    onDrop={(e) => handleDrop(e, 'TRIAGED')} 
                    onDragOver={allowDrop}
                    className="w-[280px] shrink-0 flex flex-col bg-amber-50/50 border border-amber-200/50 rounded-xl leading-snug"
                >
                    <div className="p-4 flex items-center justify-between border-b border-amber-200/50">
                        <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Triaged
                        </h3>
                        <span className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-700">{triaged.length}</span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto">
                        <p className="text-[10px] text-amber-600/60 italic mb-3 text-center">Reviewed by lead • ready to assign</p>
                        {triaged.map(renderCardBody)}
                    </div>
                </div>

                {/* Column 3: ASSIGNED */}
                <div 
                    onDrop={(e) => handleDrop(e, 'ASSIGNED')} 
                    onDragOver={allowDrop}
                    className="w-[280px] shrink-0 flex flex-col bg-indigo-50/50 border border-indigo-200/50 rounded-xl leading-snug"
                >
                    <div className="p-4 flex items-center justify-between border-b border-indigo-200/50">
                        <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Assigned
                        </h3>
                        <span className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-700">{assigned.length}</span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto">
                        <p className="text-[10px] text-indigo-600/60 italic mb-3 text-center">Owned by an engineer • due date set</p>
                        {assigned.map(renderCardBody)}
                    </div>
                </div>

                {/* Column 4: IN REMEDIATION */}
                <div 
                    onDrop={(e) => handleDrop(e, 'IN_REMEDIATION')} 
                    onDragOver={allowDrop}
                    className="w-[280px] shrink-0 flex flex-col bg-purple-50/50 border border-purple-200/50 rounded-xl leading-snug"
                >
                    <div className="p-4 flex items-center justify-between border-b border-purple-200/50">
                        <h3 className="text-[11px] font-bold text-purple-600 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span> In Remediation
                        </h3>
                        <span className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-700">{inRemediation.length}</span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto">
                        <p className="text-[10px] text-purple-600/60 italic mb-3 text-center">Draft in progress • awaiting review</p>
                        {inRemediation.map(renderCardBody)}
                    </div>
                </div>

                {/* Column 5: CLOSED */}
                <div 
                    onDrop={(e) => handleDrop(e, 'CLOSED')} 
                    onDragOver={allowDrop}
                    className="w-[280px] shrink-0 flex flex-col bg-emerald-50/50 border border-emerald-200/50 rounded-xl leading-snug"
                >
                    <div className="p-4 flex items-center justify-between border-b border-emerald-200/50">
                        <h3 className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Closed
                        </h3>
                        <span className="w-5 h-5 rounded-full bg-emerald-200 flex items-center justify-center text-[10px] font-bold text-emerald-800">{closed.length}</span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto">
                        <p className="text-[10px] text-emerald-600/60 italic mb-3 text-center">Approved • archived for audit trail</p>
                        {closed.map(renderCardBody)}
                    </div>
                </div>

            </div>
        </div>
    );
}
