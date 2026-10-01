// Cloud Synchronization Service for Writyy (Cross-Device Phone & Computer Sync)
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { INITIAL_WORDS } from '../data/words';

// Debounce timer for saving to cloud to avoid excessive writes
let syncDebounceTimer = null;

// Extract only personal user progress (excludes static 5,941 dictionary words)
export function extractSyncPayload(data) {
  const customWords = (data.allWords || []).filter(w => w.id && w.id.startsWith('custom_'));

  return {
    stack1_mastered: data.stack1_mastered || [],
    stack2_spelling: data.stack2_spelling || [],
    stack3_meaning: data.stack3_meaning || [],
    customWords,
    history: (data.history || []).slice(-100), // Keep last 100 entries
    stats: data.stats || { totalTested: 0, correctSpelling: 0 },
    lastUpdated: new Date().toISOString()
  };
}

// Push local progress to Firestore in the cloud
export async function pushProgressToCloud(uid, data) {
  if (!db || !uid) return false;

  const payload = extractSyncPayload(data);

  try {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, payload, { merge: true });
    console.log('[CloudSync] Successfully synced progress to Firebase Firestore.');
    return true;
  } catch (err) {
    console.warn('[CloudSync] Failed to push to cloud:', err);
    return false;
  }
}

// Debounced cloud sync helper for auto-saving during practice
export function scheduleCloudSync(uid, data, delayMs = 1200) {
  if (!db || !uid) return;

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    pushProgressToCloud(uid, data);
  }, delayMs);
}

// Pull user progress from Firestore
export async function fetchProgressFromCloud(uid) {
  if (!db || !uid) return null;

  try {
    const userDocRef = doc(db, 'users', uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    console.warn('[CloudSync] Failed to fetch from cloud:', err);
    return null;
  }
}

// Real-time synchronization subscription (updates across phone and computer instantly)
export function subscribeToCloudProgress(uid, onRemoteChange) {
  if (!db || !uid) return () => {};

  try {
    const userDocRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data();
        onRemoteChange(cloudData);
      }
    }, (err) => {
      console.warn('[CloudSync] Snapshot listener notice:', err);
    });

    return unsubscribe;
  } catch (err) {
    return () => {};
  }
}

// Merge cloud and local data intelligently without losing any words
export function mergeCloudAndLocal(localData, cloudData) {
  if (!cloudData) return localData;

  const mergeWordLists = (localList = [], cloudList = []) => {
    const map = new Map();
    // Add local items
    for (const item of localList) {
      if (item && item.id) map.set(item.id, item);
    }
    // Add/merge cloud items
    for (const item of cloudList) {
      if (item && item.id) map.set(item.id, item);
    }
    return Array.from(map.values());
  };

  const mergedCustom = mergeWordLists(
    (localData.allWords || []).filter(w => w.id && w.id.startsWith('custom_')),
    cloudData.customWords || []
  );

  const mergedMastered = mergeWordLists(localData.stack1_mastered, cloudData.stack1_mastered);
  const mergedSpelling = mergeWordLists(localData.stack2_spelling, cloudData.stack2_spelling);
  const mergedMeaning = mergeWordLists(localData.stack3_meaning, cloudData.stack3_meaning);

  // Take the highest stats
  const localTested = (localData.stats && localData.stats.totalTested) || 0;
  const cloudTested = (cloudData.stats && cloudData.stats.totalTested) || 0;
  const localCorrect = (localData.stats && localData.stats.correctSpelling) || 0;
  const cloudCorrect = (cloudData.stats && cloudData.stats.correctSpelling) || 0;

  return {
    allWords: [...mergedCustom, ...INITIAL_WORDS],
    stack1_mastered: mergedMastered,
    stack2_spelling: mergedSpelling,
    stack3_meaning: mergedMeaning,
    history: cloudData.history || localData.history || [],
    stats: {
      totalTested: Math.max(localTested, cloudTested),
      correctSpelling: Math.max(localCorrect, cloudCorrect)
    }
  };
}
