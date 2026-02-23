/**
 * Template Parser for OpenRegulatory Compliance Rules
 * 
 * Parses markdown templates to extract compliance rules for seeding the database.
 */

import * as fs from "fs";
import * as path from "path";

export interface ComplianceRule {
    standard: string;
    section: string;
    requirement: string;
    requiredForClass: string | null;
    expectedDocument: string;
    category: string | null;
}

/**
 * Parse all templates in the OpenRegulatory templates directory
 */
export function parseAllTemplates(templatesDir: string): ComplianceRule[] {
    const rules: ComplianceRule[] = [];

    // Parse ISO 13485 mapping
    const iso13485Path = path.join(templatesDir, "templates", "qms", "13485-mapping.md");
    if (fs.existsSync(iso13485Path)) {
        rules.push(...parseISO13485Mapping(iso13485Path));
    }

    // Parse ISO 27001 mapping
    const iso27001Path = path.join(templatesDir, "templates", "information_security", "27001-mapping.md");
    if (fs.existsSync(iso27001Path)) {
        rules.push(...parseISO27001Mapping(iso27001Path));
    }

    // Parse MDR checklists
    const mdrChecklistPath = path.join(templatesDir, "templates", "general", "checklist-gspr-mdr.md");
    if (fs.existsSync(mdrChecklistPath)) {
        rules.push(...parseMDRChecklist(mdrChecklistPath));
    }

    // Parse MDD checklist
    const mddChecklistPath = path.join(templatesDir, "templates", "general", "checklist-essential-requirements-mdd.md");
    if (fs.existsSync(mddChecklistPath)) {
        rules.push(...parseMDDChecklist(mddChecklistPath));
    }

    console.log(`  Parsed ${rules.length} compliance rules from templates`);
    return rules;
}

/**
 * Parse ISO 13485:2016 mapping table
 */
function parseISO13485Mapping(filePath: string): ComplianceRule[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const rules: ComplianceRule[] = [];

    // Extract table rows (skip header and separator)
    const lines = content.split("\n");
    let inTable = false;

    for (const line of lines) {
        // Detect table start
        if (line.includes("| Section | Title")) {
            inTable = true;
            continue;
        }

        // Skip separator line
        if (line.includes("|------")) {
            continue;
        }

        // Parse table rows
        if (inTable && line.trim().startsWith("|")) {
            const columns = line.split("|").map(col => col.trim()).filter(col => col);
            
            if (columns.length >= 3) {
                const section = columns[0];
                const title = columns[1];
                const documents = columns[2];

                // Skip "not applicable" entries
                if (documents.includes("not applicable")) {
                    continue;
                }

                // Extract document names from markdown formatting
                const docMatches = documents.match(/\*([^*]+)\*/g);
                const expectedDoc = docMatches 
                    ? docMatches.map(m => m.replace(/\*/g, "")).join(", ")
                    : documents;

                rules.push({
                    standard: "ISO 13485:2016",
                    section: section,
                    requirement: title,
                    requiredForClass: null,
                    expectedDocument: expectedDoc,
                    category: "qms"
                });
            }
        }

        // Stop at end of table
        if (inTable && line.trim() === "") {
            break;
        }
    }

    return rules;
}

/**
 * Parse ISO 27001 mapping table
 */
function parseISO27001Mapping(filePath: string): ComplianceRule[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const rules: ComplianceRule[] = [];

    const lines = content.split("\n");
    let inTable = false;

    for (const line of lines) {
        if (line.includes("| Control | Title")) {
            inTable = true;
            continue;
        }

        if (line.includes("|------")) {
            continue;
        }

        if (inTable && line.trim().startsWith("|")) {
            const columns = line.split("|").map(col => col.trim()).filter(col => col);
            
            if (columns.length >= 3) {
                const section = columns[0];
                const title = columns[1];
                const documents = columns[2];

                if (documents.includes("not applicable")) {
                    continue;
                }

                const docMatches = documents.match(/\*([^*]+)\*/g);
                const expectedDoc = docMatches 
                    ? docMatches.map(m => m.replace(/\*/g, "")).join(", ")
                    : documents;

                rules.push({
                    standard: "ISO 27001",
                    section: section,
                    requirement: title,
                    requiredForClass: null,
                    expectedDocument: expectedDoc,
                    category: "information_security"
                });
            }
        }

        if (inTable && line.trim() === "") {
            break;
        }
    }

    return rules;
}

/**
 * Parse MDR GSPR checklist
 */
function parseMDRChecklist(filePath: string): ComplianceRule[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const rules: ComplianceRule[] = [];

    const lines = content.split("\n");
    let inTable = false;

    for (const line of lines) {
        if (line.includes("| GSPR | Requirement")) {
            inTable = true;
            continue;
        }

        if (line.includes("|------")) {
            continue;
        }

        if (inTable && line.trim().startsWith("|")) {
            const columns = line.split("|").map(col => col.trim()).filter(col => col);
            
            if (columns.length >= 2) {
                const section = columns[0];
                const requirement = columns[1];

                rules.push({
                    standard: "MDR Annex I",
                    section: section,
                    requirement: requirement,
                    requiredForClass: null,
                    expectedDocument: "Technical Documentation",
                    category: "techdoc"
                });
            }
        }

        if (inTable && line.trim() === "") {
            break;
        }
    }

    return rules;
}

/**
 * Parse MDD Essential Requirements checklist
 */
function parseMDDChecklist(filePath: string): ComplianceRule[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const rules: ComplianceRule[] = [];

    const lines = content.split("\n");
    let inTable = false;

    for (const line of lines) {
        if (line.includes("| ER | Requirement")) {
            inTable = true;
            continue;
        }

        if (line.includes("|------")) {
            continue;
        }

        if (inTable && line.trim().startsWith("|")) {
            const columns = line.split("|").map(col => col.trim()).filter(col => col);
            
            if (columns.length >= 2) {
                const section = columns[0];
                const requirement = columns[1];

                rules.push({
                    standard: "MDD Annex I",
                    section: section,
                    requirement: requirement,
                    requiredForClass: null,
                    expectedDocument: "Technical Documentation",
                    category: "techdoc"
                });
            }
        }

        if (inTable && line.trim() === "") {
            break;
        }
    }

    return rules;
}

// Allow running directly for testing
if (require.main === module) {
    const templatesDir = path.resolve(__dirname, "..", "phase_2_files", "regulatory_rules", "openregulatory_templates");
    const rules = parseAllTemplates(templatesDir);
    console.log(`\nParsed ${rules.length} total rules:`);
    console.log(JSON.stringify(rules.slice(0, 3), null, 2));
}
