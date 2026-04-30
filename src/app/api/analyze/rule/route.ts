import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { queryGeminiRESTArray } from "@/lib/gemini-rest";
import { GapResult } from "@/lib/firestore-types";
import { Timestamp } from "firebase-admin/firestore";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/analyze/rule
 * Analyzes ONE rule against the uploaded documents.
 * Each call makes exactly ONE Gemini API request (~5-15s),
 * well within Vercel's 60s Hobby timeout.
 */
export async function POST(request: Request) {
    try {
        if (!adminDb || !adminStorage) {
            return NextResponse.json(
                { success: false, error: "Firebase not configured" },
                { status: 503 }
            );
        }

        const { uploadId, rule } = await request.json();

        if (!uploadId || !rule) {
            return NextResponse.json(
                { success: false, error: "Missing uploadId or rule" },
                { status: 400 }
            );
        }

        // Download files from Firebase Storage
        const documentsSnapshot = await adminDb
            .collection("documents")
            .where("uploadId", "==", uploadId)
            .get();

        if (documentsSnapshot.empty) {
            return NextResponse.json(
                { success: false, error: "No documents found" },
                { status: 400 }
            );
        }

        const bucket = adminStorage.bucket();
        const fileBuffers: { data: Buffer; mimeType: string; name: string }[] = [];

        for (const doc of documentsSnapshot.docs) {
            const { storagePath, fileName, fileType } = doc.data();
            if (!storagePath) continue;

            try {
                const file = bucket.file(storagePath);
                const [buffer] = await file.download();

                let mimeType = "application/pdf";
                if (fileType === "docx") {
                    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                }

                fileBuffers.push({ data: buffer, mimeType, name: fileName });
            } catch (err) {
                console.error(`Failed to download ${fileName}:`, err);
            }
        }

        if (fileBuffers.length === 0) {
            return NextResponse.json(
                { success: false, error: "Failed to download documents" },
                { status: 500 }
            );
        }

        const geminiResultArray = await queryGeminiRESTArray(fileBuffers, [{
            id: rule.id || "",
            requirement: rule.requirement,
            standard: rule.standard,
            section: rule.section,
            expectedDocument: rule.expectedDocument
        }]);
        const geminiResult = geminiResultArray[0];

        // Determine compliance status
        let status: "compliant" | "gap_detected" | "needs_review";
        if (geminiResult.found && (geminiResult.confidence === "high" || geminiResult.confidence === "medium")) {
            status = "compliant";
        } else if (geminiResult.found && geminiResult.confidence === "low") {
            status = "needs_review";
        } else {
            status = "gap_detected";
        }

        // Determine severity
        let severity: "critical" | "major" | "minor" = "minor";
        if (
            rule.standard?.includes("14971") ||
            rule.section?.startsWith("7.") ||
            rule.section?.startsWith("9.") ||
            rule.requiredForClass === "C"
        ) {
            severity = "critical";
        } else if (rule.section?.startsWith("5.") || rule.section?.startsWith("6.")) {
            severity = "major";
        }

        const gapTitle = status === "compliant"
            ? `${rule.requirement} - Verified`
            : `Missing: ${rule.requirement}`;

        // Save result to Firestore
        const gapResultData: GapResult = {
            uploadId,
            standard: rule.standard,
            section: rule.section,
            requirement: rule.requirement,
            status,
            severity,
            gapTitle,
            missingRequirement: rule.requirement,
            citations: geminiResult.citations,
            geminiResponse: geminiResult.rawResponse,
            estimatedCost: geminiResult.estimatedCost,
            estimatedTimeline: geminiResult.estimatedTimeline,
            remediationSteps: geminiResult.remediationSteps,
            createdAt: Timestamp.now(),
        };

        await adminDb.collection("gapResults").add(gapResultData);

        return NextResponse.json({
            success: true,
            data: {
                ruleId: rule.id,
                status,
                severity,
                gapTitle,
            },
        });
    } catch (error) {
        console.error("Analyze/rule error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Rule analysis failed",
            },
            { status: 500 }
        );
    }
}
