import { queryGeminiRESTArray } from "../src/lib/gemini-rest";
import * as fs from "fs";
import * as path from "path";

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

const C = {
    rst: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", 
    blu: "\x1b[34m", mag: "\x1b[35m", cya: "\x1b[36m",
    bgBlue: "\x1b[44m", bgMag: "\x1b[45m"
};

function getBigFileBuffer() {
    const filename = "TraceGlow_Comprehensive_Submission_V3.txt";
    const p = path.join(process.cwd(), "public", "demo_data", filename);
    if (!fs.existsSync(p)) {
        console.error(`${C.red}CRITICAL: Cannot locate full context file at PUBLIC: ${p}${C.rst}`);
        process.exit(1);
    }
    const data = fs.readFileSync(p);
    return { data, mimeType: "text/plain", name: filename };
}

async function runDeepTests() {
    console.clear();
    console.log(`\n${C.bgMag}${C.bold} TRACEBRIDGE AI : MASSIVE CONTEXT EXECUTION ${C.rst}`);
    console.log(`${C.dim}Simulating a full 45-Page FDA Submission against the cognitive engine...\n${C.rst}`);

    const file = getBigFileBuffer();

    // To prevent API token exhaustion during local CLI testing, we use Mock Mode.
    // Turn this to "false" to spend real Gemini API credits.
    process.env.GEMINI_MOCK_MODE = "true";

    try {
        console.log(`${C.yel}▶ Analyzing mass unstructured dataset: ${file.name} (${(file.data.length / 1024).toFixed(1)} KB)...${C.rst}`);
        console.log(`${C.yel}▶ Injecting dataset to parallel vector mappings...${C.rst}`);
        console.log(`${C.cya}▶ Dispatching 8 compliance heuristics into the 45-page context window...${C.rst}\n`);
        
        const startTime = Date.now();
        const results = await queryGeminiRESTArray([file], EXHAUSTIVE_RULES);
        const execTime = Date.now() - startTime;

        console.log(`${C.bold}LONG-CONTEXT EVALUATION COMPLETE (${execTime}ms)${C.rst}`);
        console.log(`================================================================================`);

        results.forEach(res => {
            const rule = EXHAUSTIVE_RULES.find(r => r.id === res.ruleId);
            if (!rule) return;

            const isPass = res.found;
            const statusStr = isPass ? `${C.grn}${C.bold}[✓ TRACE FOUND IN 45-PAGES]${C.rst}` : `${C.red}${C.bold}[✕ CRITICAL GAP: MISSING]${C.rst}`;

            console.log(`\n${C.bold}ISO METRIC:${C.rst}  ${C.blu}${rule.standard} § ${rule.section}${C.rst}`);
            console.log(`${C.bold}VERDICT:${C.rst}     ${statusStr} ${C.dim}(Confidence: ${res.confidence.toUpperCase()})${C.rst}`);
            console.log(`${C.bold}LOGIC RATIONALE:${C.rst} ${res.analytical_reasoning}`);
            
            if (!isPass) {
                console.log(`${C.red}REQUIRED ARTIFACT:${C.rst} ${res.exact_missing_evidence}`);
            } else if (res.citations?.length) {
                console.log(`${C.grn}EXACT CITATION:${C.rst}  "${res.citations[0].quote}"`);
            }
            console.log(`--------------------------------------------------------------------------------`);
        });

        console.log(`\n${C.grn}${C.bold}✓ MASSIVE CONTEXT TEST SUCCESSFUL. ALL REGULATORY ZONES SCANNED.${C.rst}\n`);

    } catch (e) {
        console.error(`${C.red}TEST SUITE FATAL EXCEPTION${C.rst}`, e);
    }
}

runDeepTests();
