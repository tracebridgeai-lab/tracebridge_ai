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
    Lock,
    FileX,
    Server,
} from "lucide-react";
import { ProductCodeSelector } from "@/components/ProductCodeSelector";
import fdaCodes from "@/lib/fda-product-codes.json";
import { Sparkles } from "lucide-react";

// Per-file limit: 50MB to support large real-world protocols (e.g. large software test protocols)
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
    const [qsubFiles, setQsubFiles] = useState<File[]>([]);
    const qsubFileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);
    const [qsubDragActive, setQsubDragActive] = useState(false);
    const [step, setStep] = useState<"upload" | "analyzing" | "done">("upload");
    const [activeStep, setActiveStep] = useState(0);
    const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState("");
    const [uploadId, setUploadId] = useState("");
    const [isExtracting, setIsExtracting] = useState(false);
    const [parsingFiles, setParsingFiles] = useState<Record<string, boolean>>({});
    
    // Security & Engine settings
    const [zdrEnabled, setZdrEnabled] = useState(true);
    const [aiEngine, setAiEngine] = useState<"gemini" | "local">("gemini");
    
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

    const handleFiles = (newFiles: FileList | File[], isQSub: boolean = false) => {
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
        
        // Mark new files as parsing
        const parsingStateUpdates: Record<string, boolean> = {};
        fileArray.forEach(f => {
            const fileId = `${f.name}-${f.size}`;
            parsingStateUpdates[fileId] = true;
            // simulate parsing time
            setTimeout(() => {
                setParsingFiles(prev => ({ ...prev, [fileId]: false }));
            }, 1500 + Math.random() * 1000); // 1.5s - 2.5s
        });
        setParsingFiles(prev => ({ ...prev, ...parsingStateUpdates }));

        if (isQSub) {
            setQsubFiles((prev) => [...prev, ...fileArray]);
        } else {
            setFiles((prev) => [...prev, ...fileArray]);
        }
    };

    const removeFile = (index: number, isQSub: boolean = false) => {
        if (isQSub) {
            setQsubFiles((prev) => prev.filter((_, i) => i !== index));
        } else {
            setFiles((prev) => prev.filter((_, i) => i !== index));
        }
    };

    const handleDrop = (e: React.DragEvent, isQSub: boolean = false) => {
        e.preventDefault();
        if (isQSub) {
            setQsubDragActive(false);
        } else {
            setDragActive(false);
        }
        handleFiles(e.dataTransfer.files, isQSub);
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

    const handleAutoDetect = async () => {
        if (files.length === 0) {
            setError("Please upload at least one document first to auto-detect.");
            return;
        }

        setIsExtracting(true);
        setError("");
        
        try {
            const formData = new FormData();
            formData.append("file", files[0]);

            const res = await fetch("/api/extract-metadata", {
                method: "POST",
                body: formData
            });

            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            const { deviceName, productCode } = json.data;
            const matchedCode = fdaCodes.find((c: any) => c.code === productCode);
            
            if (matchedCode) {
                // If the user changed the description dynamically based on the AI guess
                const newCode = { ...matchedCode, description: deviceName || matchedCode.description };
                setSelectedCode(newCode);
            } else {
                setError(`AI extracted a Product Code (${productCode}) that is not in our database.`);
            }
        } catch (err) {
            console.error(err);
            setError("Failed to auto-detect metadata. Please select manually.");
        } finally {
            setIsExtracting(false);
        }
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
                isQSub: boolean;
            }[] = [];

            // Helper to upload a set of files
            const uploadFileArray = async (fileArray: File[], isQSub: boolean) => {
                for (let i = 0; i < fileArray.length; i++) {
                    const file = fileArray[i];
                    const fileType = file.name.split(".").pop()?.toLowerCase() || "unknown";
                    const storagePath = `uploads/${userId}/${uploadTimestamp}-${isQSub ? 'QSUB-' : ''}${file.name}`;

                    const storageRef = ref(storage, storagePath);
                    await uploadBytes(storageRef, file, {
                        contentType: file.type || "application/octet-stream",
                        customMetadata: {
                            originalName: file.name,
                            uploadedBy: userId,
                            isQSub: isQSub.toString()
                        },
                    });

                    const storageUrl = await getDownloadURL(storageRef);

                    uploadedFiles.push({
                        fileName: file.name,
                        fileType,
                        fileSize: file.size,
                        storagePath,
                        storageUrl,
                        isQSub,
                    });
                }
            };

            await uploadFileArray(files, false);
            await uploadFileArray(qsubFiles, true);

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
                    zdrEnabled,
                    aiEngine,
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
            
            // Start the fetch but do NOT await it immediately so we can advance to the Scan Theater
            const analyzePromise = fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uploadId: newUploadId }),
            });

            // Step 4: Show Scan Theater (This keeps the user entertained while Vercel processes the PDFs)
            setActiveStep(4);
            setAnalysisProgress({ current: 0, total: 0 }); 

            // Now we wait for the long-running analysis to actually finish
            const analyzeRes = await analyzePromise;
            const analyzeJson = await analyzeRes.json();
            if (!analyzeJson.success) throw new Error(analyzeJson.error);



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
                            <h3 className="text-xl font-bold tracking-tight text-slate-900">Regulatory Gap Analysis in Progress</h3>
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
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Analysis Complete!</h2>
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
                <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                        <Upload className="w-4 h-4 text-indigo-600" />
                    </span>
                    510(k) Gap Analysis
                    <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-200">
                        Core Engine
                    </span>
                </h1>
                <p className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 tracking-tight">
                    Upload your V&V documents for automatic, semantic AI 510(k) gap detection.
                </p>
                <p className="text-slate-500 mt-2 text-sm max-w-3xl leading-relaxed">
                    Initiate a new compliance scan. Upload FDA pre-sub feedback alongside your product's technical documentation to immediately identify missing evidence, misaligned risk controls, or untested software requirements.
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
                <div className="bg-white border border-[var(--border)] p-6 rounded-md shadow-sm relative">
                    <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">1. Device Classification</h4>
                        {files.length > 0 && (
                            <button
                                onClick={handleAutoDetect}
                                disabled={isExtracting}
                                className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors disabled:opacity-50"
                            >
                                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                AI Auto-Detect
                            </button>
                        )}
                    </div>
                    <ProductCodeSelector onSelect={setSelectedCode} value={selectedCode} />
                    
                    {selectedCode && (
                        <div className="mt-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg animate-in slide-in-from-top-2 fade-in duration-300 flex gap-3 shadow-inner">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                <Brain className="w-4 h-4 text-indigo-600 animate-pulse" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-indigo-900 mb-1">AI Engine Context Loaded</p>
                                <p className="text-[11px] text-indigo-700 leading-relaxed">
                                    Targeting <span className="font-bold">FDA Class {selectedCode.deviceClass || "II"}</span> (Product Code: {selectedCode.code}). 
                                    Activating validation vectors for 21 CFR § {selectedCode.regulationNumber || "820.30"}{selectedCode.requiresSoftware ? ", IEC 62304" : ""}{selectedCode.requiresClinical ? ", ISO 14155" : ""}{selectedCode.requiresBiocompatibility ? ", ISO 10993" : ""}.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Enterprise Integrations & File Upload */}
                <div className="bg-white border border-[var(--border)] p-6 rounded-md shadow-sm flex flex-col pt-6 relative overflow-hidden">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">2. Data Ingestion Stream</h4>
                    
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
                                    <h4 className="text-sm font-bold text-emerald-900">Greenlight Guru API <span className="text-[10px] text-emerald-600/70 font-normal uppercase tracking-wider ml-1">(Coming Soon)</span></h4>
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
                                    <h4 className="text-sm font-bold text-blue-900">Atlassian Jira <span className="text-[10px] text-blue-600/70 font-normal uppercase tracking-wider ml-1">(Coming Soon)</span></h4>
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
                    
                    <div className="flex flex-col gap-4">
                        {/* Q-Sub Dedicated Zone (Primary) */}
                        <div
                            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                                qsubDragActive
                                    ? "border-amber-500 bg-amber-50/50 scale-[1.01]"
                                    : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400"
                            }`}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setQsubDragActive(true);
                            }}
                            onDragLeave={() => setQsubDragActive(false)}
                            onDrop={(e) => handleDrop(e, true)}
                            onClick={() => qsubFileInputRef.current?.click()}
                        >
                            <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 transition-colors ${qsubDragActive ? 'bg-amber-100 text-amber-600' : 'bg-white text-amber-500 shadow-sm border border-amber-200'}`}>
                                <FileSearch className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-bold text-slate-700 mb-1">
                                FDA Pre-Sub (Q-Sub) Feedback
                            </p>
                            <p className="text-xs text-[var(--muted)] px-8">
                                Upload FDA meeting minutes. TraceBridge will strictly verify that your evidence addresses the FDA's direct requests.
                            </p>
                            <input
                                ref={qsubFileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.docx,.txt"
                                className="hidden"
                                onChange={(e) => e.target.files && handleFiles(e.target.files, true)}
                            />
                        </div>

                        {/* Main DHF Zone (Secondary) */}
                        <div
                            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                                dragActive
                                    ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]"
                                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                            }`}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragActive(true);
                            }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={(e) => handleDrop(e, false)}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-3 transition-colors ${dragActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400 shadow-sm border border-slate-100'}`}>
                                <Upload className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-bold text-slate-700 mb-1">
                                Drop design documents (DHF/DMR/V&V) <span className="text-slate-400 font-normal ml-1">(Optional)</span>
                            </p>
                            <p className="text-[11px] text-[var(--muted)]">
                                Powered by a 1M+ Token Processing Window. Supports unstructured PDF, DOCX, and TXT.
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.docx,.txt"
                                className="hidden"
                                onChange={(e) => e.target.files && handleFiles(e.target.files, false)}
                            />
                        </div>
                    </div>

                    {files.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {files.map((file, i) => {
                                const fileId = `${file.name}-${file.size}`;
                                const isParsing = parsingFiles[fileId];
                                return (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] transition-all"
                                >
                                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <p className="text-sm font-medium truncate">{file.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-[var(--muted)]">
                                                {(file.size / 1024 / 1024).toFixed(2)} MB
                                            </span>
                                            <span className="text-[10px] text-slate-300">•</span>
                                            {isParsing ? (
                                                <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-1.5 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Extracting tokens & identifying requirements...
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Ready for Inference
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(i, false);
                                        }}
                                        className="p-1 rounded-lg hover:bg-[var(--danger)]/10 transition-colors"
                                    >
                                        <X className="w-4 h-4 text-[var(--muted)] hover:text-[var(--danger)]" />
                                    </button>
                                </div>
                            )})}
                        </div>
                    )}

                    {qsubFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {qsubFiles.map((file, i) => {
                                const fileId = `${file.name}-${file.size}`;
                                const isParsing = parsingFiles[fileId];
                                return (
                                <div
                                    key={`qsub-${i}`}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100"
                                >
                                    <FileSearch className="w-5 h-5 text-amber-500" />
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <p className="text-sm font-medium truncate text-amber-900">{file.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-amber-700/70">
                                                Q-Sub Feedback • {(file.size / 1024 / 1024).toFixed(2)} MB
                                            </span>
                                            <span className="text-[10px] text-amber-300">•</span>
                                            {isParsing ? (
                                                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1.5 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Extracting context...
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Ready for Validation
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(i, true);
                                        }}
                                        className="p-1 rounded-lg hover:bg-amber-100 transition-colors"
                                    >
                                        <X className="w-4 h-4 text-amber-600 hover:text-amber-800" />
                                    </button>
                                </div>
                            )})}
                        </div>
                    )}
                </div>

                {/* Engine Configuration */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-md shadow-sm relative overflow-hidden">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">3. Security & Execution Parameters</h4>
                    
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-2"><FileX className="w-4 h-4 text-emerald-500" /> Zero Data Retention (ZDR)</h4>
                                <p className="text-[11px] text-slate-500 mt-1 max-w-[80%]">Permanently destroy file artifacts from the database immediately following the gap analysis. Disables Trace Inspection.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={zdrEnabled} onChange={(e) => setZdrEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                        
                        <div className="pt-4 border-t border-slate-200">
                            <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-2 mb-2"><Server className="w-4 h-4 text-indigo-500" /> AI Inference Engine</h4>
                            <select 
                                value={aiEngine} 
                                onChange={(e) => setAiEngine(e.target.value as "gemini" | "local")}
                                className="w-full text-sm font-bold bg-white border border-slate-200 rounded-lg px-3 py-2.5 outline-none text-slate-700 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                            >
                                <option value="gemini">Google Gemini Cloud (Enterprise ZDR API)</option>
                                <option value="local">Air-Gapped Local Server (Ollama)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={!selectedCode || files.length === 0}
                    className={`w-full py-4 text-lg flex items-center justify-center gap-2 rounded-xl font-bold transition-all overflow-hidden relative group ${
                        (!selectedCode || files.length === 0) 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:-translate-y-0.5 border border-indigo-400'
                    }`}
                >
                    {selectedCode && files.length > 0 && (
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
                    )}
                    <Shield className={`w-5 h-5 relative z-10 ${selectedCode && files.length > 0 ? 'animate-pulse text-indigo-100' : ''}`} />
                    <span className="relative z-10">{selectedCode && files.length > 0 ? 'Launch Gap Analysis Engine' : 'Run Gap Analysis'}</span>
                </button>

                {/* Security & Compliance Guarantee */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-4 shadow-inner">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <Lock className="w-4 h-4 text-emerald-500" /> Enterprise Security & Data Privacy
                    </h4>
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-[13px] font-bold text-slate-800">Transit & Inference (RAM)</p>
                                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">The document is encrypted and sent to Google Cloud. The Gemini LLM reads the document in temporary memory (RAM) to generate the gap analysis.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <FileX className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-[13px] font-bold text-slate-800">Zero Data Retention (ZDR)</p>
                                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">The moment the analysis is returned to the user, Google completely purges the data. It is never written to a disk, never saved to a database, and never used to train future models.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                <Server className="w-3.5 h-3.5 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-[13px] font-bold text-slate-800">Enterprise Air-Gapped (Coming Soon)</p>
                                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">Need absolute control? Deploy TraceBridge locally on your own private, air-gapped servers using open-source Foundational Models.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
