import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';

let app: App | null = null;

try {
  // Method 1: Full service account JSON in FIREBASE_SERVICE_ACCOUNT_KEY
  let serviceAccount: Record<string, string> | null = null;

  const fullKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fullKey && fullKey.trim().startsWith('{')) {
    serviceAccount = JSON.parse(fullKey);
  }

  // Method 2: Individual env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
  if (!serviceAccount) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      serviceAccount = {
        type: 'service_account',
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      };
    }
  }

  if (serviceAccount) {
    app = getApps().length === 0
      ? initializeApp({ credential: cert(serviceAccount as Record<string, string>) })
      : getApps()[0];
  } else if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    console.warn('Firebase Admin: No credentials found. Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_KEY');
  }
} catch (e) {
  console.error('Firebase Admin init failed:', e);
}

export { app };
