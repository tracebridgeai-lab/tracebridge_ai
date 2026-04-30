import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const EXHAUSTIVE_RULES = [
    // Pillar 1: General QMS
    {
        id: "rule_qms_13485",
        standard: "ISO 13485:2016",
        section: "4.2.1",
        requirement: "The quality management system documentation shall include the quality manual, documented procedures required by this standard, and documented statistical frameworks.",
        expectedDocument: "Quality Manual"
    },
    // Pillar 2: Cybersecurity (Trap)
    {
        id: "rule_cyber",
        standard: "FDA Cybersecurity Guidance",
        section: "V.A",
        requirement: "Premarket submissions must contain a comprehensive Software Bill of Materials (SBOM)",
        expectedDocument: "Cybersecurity Management Plan"
    },
    // Pillar 3: Software Arc (Golden)
    {
        id: "rule_iec_arc",
        standard: "IEC 62304",
        section: "5.3",
        requirement: "The manufacturer shall establish a software architecture that limits software unit boundary intersections, and explicitly states segregation measures.",
        expectedDocument: "Software Architecture Document"
    },
    // Pillar 4: Risk Management (Trap)
    {
        id: "rule_risk_14971",
        standard: "ISO 14971:2019",
        section: "7",
        requirement: "Risk evaluation must implement a deterministic threshold comparing the calculated risk index (Probability x Severity matrix) against pre-defined acceptability criteria.",
        expectedDocument: "Risk Management File"
    },
    // Pillar 5: Class III Biocompatibility (Golden)
    {
        id: "rule_biocomp",
        standard: "ISO 10993-1",
        section: "Toxicology",
        requirement: "Class III long-term implants must provide physiological extraction toxicology reports proving chemical degradants remain below systemic toxic thresholds.",
        expectedDocument: "Biocompatibility Evaluation"
    },
    // Pillar 6: SaMD App Boundary Testing
    {
        id: "rule_samd_boundary",
        standard: "FDA SaMD Guidance",
        section: "Physical Segregation",
        requirement: "Software as a Medical Device (SaMD) must logically prove it lacks biological patient touchpoints and operates strictly as a digital binary.",
        expectedDocument: "Product Definition"
    },
    // Pillar 7: Class I Low-Risk Exemption
    {
        id: "rule_class1_exemption",
        standard: "Class I Exemption Protocol",
        section: "Clinical Trials",
        requirement: "Class I exempt manual instruments without measuring capabilities may securely omit formal pre-market IDE clinical studies.",
        expectedDocument: "Device Description"
    },
    // Pillar 8: Usability Human Factors (Trap)
    {
        id: "rule_human_factors_62366",
        standard: "IEC 62366-1",
        section: "Usability Testing",
        requirement: "Formative usability testing MUST include subjects representative of the actual intended user population (e.g. elderly/naive users), not internal engineers.",
        expectedDocument: "Usability Engineering Report"
    }
];

export async function POST(request: Request) {
    try {
        if (!adminDb) return NextResponse.json({ success: false, error: "Firebase offline" }, { status: 503 });

        console.log("Starting Enterprise Firebase Rule Wipe & Seed...");

        const rulesCol = adminDb.collection("complianceRules");

        // WIPE OUT OLD DATA FOR A CLEAN SLATE
        const snapshot = await rulesCol.get();
        const batch = adminDb.batch();
        
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        // Delete all old rules
        await batch.commit();
        console.log(`Deleted ${snapshot.docs.length} old rules.`);

        // INJECT NEW ENTERPRISE RULES
        const newBatch = adminDb.batch();

        EXHAUSTIVE_RULES.forEach((rule) => {
            const docRef = rulesCol.doc(rule.id);
            newBatch.set(docRef, { ...rule, createdAt: new Date().toISOString() });
        });

        await newBatch.commit();
        console.log(`Successfully injected 8 Comprehensive Medical Device Pillars.`);

        return NextResponse.json({ success: true, message: "Production Firebase rules successfully seeded." });

    } catch (error) {
        console.error("Rules Seeding error:", error);
        return NextResponse.json({ success: false, error: "Failed to seed rules database" }, { status: 500 });
    }
}
