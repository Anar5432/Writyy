// Service Worker Cache API for Writyy Audio
// Stores studio dictionary MP3 audio files permanently in Cache Storage
// Enables 100% offline studio-quality pronunciation directly inside the phone.

export const AUDIO_CACHE_NAME = 'writyy-audio-v1';

// Open or get Cache Storage
export async function getAudioCache() {
  if (typeof window === 'undefined' || !window.caches) return null;
  try {
    return await window.caches.open(AUDIO_CACHE_NAME);
  } catch (e) {
    console.warn('[AudioCache] Failed to open Cache Storage:', e);
    return null;
  }
}

// Get count of cached words in offline storage
export async function getCachedAudioCount() {
  try {
    const cache = await getAudioCache();
    if (!cache) return 0;
    const keys = await cache.keys();
    return keys.length;
  } catch (err) {
    return 0;
  }
}

// Check if a word's audio is already in offline cache
export async function isWordAudioCached(word) {
  if (!word || typeof window === 'undefined' || !window.caches) return false;
  const cleanWord = word.trim().toLowerCase();
  const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
  try {
    const cache = await getAudioCache();
    if (!cache) return false;
    const match = await cache.match(youdaoUrl);
    return Boolean(match);
  } catch (e) {
    return false;
  }
}

// Pre-cache audio for a specific word into Cache Storage using no-cors fetch
export async function fetchWordAudioBlob(word) {
  if (!word || typeof window === 'undefined' || !window.caches) return false;
  const cleanWord = word.trim().toLowerCase();
  const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;

  try {
    const cache = await getAudioCache();
    if (!cache) return false;

    // Check if already in cache
    const existing = await cache.match(youdaoUrl);
    if (existing) return true;

    // Fetch with no-cors mode so cross-origin CDN audio is accepted into Cache Storage
    const response = await fetch(youdaoUrl, {
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit'
    });

    if (response) {
      await cache.put(youdaoUrl, response);
      return true;
    }
  } catch (e) {
    // Fail silently in background
  }
  return false;
}

// Backward compatibility stub (audio is now played directly via <audio> from Cache Storage)
export async function getCachedAudioBlob(word) {
  return null;
}

// Batch download audio for a list of words with progress callback
export async function downloadAudioPack(words, onProgress, abortSignal) {
  if (!Array.isArray(words) || words.length === 0) return { downloaded: 0, total: 0 };

  const uniqueWords = [...new Set(words.map(w => (typeof w === 'string' ? w : w.word || '').trim().toLowerCase()))].filter(Boolean);
  const total = uniqueWords.length;
  let completed = 0;
  let downloadedCount = 0;

  const cache = await getAudioCache();
  if (!cache) return { downloaded: 0, total: 0 };

  // Fast concurrent batch downloading (batch of 5)
  const batchSize = 5;
  for (let i = 0; i < uniqueWords.length; i += batchSize) {
    if (abortSignal && abortSignal.aborted) break;

    const batch = uniqueWords.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (word) => {
        const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
        try {
          const existing = await cache.match(youdaoUrl);
          if (!existing) {
            const res = await fetch(youdaoUrl, {
              method: 'GET',
              mode: 'no-cors',
              credentials: 'omit'
            });
            if (res) {
              await cache.put(youdaoUrl, res);
              downloadedCount++;
            }
          }
        } catch (e) {}

        completed++;
        if (onProgress) {
          onProgress({
            current: completed,
            total,
            percent: Math.round((completed / total) * 100),
            currentWord: word
          });
        }
      })
    );
  }

  const finalCount = await getCachedAudioCount();
  return { downloaded: downloadedCount, total, finalCount };
}
