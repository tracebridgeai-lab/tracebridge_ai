/**
 * Firebase Admin SDK initialization (server-side only)
 * Uses singleton pattern to prevent multiple initializations
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";

// Global singleton to prevent re-initialization
const globalForFirebase = globalThis as unknown as {
  firebaseApp: App | undefined;
};

/**
 * Initialize Firebase Admin SDK
 * Only initializes once using singleton pattern
 */
function initializeFirebaseAdmin(): App | null {
  // Check if credentials are available
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // During build time, Firebase might not be needed
  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase Admin credentials not found. Some features will be unavailable.");
    return null;
  }

  if (globalForFirebase.firebaseApp) {
    return globalForFirebase.firebaseApp;
  }

  // Check if already initialized
  const existingApps = getApps();
  if (existingApps.length > 0) {
    globalForFirebase.firebaseApp = existingApps[0];
    return existingApps[0];
  }

  try {
    // Get storage bucket from environment or construct default
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 
                         process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
                         `${projectId}.appspot.com`;

    const app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: storageBucket,
    });

    console.log(`Firebase Admin initialized with bucket: ${storageBucket}`);
    globalForFirebase.firebaseApp = app;
    return app;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    return null;
  }
}

// Initialize Firebase Admin
const firebaseApp = initializeFirebaseAdmin();

// Export Firebase Admin services with null checks
export const adminAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const adminDb: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
export const adminStorage: Storage | null = firebaseApp ? getStorage(firebaseApp) : null;

// Export the app instance
export default firebaseApp;

/**
 * Verify Firebase ID token from client
 */
export async function verifyIdToken(token: string) {
  if (!adminAuth) {
    return {
      success: false,
      error: "Firebase Admin not initialized",
    };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return {
      success: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error) {
    console.error("Error verifying ID token:", error);
    return {
      success: false,
      error: "Invalid or expired token",
    };
  }
}

/**
 * Get user by UID
 */
export async function getUserByUid(uid: string) {
  if (!adminAuth) {
    return {
      success: false,
      error: "Firebase Admin not initialized",
    };
  }

  try {
    const userRecord = await adminAuth.getUser(uid);
    return {
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
      },
    };
  } catch (error) {
    console.error("Error getting user:", error);
    return {
      success: false,
      error: "User not found",
    };
  }
}
