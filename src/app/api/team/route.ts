import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * GET /api/team?userId=xxx
 * Returns the team for a given user, or null if they don't belong to one.
 */
export async function GET(request: Request) {
    try {
        if (!adminDb) {
            return NextResponse.json({ success: false, error: "Firebase not configured" }, { status: 503 });
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ success: false, error: "Missing userId" }, { status: 400 });
        }

        // Find teams where user is a member
        const teamsSnapshot = await adminDb.collection("teams").get();
        const userTeam = teamsSnapshot.docs.find(doc => {
            const data = doc.data();
            return data.ownerId === userId ||
                (data.members || []).some((m: any) => m.uid === userId);
        });

        if (!userTeam) {
            return NextResponse.json({ success: true, data: { team: null } });
        }

        const teamData: any = { id: userTeam.id, ...userTeam.data() };

        // Get team upload stats
        const members = teamData.members || [];
        const memberIds = [teamData.ownerId, ...members.map((m: any) => m.uid)];

        const uploadsSnapshot = await adminDb.collection("uploads").get();
        const teamUploads = uploadsSnapshot.docs.filter(doc =>
            memberIds.includes(doc.data().userId)
        );

        return NextResponse.json({
            success: true,
            data: {
                team: teamData,
                stats: {
                    totalUploads: teamUploads.length,
                    totalMembers: memberIds.length,
                },
            },
        });
    } catch (error) {
        console.error("Team GET error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch team" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/team
 * Actions: create, invite, remove, update
 */
export async function POST(request: Request) {
    try {
        if (!adminDb) {
            return NextResponse.json({ success: false, error: "Firebase not configured" }, { status: 503 });
        }

        const { action, userId, teamName, memberEmail, teamId } = await request.json();

        if (!action || !userId) {
            return NextResponse.json({ success: false, error: "Missing action or userId" }, { status: 400 });
        }

        switch (action) {
            case "create": {
                if (!teamName) {
                    return NextResponse.json({ success: false, error: "Missing teamName" }, { status: 400 });
                }

                const teamRef = await adminDb.collection("teams").add({
                    name: teamName,
                    ownerId: userId,
                    members: [],
                    createdAt: Timestamp.now(),
                });

                return NextResponse.json({
                    success: true,
                    data: { teamId: teamRef.id, message: "Team created" },
                });
            }

            case "invite": {
                if (!teamId || !memberEmail) {
                    return NextResponse.json({ success: false, error: "Missing teamId or memberEmail" }, { status: 400 });
                }

                const teamDoc = await adminDb.collection("teams").doc(teamId).get();
                if (!teamDoc.exists) {
                    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
                }

                const team = teamDoc.data()!;
                if (team.ownerId !== userId) {
                    return NextResponse.json({ success: false, error: "Only team owner can invite" }, { status: 403 });
                }

                // Check if already a member
                const existing = (team.members || []).find((m: any) => m.email === memberEmail);
                if (existing) {
                    return NextResponse.json({ success: false, error: "Already a member" }, { status: 400 });
                }

                const newMember = {
                    uid: `pending_${Date.now()}`,
                    email: memberEmail,
                    displayName: memberEmail.split("@")[0],
                    role: "member",
                    joinedAt: Timestamp.now(),
                };

                await adminDb.collection("teams").doc(teamId).update({
                    members: [...(team.members || []), newMember],
                });

                return NextResponse.json({
                    success: true,
                    data: { message: `Invited ${memberEmail}` },
                });
            }

            case "remove": {
                if (!teamId || !memberEmail) {
                    return NextResponse.json({ success: false, error: "Missing teamId or memberEmail" }, { status: 400 });
                }

                const removeTeamDoc = await adminDb.collection("teams").doc(teamId).get();
                if (!removeTeamDoc.exists) {
                    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
                }

                const removeTeam = removeTeamDoc.data()!;
                if (removeTeam.ownerId !== userId) {
                    return NextResponse.json({ success: false, error: "Only team owner can remove" }, { status: 403 });
                }

                const updatedMembers = (removeTeam.members || []).filter(
                    (m: any) => m.email !== memberEmail
                );

                await adminDb.collection("teams").doc(teamId).update({
                    members: updatedMembers,
                });

                return NextResponse.json({
                    success: true,
                    data: { message: `Removed ${memberEmail}` },
                });
            }

            default:
                return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error) {
        console.error("Team POST error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Team operation failed" },
            { status: 500 }
        );
    }
}
