import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { app } from './firebase';

let db: Firestore | null = null;

try {
  if (app) {
    db = getFirestore(app);
  }
} catch (e) {
  console.error('Firestore init failed:', e);
}

export { db };

export function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

export function getRouteCardsRef(userId: string) {
  if (!db) throw new Error('Firestore not initialized');
  return db.collection('users').doc(userId).collection('routeCards');
}

export function getAlertSchedulesRef(userId: string) {
  if (!db) throw new Error('Firestore not initialized');
  return db.collection('users').doc(userId).collection('alertSchedules');
}

export function getAlertDeliveryStateRef(userId: string) {
  if (!db) throw new Error('Firestore not initialized');
  return db.collection('users').doc(userId).collection('alertDeliveryState');
}

export function getSettingsRef(userId: string) {
  if (!db) throw new Error('Firestore not initialized');
  return db.collection('users').doc(userId).collection('settings').doc('app');
}
