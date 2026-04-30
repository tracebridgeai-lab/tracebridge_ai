import { NextResponse } from "next/server";
import { adminDb, verifyIdToken } from "@/lib/firebase-admin";
import { Upload, DocumentMetadata, AuditLog } from "@/lib/firestore-types";
import { Timestamp } from "firebase-admin/firestore";

// Route segment config
export const maxDuration = 60;
export const dynamic = "force-dynamic";


export async function POST(request: Request) {
    try {
        // Check if Firebase is initialized
        if (!adminDb) {
            return NextResponse.json(
                { success: false, error: "Firebase not configured. Please set Firebase credentials in .env" },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { deviceName, productCode, files, idToken } = body;

        // Authoritative FDA Code Lookup
        let fdaData = null;
        try {
            const fdaCodes = require("@/lib/fda-product-codes.json");
            fdaData = fdaCodes.find((c: any) => c.code === productCode);
        } catch (err) {
            console.warn("Failed to load FDA product codes", err);
        }

        const safeFeatures = fdaData ? {
            requiresSoftware: fdaData.requiresSoftware,
            requiresClinical: fdaData.requiresClinical,
            requiresBiocompatibility: fdaData.requiresBiocompatibility
        } : body.features || { requiresSoftware: true, requiresClinical: true, requiresBiocompatibility: true };

        const deviceClass = fdaData?.deviceClass || "Unknown";
        const regulationNumber = fdaData?.regulationNumber || "Unknown";

        // Dynamically build applicable standards
        const standards = ["ISO 13485:2016", "ISO 14971:2019"];
        if (safeFeatures.requiresSoftware) {
            standards.push("IEC 62304:2006");
        }

        // Validate required fields
        if (!deviceName || !files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields: deviceName, files",
                },
                { status: 400 }
            );
        }

        // Verify Firebase ID token if provided
        let userId: string;
        if (idToken) {
            const verification = await verifyIdToken(idToken);
            if (!verification.success) {
                return NextResponse.json(
                    { success: false, error: "Invalid authentication token" },
                    { status: 401 }
                );
            }
            userId = verification.uid!;
        } else {
            userId = "demo-user";
            console.warn("No ID token provided, using demo user");
        }

        // Create upload document in Firestore
        const uploadData: Upload = {
            userId,
            deviceName,
            productCode: productCode || "Unknown",
            deviceClass,
            regulationNumber,
            features: safeFeatures,
            standards,
            status: "pending",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        const uploadRef = await adminDb.collection("uploads").add(uploadData);
        const uploadId = uploadRef.id;

        // Store document metadata in Firestore (files already in Firebase Storage)
        const documentRecords: DocumentMetadata[] = [];

        for (const file of files) {
            const docMetadata: DocumentMetadata = {
                uploadId,
                fileName: file.fileName,
                fileType: file.fileType,
                fileSize: file.fileSize,
                storageUrl: file.storageUrl,
                storagePath: file.storagePath,
                createdAt: Timestamp.now(),
            };

            const docRef = await adminDb.collection("documents").add(docMetadata);
            documentRecords.push({
                id: docRef.id,
                ...docMetadata,
            });
        }

        // Log audit entry
        const auditLog: AuditLog = {
            userId,
            action: "upload",
            details: {
                uploadId,
                deviceName,
                fileCount: files.length,
                standards,
            },
            createdAt: Timestamp.now(),
        };
        await adminDb.collection("auditLogs").add(auditLog);

        return NextResponse.json({
            success: true,
            data: {
                uploadId,
                deviceName,
                standards,
                documents: documentRecords,
                status: "pending",
            },
        });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to process upload",
            },
            { status: 500 }
        );
    }
}
