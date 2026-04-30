const fs = require('fs');
const path = require('path');

const outDir = path.join(process.cwd(), 'public/demo_data/Clinical_510k_Bundle');
if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }

const docs = [
  { id: 1, name: "User_Fee_Cover_Sheet.txt", content: "MEDICAL DEVICE USER FEE COVER SHEET\n\nPayment Identification Number (PIN): 510K-938219\nSoftware Applicant: TraceGlow Technologies." },
  { id: 2, name: "CDRH_Submission_Cover_Sheet.txt", content: "CDRH PREMARKET REVIEW SUBMISSION COVER SHEET\n\nSubmission Type: 510(k) Traditional\nDevice Code: LLZ (Image Analysis Software)." },
  { id: 3, name: "Cover_Letter.txt", content: "510(k) COVER LETTER\n\nDear FDA Reviewer,\nWe hereby submit this 510(k) for the TraceGlow AI Diagnostic platform, establishing substantial equivalence." },
  { id: 4, name: "Indications_For_Use.txt", content: "INDICATIONS FOR USE STATEMENT\n\nThe TraceGlow AI system is indicated for analyzing clinical imaging to assist radiologists. It is a prescription use only system." },
  { id: 5, name: "510k_Summary.txt", content: "510(k) SUMMARY\n\nSubmitter: TraceGlow Technologies.\nPredicate Device: K191919\nRegulation Number: 21 CFR 892.2050. The system employs ML algorithms." },
  { id: 6, name: "Truthful_And_Accurate_Statement.txt", content: "TRUTHFUL AND ACCURATE STATEMENT\n\nI certify that, in my capacity as VP of Engineering, I believe that all data and information submitted is truthful and accurate and no material fact has been omitted." },
  { id: 7, name: "Class_III_Certification.txt", content: "CLASS III CERTIFICATION\n\nNot applicable. This device is Class II." },
  { id: 8, name: "Financial_Disclosure.txt", content: "FINANCIAL CERTIFICATION\n\nThe submitter certifies that no investigators have proprietary interest in the device." },
  { id: 9, name: "Declarations_of_Conformity.txt", content: "DECLARATIONS OF CONFORMITY\n\nThe system complies with ISO 13485:2016 and IEC 62304 standards for software lifecycle." },
  { id: 10, name: "Executive_Summary.txt", content: "EXECUTIVE SUMMARY\n\nDetailed operational constraints of the TraceGlow system. It utilizes cloud-based GPU clustering for deep neural net inference with a 99.8% SLA." },
  { id: 11, name: "Device_Description.txt", content: "DEVICE DESCRIPTION\n\nSoftware architecture consists of a React frontend and a Node.js microservice backend interacting over secure WebSocket. Incorporates zero-trust cryptography." },
  { id: 12, name: "Substantial_Equivalence.txt", content: "SUBSTANTIAL EQUIVALENCE DISCUSSION\n\nThe fundamental scientific technology of TraceGlow is identical to the predicate device, relying on similar convolutional neural architecture." },
  { id: 13, name: "Proposed_Labeling.txt", content: "PROPOSED LABELING\n\nLabeling includes User Manual, IFU, and dynamic graphical hazard warnings presented in the software UI." },
  { id: 14, name: "Sterilization_And_Shelf_Life.txt", content: "STERILIZATION AND SHELF LIFE\n\nNot applicable. Device is Software as a Medical Device (SaMD) and has no physical components." },
  { id: 15, name: "Biocompatibility.txt", content: "BIOCOMPATIBILITY\n\nNot applicable. Strict zero-contact software interface. No patient contact materials." },
  { id: 16, name: "Software_And_Cybersecurity.txt", content: "SOFTWARE AND CYBERSECURITY\n\nThe software architecture strictly isolates units per IEC 62304 section 5.3. A comprehensive Software Bill of Materials (SBOM) is attached. Cybersecurity Management Plan adheres to FDA guidance V.A protecting PII headers via AES-256." },
  { id: 17, name: "Electromagnetic_Compatibility.txt", content: "ELECTROMAGNETIC COMPATIBILITY\n\nNot applicable. Pure software product operated on COTS hardware." },
  { id: 18, name: "Performance_Testing.txt", content: "CLINICAL PERFORMANCE TESTING\n\nRisk management complies with ISO 14971:2019 Section 7. The evaluation implemented a deterministic threshold crossing the calculated risk index against acceptability bounds, concluding overall residual risk is globally acceptable." }
];

docs.forEach(d => {
  fs.writeFileSync(path.join(outDir, d.name), d.content);
});
console.log("Successfully generated all 18 clinical 510(k) artifacts.");
