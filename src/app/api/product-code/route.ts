import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * POST /api/product-code
 * Uses Gemini to extract the most likely FDA product code from a device name/description.
 * Returns the product code, device class, and applicable regulations.
 */
export async function POST(request: Request) {
    try {
        const { deviceName } = await request.json();

        if (!deviceName) {
            return NextResponse.json(
                { success: false, error: "Missing deviceName" },
                { status: 400 }
            );
        }

        const prompt = `You are an FDA regulatory expert. Given the medical device name/description below, determine:

1. The most likely FDA Product Code (3-letter code, e.g. "GEX", "DQA", "QAS")
2. The product code description (e.g. "Electrocardiograph", "Computed Tomography System")
3. The device class (Class I, Class II, or Class III)
4. The regulation number (e.g. "21 CFR 870.2340")
5. The review panel (e.g. "Cardiovascular", "Radiology")
6. Whether a 510(k) is required (true/false)
7. A list of applicable FDA guidance documents or standards

Device Name/Description: "${deviceName}"

Return ONLY valid JSON in this exact format (no markdown, no code block):
{
  "productCode": "XXX",
  "productCodeDescription": "...",
  "deviceClass": "Class II",
  "regulationNumber": "21 CFR XXX.XXXX",
  "reviewPanel": "...",
  "requires510k": true,
  "applicableStandards": ["IEC 62304:2006", "ISO 14971:2019", "ISO 13485:2016"],
  "applicableGuidances": ["Guidance document 1", "Guidance document 2"]
}`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1024,
                    },
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Failed to parse product code response");
        }

        const productCodeData = JSON.parse(jsonMatch[0]);

        return NextResponse.json({
            success: true,
            data: productCodeData,
        });
    } catch (error) {
        console.error("Product code detection error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to detect product code",
            },
            { status: 500 }
        );
    }
}
