import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { ComplianceRule } from "@/lib/firestore-types";

/**
 * GET /api/rules
 * Returns compliance rules, optionally filtered by standard.
 * Query params: ?standard=IEC+62304&standard=ISO+14971
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
        const standards = searchParams.getAll("standard");

        let rulesSnapshot;

        if (standards.length > 0) {
            // Filter by standards (no orderBy to avoid index requirement)
            rulesSnapshot = await adminDb!
                .collection("complianceRules")
                .where("standard", "in", standards)
                .get();
        } else {
            // Get all rules (no orderBy to avoid index requirement)
            rulesSnapshot = await adminDb!
                .collection("complianceRules")
                .get();
        }

        const rules: ComplianceRule[] = rulesSnapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data() as Omit<ComplianceRule, "id">
            }))
            // Sort in memory
            .sort((a, b) => {
                if (a.standard !== b.standard) {
                    return a.standard.localeCompare(b.standard);
                }
                return a.section.localeCompare(b.section);
            });

        // Group by standard for easier frontend consumption
        const grouped = rules.reduce<Record<string, ComplianceRule[]>>(
            (acc, rule) => {
                if (!acc[rule.standard]) {
                    acc[rule.standard] = [];
                }
                acc[rule.standard].push(rule);
                return acc;
            },
            {}
        );

        return NextResponse.json({
            success: true,
            data: {
                rules,
                grouped,
                totalRules: rules.length,
                standards: Object.keys(grouped),
            },
        });
    } catch (error) {
        console.error("Error fetching rules:", error);
        return NextResponse.json(
            { 
                success: false, 
                error: error instanceof Error ? error.message : "Failed to fetch compliance rules" 
            },
            { status: 500 }
        );
    }
}

