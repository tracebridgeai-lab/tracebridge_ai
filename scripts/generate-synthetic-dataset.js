const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const fdaCodes = require('../src/lib/fda-product-codes.json');

const OUT_DIR = path.join(__dirname, 'synthetic_dataset');

if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR);
}

console.log("🔥 TraceBridge AI Synthetic Validation Dataset Generator 🔥");
console.log(`Building datasets for ${fdaCodes.length} FDA edge-cases...\n`);

async function createDoc(filename, productCodeObj, isCompliant) {
    const children = [];

    // TITLE
    children.push(
        new Paragraph({
            text: `V&V Technical Documentation: ${productCodeObj.description} [${productCodeObj.code}]`,
            heading: HeadingLevel.TITLE,
        })
    );
    
    children.push(
        new Paragraph({
            text: `Document Status: ${isCompliant ? "COMPLIANT (Full Evidence)" : "NON-COMPLIANT (Missing Critical Data)"}`,
            spacing: { after: 400 }
        })
    );

    // DYNAMIC RULES INJECTION
    
    // 1. Software Requirement
    if (productCodeObj.requiresSoftware) {
        children.push(new Paragraph({ text: "Software Architecture & Cybersecurity", heading: HeadingLevel.HEADING_1 }));
        if (isCompliant) {
            children.push(new Paragraph({ text: "The software architecture conforms to IEC 62304. We utilize a secure cloud backend with end-to-end encryption. All SOUP (Software of Unknown Provenance) modules have been aggressively documented and risk mitigated. Threat surface maps have been established in accordance with FDA premarket cybersecurity guidance."}));
        } else {
            children.push(new Paragraph({ text: "[GAP INDUCED: Software architecture documentation totally missing from this file.]"}));
        }
    } else {
        children.push(new Paragraph({ text: "Software Architecture", heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph({ text: "Not applicable. This device contains zero software and no electrical components."}));
    }

    // 2. Clinical Data Requirement
    if (productCodeObj.requiresClinical) {
        children.push(new Paragraph({ text: "Clinical Evaluation & Human Factors", heading: HeadingLevel.HEADING_1 }));
        if (isCompliant) {
            children.push(new Paragraph({ text: "Clinical trials were conducted with N=450 patients. Primary endpoints for efficacy and safety were successfully met with a p-value < 0.05. Over 15 human factors usability studies demonstrated 99% task completion without critical life-threatening errors."}));
        } else {
            children.push(new Paragraph({ text: "[GAP INDUCED: Clinical evaluation report totally excluded.]"}));
        }
    } else {
        children.push(new Paragraph({ text: "Clinical Evaluation", heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph({ text: "Not applicable. Standard established mechanical design. No human trials required."}));
    }

    // 3. Biocompatibility Requirement
    if (productCodeObj.requiresBiocompatibility) {
        children.push(new Paragraph({ text: "Biocompatibility & ISO 10993", heading: HeadingLevel.HEADING_1 }));
        if (isCompliant) {
            children.push(new Paragraph({ text: "ISO 10993 cytotoxicity, sensitization, and irritation tests were conducted on the finalized, sterilized device. The results demonstrated zero cell lysis and no allergic reactions in prolonged 30-day exposure models."}));
        } else {
            children.push(new Paragraph({ text: "[GAP INDUCED: Biocompatibility testing absent from this file.]"}));
        }
    } else {
        children.push(new Paragraph({ text: "Biocompatibility", heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph({ text: "Not applicable. Device never makes direct or indirect contact with the human body or tissue."}));
    }

    // Render file
    const doc = new Document({
        sections: [{
            properties: {},
            children: children
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
}

async function run() {
    let count = 0;
    for (const code of fdaCodes) {
        // Generate Compliant File
        const okName = `${code.code}_Compliant_Evidenced.docx`;
        await createDoc(okName, code, true);

        // Generate Non-Compliant File
        const badName = `${code.code}_NON_Compliant_Gaps.docx`;
        await createDoc(badName, code, false);
        
        console.log(`✅ Constructed Dataset for ${code.code}`);
        count += 2;
    }
    
    console.log(`\n🎉 Generated ${count} beautiful .docx files directly inside /scripts/synthetic_dataset/`);
    console.log(`Ready to stress test TraceBridge AI!`);
}

run().catch(console.error);
