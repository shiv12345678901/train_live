export async function handler() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
  
  let status = 'unknown';
  let detail = '';
  
  if (!key) {
    status = 'missing';
    detail = 'FIREBASE_SERVICE_ACCOUNT_KEY env var is not set';
  } else if (!key.startsWith('{')) {
    status = 'invalid_format';
    detail = `Key starts with: "${key.substring(0, 20)}..." — expected to start with {`;
  } else {
    try {
      const parsed = JSON.parse(key);
      if (parsed.project_id && parsed.private_key && parsed.client_email) {
        // Try to initialize Firebase
        try {
          const { initializeApp, cert, getApps } = await import('firebase-admin/app');
          const { getFirestore } = await import('firebase-admin/firestore');
          
          const app = getApps().length === 0
            ? initializeApp({ credential: cert(parsed) })
            : getApps()[0];
          
          const db = getFirestore(app);
          // Try a simple read
          const testRef = db.collection('users').doc('test');
          await testRef.get();
          
          status = 'working';
          detail = `Connected to project: ${parsed.project_id}`;
        } catch (e) {
          status = 'firebase_error';
          detail = e instanceof Error ? e.message : String(e);
        }
      } else {
        status = 'missing_fields';
        detail = `project_id: ${!!parsed.project_id}, private_key: ${!!parsed.private_key}, client_email: ${!!parsed.client_email}`;
      }
    } catch (e) {
      status = 'json_parse_error';
      detail = `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}. First 50 chars: "${key.substring(0, 50)}"`;
    }
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, detail }),
  };
}
