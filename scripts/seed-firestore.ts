/**
 * Seed Firestore with compliance rules from OpenRegulatory templates
 * Run with: npx tsx scripts/seed-firestore.ts
 */

import "dotenv/config";
import { adminDb } from "../src/lib/firebase-admin";
import { parseAllTemplates } from "./parse-templates";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("🌱 Seeding Firestore with compliance rules...\n");

    // Check if Firebase is initialized
    if (!adminDb) {
        console.error("❌ Firebase Admin not initialized. Please check your environment variables:");
        console.error("   - FIREBASE_PROJECT_ID");
        console.error("   - FIREBASE_CLIENT_EMAIL");
        console.error("   - FIREBASE_PRIVATE_KEY");
        process.exit(1);
    }

    // Parse templates
    const templatesDir = path.resolve(
        __dirname,
        "..",
        "phase_2_files",
        "regulatory_rules",
        "openregulatory_templates"
    );

    console.log(`  Parsing templates from: ${templatesDir}`);

    let rules;
    try {
        rules = parseAllTemplates(templatesDir);
    } catch (err) {
        console.error("  Error parsing templates:", err);
        process.exit(1);
    }

    console.log(`  Found ${rules.length} rules to insert...\n`);

    // Clear existing rules (optional - comment out if you want to keep existing)
    try {
        const existingRules = await adminDb.collection("complianceRules").get();
        const batch = adminDb.batch();
        existingRules.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`  Cleared ${existingRules.size} existing rules\n`);
    } catch (err) {
        console.error("  Warning: Failed to clear existing rules", err);
    }

    // Insert rules into Firestore in batches (Firestore has a 500 operation limit per batch)
    let inserted = 0;
    const batchSize = 500;

    for (let i = 0; i < rules.length; i += batchSize) {
        const batch = adminDb.batch();
        const batchRules = rules.slice(i, i + batchSize);

        for (const rule of batchRules) {
            const docRef = adminDb.collection("complianceRules").doc();
            batch.set(docRef, {
                standard: rule.standard,
                section: rule.section,
                requirement: rule.requirement,
                requiredForClass: rule.requiredForClass,
                expectedDocument: rule.expectedDocument,
                category: rule.category,
            });
        }

        try {
            await batch.commit();
            inserted += batchRules.length;
            console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${batchRules.length} rules)`);
        } catch (error) {
            console.error(`  ✗ Failed to insert batch ${Math.floor(i / batchSize) + 1}:`, error);
        }
    }

    console.log(`\n✅ Seeded ${inserted} compliance rules into Firestore`);
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
