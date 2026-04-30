require('dotenv').config({ path: '.env.local' });
const admin = require("firebase-admin");

// Initialize Firebase Admin with our backend keys to totally bypass CORS lockouts
admin.initializeApp({
  credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
  }),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
});

async function fixCors() {
    try {
        console.log(`Connecting to Storage Bucket: ${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}...`);
        const bucket = admin.storage().bucket();
        
        await bucket.setCorsConfiguration([
            {
              origin: ["*"],
              method: ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
              responseHeader: ["*"],
              maxAgeSeconds: 3600
            }
        ]);
        
        console.log("✅ SUCCESS! CORS Policy Injected Successfully.");
        console.log("You can now securely upload PDFs from localhost:3000 directly into Firebase!");
    } catch (error) {
        console.error("❌ FAILED to update CORS. Are your .env.local backend keys correct?", error);
    }
}

fixCors();
