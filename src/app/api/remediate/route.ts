import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { gapTitle, requirement, missingRequirement, standard, section, citations } = body;

        if (!gapTitle || !requirement) {
            return NextResponse.json({ success: false, error: "Missing required parameters." }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        let citationContext = "No relevant text was found in the submitted documents.";
        if (citations && citations.length > 0) {
            citationContext = citations.map((c: any, index: number) => {
                return `Document Name: ${c.source}\nSection Found: ${c.section}\nText Evaluated: "${c.quote}"\n`;
            }).join("\n---\n");
        }

        const prompt = `
You are the Lead Quality Assurance Engineer and Regulatory Affairs compliance expert for a Medical Device company.
We are currently evaluating our device against the following regulatory framework: ${standard}.

An audit just flagged a compliance gap on our recent submission. Below is the exact data from the analysis.

=====================================
# GAP IDENTIFIED
Target Line: ${standard} Section ${section}
Official Regulatory Requirement: ${requirement}

# THE FAILURE REASON
Why the submitted documents failed: ${missingRequirement}

# SPECIFIC DOCUMENT CONTEXT EXTRACTED
Here is the specific text our engine found in the submitted documents regarding this requirement. Look closely at exactly what the document said vs what the standard requires:
${citationContext}
=====================================

YOUR TASK:
Provide a brutally clear, step-by-step remediation plan to fix exactly what was lacking in the SPECIFIC documents referenced above.

Format your response in beautiful Markdown strictly following this structure:

### 1. Document Error Analysis
State explicitly *why* the extracted text in the specific documents (e.g. System_Architecture.pdf) failed to meet the regulatory requirement. If no documents were found, state that the document is entirely missing.

### 2. Actionable Engineering Fix
Provide the exact tactical steps the engineering team must take to fix this document so it complies with ${standard} Section ${section}. 

### 3. Drafted Compliant Clause (To be pasted)
Write the exact, highly technical formal language that the engineers can directly Copy & Paste into their document to resolve the gap. Make sure the drafted language perfectly resolves the constraint mentioned in the "Failure Reason".
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        return NextResponse.json({ success: true, data: { remediationText: text } });
    } catch (err: any) {
        console.error("AI Remediation Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
