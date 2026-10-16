import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const productCode = searchParams.get("code") || "LLZ";

    try {
        // 1. Fetch live openFDA enforcement reports for this device class
        const enforcementRes = await fetch(`https://api.fda.gov/device/enforcement.json?search=product_code:${productCode}&limit=3`);
        const enforcmentData = await enforcementRes.json();
        
        // 2. Fetch live 510(k) clearances
        const clearanceRes = await fetch(`https://api.fda.gov/device/510k.json?search=product_code:${productCode}&limit=2`);
        const clearanceData = await clearanceRes.json();

        // If the openFDA API fails or returns no real-time results, we fallback to our known datasets
        if (!enforcementRes.ok || !enforcmentData.results) {
            return generateFallbackPrecedents(productCode);
        }

        const reports = [];

        // Parse Enforcement reports (openFDA enforcement data is recalls, not warning letters)
        for (const item of enforcmentData.results || []) {
            reports.push({
                type: "Recall",
                title: `${item.recalling_firm} - ${item.reason_for_recall.substring(0, 50)}...`,
                date: item.report_date,
                description: item.reason_for_recall
            });
        }

        // Parse Clearances
        for (const item of clearanceData.results || []) {
            reports.push({
                type: "510k",
                title: `${item.applicant} clearance granted`,
                date: item.decision_date,
                description: `Predicate device for ${item.device_name}`
            });
        }

        return NextResponse.json({ success: true, data: reports });

    } catch (err: any) {
        console.error("OpenFDA fetch error:", err);
        return generateFallbackPrecedents(productCode);
    }
}

function generateFallbackPrecedents(code: string) {
    // openFDA is unavailable or returned nothing. Return no precedents rather than
    // placeholder entries, so the app never shows enforcement actions that didn't happen.
    return NextResponse.json({
        success: true,
        data: [],
        message: `Live FDA precedents are unavailable right now for product code ${code}.`
    });
}
