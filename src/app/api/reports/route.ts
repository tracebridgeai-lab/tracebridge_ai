import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * GET /api/reports
 * Get all uploads/reports, optionally filtered by upload ID.
 * Query params: ?uploadId=xxx or ?all=true
 */
export async function GET(request: Request) {
    try {
        // Check if Firebase is initialized
        if (!adminDb) {
            return NextResponse.json(
                { success: false, error: "Firebase not configured" },
                { status: 503 }
            );
        }

        const { searchParams } = new URL(request.url);
        const uploadId = searchParams.get("uploadId");

        if (uploadId) {
            // Get specific upload with full results
            const uploadDoc = await adminDb!.collection("uploads").doc(uploadId).get();

            if (!uploadDoc.exists) {
                return NextResponse.json(
                    { success: false, error: "Upload not found" },
                    { status: 404 }
                );
            }

            const upload = { id: uploadDoc.id, ...uploadDoc.data() };

            // Get documents for this upload
            const documentsSnapshot = await adminDb!
                .collection("documents")
                .where("uploadId", "==", uploadId)
                .get();

            const documents = documentsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Get gap results for this upload
            const gapResultsSnapshot = await adminDb!
                .collection("gapResults")
                .where("uploadId", "==", uploadId)
                .get();

            // Sort in memory to avoid index requirement
            const gapResults = gapResultsSnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
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

        // Get all uploads (list view)
        const uploadsSnapshot = await adminDb!
            .collection("uploads")
            .get();

        const uploads = await Promise.all(
            uploadsSnapshot.docs.map(async (doc) => {
                const uploadData = { id: doc.id, ...doc.data() };

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

        // Sort by createdAt in memory (newest first)
        uploads.sort((a: any, b: any) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
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
                error: error instanceof Error ? error.message : "Failed to fetch reports" 
            },
            { status: 500 }
        );
    }
}

