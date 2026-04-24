import { initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

let db: Firestore | null = null;
let auth: Auth | null = null;
let firebaseInitError: string | null = null;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  auth = getAuth(app);
} catch (error) {
  firebaseInitError = error instanceof Error ? error.message : 'Unknown Firebase initialization error';
  console.error('Firebase initialization failed', error);
}

export { db, auth, firebaseInitError };
