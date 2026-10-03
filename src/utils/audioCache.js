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
  const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;

  try {
    const cache = await getAudioCache();
    if (!cache) return false;
    const match = (await cache.match(youdaoUrl)) || (await cache.match(googleUrl));
    return Boolean(match);
  } catch (e) {
    return false;
  }
}

// Pre-cache audio for a specific word into Cache Storage (Youdao + Google TTS fallback)
export async function fetchWordAudioBlob(word) {
  if (!word || typeof window === 'undefined' || !window.caches) return false;
  const cleanWord = word.trim().toLowerCase();
  const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
  const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;

  try {
    const cache = await getAudioCache();
    if (!cache) return false;

    // Check if already in cache
    const existing = (await cache.match(youdaoUrl)) || (await cache.match(googleUrl));
    if (existing) return true;

    // 1. Try Youdao (with 3.5s timeout)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(youdaoUrl, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response && (response.status === 200 || response.type === 'opaque')) {
        await cache.put(youdaoUrl, response.clone());
        return true;
      }
    } catch (err) {}

    // 2. Fallback to Google TTS (global CDN)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const gRes = await fetch(googleUrl, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (gRes && (gRes.status === 200 || gRes.type === 'opaque')) {
        await cache.put(googleUrl, gRes.clone());
        await cache.put(youdaoUrl, gRes);
        return true;
      }
    } catch (gErr) {}
  } catch (e) {}
  return false;
}

// Backward compatibility stub (audio is played directly via <audio> from Cache Storage)
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

  // Fast concurrent batch downloading (batch of 4)
  const batchSize = 4;
  for (let i = 0; i < uniqueWords.length; i += batchSize) {
    if (abortSignal && abortSignal.aborted) break;

    const batch = uniqueWords.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (word) => {
        const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
        const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(word)}`;

        try {
          const existing = (await cache.match(youdaoUrl)) || (await cache.match(googleUrl));
          if (!existing) {
            let fetched = false;

            // 1. Try Youdao
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3500);
              const res = await fetch(youdaoUrl, {
                method: 'GET',
                mode: 'no-cors',
                credentials: 'omit',
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (res && (res.status === 200 || res.type === 'opaque')) {
                await cache.put(youdaoUrl, res);
                downloadedCount++;
                fetched = true;
              }
            } catch (yErr) {}

            // 2. Fallback to Google TTS if Youdao fails
            if (!fetched) {
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);
                const gRes = await fetch(googleUrl, {
                  method: 'GET',
                  mode: 'no-cors',
                  credentials: 'omit',
                  signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (gRes && (gRes.status === 200 || gRes.type === 'opaque')) {
                  await cache.put(googleUrl, gRes.clone());
                  await cache.put(youdaoUrl, gRes);
                  downloadedCount++;
                }
              } catch (gErr) {}
            }
          } else {
            downloadedCount++;
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
