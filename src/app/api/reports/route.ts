import { NextResponse } from "next/server";
import { adminDb, verifyIdToken } from "@/lib/firebase-admin";

/**
 * Convert Firestore Timestamp fields to ISO strings for JSON serialization.
 * Firestore Timestamps serialize as {_seconds, _nanoseconds} which breaks new Date().
 */
function serializeTimestamps(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(serializeTimestamps);

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === "object" && "_seconds" in (value as any)) {
            // Firestore Timestamp → ISO string
            const ts = value as { _seconds: number; _nanoseconds: number };
            result[key] = new Date(ts._seconds * 1000).toISOString();
        } else if (value && typeof value === "object" && typeof (value as any).toDate === "function") {
            // Firestore Timestamp with toDate method
            result[key] = (value as any).toDate().toISOString();
        } else if (Array.isArray(value)) {
            result[key] = value.map(serializeTimestamps);
        } else if (value && typeof value === "object") {
            result[key] = serializeTimestamps(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * GET /api/reports
 * Get all uploads/reports, optionally filtered by upload ID.
 * Query params: ?uploadId=xxx or ?all=true
 */
export async function GET(request: Request) {
    try {
        if (!adminDb) {
            return NextResponse.json(
                { success: false, error: "Firebase not configured" },
                { status: 503 }
            );
        }

        // Authenticate the user via Authorization Bearer token header
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json(
                { success: false, error: "Unauthorized access: Missing or invalid token" },
                { status: 401 }
            );
        }

        const idToken = authHeader.split("Bearer ")[1];
        const verification = await verifyIdToken(idToken);
        
        if (!verification.success || !verification.uid) {
            return NextResponse.json(
                { success: false, error: "Unauthorized access: Token validation failed" },
                { status: 401 }
            );
        }
        
        const tenantUid = verification.uid;

        const { searchParams } = new URL(request.url);
        const uploadId = searchParams.get("uploadId");

        if (uploadId) {
            // Get specific upload and enforce Tenant UID
            const uploadDoc = await adminDb.collection("uploads").doc(uploadId).get();

            if (!uploadDoc.exists || uploadDoc.data()?.userId !== tenantUid) {
                return NextResponse.json(
                    { success: false, error: "Upload not found" },
                    { status: 404 }
                );
            }

            const upload = serializeTimestamps({ id: uploadDoc.id, ...uploadDoc.data() });

            // Get documents for this upload
            const documentsSnapshot = await adminDb
                .collection("documents")
                .where("uploadId", "==", uploadId)
                .get();

            const documents = documentsSnapshot.docs.map(doc =>
                serializeTimestamps({ id: doc.id, ...doc.data() })
            );

            // Get gap results for this upload
            const gapResultsSnapshot = await adminDb
                .collection("gapResults")
                .where("uploadId", "==", uploadId)
                .get();

            // Sort in memory to avoid index requirement
            const gapResults = gapResultsSnapshot.docs
                .map(doc => serializeTimestamps({ id: doc.id, ...doc.data() }))
                .sort((a: any, b: any) => {
                    const statusOrder = { compliant: 0, needs_review: 1, gap_detected: 2 };
                    return (statusOrder[a.status as keyof typeof statusOrder] || 3) -
                        (statusOrder[b.status as keyof typeof statusOrder] || 3);
                });

            // Calculate summary
            const total = gapResults.length;
            const compliant = gapResults.filter(
                (r: any) => r.status === "compliant"
            ).length;
            const gaps = gapResults.filter(
                (r: any) => r.status === "gap_detected"
            ).length;
            const needsReview = gapResults.filter(
                (r: any) => r.status === "needs_review"
            ).length;

            return NextResponse.json({
                success: true,
                data: {
                    upload: {
                        ...upload,
                        documents,
                        gapResults,
                    },
                    summary: {
                        total,
                        compliant,
                        gaps,
                        needsReview,
                        complianceScore: total > 0 ? Math.round((compliant / total) * 100) : 0,
                    },
                },
            });
        }

        // Get all uploads for THIS ISOLATED TENANT
        const uploadsSnapshot = await adminDb
            .collection("uploads")
            .where("userId", "==", tenantUid)
            .get();

        const uploads = await Promise.all(
            uploadsSnapshot.docs.map(async (doc) => {
                const uploadData = serializeTimestamps({ id: doc.id, ...doc.data() });

                // Get document count
                const documentsSnapshot = await adminDb!
                    .collection("documents")
                    .where("uploadId", "==", doc.id)
                    .get();

                // Get gap results count
                const gapResultsSnapshot = await adminDb!
                    .collection("gapResults")
                    .where("uploadId", "==", doc.id)
                    .get();

                return {
                    ...uploadData,
                    documentCount: documentsSnapshot.size,
                    gapResultsCount: gapResultsSnapshot.size,
                };
            })
        );

        // Sort by createdAt (newest first) — now ISO strings
        uploads.sort((a: any, b: any) => {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        return NextResponse.json({
            success: true,
            data: { uploads },
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch reports",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        if (!adminDb) {
            return NextResponse.json({ success: false, error: "Firebase not configured" }, { status: 503 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ success: false, error: "Unauthorized access: Missing token" }, { status: 401 });
        }

        const idToken = authHeader.split("Bearer ")[1];
        const verification = await verifyIdToken(idToken);
        
        if (!verification.success || !verification.uid) {
            return NextResponse.json({ success: false, error: "Unauthorized access: Token failed" }, { status: 401 });
        }
        const tenantUid = verification.uid;

        const { searchParams } = new URL(request.url);
        const uploadId = searchParams.get("uploadId");

        if (!uploadId) {
            return NextResponse.json({ success: false, error: "Missing uploadId parameter" }, { status: 400 });
        }

        // Verify ownership
        const uploadRef = adminDb.collection("uploads").doc(uploadId);
        const uploadDoc = await uploadRef.get();

        if (!uploadDoc.exists || uploadDoc.data()?.userId !== tenantUid) {
            return NextResponse.json({ success: false, error: "Upload not found or unauthorized" }, { status: 404 });
        }

        // Delete cascade: documents, gapResults, then the upload
        const batch = adminDb.batch();
        
        const docsSnapshot = await adminDb.collection("documents").where("uploadId", "==", uploadId).get();
        docsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        const gapsSnapshot = await adminDb.collection("gapResults").where("uploadId", "==", uploadId).get();
        gapsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        batch.delete(uploadRef);
        await batch.commit();

        return NextResponse.json({ success: true, message: "Upload deleted successfully" });
    } catch (error) {
        console.error("Error deleting report:", error);
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete" }, { status: 500 });
    }
}
