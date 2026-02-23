/**
 * Test script to list available Gemini models for your API key
 * Run with: npx tsx scripts/test-gemini-models.ts
 */

import "dotenv/config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
    console.log("🔍 Testing Gemini API access...\n");
    console.log(`API Key: ${GEMINI_API_KEY?.substring(0, 20)}...`);
    console.log("");

    // Try v1 API
    console.log("📋 Checking v1 API models:");
    try {
        const v1Response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`
        );
        
        if (v1Response.ok) {
            const v1Data = await v1Response.json();
            console.log("✅ v1 API accessible");
            console.log(`Found ${v1Data.models?.length || 0} models:`);
            v1Data.models?.forEach((model: any) => {
                console.log(`  - ${model.name}`);
            });
        } else {
            const errorText = await v1Response.text();
            console.log(`❌ v1 API error: ${v1Response.status}`);
            console.log(errorText);
        }
    } catch (error) {
        console.log(`❌ v1 API failed:`, error);
    }

    console.log("");

    // Try v1beta API
    console.log("📋 Checking v1beta API models:");
    try {
        const v1betaResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
        );
        
        if (v1betaResponse.ok) {
            const v1betaData = await v1betaResponse.json();
            console.log("✅ v1beta API accessible");
            console.log(`Found ${v1betaData.models?.length || 0} models:`);
            v1betaData.models?.forEach((model: any) => {
                console.log(`  - ${model.name}`);
                if (model.supportedGenerationMethods?.includes('generateContent')) {
                    console.log(`    ✓ Supports generateContent`);
                }
            });
        } else {
            const errorText = await v1betaResponse.text();
            console.log(`❌ v1beta API error: ${v1betaResponse.status}`);
            console.log(errorText);
        }
    } catch (error) {
        console.log(`❌ v1beta API failed:`, error);
    }

    console.log("");
    console.log("🎯 Recommendation:");
    console.log("If no models are listed above, your API key has restrictions.");
    console.log("This could be due to:");
    console.log("  - Regional restrictions");
    console.log("  - Account type limitations");
    console.log("  - API key permissions");
    console.log("");
    console.log("Solutions:");
    console.log("  1. Try creating API key from: https://aistudio.google.com/apikey");
    console.log("  2. Use a different Google account");
    console.log("  3. Switch to OpenAI GPT-4 (more reliable)");
}

listModels()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("Error:", e);
        process.exit(1);
    });
