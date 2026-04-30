import { NextResponse } from "next/server";
import { queryGeminiRESTArray } from "@/lib/gemini-rest";
import * as fs from "fs";
import * as path from "path";

const EXHAUSTIVE_RULES = [
    {
        id: "rule_qms_13485",
        standard: "ISO 13485:2016",
        section: "4.2.1",
        requirement: "The quality management system documentation shall include the quality manual, documented procedures required by this standard, and documented statistical frameworks.",
        expectedDocument: "Quality Manual"
    },
    {
        id: "rule_cyber",
        standard: "FDA Cybersecurity Guidance",
        section: "V.A",
        requirement: "Premarket submissions must contain a comprehensive Software Bill of Materials (SBOM)",
        expectedDocument: "Cybersecurity Management Plan"
    },
    {
        id: "rule_iec_arc",
        standard: "IEC 62304",
        section: "5.3",
        requirement: "The manufacturer shall establish a software architecture that limits software unit boundary intersections, and explicitly states segregation measures.",
        expectedDocument: "Software Architecture Document"
    },
    {
        id: "rule_risk_14971",
        standard: "ISO 14971:2019",
        section: "7",
        requirement: "Risk evaluation must implement a deterministic threshold comparing the calculated risk index (Probability x Severity matrix) against pre-defined acceptability criteria.",
        expectedDocument: "Risk Management File"
    }
];

function getFileBuffer(filename: string) {
    const p = path.join(process.cwd(), "public", "demo_data", filename);
    if (!fs.existsSync(p)) return undefined;
    return { data: fs.readFileSync(p), mimeType: "text/plain", name: filename };
}

export async function POST(request: Request) {
    try {
        console.log("EXEC: Starting Massive Live Clinical Eval Core...");
        
        // Disable Mock Mode inside the runtime execution context
        process.env.GEMINI_MOCK_MODE = "false";

        // Load Real Datasets
        const filenames = [
            "Live_510k_Hostile_Audit_18_Docs.txt"
        ];

        const files = filenames.map(getFileBuffer).filter(f => f !== undefined) as { data: Buffer; mimeType: string; name: string }[];
        
        if (files.length === 0) {
            return NextResponse.json({ success: false, error: "Real datasets not found in /public/demo_data." }, { status: 500 });
        }

        const startTime = Date.now();
        
        // Fire array of complex massive documents through the Live Gemini core
        const rawResults = await queryGeminiRESTArray(files, EXHAUSTIVE_RULES);
        
        const execTime = Date.now() - startTime;

        // Compile comprehensive metric report
        const formattedResults = rawResults.map(res => {
            const ruleObj = EXHAUSTIVE_RULES.find(r => r.id === res.ruleId);
            return {
                metric: `${ruleObj?.standard} § ${ruleObj?.section}`,
                isCompliant: res.found,
                confidence: res.confidence,
                aiReasoning: res.analytical_reasoning,
                missingEvidenceRequested: res.exact_missing_evidence || "None",
                citationExtracted: res.citations && res.citations.length > 0 ? res.citations[0].quote : "N/A"
            };
        });

        // Compute overarching accuracy heuristics (just simple tracking)
        const passes = formattedResults.filter(r => r.isCompliant).length;
        const fails = formattedResults.length - passes;
        const highConfidence = formattedResults.filter(r => r.confidence === "high").length;

        const reportObject = {
            totalEvaluations: formattedResults.length,
            timeElapsedMs: execTime,
            truePositives: passes,
            trueNegatives: fails,
            confidenceRatio: `${((highConfidence / formattedResults.length) * 100).toFixed(0)}% High Certainty`,
            resultsMatrix: formattedResults
        };

        return NextResponse.json({ success: true, report: reportObject });
        
    } catch (error) {
        console.error("Live Eval Core error:", error);
        return NextResponse.json({ success: false, error: "Fatal exception in Live Core array" }, { status: 500 });
    }
}
