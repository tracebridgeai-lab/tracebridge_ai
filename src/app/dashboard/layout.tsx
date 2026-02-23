"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Shield,
    LayoutDashboard,
    Upload,
    BarChart3,
    FileText,
    LogOut,
} from "lucide-react";

const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/upload", label: "Upload", icon: Upload },
    { href: "/dashboard/results", label: "Reports", icon: FileText },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
                <div className="p-6 border-b border-[var(--border)]">
                    <Link href="/" className="flex items-center gap-2">
                        <Shield className="w-7 h-7 text-[var(--primary)]" />
                        <span className="text-lg font-bold gradient-text">
                            TraceBridge AI
                        </span>
                    </Link>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive =
                            pathname === item.href ||
                            (item.href !== "/dashboard" && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                                        ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                                        : "text-[var(--muted)] hover:text-white hover:bg-[var(--card-hover)]"
                                    }`}
                            >
                                <item.icon className="w-5 h-5" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-[var(--border)]">
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-[var(--primary)]">D</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">Demo User</p>
                            <p className="text-xs text-[var(--muted)] truncate">
                                demo@tracebridge.ai
                            </p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto p-8">{children}</div>
            </main>
        </div>
    );
}
