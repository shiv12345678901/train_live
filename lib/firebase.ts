import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';

let app: App | null = null;

try {
  // Try FIREBASE_SERVICE_ACCOUNT_KEY first (full JSON)
  let serviceAccount: Record<string, string> | null = null;
  
  const fullKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fullKey && fullKey.startsWith('{')) {
    serviceAccount = JSON.parse(fullKey);
  } else {
    // Fallback: construct from individual env vars
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
  }
} catch (e) {
  console.error('Firebase Admin init failed:', e);
}

export { app };
