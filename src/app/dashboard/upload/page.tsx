"use client";

import { useState, useRef } from "react";
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
} from "lucide-react";

// Per-file limit: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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
    const [files, setFiles] = useState<File[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [step, setStep] = useState<"upload" | "analyzing" | "done">("upload");
    const [activeStep, setActiveStep] = useState(0);
    const [error, setError] = useState("");
    const [uploadId, setUploadId] = useState("");

    const handleFiles = (newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles).filter(
            (f) =>
                f.type === "application/pdf" ||
                f.type ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );

        const oversized = fileArray.filter(f => f.size > MAX_FILE_SIZE);
        if (oversized.length > 0) {
            setError(`File "${oversized[0].name}" is ${(oversized[0].size / 1024 / 1024).toFixed(1)}MB. Max file size is 20MB.`);
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

    const handleSubmit = async () => {
        if (!deviceName || files.length === 0) {
            setError("Please enter a device name and upload at least one document.");
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
                    deviceName,
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

            // Step 3: Kick off analysis — returns IMMEDIATELY (runs in background on server)
            setTimeout(() => setActiveStep(3), 1500);
            const analyzeRes = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uploadId: newUploadId }),
            });

            let analyzeJson;
            try {
                analyzeJson = await analyzeRes.json();
            } catch {
                throw new Error(`Analysis error (${analyzeRes.status})`);
            }
            if (!analyzeJson.success) throw new Error(analyzeJson.error);

            // Step 4: Poll /api/reports until analysis completes (status = complete/failed)
            setActiveStep(4);
            const MAX_POLLS = 60;       // 3 minutes max (60 × 3s)
            const POLL_INTERVAL = 3000; // 3 seconds

            await new Promise<void>((resolve, reject) => {
                let polls = 0;
                const poll = setInterval(async () => {
                    polls++;
                    try {
                        const statusRes = await fetch(`/api/reports?uploadId=${newUploadId}`);
                        const statusJson = await statusRes.json();

                        if (statusJson.success) {
                            const status = statusJson.data?.upload?.status;
                            if (status === "complete") {
                                clearInterval(poll);
                                resolve();
                            } else if (status === "failed") {
                                clearInterval(poll);
                                reject(new Error(statusJson.data?.upload?.errorMessage || "Analysis failed on server"));
                            }
                        }

                        if (polls >= MAX_POLLS) {
                            clearInterval(poll);
                            reject(new Error("Analysis timed out. Please try again."));
                        }
                    } catch {
                        // Network blip — keep polling
                    }
                }, POLL_INTERVAL);
            });

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
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="glass-card p-12 text-center max-w-lg w-full gradient-border">
                    <Loader2 className="w-12 h-12 text-[var(--primary)] mx-auto mb-6 animate-spin" />
                    <h2 className="text-2xl font-bold mb-2">Analyzing Your Submission...</h2>
                    <p className="text-[var(--muted)] mb-8 text-sm">
                        This may take a few minutes for large documents.
                    </p>

                    {/* Step list */}
                    <div className="space-y-4 text-left">
                        {ANALYSIS_STEPS.map((s, i) => {
                            const isComplete = i < activeStep;
                            const isActive = i === activeStep;
                            return (
                                <div
                                    key={i}
                                    className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-500 ${isActive
                                        ? "bg-[var(--primary)]/10 border border-[var(--primary)]/30"
                                        : isComplete
                                            ? "opacity-100"
                                            : "opacity-40"
                                        }`}
                                >
                                    {isComplete ? (
                                        <CheckCircle2 className="w-5 h-5 text-[var(--success)] flex-shrink-0" />
                                    ) : isActive ? (
                                        <Loader2 className="w-5 h-5 text-[var(--primary)] animate-spin flex-shrink-0" />
                                    ) : (
                                        <s.icon className="w-5 h-5 text-[var(--muted)] flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${isActive ? "text-white font-medium" : isComplete ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
                                        {s.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-[var(--border)] rounded-full h-2 mt-8 mb-2">
                        <div
                            className="h-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-1000"
                            style={{ width: `${Math.min(((activeStep + 1) / ANALYSIS_STEPS.length) * 100, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                        Step {activeStep + 1} of {ANALYSIS_STEPS.length}
                    </p>
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
                {/* Device Name */}
                <div className="glass-card p-6">
                    <label className="block text-sm font-medium mb-3">Device Name</label>
                    <input
                        type="text"
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder="e.g., Horizon POD Insulin Pump"
                        className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                    />
                    <p className="text-xs text-[var(--muted)] mt-2">
                        TraceBridge will automatically check against IEC 62304, ISO 14971, and ISO 13485.
                    </p>
                </div>

                {/* File Upload */}
                <div className="glass-card p-6">
                    <label className="block text-sm font-medium mb-3">
                        Upload Documents
                    </label>
                    <div
                        className={`upload-zone ${dragActive ? "drag-active" : ""}`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragActive(true);
                        }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="w-10 h-10 text-[var(--muted)] mx-auto mb-3" />
                        <p className="text-sm font-medium mb-1">
                            Drag & drop files here or click to browse
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                            PDF and DOCX files up to 20MB each
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx"
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
                    disabled={!deviceName || files.length === 0}
                    className="btn-primary w-full py-4 text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none flex items-center justify-center gap-2"
                >
                    <Shield className="w-5 h-5" />
                    Run Gap Analysis
                </button>
            </div>
        </div>
    );
}
