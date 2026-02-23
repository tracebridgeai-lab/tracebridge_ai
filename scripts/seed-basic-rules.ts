/**
 * Seed basic compliance rules for testing
 * Run with: npx tsx scripts/seed-basic-rules.ts
 */

import "dotenv/config";
import { adminDb } from "../src/lib/firebase-admin";

const BASIC_RULES = [
    // IEC 62304:2006 - Medical Device Software Lifecycle
    {
        standard: "IEC 62304:2006",
        section: "5.1.1",
        requirement: "Software development planning",
        requiredForClass: "A, B, C",
        expectedDocument: "Software Development Plan",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "5.2.1",
        requirement: "Define and document software requirements",
        requiredForClass: "A, B, C",
        expectedDocument: "Software Requirements Specification",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "5.3.1",
        requirement: "Transform software requirements into architecture",
        requiredForClass: "B, C",
        expectedDocument: "Software Architecture Document",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "5.5.1",
        requirement: "Establish software integration and integration testing",
        requiredForClass: "B, C",
        expectedDocument: "Software Integration Test Plan",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "5.6.1",
        requirement: "Establish software system testing",
        requiredForClass: "A, B, C",
        expectedDocument: "Software System Test Plan",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "5.7.1",
        requirement: "Ensure software verification is complete",
        requiredForClass: "A, B, C",
        expectedDocument: "Software Verification Report",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "5.8.1",
        requirement: "Ensure software validation is complete",
        requiredForClass: "A, B, C",
        expectedDocument: "Software Validation Report",
        category: "software_lifecycle"
    },
    {
        standard: "IEC 62304:2006",
        section: "8.1.1",
        requirement: "Establish configuration management process",
        requiredForClass: "A, B, C",
        expectedDocument: "Configuration Management Plan",
        category: "software_lifecycle"
    },

    // ISO 14971:2019 - Risk Management
    {
        standard: "ISO 14971:2019",
        section: "4.1",
        requirement: "Risk management process",
        requiredForClass: "All",
        expectedDocument: "Risk Management Plan",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "4.2",
        requirement: "Management responsibilities",
        requiredForClass: "All",
        expectedDocument: "Risk Management Policy",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "5.2",
        requirement: "Intended use and reasonably foreseeable misuse",
        requiredForClass: "All",
        expectedDocument: "Intended Use Document",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "5.3",
        requirement: "Identification of characteristics related to safety",
        requiredForClass: "All",
        expectedDocument: "Safety Characteristics Document",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "5.4",
        requirement: "Identification of hazards and hazardous situations",
        requiredForClass: "All",
        expectedDocument: "Hazard Analysis",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "5.5",
        requirement: "Risk estimation",
        requiredForClass: "All",
        expectedDocument: "Risk Assessment Matrix",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "6.2",
        requirement: "Risk control option analysis",
        requiredForClass: "All",
        expectedDocument: "Risk Control Measures",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "7.1",
        requirement: "Residual risk evaluation",
        requiredForClass: "All",
        expectedDocument: "Residual Risk Analysis",
        category: "risk_management"
    },
    {
        standard: "ISO 14971:2019",
        section: "8",
        requirement: "Risk management review",
        requiredForClass: "All",
        expectedDocument: "Risk Management Report",
        category: "risk_management"
    },

    // ISO 13485:2016 - Quality Management
    {
        standard: "ISO 13485:2016",
        section: "4.1.1",
        requirement: "General requirements for quality management system",
        requiredForClass: "All",
        expectedDocument: "Quality Manual",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "4.2.3",
        requirement: "Control of documents",
        requiredForClass: "All",
        expectedDocument: "Document Control Procedure",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "4.2.4",
        requirement: "Control of records",
        requiredForClass: "All",
        expectedDocument: "Record Control Procedure",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "5.5.1",
        requirement: "Management representative",
        requiredForClass: "All",
        expectedDocument: "Management Representative Appointment",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "6.2",
        requirement: "Human resources competence and training",
        requiredForClass: "All",
        expectedDocument: "Training Records",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "7.1",
        requirement: "Planning of product realization",
        requiredForClass: "All",
        expectedDocument: "Product Development Plan",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "7.3.2",
        requirement: "Design and development inputs",
        requiredForClass: "All",
        expectedDocument: "Design Input Specification",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "7.3.3",
        requirement: "Design and development outputs",
        requiredForClass: "All",
        expectedDocument: "Design Output Specification",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "7.3.4",
        requirement: "Design and development review",
        requiredForClass: "All",
        expectedDocument: "Design Review Records",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "7.3.5",
        requirement: "Design and development verification",
        requiredForClass: "All",
        expectedDocument: "Design Verification Report",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "7.3.6",
        requirement: "Design and development validation",
        requiredForClass: "All",
        expectedDocument: "Design Validation Report",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "8.2.1",
        requirement: "Feedback and complaints handling",
        requiredForClass: "All",
        expectedDocument: "Complaint Handling Procedure",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "8.2.2",
        requirement: "Internal audit",
        requiredForClass: "All",
        expectedDocument: "Internal Audit Reports",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "8.5.2",
        requirement: "Corrective action",
        requiredForClass: "All",
        expectedDocument: "CAPA Records",
        category: "qms"
    },
    {
        standard: "ISO 13485:2016",
        section: "8.5.3",
        requirement: "Preventive action",
        requiredForClass: "All",
        expectedDocument: "Preventive Action Records",
        category: "qms"
    }
];

async function main() {
    console.log("🌱 Seeding Firestore with basic compliance rules...\n");

    if (!adminDb) {
        console.error("❌ Firebase Admin not initialized. Check environment variables.");
        process.exit(1);
    }

    // Clear existing rules
    try {
        const existingRules = await adminDb.collection("complianceRules").get();
        if (existingRules.size > 0) {
            const batch = adminDb.batch();
            existingRules.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`  Cleared ${existingRules.size} existing rules\n`);
        }
    } catch (err) {
        console.error("  Warning: Failed to clear existing rules", err);
    }

    // Insert rules
    let inserted = 0;
    const batch = adminDb.batch();

    for (const rule of BASIC_RULES) {
        const docRef = adminDb.collection("complianceRules").doc();
        batch.set(docRef, rule);
    }

    try {
        await batch.commit();
        inserted = BASIC_RULES.length;
        console.log(`  ✓ Inserted ${inserted} compliance rules`);
    } catch (error) {
        console.error(`  ✗ Failed to insert rules:`, error);
        process.exit(1);
    }

    console.log(`\n✅ Successfully seeded ${inserted} compliance rules`);
    console.log("\nRules by standard:");
    console.log(`  - IEC 62304:2006: ${BASIC_RULES.filter(r => r.standard === "IEC 62304:2006").length}`);
    console.log(`  - ISO 14971:2019: ${BASIC_RULES.filter(r => r.standard === "ISO 14971:2019").length}`);
    console.log(`  - ISO 13485:2016: ${BASIC_RULES.filter(r => r.standard === "ISO 13485:2016").length}`);
}

main()
    .then(() => {
        console.log("\n✨ Done!");
        process.exit(0);
    })
    .catch((e) => {
        console.error("\n❌ Error:", e);
        process.exit(1);
    });
