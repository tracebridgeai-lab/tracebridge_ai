"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
    Shield,
    LayoutDashboard,
    Upload,
    FileText,
    Users,
    LogOut,
    Loader2,
    Kanban,
    ChevronLeft,
    ChevronRight,
    FileSearch,
    Server,
    Menu,
    X,
    Network,
} from "lucide-react";

type NavItem = {
    href?: string;
    label?: string;
    icon?: any;
    isDivider?: boolean;
    heading?: string;
};

const navItems: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    
    { isDivider: true, heading: "Core Workflow" },
    { href: "/dashboard/upload", label: "510(k) Gap Analysis", icon: Upload },
    { href: "/dashboard/results", label: "Gap Findings", icon: FileSearch },
    { href: "/dashboard/pipeline", label: "Remediation Pipeline", icon: Kanban },
    
    { isDivider: true, heading: "Outputs & Tracking" },
    { href: "/dashboard/traceability", label: "Traceability Matrix", icon: Network },
    { href: "/dashboard/reports", label: "Submission Hub", icon: FileText },
    
    { isDivider: true, heading: "Settings & Management" },
    { href: "/dashboard/team", label: "Workspace & Team", icon: Users },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, logout } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [pathname]);

    // Auth guard - redirect to login if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    const handleLogout = async () => {
        await logout();
        router.push("/login");
    };

    // Show loading while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    // Don't render dashboard if not authenticated
    if (!user) {
        return null;
    }

    const initials = user.displayName
        ? user.displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
        : user.email?.[0]?.toUpperCase() || "U";

    return (
        <div className="min-h-screen flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-40">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <div className="relative w-10 h-7 shrink-0">
                        <Image src="/brand/icon_transparent.png" alt="TraceBridge Icon" fill className="object-contain" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight text-[var(--foreground)] truncate">TraceBridge <span className="text-emerald-500">AI</span></span>
                </Link>
                <button 
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                >
                    {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Sidebar Overlay for Mobile */}
            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm" 
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"} 
                fixed inset-y-0 left-0 z-50 md:relative 
                ${isCollapsed ? "md:w-20" : "md:w-64"} w-72 md:flex-shrink-0 
                border-r border-[var(--border)] bg-[var(--card)] flex flex-col transition-all duration-300
            `}>
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="hidden md:block absolute -right-3 top-6 bg-white border border-[var(--border)] rounded-full p-1 shadow-sm text-slate-400 hover:text-indigo-600 transition-colors z-10"
                >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            
                <div className="p-6 border-b border-[var(--border)] flex items-center justify-between md:justify-center">
                    <Link href="/dashboard" className={`flex items-center gap-2 ${isCollapsed ? 'md:justify-center' : ''}`}>
                        <div className={`relative shrink-0 transition-all ${isCollapsed ? 'w-12 h-8' : 'w-[2.75rem] h-7'}`}>
                            <Image 
                                src="/brand/icon_transparent.png" 
                                alt="TraceBridge Icon" 
                                fill 
                                className="object-contain"
                            />
                        </div>
                        <span className={`text-2xl font-bold tracking-tight text-[var(--foreground)] truncate md:${isCollapsed ? 'hidden' : 'block'}`}>
                            TraceBridge <span className="text-emerald-500">AI</span>
                        </span>
                    </Link>
                    <button 
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="md:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item, index) => {
                        if (item.isDivider) {
                            return (
                                <div key={`divider-${index}`} className={`pt-4 pb-1 ${isCollapsed ? 'hidden' : 'block'}`}>
                                    <p className="px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        {item.heading}
                                    </p>
                                </div>
                            );
                        }

                        const isActive =
                            pathname === item.href ||
                            (item.href !== "/dashboard" && pathname.startsWith(item.href!));
                        return (
                            <Link
                                key={item.href}
                                href={item.href!}
                                title={isCollapsed ? item.label : ""}
                                className={`flex items-center gap-3 rounded-xl transition-all ${isCollapsed ? 'justify-center p-3' : 'px-4 py-2.5'} text-sm font-medium ${isActive
                                    ? "bg-[var(--primary)]/10 text-[var(--primary)] font-bold shadow-sm"
                                    : "text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--card-hover)]"
                                    }`}
                            >
                                {item.icon && <item.icon className="w-5 h-5 shrink-0" />}
                                {!isCollapsed && <span className="truncate">{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-[var(--border)]">
                    <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center px-0' : 'px-4'} py-3`}>
                        <div className="w-8 h-8 shrink-0 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                            {user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt=""
                                    className="w-8 h-8 rounded-full"
                                />
                            ) : (
                                <span className="text-xs font-bold text-[var(--primary)]">
                                    {initials}
                                </span>
                            )}
                        </div>
                        {!isCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                    {user.displayName || "User"}
                                </p>
                                <p className="text-xs text-[var(--muted)] truncate">
                                    {user.email}
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleLogout}
                        title={isCollapsed ? "Sign Out" : ""}
                        className={`w-full flex items-center gap-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-all mt-1 ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {!isCollapsed && <span>Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto w-full md:w-auto">
                <div className="max-w-6xl mx-auto p-4 md:p-8">{children}</div>
            </main>
        </div>
    );
}
