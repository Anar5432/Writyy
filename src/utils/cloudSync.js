// Cloud Synchronization Service for Writyy (via Neon PostgreSQL)
import { fetchUserData, pushUserData } from './neonDb.js';
import { INITIAL_WORDS } from '../data/words.js';
import { ensureAwlEnriched, enrichWordWithAwl } from './storage.js';

let syncDebounceTimer = null;

// Extract only personal user progress (excludes static 5,941 dictionary words)
export function extractSyncPayload(data) {
  const customWords = (data.allWords || []).filter(w => w.id && w.id.startsWith('custom_'));

  const payload = {
    stack1_mastered: data.stack1_mastered || [],
    stack2_spelling: data.stack2_spelling || [],
    stack3_meaning: data.stack3_meaning || [],
    struggledHistory: data.struggledHistory || [],
    customWords,
    history: (data.history || []).slice(-100),
    stats: data.stats || { totalTested: 0, correctSpelling: 0, xpBalance: 0, daily: {} },
    lastUpdated: new Date().toISOString()
  };

  // Ensure clean JSON with zero undefined fields
  return JSON.parse(JSON.stringify(payload));
}

// Push local progress to Neon PostgreSQL
export async function pushProgressToCloud(userOrEmail, data) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail?.email);
  if (!email) return false;

  const payload = extractSyncPayload(data);
  const success = await pushUserData(email, payload);
  if (success) {
    console.log('[CloudSync] Successfully pushed progress to Neon PostgreSQL.');
  }
  return success;
}

// Debounced cloud sync helper for auto-saving during practice
export function scheduleCloudSync(userOrEmail, data, delayMs = 1200) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail?.email);
  if (!email) return;

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    pushProgressToCloud(email, data);
  }, delayMs);
}

// Pull user progress from Neon PostgreSQL
export async function fetchProgressFromCloud(userOrEmail) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail?.email);
  if (!email) return null;

  return await fetchUserData(email);
}

// Merge cloud and local data intelligently without losing any words
export function mergeCloudAndLocal(localData, cloudData) {
  if (!cloudData) return localData;

  const mergeWordLists = (localList = [], cloudList = []) => {
    const map = new Map();
    // Add cloud items first
    for (const item of (cloudList || [])) {
      if (item) {
        const key = item.id || item.word;
        if (key) map.set(key, item);
      }
    }
    // Add local items second so local offline work takes precedence
    for (const item of (localList || [])) {
      if (item) {
        const key = item.id || item.word;
        if (key) map.set(key, item);
      }
    }
    return Array.from(map.values());
  };

  const mergedCustom = mergeWordLists(
    (localData.allWords || []).filter(w => w.id && w.id.startsWith('custom_')),
    cloudData.customWords || []
  );

  const mergedMastered = mergeWordLists(localData.stack1_mastered, cloudData.stack1_mastered);
  const rawSpelling = mergeWordLists(localData.stack2_spelling, cloudData.stack2_spelling);
  const rawMeaning = mergeWordLists(localData.stack3_meaning, cloudData.stack3_meaning);

  // Clean deduplication across stacks: Mastered (Stack 1) takes precedence
  const masteredIds = new Set(mergedMastered.map(w => w.id || w.word));
  const mergedSpelling = rawSpelling.filter(w => !masteredIds.has(w.id || w.word));
  const spellingIds = new Set(mergedSpelling.map(w => w.id || w.word));
  const mergedMeaning = rawMeaning.filter(w => !masteredIds.has(w.id || w.word) && !spellingIds.has(w.id || w.word));

  // Merge struggled history preserving mistake counts and statuses
  const struggledMap = new Map();
  const allStruggled = [...(cloudData.struggledHistory || []), ...(localData.struggledHistory || [])];
  for (const item of allStruggled) {
    if (!item) continue;
    const key = (item.word || item.id || '').toLowerCase();
    if (!key) continue;
    const enrichedItem = enrichWordWithAwl(item);
    if (!struggledMap.has(key)) {
      struggledMap.set(key, enrichedItem);
    } else {
      const existing = struggledMap.get(key);
      struggledMap.set(key, {
        ...existing,
        ...enrichedItem,
        mistakeCount: Math.max(existing.mistakeCount || 1, enrichedItem.mistakeCount || 1),
        status: (existing.status === 'in_review' || enrichedItem.status === 'in_review') ? 'in_review' : 'mastered',
        lastTestedAt: new Date(Math.max(
          new Date(existing.lastTestedAt || 0).getTime(),
          new Date(enrichedItem.lastTestedAt || 0).getTime()
        )).toISOString()
      });
    }
  }

  // Take the highest stats and merge daily stats accurately
  const localTested = (localData.stats && localData.stats.totalTested) || 0;
  const cloudTested = (cloudData.stats && cloudData.stats.totalTested) || 0;
  const localCorrect = (localData.stats && localData.stats.correctSpelling) || 0;
  const cloudCorrect = (cloudData.stats && cloudData.stats.correctSpelling) || 0;

  const mergedDaily = { ...(cloudData.stats?.daily || {}) };
  for (const [dateKey, lDay] of Object.entries(localData.stats?.daily || {})) {
    const cDay = mergedDaily[dateKey] || { tested: 0, correct: 0, wrong: 0, xp: 0 };
    mergedDaily[dateKey] = {
      tested: Math.max(lDay.tested || 0, cDay.tested || 0),
      correct: Math.max(lDay.correct || 0, cDay.correct || 0),
      wrong: Math.max(lDay.wrong || 0, cDay.wrong || 0),
      xp: (lDay.tested || 0) >= (cDay.tested || 0)
        ? (typeof lDay.xp === 'number' ? lDay.xp : ((lDay.correct || 0) - (lDay.wrong || 0)))
        : (typeof cDay.xp === 'number' ? cDay.xp : ((cDay.correct || 0) - (cDay.wrong || 0)))
    };
  }

  const finalTotalTested = Math.max(localTested, cloudTested);
  const finalCorrect = Math.max(localCorrect, cloudCorrect);
  const localXp = typeof localData.stats?.xpBalance === 'number'
    ? localData.stats.xpBalance
    : (localCorrect - (localTested - localCorrect));
  const cloudXp = typeof cloudData.stats?.xpBalance === 'number'
    ? cloudData.stats.xpBalance
    : (cloudCorrect - (cloudTested - cloudCorrect));
  const finalXp = finalTotalTested === localTested ? localXp : cloudXp;

  return {
    allWords: ensureAwlEnriched([...mergedCustom, ...INITIAL_WORDS]),
    stack1_mastered: mergedMastered.map(enrichWordWithAwl),
    stack2_spelling: mergedSpelling.map(enrichWordWithAwl),
    stack3_meaning: mergedMeaning.map(enrichWordWithAwl),
    struggledHistory: Array.from(struggledMap.values()),
    history: (cloudData.history && cloudData.history.length > 0) ? cloudData.history : (localData.history || []),
    stats: {
      totalTested: finalTotalTested,
      correctSpelling: finalCorrect,
      xpBalance: finalXp,
      daily: mergedDaily
    }
  };
}
