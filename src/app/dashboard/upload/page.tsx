"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Upload,
    FileText,
    X,
    Shield,
    CheckCircle2,
    Loader2,
    AlertCircle,
} from "lucide-react";

const AVAILABLE_STANDARDS = [
    {
        id: "IEC 62304:2006",
        name: "IEC 62304:2006",
        desc: "Medical Device Software Lifecycle",
    },
    {
        id: "ISO 14971:2019",
        name: "ISO 14971:2019",
        desc: "Risk Management for Medical Devices",
    },
    {
        id: "ISO 13485:2016",
        name: "ISO 13485:2016",
        desc: "Quality Management Systems",
    },
];

export default function UploadPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [deviceName, setDeviceName] = useState("");
    const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [step, setStep] = useState<"upload" | "analyzing" | "done">("upload");
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const [uploadId, setUploadId] = useState("");

    const toggleStandard = (id: string) => {
        setSelectedStandards((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    };

    const handleFiles = (newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles).filter(
            (f) =>
                f.type === "application/pdf" ||
                f.type ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
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
        if (!deviceName || selectedStandards.length === 0 || files.length === 0) {
            setError("Please fill in all fields and upload at least one document.");
            return;
        }

        setError("");
        setStep("analyzing");
        setProgress(10);

        try {
            // Step 1: Upload
            const uploadData = new FormData();
            uploadData.append("deviceName", deviceName);
            uploadData.append("standards", JSON.stringify(selectedStandards));
            files.forEach((f) => uploadData.append("files", f));

            setProgress(20);
            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                body: uploadData,
            });
            const uploadJson = await uploadRes.json();

            if (!uploadJson.success) throw new Error(uploadJson.error);

            const uploadId = uploadJson.data.uploadId;
            setUploadId(uploadId);
            setProgress(40);

            // Step 2: Analyze
            const analyzeData = new FormData();
            analyzeData.append("uploadId", uploadId);
            files.forEach((f) => analyzeData.append("files", f));

            // Simulate progress during analysis
            const progressInterval = setInterval(() => {
                setProgress((p) => Math.min(p + 2, 90));
            }, 1000);

            const analyzeRes = await fetch("/api/analyze", {
                method: "POST",
                body: analyzeData,
            });
            const analyzeJson = await analyzeRes.json();

            clearInterval(progressInterval);

            if (!analyzeJson.success) throw new Error(analyzeJson.error);

            setProgress(100);
            setStep("done");

            // Redirect to results after brief pause
            setTimeout(() => {
                router.push(`/dashboard/results?id=${uploadId}`);
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed");
            setStep("upload");
            setProgress(0);
        }
    };

    if (step === "analyzing") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="glass-card p-12 text-center max-w-md w-full gradient-border pulse-glow">
                    <Loader2 className="w-12 h-12 text-[var(--primary)] mx-auto mb-6 animate-spin" />
                    <h2 className="text-2xl font-bold mb-2">Analyzing Documents</h2>
                    <p className="text-[var(--muted)] mb-6">
                        Gemini AI is searching your documents for compliance evidence...
                    </p>
                    <div className="w-full bg-[var(--border)] rounded-full h-2 mb-2">
                        <div
                            className="h-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-sm text-[var(--muted)]">{progress}%</p>
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
                    Upload your V&V documents and select standards to check against.
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
                </div>

                {/* Standards Selection */}
                <div className="glass-card p-6">
                    <label className="block text-sm font-medium mb-3">
                        Select Standards
                    </label>
                    <div className="grid md:grid-cols-3 gap-3">
                        {AVAILABLE_STANDARDS.map((std) => {
                            const selected = selectedStandards.includes(std.id);
                            return (
                                <button
                                    key={std.id}
                                    onClick={() => toggleStandard(std.id)}
                                    className={`p-4 rounded-xl border text-left transition-all ${selected
                                            ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                            : "border-[var(--border)] hover:border-[var(--primary)]/30"
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {selected ? (
                                            <CheckCircle2 className="w-4 h-4 text-[var(--primary)]" />
                                        ) : (
                                            <Shield className="w-4 h-4 text-[var(--muted)]" />
                                        )}
                                        <span className="font-semibold text-sm">{std.name}</span>
                                    </div>
                                    <p className="text-xs text-[var(--muted)]">{std.desc}</p>
                                </button>
                            );
                        })}
                    </div>
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
                            Supports PDF and DOCX files
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
                    disabled={
                        !deviceName || selectedStandards.length === 0 || files.length === 0
                    }
                    className="btn-primary w-full py-4 text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none flex items-center justify-center gap-2"
                >
                    <Shield className="w-5 h-5" />
                    Run Gap Analysis
                </button>
            </div>
        </div>
    );
}
