"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
    Shield,
    Mail,
    Lock,
    User,
    ArrowRight,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
} from "lucide-react";

type Mode = "login" | "signup" | "forgot";

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signUp, signInWithGoogle, resetPassword, user, loading } = useAuth();

    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && user) {
            router.push("/dashboard");
        }
    }, [user, loading, router]);

    if (!loading && user) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setSubmitting(true);

        try {
            if (mode === "login") {
                await signIn(email, password);
                router.push("/dashboard");
            } else if (mode === "signup") {
                if (!displayName.trim()) {
                    setError("Please enter your name.");
                    setSubmitting(false);
                    return;
                }
                await signUp(email, password, displayName);
                router.push("/dashboard");
            } else if (mode === "forgot") {
                await resetPassword(email);
                setSuccess("Password reset email sent! Check your inbox.");
            }
        } catch (err: any) {
            const code = err?.code || "";
            if (code === "auth/user-not-found") setError("No account found with this email.");
            else if (code === "auth/wrong-password") setError("Incorrect password.");
            else if (code === "auth/email-already-in-use") setError("An account with this email already exists.");
            else if (code === "auth/weak-password") setError("Password must be at least 6 characters.");
            else if (code === "auth/invalid-email") setError("Invalid email address.");
            else if (code === "auth/invalid-credential") setError("Invalid email or password.");
            else setError(err?.message || "Something went wrong. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError("");
        try {
            await signInWithGoogle();
            router.push("/dashboard");
        } catch (err: any) {
            if (err?.code !== "auth/popup-closed-by-user") {
                setError(err?.message || "Google sign-in failed.");
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            
            {/* Header Branding */}
            <div className="mb-8 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="w-8 h-8 text-[var(--primary)]" />
                    <span className="text-2xl font-bold text-slate-900 tracking-tight">TraceBridge AI</span>
                </div>
                <h1 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Enterprise Quality Management</h1>
            </div>

            {/* Authentication Card */}
            <div className="w-full max-w-md bg-white border border-slate-300 shadow-sm rounded-md p-8">
                <h2 className="text-xl font-bold text-slate-800 mb-6 text-center border-b border-slate-100 pb-4">
                    {mode === "login" && "Sign In to Active Directory"}
                    {mode === "signup" && "Request Account Provisioning"}
                    {mode === "forgot" && "Reset Password Credential"}
                </h2>

                {error && (
                    <div className="mb-6 p-3 rounded bg-red-50 border border-red-200 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-800 font-medium">{error}</p>
                    </div>
                )}
                {success && (
                    <div className="mb-6 p-3 rounded bg-emerald-50 border border-emerald-200 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-emerald-800 font-medium">{success}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === "signup" && (
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="John Doe"
                                    className="w-full pl-9 pr-3 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Corporate Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                required
                                className="w-full pl-9 pr-3 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                            />
                        </div>
                    </div>

                    {mode !== "forgot" && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">Password</label>
                                {mode === "login" && (
                                    <button
                                        type="button"
                                        onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }}
                                        className="text-xs text-[var(--primary)] hover:underline font-semibold"
                                    >
                                        Recover
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    className="w-full pl-9 pr-10 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-[var(--primary)] hover:bg-blue-800 text-white font-bold py-2 px-4 rounded text-sm transition-colors flex items-center justify-center gap-2 mt-6"
                    >
                        {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                {mode === "login" && "Authenticate"}
                                {mode === "signup" && "Submit Provision Request"}
                                {mode === "forgot" && "Send Recovery Link"}
                            </>
                        )}
                    </button>
                </form>

                {mode !== "forgot" && (
                    <div className="mt-6 border-t border-slate-200 pt-6">
                        <button
                            onClick={handleGoogleSignIn}
                            className="w-full flex items-center justify-center gap-3 px-4 py-2 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold transition-colors shadow-sm"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Enterprise SSO (Google)
                        </button>
                    </div>
                )}
            </div>

            {/* Footer Form Toggles & Legal */}
            <div className="mt-8 text-center text-xs text-slate-500">
                <div className="mb-4">
                    {mode === "login" && (
                        <span>Require system access? <button onClick={() => { setMode("signup"); setError(""); setSuccess(""); }} className="text-[var(--primary)] font-bold hover:underline">Request Provisioning</button></span>
                    )}
                    {mode === "signup" && (
                        <span>Already provisioned? <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }} className="text-[var(--primary)] font-bold hover:underline">Authenticate Here</button></span>
                    )}
                    {mode === "forgot" && (
                        <span><button onClick={() => { setMode("login"); setError(""); setSuccess(""); }} className="text-[var(--primary)] font-bold hover:underline">Return to Authentication module</button></span>
                    )}
                </div>
                <p>Protected by 256-bit encryption. Authorized personnel only.</p>
                <p className="mt-1">© 2026 TraceBridge AI Systems.</p>
            </div>
        </div>
    );
}
