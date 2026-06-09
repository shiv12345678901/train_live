import { collection, doc, CollectionReference, DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Returns a collection reference for the user's routeCards subcollection.
 * Path: users/{userId}/routeCards
 */
export function getRouteCardsCollection(userId: string): CollectionReference {
  return collection(db, 'users', userId, 'routeCards');
}

/**
 * Returns a collection reference for the user's alertSchedules subcollection.
 * Path: users/{userId}/alertSchedules
 */
export function getAlertSchedulesCollection(userId: string): CollectionReference {
  return collection(db, 'users', userId, 'alertSchedules');
}

/**
 * Returns a collection reference for the user's alertDeliveryState subcollection.
 * Path: users/{userId}/alertDeliveryState
 */
export function getAlertDeliveryStateCollection(userId: string): CollectionReference {
  return collection(db, 'users', userId, 'alertDeliveryState');
}

/**
 * Returns a document reference for the user's app settings document.
 * Path: users/{userId}/settings/app
 */
export function getSettingsDoc(userId: string): DocumentReference {
  return doc(db, 'users', userId, 'settings', 'app');
}
