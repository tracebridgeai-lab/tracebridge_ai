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
    const [isLoading, setIsLoading] = useState(true);


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
                    } else {
                        // If activeUploadId is already set but gaps are zero, wait for gap load.
                    }
                } else {
                    setIsLoading(false); // No uploads
                }
            } catch (err) {
                console.error("Failed to load uploads view:", err);
                setIsLoading(false);
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
                        status: gap.pipelineStatus || (gap.status === 'compliant' ? 'CLOSED' : (gap.status === 'gap_detected' ? 'DETECTED' : 'TRIAGED')),
                        title: gap.requirement.substring(0,60) + (gap.requirement.length > 60 ? "..." : ""),
                        standard: gap.standard + (gap.section ? ` § ${gap.section}` : ""),
                        priority: gap.severity ? gap.severity.toUpperCase() : "MEDIUM",
                        confidence: gap.confidenceScore ?? (gap.confidence === 'high' ? 95 : gap.confidence === 'medium' ? 75 : gap.confidence === 'low' ? 45 : 80),
                        subNote: gap.citations?.[0]?.quote ? "Evidence Extracted" : "Missing File",
                        closedBy: gap.status === 'compliant' ? "AI Verified" : undefined,
                        closedTime: gap.status === 'compliant' ? "Automated" : undefined
                    }));
                    
                    let finalTasks = newTasks;
                    try {
                        const pipelineRes = await fetch(`/api/pipeline?uploadId=${latest.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        const pipelineData = await pipelineRes.json();
                        
                        if (pipelineData.success && pipelineData.data && pipelineData.data.length > 0) {
                            const storedTasks = pipelineData.data;
                            finalTasks = newTasks.map((t) => {
                                const stored = storedTasks.find((p: any) => p.id === t.id);
                                return stored ? { ...t, ...stored, title: t.title, standard: t.standard } : t;
                            });
                        }
                    } catch (e) {
                        console.error("Failed to load pipeline DB state", e);
                    }
                    setTasks(finalTasks);
                }
            } catch (err) {
                console.error("Pipeline Sync Failed:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadRealGaps();
    }, [user, activeUploadId]);



    // Helper to persist task state to DB
    const persistTasks = async (updatedTasks: Task[]) => {
        if (!user || !activeUploadId) return;
        try {
            const token = await user.getIdToken();
            await fetch("/api/pipeline", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ uploadId: activeUploadId, tasks: updatedTasks })
            });
        } catch (e) {
            console.error("Failed to persist pipeline tasks:", e);
        }
    };


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

            const updatedTasks = prev.map(t => {
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
            
            // Fire API call asynchronously
            persistTasks(updatedTasks);
            
            return updatedTasks;
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
                    id={`gap-${t.id}`}
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
        let statusColor = 'bg-slate-400';
        if (t.status === 'TRIAGED') statusColor = 'bg-amber-400';
        if (t.status === 'ASSIGNED') statusColor = 'bg-indigo-500';
        if (t.status === 'IN_REMEDIATION') statusColor = 'bg-purple-500';
        
        const borderColor = isMine ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200/80';
        
        return (
            <div 
                id={`gap-${t.id}`}
                key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)}
                onClick={() => router.push(`/dashboard/results?id=${t.uploadId || 'demo-id'}&demoGap=${t.id}`)}
                className={`bg-white rounded-xl p-4 border shadow-sm hover:shadow-md mb-3 cursor-pointer transition-all active:cursor-grabbing ${borderColor} relative group overflow-hidden hover:-translate-y-0.5 duration-200`}
            >
                <div className={`absolute top-0 left-0 w-1 h-full ${statusColor} transition-all group-hover:w-1.5`} />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="relative z-10 pl-1">
                    <div className="flex justify-between items-start mb-2">
                        {t.priority && (
                            <span className={`px-2 py-0.5 rounded flex items-center gap-1 font-bold text-[9px] uppercase tracking-wider ${
                                t.priority.includes('CRITICAL') ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${t.priority.includes('CRITICAL') ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                                {t.priority}
                            </span>
                        )}
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                            ID-{t.id.substring(0, 4).toUpperCase()}
                        </span>
                    </div>
                    <h4 className="text-[12px] leading-snug font-bold text-slate-800 mb-1.5 group-hover:text-indigo-700 transition-colors line-clamp-3">{t.title}</h4>
                    <p className="text-[9px] text-slate-400 mb-3 font-mono tracking-tighter truncate" title={t.standard}>{t.standard}</p>

                {/* Progress Bar (Detected/Triaged) */}
                {t.confidence !== undefined && (
                    <div className="flex items-center justify-between pt-2.5 border-t border-slate-100/60 mt-1">
                        <div className="flex items-center gap-1.5">
                            <svg className={`w-3.5 h-3.5 ${
                                t.confidence && t.confidence >= 95 ? 'text-emerald-500' :
                                t.confidence && t.confidence >= 80 ? 'text-indigo-500' :
                                t.confidence && t.confidence >= 50 ? 'text-amber-500' : 'text-rose-500'
                            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${
                                t.confidence && t.confidence >= 95 ? 'text-emerald-600' :
                                t.confidence && t.confidence >= 80 ? 'text-indigo-600' :
                                t.confidence && t.confidence >= 50 ? 'text-amber-600' : 'text-rose-600'
                            }`}>{t.confidence > 0 ? `AI CONFIDENCE: ${t.confidence}%` : 'AI ANALYSIS PENDING'}</span>
                        </div>
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

    if (isLoading) {
        return (
            <div className="flex flex-col h-[calc(100vh-8rem)] relative">
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Syncing Pipeline Data...</p>
                    </div>
                </div>
            </div>
        );
    }

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
                        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </span>
                            Gap Remediation Pipeline
                            <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-200">
                                Kanban View
                            </span>
                        </h1>
                        <p className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 tracking-tight">
                            Gap remediation workflow • Live Jira Integration Active
                        </p>
                        <p className="text-slate-500 mt-2 text-sm max-w-3xl leading-relaxed">
                            Drag and drop 510(k) gaps between columns to update their status. Changes are automatically synchronized with your engineering issue tracker.
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
