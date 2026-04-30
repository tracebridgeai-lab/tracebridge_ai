"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
    Users,
    UserPlus,
    Crown,
    Mail,
    Trash2,
    Loader2,
    Plus,
    Shield,
} from "lucide-react";

interface TeamMember {
    uid: string;
    email: string;
    displayName?: string;
    role: "admin" | "member";
    joinedAt: any;
}

interface TeamData {
    id: string;
    name: string;
    ownerId: string;
    members: TeamMember[];
}

export default function TeamPage() {
    const { user } = useAuth();
    const [team, setTeam] = useState<TeamData | null>(null);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState("");
    const [teamName, setTeamName] = useState("");
    const [creating, setCreating] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [stats, setStats] = useState({ totalUploads: 0, totalMembers: 0 });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (user) fetchTeam();
    }, [user]);

    const fetchTeam = async () => {
        try {
            const res = await fetch(`/api/team?userId=${user?.uid}`);
            const json = await res.json();
            if (json.success && json.data.team) {
                setTeam(json.data.team);
                setStats(json.data.stats);
            }
        } catch {
            /* no team yet */
        }
        setLoading(false);
    };

    const createTeam = async () => {
        if (!teamName.trim()) return;
        setCreating(true);
        setError("");
        try {
            const res = await fetch("/api/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create",
                    userId: user?.uid,
                    teamName: teamName.trim(),
                }),
            });
            const json = await res.json();
            if (json.success) {
                setSuccess("Team created!");
                setTeamName("");
                await fetchTeam();
            } else {
                setError(json.error);
            }
        } catch {
            setError("Failed to create team");
        }
        setCreating(false);
    };

    const inviteMember = async () => {
        if (!inviteEmail.trim() || !team) return;
        setInviting(true);
        setError("");
        try {
            const res = await fetch("/api/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "invite",
                    userId: user?.uid,
                    teamId: team.id,
                    memberEmail: inviteEmail.trim(),
                }),
            });
            const json = await res.json();
            if (json.success) {
                setSuccess(`Invited ${inviteEmail}`);
                setInviteEmail("");
                await fetchTeam();
            } else {
                setError(json.error);
            }
        } catch {
            setError("Failed to invite member");
        }
        setInviting(false);
    };

    const removeMember = async (email: string) => {
        if (!team) return;
        try {
            const res = await fetch("/api/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "remove",
                    userId: user?.uid,
                    teamId: team.id,
                    memberEmail: email,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setSuccess(`Removed ${email}`);
                await fetchTeam();
            } else {
                setError(json.error);
            }
        } catch {
            setError("Failed to remove member");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    const isOwner = team?.ownerId === user?.uid;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-2">Team Workspace</h1>
                <p className="text-[var(--muted)]">
                    Collaborate with your team on regulatory compliance analysis.
                </p>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-sm flex items-center gap-2">
                    <span>⚠️</span> {error}
                </div>
            )}

            {success && (
                <div className="p-4 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)] text-sm flex items-center gap-2">
                    <span>✅</span> {success}
                </div>
            )}

            {!team ? (
                /* No team yet — create one */
                <div className="glass-card p-8 text-center max-w-lg mx-auto gradient-border">
                    <Users className="w-16 h-16 text-[var(--primary)] mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-bold mb-2">Create Your Team</h2>
                    <p className="text-[var(--muted)] text-sm mb-6">
                        Create a workspace to share uploads and compliance reports with your team members.
                    </p>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            placeholder="Team name (e.g., Regulatory Affairs)"
                            className="flex-1 px-4 py-3 rounded-xl bg-[var(--input)] border border-[var(--border)] text-slate-900 text-sm focus:outline-none focus:border-[var(--primary)]"
                            onKeyDown={(e) => e.key === "Enter" && createTeam()}
                        />
                        <button
                            onClick={createTeam}
                            disabled={creating || !teamName.trim()}
                            className="btn-primary px-6 py-3 text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Create
                        </button>
                    </div>
                </div>
            ) : (
                /* Team exists — show dashboard */
                <>
                    {/* Team header + stats */}
                    <div className="glass-card p-6 gradient-border">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{team.name}</h2>
                                    <p className="text-xs text-[var(--muted)]">
                                        {isOwner ? "You are the team owner" : "Team member"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-[var(--background)]">
                                <p className="text-2xl font-bold">{stats.totalMembers}</p>
                                <p className="text-xs text-[var(--muted)]">Team Members</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[var(--background)]">
                                <p className="text-2xl font-bold">{stats.totalUploads}</p>
                                <p className="text-xs text-[var(--muted)]">Total Analyses</p>
                            </div>
                        </div>
                    </div>

                    {/* Members list */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Users className="w-5 h-5 text-[var(--primary)]" />
                                Members
                            </h3>
                        </div>

                        <div className="space-y-3">
                            {/* Owner */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                        <Crown className="w-5 h-5 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">
                                            {user?.displayName || user?.email?.split("@")[0] || "Owner"}
                                        </p>
                                        <p className="text-xs text-[var(--muted)]">{user?.email}</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
                                    Owner
                                </span>
                            </div>

                            {/* Members */}
                            {(team.members || []).map((member, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-4 rounded-xl bg-[var(--background)] border border-[var(--border)]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                                            <span className="text-sm font-bold text-[var(--primary)]">
                                                {member.displayName?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">
                                                {member.displayName || member.email.split("@")[0]}
                                            </p>
                                            <p className="text-xs text-[var(--muted)]">{member.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-3 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-medium capitalize">
                                            {member.role}
                                        </span>
                                        {isOwner && (
                                            <button
                                                onClick={() => removeMember(member.email)}
                                                className="p-2 rounded-lg hover:bg-[var(--danger)]/10 text-[var(--muted)] hover:text-[var(--danger)] transition-all"
                                                title="Remove member"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Invite member */}
                    {isOwner && (
                        <div className="glass-card p-6">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                                Invite Member
                            </h3>
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@company.com"
                                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--input)] border border-[var(--border)] text-slate-900 text-sm focus:outline-none focus:border-[var(--primary)]"
                                        onKeyDown={(e) => e.key === "Enter" && inviteMember()}
                                    />
                                </div>
                                <button
                                    onClick={inviteMember}
                                    disabled={inviting || !inviteEmail.trim()}
                                    className="btn-primary px-6 py-3 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                    {inviting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="w-4 h-4" />
                                    )}
                                    Invite
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
