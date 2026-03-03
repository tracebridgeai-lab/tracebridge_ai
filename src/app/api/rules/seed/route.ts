import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * POST /api/rules/seed
 * Seeds additional compliance rules: ISO 10993 (Biocompatibility) and eStar template sections.
 */
export async function POST() {
    try {
        if (!adminDb) {
            return NextResponse.json(
                { success: false, error: "Firebase not configured" },
                { status: 503 }
            );
        }

        const additionalRules = [
            // ============ ISO 10993 — Biocompatibility ============
            {
                standard: "ISO 10993:2018",
                section: "10993-1:5",
                requirement: "Biological evaluation planning — documented risk-based approach for biocompatibility assessment",
                expectedDocument: "Biocompatibility Evaluation Plan",
                requiredForClass: "B",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-1:6",
                requirement: "Material characterization — chemical composition and physical properties of all patient-contact materials",
                expectedDocument: "Material Data Sheets / Biocompatibility Report",
                requiredForClass: "B",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-1:A",
                requirement: "Categorization by body contact type (surface, external communicating, implant) and duration",
                expectedDocument: "Biocompatibility Evaluation Plan",
                requiredForClass: "B",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-5",
                requirement: "In vitro cytotoxicity testing — evidence that device materials are not cytotoxic",
                expectedDocument: "Cytotoxicity Test Report",
                requiredForClass: "B",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-10",
                requirement: "Irritation and skin sensitization testing — evidence of non-irritating and non-sensitizing properties",
                expectedDocument: "Sensitization/Irritation Test Report",
                requiredForClass: "B",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-11",
                requirement: "Systemic toxicity evaluation — assessment of potential system-wide toxic effects",
                expectedDocument: "Systemic Toxicity Report",
                requiredForClass: "C",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-3",
                requirement: "Genotoxicity, carcinogenicity, and reproductive toxicity evaluation",
                expectedDocument: "Genotoxicity Test Report",
                requiredForClass: "C",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-6",
                requirement: "Implantation tests — local tissue effects after implantation",
                expectedDocument: "Implantation Test Report",
                requiredForClass: "C",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-4",
                requirement: "Hemocompatibility testing for blood-contacting devices",
                expectedDocument: "Hemocompatibility Test Report",
                requiredForClass: "C",
                category: "Biocompatibility",
            },
            {
                standard: "ISO 10993:2018",
                section: "10993-18",
                requirement: "Chemical characterization of materials — extractables and leachables analysis",
                expectedDocument: "Chemical Characterization Report",
                requiredForClass: "B",
                category: "Biocompatibility",
            },

            // ============ eStar Template Sections ============
            {
                standard: "FDA eStar",
                section: "eStar-1",
                requirement: "Applicant Information — company name, contact info, establishment registration, device listing numbers",
                expectedDocument: "eStar Submission / Cover Letter",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-2",
                requirement: "Device Description — indications for use, technological characteristics, materials, components, accessories",
                expectedDocument: "Device Description Document",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-3",
                requirement: "Predicate/Substantial Equivalence — identification of predicate device and comparison table",
                expectedDocument: "Substantial Equivalence Comparison / 510(k) Summary",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-4",
                requirement: "Standards and Guidance — list of recognized standards and FDA guidance documents applied",
                expectedDocument: "Standards Declaration / Declarations of Conformity",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-5",
                requirement: "Performance Testing — summary of bench, animal, and clinical testing with protocols and results",
                expectedDocument: "Test Protocols and Reports / V&V Summary",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-6",
                requirement: "Biocompatibility — summary of biocompatibility assessment per ISO 10993 with test results",
                expectedDocument: "Biocompatibility Evaluation Summary",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-7",
                requirement: "Software Documentation — software level of concern, hazard analysis, and V&V documentation per IEC 62304",
                expectedDocument: "Software Documentation / IEC 62304 Package",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-8",
                requirement: "Electromagnetic Compatibility (EMC) — IEC 60601-1-2 compliance for electrical medical devices",
                expectedDocument: "EMC Test Report / IEC 60601-1-2 Report",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-9",
                requirement: "Sterility — sterilization method validation and sterility assurance documentation",
                expectedDocument: "Sterilization Validation Report",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-10",
                requirement: "Shelf Life / Packaging — aging studies, packaging validation, and expiration date justification",
                expectedDocument: "Shelf Life Study Report / Packaging Validation",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-11",
                requirement: "Labeling — proposed labels, IFU, package inserts per 21 CFR 801",
                expectedDocument: "Labeling / IFU / Package Insert",
                requiredForClass: "B",
                category: "eStar Template",
            },
            {
                standard: "FDA eStar",
                section: "eStar-12",
                requirement: "Clinical Data — clinical evidence summary, predicate comparison, or clinical study results if required",
                expectedDocument: "Clinical Data Summary / Literature Review",
                requiredForClass: "B",
                category: "eStar Template",
            },
        ];

        // Batch write
        const batch = adminDb.batch();
        let added = 0;

        for (const rule of additionalRules) {
            // Check if rule already exists
            const existing = await adminDb
                .collection("complianceRules")
                .where("standard", "==", rule.standard)
                .where("section", "==", rule.section)
                .get();

            if (existing.empty) {
                const ref = adminDb.collection("complianceRules").doc();
                batch.set(ref, {
                    ...rule,
                    createdAt: Timestamp.now(),
                });
                added++;
            }
        }

        await batch.commit();

        return NextResponse.json({
            success: true,
            data: {
                added,
                totalRules: additionalRules.length,
                message: `Seeded ${added} new rules (${additionalRules.length - added} already existed)`,
            },
        });
    } catch (error) {
        console.error("Seed error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Seed failed" },
            { status: 500 }
        );
    }
}
