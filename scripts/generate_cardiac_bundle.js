const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'demo_data', 'Real_Device_Cardiac_Bundle');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

const docs = [
    {
        name: "01_Intended_Use_Statement.txt",
        content: `DEVICE IDENTIFICATION: KardiaAI Smart Rhythm Detector (SaMD)
PRODUCT CODE: QDA
DEVICE CLASS: Class II (Special Controls)

INTENDED USE:
The KardiaAI App is a software-only mobile medical application intended to mathematically analyze physiological data acquired by compatible consumer smartwatch photoplethysmography (PPG) sensors. It is intended to identify episodes of irregular heart rhythms suggestive of Atrial Fibrillation (AFib) and notify the user.

WARNINGS:
- The KardiaAI App is not intended to replace traditional methods of diagnosis or treatment.
- The app is not intended for use by people under 22 years old.
- The app does not detect heart attacks, blood clots, or strokes.

ENVIRONMENT OF USE: Over-the-Counter (OTC) consumer usage.`
    },
    {
        name: "02_IEC62304_Software_Architecture.txt",
        content: `DOCUMENT: Software Architecture Specification (SAS)
STANDARD: IEC 62304:2015
SOFTWARE SAFETY CLASS: Class C

1. OVERVIEW
The architecture consists of three rigidly segregated modules:
1) Sensor API Daemon (SAD) - C++ hardware bridge
2) Neural Classification Engine (NCE) - TensorFlow Lite module
3) User Interface Viewer (UIV) - React Native presentation layer

2. SEGREGATION OF SOFTWARE ITEMS
To prevent UI thread crashes from interrupting critical clinical analysis, the NCE runs in an isolated, high-priority background worker thread (Thread 1). The UIV is restricted from direct memory access to the NCE model state. Inter-process communication is handled strictly via highly restricted local MQTT queues.

3. UNKNOWN PROVENANCE (SOUP)
- React Native v0.72 (Class A)
- SQLite v3.41 (Class B)
- TensorFlow Lite v2.10 (Class C)`
    },
    {
        name: "03_Software_Requirements_Spec.txt",
        content: `DOCUMENT: Software Requirements Specification (SRS)
DEVICE: KardiaAI

REQ-001 [CLINICAL]: The Classification Engine MUST process a 30-second PPG waveform buffer within 2.5 seconds.
REQ-002 [CLINICAL]: The algorithm MUST achieve a Sensitivity of >= 98.0% and Specificity of >= 97.5% for AFib detection against the MIT-BIH Arrhythmia Database.
REQ-003 [UI]: The UI MUST display a clear "Inconclusive Recording" state if the signal-to-noise ratio drops below 15dB.
REQ-004 [DATA]: All stored ECG waveforms MUST be encrypted using AES-256-GCM before writing to local SQLite.
REQ-005 [ALARM]: If a sustained heart rate > 150 BPM is detected for more than 5 minutes at rest, the UI MUST generate a High-Priority notification override.`
    },
    {
        name: "04_ISO14971_Risk_Management_Report.txt",
        content: `DOCUMENT: ISO 14971 Risk Management Report & Hazard Traceability
RISK ACCEPTABILITY CRITERIA: All risks must be reduced to "ALARP" (As Low As Reasonably Practicable) and cannot reside in the RED Zone.

HAZARD HZ-01: False Negative Detection of AFib
Cause: Algorithm fails to identify low-amplitude P-waves due to motion artifact.
Severity: Critical (Delay in medical intervention)
Probability (Pre-mitigation): Occasional
Risk Level: UNACCEPTABLE (Red)
Mitigation: Implement Signal Quality Assessment (SQA) gatekeeper. If motion is detected, discard reading and alert user to sit still (SRS REQ-003).
Probability (Post-mitigation): Unlikely
Residual Risk Level: ACCEPTABLE

HAZARD HZ-02: Exposure of Protected Health Information (PHI)
Cause: Physical theft of unencrypted mobile device.
Severity: Major
Probability: Probable
Mitigation: Enforce OS-level biometric encryption and AES-256 for local storage (SRS REQ-004).
Residual Risk Level: ACCEPTABLE`
    },
    {
        name: "05_Cybersecurity_Threat_Model_SBOM.txt",
        content: `DOCUMENT: Primary Cybersecurity Assessment
FRAMEWORK: FDA Cybersecurity Premarket Guidance / MITRE ATT&CK

1. SOFTWARE BILL OF MATERIALS (SBOM)
- Name: React Native, Version: 0.72.1, License: MIT. Vulns: CVE-2023-XXXX (Medium - Mitigated via CSP)
- Name: SQLite, Version: 3.41.0, License: Public Domain. Vulns: None.
- Name: LibSodium, Version: 1.0.18, License: ISC. Vulns: None.

2. THREAT MODELING (STRIDE)
Spoofing: Attacker spoofs Bluetooth PPG sensor. 
-> Mitigation: Require Bluetooth Low Energy OOB pairing with cryptographic handshakes.

Tampering: Modification of the local AI weights.
-> Mitigation: The app performs a SHA-256 checksum validation on the TFLite model on every boot. If corrupted, app halts.

Information Disclosure: Interception of crash logs.
-> Mitigation: All crash reports sent to Sentry are heavily sanitized of PHI and timestamped locally without precise IP data.`
    },
    {
        name: "06_IEC62366_Human_Factors_Report.txt",
        content: `DOCUMENT: Human Factors Engineering Summative Report
STANDARD: IEC 62366-1

PROTOCOL:
15 participants (Age 65+) were placed in a simulated home environment and asked to initiate a cardiac recording without prior instruction, using only the app UI.

CRITICAL TASKS:
1. Successfully wearing the sensor.
2. Initiating a 30-second recording while staying perfectly still.
3. Interpreting a "Positive" AFib result page.

RESULTS:
- Task 1: 15/15 Passed.
- Task 2: 13/15 Passed. (2 participants moved their arm, resulting in an "Inconclusive" state correctly triggered by SQA gatekeeper).
- Task 3: 15/15 Passed. All users successfully understood they needed to contact a physician.

CONCLUSION:
No new risks were identified during summative testing. The user interface adequately mitigates all use-related hazards.`
    },
    {
        name: "07_Clinical_Validation_Report.txt",
        content: `DOCUMENT: Pivotal Clinical Trial Validation Results
DESIGN: Retrospective, multi-center, observational study.
DATASET: 1,500 highly-annotated single-lead ECG strips, evaluated by 3 Board-Certified Cardiologists.

PRIMARY ENDPOINTS:
- Sensitivity (True Positives): Target >98.0%. Achieved: 98.4% (95% CI: 97.9 - 99.1). PASS.
- Specificity (True Negatives): Target >97.5%. Achieved: 99.1% (95% CI: 98.8 - 99.5). PASS.

SECONDARY ENDPOINTS:
- Processing time per reading < 2.5s. Achieved: 1.1s average. PASS.

CONCLUSION:
The KardiaAI algorithm meets all pre-established clinical performance criteria and demonstrates equivalence to the predicate device (K999999).`
    },
    {
        name: "08_Labeling_IFU.txt",
        content: `DOCUMENT: Instructions for Use (IFU)

HOW TO TAKE A RECORDING:
1. Sit down comfortably and relax for 1 minute.
2. Open the KardiaAI App.
3. Tap "Record" and rest your arms on a table. Do not move or speak.
4. Wait 30 seconds for the progress bar to complete.

INTERPRETING RESULTS:
- NORMAL SINUS RHYTHM: Your heart is beating in a uniform pattern.
- ATRIAL FIBRILLATION DETECTED: An irregular rhythm was found. You should share this result with your doctor. This is not a diagnosis of a heart attack.

WARNING: If you are experiencing chest pain, pressure, or shortness of breath, call 911 immediately.`
    },
    {
        name: "09_Post_Market_Surveillance_Plan.txt",
        content: `DOCUMENT: Post-Market Surveillance (PMS) Plan

ACTIVE SURVEILLANCE:
- Data from the app crash reporting system (Sentry) will be reviewed bi-weekly for anomalies.
- App store reviews across iOS and Android will be scraped monthly specifically searching for keywords: "wrong, failed, hospital, died, error".

COMPLAINT HANDLING:
All user complaints regarding false positive or false negative results will trigger a mandatory Medical Device Reporting (MDR) evaluation within 48 hours.

ANNUAL REPORTING:
A comprehensive Periodic Safety Update Report (PSUR) will be compiled annually and held internally for FDA inspection.`
    },
    {
        name: "10_ISO13485_Quality_Manual.txt",
        content: `DOCUMENT: Master Quality Manual
STANDARD: ISO 13485:2016

QMS SCOPE:
Design, development, and distribution of standalone software for cardiac arrhythmia detection.

MANAGEMENT RESPONSIBILITY:
The Executive Board commits to providing necessary resources for compliance. The VP of Quality has final authority over all CAPA implementations.

DOCUMENT CONTROL:
All clinical and architectural documents are maintained under strict version control in the electronic Quality Management System (eQMS). Drafts must be approved by QA and Engineering leads via CFR Part 11 compliant digital signatures before release.`
    }
];

docs.forEach((doc) => {
    fs.writeFileSync(path.join(targetDir, doc.name), doc.content);
});

console.log('Successfully generated ' + docs.length + ' real-world simulation documents in ' + targetDir);
