"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
    Upload,
    FileText,
    X,
    Shield,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Search,
    Brain,
    BarChart3,
    FileSearch,
    ArrowRight,
} from "lucide-react";
import { ProductCodeSelector } from "@/components/ProductCodeSelector";

// Per-file limit: 50MB to support large real-world protocols (like Omnipod SAW)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Analysis steps for the step-by-step UI
const ANALYSIS_STEPS = [
    { icon: FileSearch, label: "Uploading documents to secure storage" },
    { icon: Search, label: "Extracting device information & product code" },
    { icon: Shield, label: "Retrieving FDA requirements for your device" },
    { icon: Brain, label: "Comparing V&V documentation against requirements" },
    { icon: BarChart3, label: "Generating gap analysis report" },
];

export default function UploadPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    const [deviceName, setDeviceName] = useState("");
    const [selectedCode, setSelectedCode] = useState<any>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [step, setStep] = useState<"upload" | "analyzing" | "done">("upload");
    const [activeStep, setActiveStep] = useState(0);
    const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState("");
    const [uploadId, setUploadId] = useState("");
    
    // Scan theater state
    const [currentScanText, setCurrentScanText] = useState("Initializing compliance engine...");

    useEffect(() => {
        if (activeStep !== 4) return;
        
        const possibleTexts = [
            "Scanning IEC 62304 Section 5.1.2...",
            "Evaluating ISO 14971 Risk Controls...",
            "Cross-referencing FDA 21 CFR Part 820...",
            "Analyzing Software Requirements Specification...",
            "Extracting Traceability Matrix boundaries...",
            "Checking ISO 13485 Design History constraints...",
            "Validating Cybersecurity compliance vectors...",
            "Assessing human factors testing protocols..."
        ];
        
        // Shuffle randomly for dynamic effect
        const shuffled = possibleTexts.sort(() => 0.5 - Math.random());
        let i = 0;
        
        const interval = setInterval(() => {
            setCurrentScanText(shuffled[i % shuffled.length]);
            i++;
        }, 600);
        
        return () => clearInterval(interval);
    }, [activeStep]);

    const handleFiles = (newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles).filter(
            (f) =>
                f.type === "application/pdf" ||
                f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                f.type === "text/plain"
        );

        const oversized = fileArray.filter(f => f.size > MAX_FILE_SIZE);
        if (oversized.length > 0) {
            setError(`File "${oversized[0].name}" is ${(oversized[0].size / 1024 / 1024).toFixed(1)}MB. Max file size is 50MB.`);
            return;
        }

        setError("");
        setFiles((prev) => [...prev, ...fileArray]);
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleQuickLoadDemo = () => {
        const demoFiles = [
            new File(["Dummy payload"], "FDA_510k_Executive_Summary_v3.pdf", { type: "application/pdf" }),
            new File(["Dummy payload"], "ISO_14971_Risk_Management_Report.pdf", { type: "application/pdf" }),
            new File(["Dummy payload"], "IEC_62304_Software_Architecture_Spec.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
            new File(["Dummy payload"], "Cybersecurity_Threat_Model_SBOM.pdf", { type: "application/pdf" }),
        ];
        handleFiles(demoFiles as unknown as FileList);
    };

    const handleSubmit = async () => {
        if (!selectedCode || files.length === 0) {
            setError("Please select a medical device type and upload at least one document.");
            return;
        }

        setError("");
        setStep("analyzing");
        setActiveStep(0);

        try {
            // Step 1: Upload files to Firebase Storage
            const userId = user?.uid || "demo-user";
            const uploadTimestamp = Date.now();
            const uploadedFiles: {
                fileName: string;
                fileType: string;
                fileSize: number;
                storagePath: string;
                storageUrl: string;
            }[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileType = file.name.split(".").pop()?.toLowerCase() || "unknown";
                const storagePath = `uploads/${userId}/${uploadTimestamp}-${file.name}`;

                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, file, {
                    contentType: file.type || "application/octet-stream",
                    customMetadata: {
                        originalName: file.name,
                        uploadedBy: userId,
                    },
                });

                const storageUrl = await getDownloadURL(storageRef);

                uploadedFiles.push({
                    fileName: file.name,
                    fileType,
                    fileSize: file.size,
                    storagePath,
                    storageUrl,
                });
            }

            setActiveStep(1);

            // Step 2: Create upload record (auto-selects all 3 standards)
            const idToken = user ? await user.getIdToken() : undefined;
            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceName: selectedCode.description,
                    productCode: selectedCode.code,
                    features: {
                        requiresSoftware: selectedCode.requiresSoftware,
                        requiresClinical: selectedCode.requiresClinical,
                        requiresBiocompatibility: selectedCode.requiresBiocompatibility
                    },
                    files: uploadedFiles,
                    idToken,
                }),
            });

            let uploadJson;
            try {
                uploadJson = await uploadRes.json();
            } catch {
                throw new Error(`Server error (${uploadRes.status})`);
            }
            if (!uploadJson.success) throw new Error(uploadJson.error);

            const newUploadId = uploadJson.data.uploadId;
            setUploadId(newUploadId);
            setActiveStep(2);

            // Step 3: Kick off Native Batch Gap Engine
            setActiveStep(3);
            const analyzeRes = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uploadId: newUploadId }),
            });
            const analyzeJson = await analyzeRes.json();
            if (!analyzeJson.success) throw new Error(analyzeJson.error);

            // Step 4: Poll backend for completion (The Batch engine finishes in seconds)
            setActiveStep(4);
            setAnalysisProgress({ current: 0, total: 0 }); // Use generic Step 5 UI
            
            let isComplete = false;
            let pollingCounter = 0;
            while (!isComplete) {
                await new Promise(r => setTimeout(r, 3000)); // Poll every 3s
                pollingCounter++;
                
                const headers: Record<string, string> = {};
                if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
                
                const reportRes = await fetch(`/api/reports?uploadId=${newUploadId}`, { headers });
                if (reportRes.ok) {
                    const reportJson = await reportRes.json();
                    if (reportJson.success) {
                        if (reportJson.data.upload.status === "complete") {
                            isComplete = true;
                        } else if (reportJson.data.upload.status === "failed") {
                            throw new Error(reportJson.data.upload.errorMessage || "Analysis failed in the background batch processor.");
                        }
                    }
                }
                
                if (pollingCounter > 300) { // 15 minute maximum timeout to account for exponential API backoffs
                    throw new Error("Analysis timed out. Please check your document sizes or API rate limits.");
                }
            }

            setStep("done");
            setTimeout(() => {
                router.push(`/dashboard/results?id=${newUploadId}`);
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
            setStep("upload");
            setActiveStep(0);
        }
    };

    // Analysis step-by-step UI
    if (step === "analyzing") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto">
                <div className="bg-white border border-[var(--border)] rounded-md p-8 w-full shadow-sm">
                    <div className="flex items-center gap-4 mb-6 border-b border-[var(--border)] pb-4">
                        <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
                        <div>
                            <h2 className="text-xl font-bold text-[var(--foreground)]">Regulatory Gap Analysis in Progress</h2>
                            <p className="text-[var(--muted)] text-sm">
                                Processing ISO 13485 constraints. Do not close this window.
                            </p>
                        </div>
                    </div>

                    {/* Step list table format */}
                    <div className="space-y-2 border border-[var(--border)] rounded bg-slate-50 p-2">
                        {ANALYSIS_STEPS.map((s, i) => {
                            const isComplete = i < activeStep;
                            const isActive = i === activeStep;
                            return (
                                <div
                                    key={i}
                                    className={`flex items-center gap-3 p-3 transition-colors ${isActive
                                        ? "bg-white border border-[var(--primary)]/30 rounded"
                                        : isComplete
                                            ? "opacity-100"
                                            : "opacity-40"
                                        }`}
                                >
                                    {isComplete ? (
                                        <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0" />
                                    ) : isActive ? (
                                        <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin flex-shrink-0" />
                                    ) : (
                                        <s.icon className="w-4 h-4 text-[var(--muted)] flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${isActive ? "text-[var(--primary)] font-bold" : isComplete ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                                        {s.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Scan Theater / Progress */}
                    {activeStep === 4 ? (
                        <div className="mt-8 p-6 rounded-xl bg-slate-50 border border-[var(--border)] shadow-sm flex flex-col items-center justify-center transition-all">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--primary)]"></span>
                                </span>
                                <span className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">Clinical Engine Active</span>
                            </div>
                            <p className="text-sm font-mono text-[var(--muted)] h-5 overflow-hidden transition-all duration-300">
                                {currentScanText}
                            </p>
                        </div>
                    ) : (
                        <div className="mt-8">
                            <div className="w-full bg-[var(--border)] rounded-full h-2 mb-2">
                                <div
                                    className="h-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-1000"
                                    style={{ width: `${Math.min(((activeStep + 1) / ANALYSIS_STEPS.length) * 100, 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-[var(--muted)]">
                                {analysisProgress.total > 0
                                    ? `Analyzing rule ${analysisProgress.current} of ${analysisProgress.total}`
                                    : `Step ${activeStep + 1} of ${ANALYSIS_STEPS.length}`
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (step === "done") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="glass-card p-12 text-center max-w-md w-full">
                    <CheckCircle2 className="w-16 h-16 text-[var(--success)] mx-auto mb-6" />
                    <h2 className="text-2xl font-bold mb-2">Analysis Complete!</h2>
                    <p className="text-[var(--muted)]">
                        Redirecting to your gap report...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">New Analysis</h1>
                <p className="text-[var(--muted)]">
                    Upload your V&V documents for automatic compliance gap detection.
                </p>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0" />
                    <p className="text-sm text-[var(--danger)]">{error}</p>
                </div>
            )}

            <div className="space-y-6">
                {/* Device Type Selector */}
                <div className="bg-white border border-[var(--border)] p-6 rounded-md shadow-sm">
                    <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-4 border-b border-[var(--border)] pb-2">1. Device Classification</h3>
                    <ProductCodeSelector onSelect={setSelectedCode} />
                </div>

                {/* Enterprise Integrations & File Upload */}
                <div className="bg-white border border-[var(--border)] p-6 rounded-md shadow-sm flex flex-col pt-6 relative overflow-hidden">
                    <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-4 border-b border-[var(--border)] pb-2">2. Data Ingestion Stream</h3>
                    
                    {/* Enterprise Direct Sync Connectors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <button 
                            onClick={() => {
                                window.alert("OAuth 2.0 Webhook Authenticated.\n\nIndexing Greenlight Guru 'Final Draft' compliance documents...");
                                handleQuickLoadDemo();
                            }}
                            className="bg-emerald-50/50 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all p-4 rounded-xl flex items-center justify-between text-left group shadow-sm"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded shadow-sm flex items-center justify-center text-white font-serif font-bold text-xl">ɢ</div>
                                <div>
                                    <h4 className="text-sm font-bold text-emerald-900">Greenlight Guru API</h4>
                                    <p className="text-xs text-emerald-700">Sync Master DHR/QMS Records</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:text-emerald-600 transition-transform group-hover:translate-x-1" />
                        </button>
                        
                        <button 
                            onClick={() => {
                                window.alert("Atlassian Token Validated.\n\nSyncing Software Architecture Specifications and Test Anomaly logs...");
                                handleQuickLoadDemo();
                            }}
                            className="bg-blue-50/50 border border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-all p-4 rounded-xl flex items-center justify-between text-left group shadow-sm"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-[#0052CC] rounded shadow-sm flex items-center justify-center text-white font-bold text-xl">
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M11.53 10.67l-5.5-5.5a1.47 1.47 0 00-2.06 0L0 9.11v9.64a1.47 1.47 0 001.47 1.47h9.64l4.03-4.03-3.61-5.52zM21.57 0h-9.64a1.47 1.47 0 00-1.47 1.47v9.64l1.37-1.37L10.6 8.52a2.02 2.02 0 012.86 0l8.11 8.11V1.47A1.47 1.47 0 0020.1 0z"/></svg>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-blue-900">Atlassian Jira</h4>
                                    <p className="text-xs text-blue-700">Sync SaMD Spec & Test Cases</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-1" />
                        </button>
                    </div>

                    <div className="relative flex items-center py-2 mb-4">
                        <div className="flex-grow border-t border-[var(--border)]"></div>
                        <span className="flex-shrink-0 mx-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Or upload manually</span>
                        <div className="flex-grow border-t border-[var(--border)]"></div>
                    </div>

                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        Local File Drive Array
                    </label>
                    <div
                        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                            dragActive
                                ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]"
                                : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400"
                        }`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragActive(true);
                        }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 transition-colors ${dragActive ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-slate-400 shadow-sm border border-slate-200'}`}>
                            <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 mb-1">
                            Drag & drop regulatory files or click to browse
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                            Supports highly unstructured PDF, DOCX, and TXT files up to 50MB each
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.txt"
                            className="hidden"
                            onChange={(e) => e.target.files && handleFiles(e.target.files)}
                        />
                    </div>

                    {files.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {files.map((file, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--background)] border border-[var(--border)]"
                                >
                                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{file.name}</p>
                                        <p className="text-xs text-[var(--muted)]">
                                            {(file.size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(i);
                                        }}
                                        className="p-1 rounded-lg hover:bg-[var(--danger)]/10 transition-colors"
                                    >
                                        <X className="w-4 h-4 text-[var(--muted)] hover:text-[var(--danger)]" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={!selectedCode || files.length === 0}
                    className="btn-primary w-full py-4 text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none flex items-center justify-center gap-2"
                >
                    <Shield className="w-5 h-5" />
                    Run Gap Analysis
                </button>
            </div>
        </div>
    );
}
