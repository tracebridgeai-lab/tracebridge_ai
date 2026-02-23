/**
 * Test network connectivity to Google Gemini API
 * Run with: npx tsx scripts/test-network.ts
 */

import "dotenv/config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testConnectivity() {
    console.log("🌐 Testing network connectivity to Gemini API...\n");

    // Test 1: Simple model list (no file upload)
    console.log("Test 1: List models (simple GET request)");
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`,
            { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            console.log("✅ GET request successful");
        } else {
            console.log(`❌ GET request failed: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ GET request error:`, error instanceof Error ? error.message : error);
    }

    console.log("");

    // Test 2: Simple text generation (no files)
    console.log("Test 2: Simple text generation (POST request, no files)");
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: "Say hello" }]
                    }]
                }),
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            console.log(`✅ POST request successful`);
            console.log(`Response: ${text.substring(0, 100)}`);
        } else {
            console.log(`❌ POST request failed: ${response.status}`);
            const errorText = await response.text();
            console.log(errorText.substring(0, 200));
        }
    } catch (error) {
        console.log(`❌ POST request error:`, error instanceof Error ? error.message : error);
    }

    console.log("");

    // Test 3: Small file upload
    console.log("Test 3: File upload (POST with base64 data)");
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Create a tiny test file
        const testData = Buffer.from("Test document content").toString("base64");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "What is in this document?" },
                            {
                                inline_data: {
                                    mime_type: "text/plain",
                                    data: testData
                                }
                            }
                        ]
                    }]
                }),
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
            console.log(`✅ File upload successful`);
        } else {
            console.log(`❌ File upload failed: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ File upload error:`, error instanceof Error ? error.message : error);
    }

    console.log("");
    console.log("🎯 Diagnosis:");
    console.log("If all tests fail with 'fetch failed' or 'timeout':");
    console.log("  - Check firewall settings");
    console.log("  - Try disabling VPN");
    console.log("  - Check if proxy is required");
    console.log("  - Try from a different network");
    console.log("");
    console.log("If only file upload fails:");
    console.log("  - File size may be too large");
    console.log("  - Try reducing document size");
}

testConnectivity()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("Error:", e);
        process.exit(1);
    });
