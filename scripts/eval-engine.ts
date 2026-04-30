import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables dynamically based on execution path
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Force live execution, disable mock
process.env.GEMINI_MOCK_MODE = "false";

// Dynamically import to prevent ESM hoisting from breaking dotenv
const { queryGeminiRESTArray } = require("../src/lib/gemini-rest");

const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

async function runEvals() {
    console.log(`${BOLD}${YELLOW}==============================================${RESET}`);
    console.log(`${BOLD}${YELLOW}   TRACEBRIDGE AI: HOSTILE AUDITOR EVALS    ${RESET}`);
    console.log(`${BOLD}${YELLOW}==============================================${RESET}\n`);

    const dataDir = path.resolve(process.cwd(), "demo_data");
    
    // ==========================================
    // TEST 1: FALSE POSITIVE TRAP (Buzzwords)
    // ==========================================
    console.log(`${BOLD}Running Test 1: False Positive Trap (ISO 14971 FMEA)${RESET}`);
    const rmfPath = path.join(dataDir, "MOCK_Risk_Management_Report_v1.0.txt");
    const rmfBuffer = fs.readFileSync(rmfPath);
    
    const rulesTest1 = [{
        id: "RULE_TRAP_1",
        standard: "ISO 14971:2019",
        section: "Risk Management",
        requirement: "The manufacturer shall establish and document a risk management plan in accordance with ISO 14971. This file must contain objective mathematical or table-based severity/probability analysis (e.g. FMEA traces) with documented mitigation variables.",
        expectedDocument: "Risk Management File / FMEA"
    }];

    const filesTest1 = [{
        data: rmfBuffer,
        mimeType: "text/plain",
        name: "MOCK_Risk_Management_Report_v1.0.txt"
    }];

    let result1;
    let retries1 = 3;
    while(retries1 > 0) {
        try {
            result1 = await queryGeminiRESTArray(filesTest1, rulesTest1);
            break;
        } catch(err: any) {
            if (err.message.includes("503") && retries1 > 1) {
                console.warn(`${YELLOW}Google API 503 Spike Detected. Retrying Test 1 in 5 seconds...${RESET}`);
                await new Promise(res => setTimeout(res, 5000));
                retries1--;
            } else {
                console.error(`${RED}Test 1 Critical Failure:${RESET}`, err);
                process.exit(1);
            }
        }
    }

    const engineResponse = result1[0];

    if (engineResponse.found === false && engineResponse.exact_missing_evidence) {
        console.log(`${GREEN}✔ PASS: AI successfully detected the buzzword trap and failed the document!${RESET}`);
        console.log(`  Engine Reasoning: ${engineResponse.analytical_reasoning}`);
        console.log(`  Missing Evidence Flagged: ${RED}${engineResponse.exact_missing_evidence}${RESET}\n`);
    } else {
        console.log(`${RED}✘ FAIL: AI hallucinates a false positive or did not provide exact missing evidence!${RESET}`);
        console.log(JSON.stringify(engineResponse, null, 2));
        process.exit(1);
    }

    // ==========================================
    // TEST 2: GOLDEN DATASET FORGIVENESS
    // ==========================================
    console.log(`${BOLD}Running Test 2: Golden Dataset Forgiveness (IEC 62304 Specifications)${RESET}`);
    const srsPath = path.join(dataDir, "MOCK_Software_Requirements_Specification_v2.1.txt");
    const srsBuffer = fs.readFileSync(srsPath);
    
    const rulesTest2 = [{
        id: "RULE_TRAP_2",
        standard: "FDA Cybersecurity",
        section: "Telemetry Security",
        requirement: "Software architecture must decouple medical logic from UI rendering, and all wireless transmission components (BLE) must utilize AES-256 authenticated encryption to prevent signal hijacking.",
        expectedDocument: "Software Architecture Document / SRS"
    }];

    const filesTest2 = [{
        data: srsBuffer,
        mimeType: "text/plain",
        name: "MOCK_Software_Requirements_Specification_v2.1.txt"
    }];

    let result2;
    let retries2 = 3;
    while(retries2 > 0) {
        try {
            result2 = await queryGeminiRESTArray(filesTest2, rulesTest2);
            break;
        } catch(err: any) {
            if (err.message.includes("503") && retries2 > 1) {
                console.warn(`${YELLOW}Google API 503 Spike Detected. Retrying Test 2 in 5 seconds...${RESET}`);
                await new Promise(res => setTimeout(res, 5000));
                retries2--;
            } else {
                console.error(`${RED}Test 2 Critical Failure:${RESET}`, err);
                process.exit(1);
            }
        }
    }

    const engineResponse2 = result2[0];

    if (engineResponse2.found === true) {
        console.log(`${GREEN}✔ PASS: AI bypassed the superficial formatting and validated the raw mathematical encryption physics!${RESET}`);
        console.log(`  Engine Reasoning: ${engineResponse2.analytical_reasoning}`);
        console.log(`  Confidence: ${engineResponse2.confidence}`);
        if (engineResponse2.citations && engineResponse2.citations.length > 0) {
            console.log(`  Trace Source: ${engineResponse2.citations[0].source} - ${engineResponse2.citations[0].quote}\n`);
        } else {
            console.log(`\n`);
        }
    } else {
        console.log(`${RED}✘ FAIL: AI trapped by bad formatting - generated a false negative!${RESET}`);
        console.log(JSON.stringify(engineResponse2, null, 2));
        process.exit(1);
    }

    console.log(`${BOLD}${GREEN}==============================================${RESET}`);
    console.log(`${BOLD}${GREEN}   ALL QUALITY EVALUATION SYSTEMS PASSED    ${RESET}`);
    console.log(`${BOLD}${GREEN}==============================================${RESET}\n`);
}

runEvals().catch(console.error);
