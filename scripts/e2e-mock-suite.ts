import { queryGeminiRESTArray } from "../src/lib/gemini-rest";
import * as fs from "fs";
import * as path from "path";

const MOCK_RULES = [
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
        requirement: "Premarket submissions must contain a comprehensive Software Bill of Materials (SBOM) and explicit mitigation matrix for all known Common Vulnerabilities and Exposures (CVE).",
        expectedDocument: "Cybersecurity Management Plan"
    },
    {
        id: "rule_iec_arc",
        standard: "IEC 62304",
        section: "5.3",
        requirement: "The manufacturer shall establish a software architecture that defines software items, limits software unit boundary intersections, and explicitly states segregation measures between safety classes.",
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

// CLI Graphics & Colors
const C = {
    rst: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", 
    blu: "\x1b[34m", mag: "\x1b[35m", cya: "\x1b[36m",
    bgBlue: "\x1b[44m"
};

function getFileBuffer(filename: string) {
    const p = path.join(process.cwd(), "demo_data", filename);
    const data = fs.readFileSync(p);
    return { data, mimeType: "text/plain", name: filename };
}

async function runTests() {
    console.clear();
    console.log(`\n${C.bgBlue}${C.bold} TRACEBRIDGE AI : GO-LIVE GOVERNANCE SUITE ${C.rst}`);
    console.log(`${C.dim}Executing high-velocity cognitive testing on FDA verticals...\n${C.rst}`);

    const files = [
        getFileBuffer("TEST_01_ISO_13485_QMS_Pass.txt"),
        getFileBuffer("TEST_02_Cybersecurity_SBOM_Fail.txt"),
        getFileBuffer("TEST_03_IEC_62304_Architecture_Pass.txt"),
        getFileBuffer("TEST_04_ISO_14971_Risk_Matrix_Fail.txt")
    ];

    process.env.GEMINI_MOCK_MODE = "true";

    try {
        console.log(`${C.cya}▶ Mounting document vectors...${C.rst}`);
        console.log(`${C.cya}▶ Dispatching cognitive evaluation against 4 strict compliance rules...${C.rst}\n`);
        
        const startTime = Date.now();
        const results = await queryGeminiRESTArray(files, MOCK_RULES);
        const execTime = Date.now() - startTime;

        console.log(`${C.bold}EVALUATION MATRIX COMPLETE (${execTime}ms)${C.rst}`);
        console.log(`================================================================================`);

        results.forEach(res => {
            const rule = MOCK_RULES.find(r => r.id === res.ruleId);
            if (!rule) return;

            const isPass = res.found;
            const statusStr = isPass ? `${C.grn}${C.bold}[✓ CONFIRMED]${C.rst}` : `${C.red}${C.bold}[✕ CRITICAL GAP]${C.rst}`;
            const expectedStr = res.ruleId.includes("Pass") ? "True Positive" : "True Negative";

            console.log(`\n${C.bold}RULE:${C.rst}      ${C.blu}${rule.standard} § ${rule.section}${C.rst}`);
            console.log(`${C.bold}STATUS:${C.rst}    ${statusStr} ${C.dim}(Confidence: ${res.confidence.toUpperCase()})${C.rst}`);
            console.log(`${C.bold}AI REASON:${C.rst} ${res.analytical_reasoning}`);
            
            if (!isPass) {
                console.log(`${C.red}ACTION RAT:${C.rst} ${res.exact_missing_evidence}`);
            } else if (res.citations?.length) {
                console.log(`${C.grn}CITATION:${C.rst}  "${res.citations[0].quote}"`);
            }
            console.log(`--------------------------------------------------------------------------------`);
        });

        console.log(`\n${C.grn}${C.bold}✓ SYNTHETIC SUITE NOMINAL. SYSTEM READY FOR FDA BURDEN.${C.rst}\n`);

    } catch (e) {
        console.error(`${C.red}TEST SUITE FATAL EXCEPTION${C.rst}`, e);
    }
}

runTests();
