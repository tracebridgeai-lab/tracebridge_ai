import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { runGapAnalysis, getGapSummary } from "@/lib/gap-engine";
import { Timestamp } from "firebase-admin/firestore";
import { AuditLog } from "@/lib/firestore-types";

// Increase timeout for this route (Gemini API can be slow)
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

/**
 * POST /api/analyze
 * Run gap analysis on an upload.
 * Accepts uploadId and files (re-uploaded for Gemini analysis).
 */
export async function POST(request: Request) {
    let uploadId: string | null = null;
    
    try {
        // Check if Firebase is initialized
        if (!adminDb || !adminStorage) {
            return NextResponse.json(
                { success: false, error: "Firebase not configured" },
                { status: 503 }
            );
        }

        const formData = await request.formData();
        uploadId = formData.get("uploadId") as string;
        const files = formData.getAll("files") as File[];

        if (!uploadId) {
            return NextResponse.json(
                { success: false, error: "Missing uploadId" },
                { status: 400 }
            );
        }

        // Get upload from Firestore
        const uploadDoc = await adminDb!.collection("uploads").doc(uploadId).get();

        if (!uploadDoc.exists) {
            return NextResponse.json(
                { success: false, error: "Upload not found" },
                { status: 404 }
            );
        }

        const upload = { id: uploadDoc.id, ...uploadDoc.data() } as any;

        // Update status to analyzing
        await adminDb!.collection("uploads").doc(uploadId).update({
            status: "analyzing",
            updatedAt: Timestamp.now(),
        });

        // Convert uploaded files to buffers for Gemini
        const fileBuffers = await Promise.all(
            files.map(async (file) => {
                const arrayBuffer = await file.arrayBuffer();
                return {
                    data: Buffer.from(arrayBuffer),
                    mimeType: file.type || "application/pdf",
                    name: file.name,
                };
            })
        );

        if (fileBuffers.length === 0) {
            return NextResponse.json(
                { success: false, error: "No files provided for analysis" },
                { status: 400 }
            );
        }

        // Clear previous results for this upload
        const previousResults = await adminDb!
            .collection("gapResults")
            .where("uploadId", "==", uploadId)
            .get();

        const batch = adminDb!.batch();
        previousResults.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Run the gap analysis engine
        const results = await runGapAnalysis(
            uploadId,
            upload.standards as string[],
            fileBuffers
        );

        // Update upload status
        await adminDb!.collection("uploads").doc(uploadId).update({
            status: "complete",
            updatedAt: Timestamp.now(),
        });

        // Generate summary
        const summary = getGapSummary(results);

        // Audit log
        const auditLog: AuditLog = {
            userId: upload.userId as string,
            action: "analyze",
            details: {
                uploadId,
                rulesChecked: summary.total,
                gapsFound: summary.gaps,
                complianceScore: summary.complianceScore,
            },
            createdAt: Timestamp.now(),
        };
        await adminDb!.collection("auditLogs").add(auditLog);

        return NextResponse.json({
            success: true,
            data: {
                uploadId,
                deviceName: upload.deviceName,
                standards: upload.standards,
                summary,
                results,
            },
        });
    } catch (error) {
        console.error("Analysis error:", error);

        // Try to update status to failed if we have uploadId
        if (uploadId && adminDb) {
            await adminDb
                .collection("uploads")
                .doc(uploadId)
                .update({
                    status: "failed",
                    updatedAt: Timestamp.now(),
                })
                .catch(() => { });
        }

        return NextResponse.json(
            { 
                success: false, 
                error: error instanceof Error ? error.message : "Gap analysis failed" 
            },
            { status: 500 }
        );
    }
}

