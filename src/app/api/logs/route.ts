import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");

    if (!uploadId) {
        return NextResponse.json({ success: false, error: "Missing uploadId" }, { status: 400 });
    }

    try {
        if (!adminDb) {
            return NextResponse.json({ success: true, data: [] });
        }

        const logsSnapshot = await adminDb.collection("activity_logs")
            .where("uploadId", "==", uploadId)
            .orderBy("createdAt", "desc")
            .limit(10)
            .get();

        const logs = [];
        for (const doc of logsSnapshot.docs) {
            logs.push({ id: doc.id, ...doc.data() });
        }

        return NextResponse.json({ success: true, data: logs });
    } catch (error) {
        console.error("Logs API Error:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch logs" }, { status: 500 });
    }
}
