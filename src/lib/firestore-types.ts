/**
 * Firestore data types and interfaces
 */

import { Timestamp } from "firebase-admin/firestore";

/**
 * Upload document stored in Firestore
 */
export interface Upload {
  id?: string;
  userId: string;
  deviceName: string;
  productCode?: string;
  deviceClass?: string;
  regulationNumber?: string;
  features?: {
      requiresSoftware: boolean;
      requiresClinical: boolean;
      requiresBiocompatibility: boolean;
  };
  standards: string[];
  status: "pending" | "analyzing" | "complete" | "failed";
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/**
 * Document/File metadata stored in Firestore
 */
export interface DocumentMetadata {
  id?: string;
  uploadId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageUrl: string;
  storagePath: string;
  createdAt: Timestamp | Date;
}

/**
 * Gap analysis result stored in Firestore
 */
export interface GapResult {
  id?: string;
  uploadId: string;
  standard: string;
  section: string;
  requirement: string;
  status: "compliant" | "gap_detected" | "needs_review";
  severity?: "critical" | "major" | "minor";
  gapTitle: string;
  missingRequirement: string;
  citations?: Array<{
    source: string;
    section: string;
    quote: string;
  }>;
  reasoning?: string;
  missingEvidence?: string;
  geminiResponse?: string;
  estimatedCost?: string;
  estimatedTimeline?: string;
  remediationSteps?: string[];
  createdAt: Timestamp | Date;
}

/**
 * Compliance rule (can be cached or stored in Firestore)
 */
export interface ComplianceRule {
  id?: string;
  standard: string;
  section: string;
  requirement: string;
  requiredForClass?: string;
  expectedDocument: string;
  category?: string;
}

/**
 * Audit log entry
 */
export interface AuditLog {
  id?: string;
  userId: string;
  action: "upload" | "analyze" | "view_report" | "login";
  details?: Record<string, any>;
  createdAt: Timestamp | Date;
}

/**
 * User profile (optional - Firebase Auth handles most of this)
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: Timestamp | Date;
  lastLoginAt: Timestamp | Date;
}

/**
 * Team / Workspace for collaboration
 */
export interface Team {
  id?: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  createdAt: Timestamp | Date;
}

export interface TeamMember {
  uid: string;
  email: string;
  displayName?: string;
  role: "admin" | "member";
  joinedAt: Timestamp | Date;
}
