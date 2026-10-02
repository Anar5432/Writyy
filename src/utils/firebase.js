// Firebase Service for Writyy (Authentication & Cloud Firestore)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';

const CONFIG_STORAGE_KEY = 'writyy_firebase_config';

// Default / fallback Firebase configuration
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjXg5wiswDB76k-wOevrxkq16Y_7jxiJw",
  authDomain: "impressive-acolyte-1lxdt.firebaseapp.com",
  projectId: "impressive-acolyte-1lxdt",
  storageBucket: "impressive-acolyte-1lxdt.firebasestorage.app",
  messagingSenderId: "822358393666",
  appId: "1:822358393666:web:eae8ccb24cfb9ce07d7edb",
  databaseId: "ai-studio-25eb01a1-4492-4b78-902d-3f7dd036ad82"
};

export function getFirebaseConfig() {
  try {
    const custom = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed && parsed.apiKey && parsed.apiKey.length > 5) return parsed;
    }
  } catch (e) {}

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
    databaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || DEFAULT_FIREBASE_CONFIG.databaseId
  };
}

export function saveFirebaseConfig(config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    window.location.reload();
  } catch (e) {
    console.error('Failed to save Firebase config:', e);
  }
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.apiKey.length > 5);
}

// Initialize Firebase App
let app = null;
let auth = null;
let db = null;

try {
  const config = getFirebaseConfig();
  if (config.apiKey && config.projectId) {
    app = getApps().length === 0 ? initializeApp(config) : getApp();
    auth = getAuth(app);
    const dbId = config.databaseId || 'ai-studio-25eb01a1-4492-4b78-902d-3f7dd036ad82';
    db = getFirestore(app, dbId);
  }
} catch (err) {
  console.warn('[Firebase] Initialization notice:', err);
}

export { auth, db };

// Authentication Methods
export async function signUpWithEmail(email, password, displayName = '') {
  if (!auth) throw new Error('Firebase is not configured yet. Please provide Firebase credentials in Settings.');
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, { displayName: displayName.trim() });
  }
  return userCredential.user;
}

export async function loginWithEmail(email, password) {
  if (!auth) throw new Error('Firebase is not configured yet. Please provide Firebase credentials in Settings.');
  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return userCredential.user;
}

export async function loginWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured yet.');
  const provider = new GoogleAuthProvider();
  const userCredential = await signInWithPopup(auth, provider);
  return userCredential.user;
}

export async function logoutUser() {
  if (!auth) return;
  await signOut(auth);
}

export function onUserAuthChange(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
