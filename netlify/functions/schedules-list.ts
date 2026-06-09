import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const snapshot = await getAlertSchedulesRef(userId).get();
    const schedules = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() }));
    return { statusCode: 200, body: JSON.stringify(schedules) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch alert schedules' }) };
  }
};

export { handler };
