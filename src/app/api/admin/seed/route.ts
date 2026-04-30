import { NextResponse } from "next/server";
import { adminDb, verifyIdToken } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Device Names
const DEVICES = [
    "Surgical Robot Control Interface v2.4",
    "AI Radiological Triage System",
    "TraceGlow Continuous Glucose Monitor",
    "AeroFlow Infusion Pump Telemetry",
    "CardioLink Implantable Pacemaker Firmware",
    "Orthopedic Drill Calibration System",
    "Ophthalmic Laser Control Board",
    "Dialysis Machine Safety Interlock",
    "Dental Milling CAD/CAM Integration"
];

// The Exhaustive Rules Engine defined for Go-Live UI population
const EXHAUSTIVE_RULES = [
    {
        id: "rule_qms_13485",
        standard: "ISO 13485:2016",
        section: "4.2.1",
        requirement: "The quality management system documentation shall include the quality manual and documented statistical frameworks.",
        expectedDocument: "Quality Manual",
        posPassText: "AI Trace Confirmed: Structural mapping of Quality Manual hierarchical clauses successfully validated.",
        negFailText: "Root Cause Analysis: Strict hierarchical document procedures omitted. System failed to locate explicit phase-gated statistical sampling methodology.",
        missingArtifact: "Quality Manual Section 8.2 Phase-Gated Algorithm"
    },
    {
        id: "rule_cyber",
        standard: "FDA Cybersecurity Guidance",
        section: "V.A",
        requirement: "Premarket submissions must contain a comprehensive Software Bill of Materials (SBOM)",
        expectedDocument: "Cybersecurity Management Plan",
        posPassText: "AI Trace Confirmed: All third-party SBOM components mapped strictly to CVE vulnerability feeds.",
        negFailText: "Root Cause Analysis: Hostile Audit Trap Triggered. Document relies on buzzwords ('secure', 'encryption') but explicitly failed to provide the mathematical SBOM risk ledger.",
        missingArtifact: "Software Bill of Materials (SBOM) mapped to exact CVE numbers."
    },
    {
        id: "rule_iec_arc",
        standard: "IEC 62304",
        section: "5.3",
        requirement: "Establish a software architecture that limits software unit boundary intersections, and explicitly states segregation measures.",
        expectedDocument: "Software Architecture Document",
        posPassText: "AI Trace Confirmed: Sequence diagrams enforce strict API gateway segregation crossing Class C to Class A logic boundaries.",
        negFailText: "Root Cause Analysis: System crash detection - Architecture lacks physical or network memory limiters preventing a Class A sub-routine from modifying a Class C safety function.",
        missingArtifact: "IEC Sequence Flowchart mapping strict RAM segregation."
    },
    {
        id: "rule_risk_14971",
        standard: "ISO 14971:2019",
        section: "7",
        requirement: "Risk evaluation must implement a deterministic threshold comparing the calculated risk index (Probability x Severity matrix) against pre-defined acceptability criteria.",
        expectedDocument: "Risk Management File",
        posPassText: "AI Trace Confirmed: All residual risk calculations deterministically resolve below the accepted threshold algorithm (PxS < 0.05).",
        negFailText: "Root Cause Analysis: Hostile Audit Trap Triggered. Management accepted 'risk vs reward' philosophically but physically failed to compute Probability multiplied by Severity scales.",
        missingArtifact: "Mathematical Probability (P) x Severity (S) calculation chart."
    },
    {
        id: "rule_biocomp",
        standard: "ISO 10993-1",
        section: "Toxicology",
        requirement: "Class III implants must provide physiological extraction toxicology reports proving chemical degradants remain below systematic thresholds.",
        expectedDocument: "Biocompatibility Evaluation",
        posPassText: "AI Trace Confirmed: Polymer extraction bounds explicitly validated via MEM Elution testing (0.05 mg/kg threshold intact).",
        negFailText: "Root Cause Analysis: Polyetheretherketone physical degradation cycles untested over 90-day biological simulations.",
        missingArtifact: "MEM Elution Systematic Cytotoxicity Method Test Results"
    },
    {
        id: "rule_samd_boundary",
        standard: "FDA SaMD Guidance",
        section: "Boundary Limits",
        requirement: "Software as a Medical Device (SaMD) must logically prove it lacks biological patient touchpoints and operates strictly as a digital binary.",
        expectedDocument: "Product Definition",
        posPassText: "AI Trace Confirmed: Application boundaries defined explicitly on Commercial-Off-The-Shelf (COTS) devices without biomechanical hooks. Biocompatibility arrays securely disabled.",
        negFailText: "Root Cause Analysis: The application interfaces with external custom hardware peripherals, breaking SaMD exclusive software status.",
        missingArtifact: "Hardware/Software explicit boundary delineation schematic."
    },
    {
        id: "rule_class1_exemption",
        standard: "Class I Exemption Protocol",
        section: "Clinical Trials",
        requirement: "Class I exempt manual instruments without measuring capabilities may securely omit formal pre-market IDE clinical studies.",
        expectedDocument: "Device Description",
        posPassText: "AI Trace Confirmed: Evaluator effectively softened clinical data parameters since device possesses no diagnostic measurement mechanics.",
        negFailText: "Root Cause Analysis: Device description implies diagnostic measurement logic, nullifying Class I pre-market clinical exemption safety vectors.",
        missingArtifact: "Justification explicit stating absence of analog measuring parameters."
    },
    {
        id: "rule_human_factors_62366",
        standard: "IEC 62366-1",
        section: "Usability Testing",
        requirement: "Formative usability testing MUST include subjects representative of the actual intended user population, not internal engineers.",
        expectedDocument: "Usability Engineering Report",
        posPassText: "AI Trace Confirmed: Patient demographics verified against target medical persona constraints mapping correctly to naive test cases.",
        negFailText: "Root Cause Analysis: Hostile Audit Trap Triggered. Testing demographics exclusively surveyed 25-30 year old internal engineers. Failure to evaluate target 60+ year old nurse personas.",
        missingArtifact: "Demographic breakdown of formative testing pool explicitly isolating target groups."
    }
];

function getRandomDate() {
    const now = new Date();
    const past = new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000); 
    return Timestamp.fromDate(past);
}

export async function POST(request: Request) {
    try {
        if (!adminDb) return NextResponse.json({ success: false, error: "Firebase offline" }, { status: 503 });

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

        const idToken = authHeader.split("Bearer ")[1];
        const verification = await verifyIdToken(idToken);
        
        if (!verification.success || !verification.uid) return NextResponse.json({ success: false, error: "Token validation failed" }, { status: 401 });
        
        const tenantUid = verification.uid;
        console.log(`Starting Exhaustive Database Seed for User: ${tenantUid}`);
        
        const uploadsCol = adminDb.collection("uploads");
        const gapsCol = adminDb.collection("gapResults");

        // UI STRESS TEST: Inject 30 Full Audits
        for (let i = 0; i < 30; i++) {
            const deviceName = DEVICES[Math.floor(Math.random() * DEVICES.length)];
            const statusInt = Math.random();
            const status = statusInt > 0.85 ? "analyzing" : statusInt > 0.75 ? "pending" : "complete";
            
            const uploadRef = await uploadsCol.add({
                userId: tenantUid,
                deviceName: `${deviceName} [TEST-${i}X]`,
                productCode: "N/A",
                deviceClass: "Class II",
                regulationNumber: "870.xxxx",
                features: { requiresSoftware: true, requiresClinical: false, requiresBiocompatibility: false },
                standards: ["ISO 13485:2016", "ISO 14971:2019", "IEC 62304", "IEC 62366-1", "ISO 10993-1"],
                status: status,
                createdAt: getRandomDate(),
                updatedAt: Timestamp.now(),
            });

            if (status === "complete") {
                // UI STRESS TEST: Massive node loading
                const numGaps = Math.floor(Math.random() * 25) + 15;
                const batchPromises = [];
                
                for (let g = 0; g < numGaps; g++) {
                    const rule = EXHAUSTIVE_RULES[Math.floor(Math.random() * EXHAUSTIVE_RULES.length)];
                    
                    const gapStatusInt = Math.random();
                    // 60% Valid, 30% Gap, 10% Manual Review target
                    const state = gapStatusInt > 0.4 ? "compliant" : gapStatusInt > 0.1 ? "gap_detected" : "needs_review";
                    const severity = state === "gap_detected" ? (Math.random() > 0.5 ? "critical" : "major") : state === "needs_review" ? "minor" : "none";
                    
                    const gapData = {
                        uploadId: uploadRef.id,
                        userId: tenantUid,
                        standard: rule.standard,
                        section: rule.section,
                        requirement: rule.requirement,
                        status: state,
                        severity: severity,
                        gapTitle: state === "compliant" ? `${rule.requirement.substring(0, 40)}... Verified` : `Missing: ${rule.requirement.substring(0, 40)}`,
                        missingRequirement: state === "gap_detected" ? rule.requirement : "",
                        
                        // NEW EXPLICABILITY LOGIC MAPPED TO UI
                        reasoning: state === "compliant" ? rule.posPassText : rule.negFailText,
                        missingEvidence: state !== "compliant" ? rule.missingArtifact : undefined,
                        
                        citations: state === "compliant" ? [{ 
                            source: rule.expectedDocument, 
                            section: `${rule.section}.${Math.floor(Math.random() * 5)}`, 
                            quote: `The system structurally implements requirements mapping to ${rule.section} accurately.` 
                        }] : [],
                        
                        estimatedCost: state === "gap_detected" ? "$3,500 - $7,000" : "—",
                        estimatedTimeline: state === "gap_detected" ? "2-4 weeks" : "—",
                        createdAt: Timestamp.now(),
                    };
                    batchPromises.push(gapsCol.add(gapData));
                }
                
                await Promise.all(batchPromises);
            }
        }

        return NextResponse.json({ success: true, message: "Successfully seeded 900+ Full Exhaustive UI Nodes." });
        
    } catch (error) {
        console.error("Seeding error:", error);
        return NextResponse.json({ success: false, error: "Failed to seed" }, { status: 500 });
    }
}
