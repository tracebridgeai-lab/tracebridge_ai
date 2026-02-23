import { adminDb } from "./firebase-admin";
import { queryGeminiREST } from "./gemini-rest";
import { ComplianceRule, GapResult } from "./firestore-types";
import { Timestamp } from "firebase-admin/firestore";

export interface GapReportItem {
    gap_title: string;
    standard: string;
    section: string;
    missing_requirement: string;
    severity: "critical" | "major" | "minor";
    citations: { source: string; section: string; quote: string }[];
    status: "compliant" | "gap_detected" | "needs_review";
}

/**
 * Step A: Query Firestore for all compliance rules matching the selected standards.
 * Note: Rules should be pre-seeded in Firestore or loaded from templates
 */
export async function getRulesForStandards(standards: string[]): Promise<ComplianceRule[]> {
    if (!adminDb) {
        console.warn("Firebase not initialized, returning empty rules");
        return [];
    }

    // Query without orderBy to avoid index requirement
    // We'll sort in memory instead
    const rulesSnapshot = await adminDb
        .collection("complianceRules")
        .where("standard", "in", standards)
        .get();

    const rules = rulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<ComplianceRule, "id">
    }));

    // Sort in memory
    return rules.sort((a, b) => {
        if (a.standard !== b.standard) {
            return a.standard.localeCompare(b.standard);
        }
        return a.section.localeCompare(b.section);
    });
}

/**
 * Determine severity based on standard and section characteristics.
 */
function determineSeverity(
    standard: string,
    section: string,
    requiredForClass: string | null | undefined
): "critical" | "major" | "minor" {
    // Risk management and safety-related requirements are critical
    if (
        standard.includes("14971") ||
        section.startsWith("7.") ||
        section.startsWith("9.")
    ) {
        return "critical";
    }

    // Class C requirements are critical
    if (requiredForClass === "C") {
        return "critical";
    }

    // Core development requirements are major
    if (section.startsWith("5.") || section.startsWith("6.")) {
        return "major";
    }

    // Everything else is minor
    return "minor";
}

/**
 * Step B + C: For each rule, query Gemini and combine results.
 * This is the core gap engine pipeline.
 */
export async function runGapAnalysis(
    uploadId: string,
    standards: string[],
    fileBuffers: { data: Buffer; mimeType: string; name: string }[]
): Promise<GapReportItem[]> {
    // Step A: Get all applicable rules
    const rules = await getRulesForStandards(standards);

    if (rules.length === 0) {
        throw new Error(
            `No compliance rules found for standards: ${standards.join(", ")}`
        );
    }

    const results: GapReportItem[] = [];

    // Step B: For each rule, query Gemini for evidence
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        
        // Skip non-applicable rules  
        if (
            rule.expectedDocument === "(Not applicable)" ||
            rule.expectedDocument === "- not applicable -" ||
            rule.expectedDocument.trim() === ""
        ) {
            continue;
        }

        try {
            // Add delay between requests to avoid rate limiting (except for first request)
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }
            
            const geminiResult = await queryGeminiREST(
                fileBuffers,
                rule.requirement,
                rule.standard,
                rule.section,
                rule.expectedDocument
            );

            // Step C: Combine deterministic + semantic results
            let status: "compliant" | "gap_detected" | "needs_review";

            if (geminiResult.found && geminiResult.confidence === "high") {
                status = "compliant";
            } else if (geminiResult.found && geminiResult.confidence === "medium") {
                status = "needs_review";
            } else {
                status = "gap_detected";
            }

            const severity = determineSeverity(
                rule.standard,
                rule.section,
                rule.requiredForClass
            );

            const gapItem: GapReportItem = {
                gap_title: status === "compliant"
                    ? `${rule.requirement} - Verified`
                    : `Missing: ${rule.requirement}`,
                standard: rule.standard,
                section: rule.section,
                missing_requirement: rule.requirement,
                severity,
                citations: geminiResult.citations,
                status,
            };

            results.push(gapItem);

            // Save to Firestore
            const gapResultData: GapResult = {
                uploadId,
                standard: rule.standard,
                section: rule.section,
                requirement: rule.requirement,
                status,
                severity,
                gapTitle: gapItem.gap_title,
                missingRequirement: rule.requirement,
                citations: geminiResult.citations,
                geminiResponse: geminiResult.rawResponse,
                createdAt: Timestamp.now(),
            };

            if (adminDb) {
                await adminDb.collection("gapResults").add(gapResultData);
            }
        } catch (error) {
            console.error(
                `Error analyzing rule ${rule.standard} ${rule.section}:`,
                error
            );

            // Mark as needs_review if Gemini fails for this rule
            const gapItem: GapReportItem = {
                gap_title: `Review Required: ${rule.requirement}`,
                standard: rule.standard,
                section: rule.section,
                missing_requirement: rule.requirement,
                severity: "major",
                citations: [],
                status: "needs_review",
            };

            results.push(gapItem);

            const gapResultData: GapResult = {
                uploadId,
                standard: rule.standard,
                section: rule.section,
                requirement: rule.requirement,
                status: "needs_review",
                severity: "major",
                gapTitle: gapItem.gap_title,
                missingRequirement: rule.requirement,
                citations: [],
                geminiResponse: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
                createdAt: Timestamp.now(),
            };

            if (adminDb) {
                await adminDb.collection("gapResults").add(gapResultData);
            }
        }
    }

    return results;
}

/**
 * Get summary statistics for a gap analysis.
 */
export function getGapSummary(results: GapReportItem[]) {
    return {
        total: results.length,
        compliant: results.filter((r) => r.status === "compliant").length,
        gaps: results.filter((r) => r.status === "gap_detected").length,
        needsReview: results.filter((r) => r.status === "needs_review").length,
        critical: results.filter(
            (r) => r.severity === "critical" && r.status === "gap_detected"
        ).length,
        major: results.filter(
            (r) => r.severity === "major" && r.status === "gap_detected"
        ).length,
        minor: results.filter(
            (r) => r.severity === "minor" && r.status === "gap_detected"
        ).length,
        complianceScore: results.length > 0
            ? Math.round(
                (results.filter((r) => r.status === "compliant").length /
                    results.length) *
                100
            )
            : 0,
    };
}
