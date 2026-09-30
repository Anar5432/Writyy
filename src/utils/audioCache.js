// IndexedDB Audio Cache for Writyy
// Stores studio dictionary MP3 audio files permanently on the user's phone
// Enables 100% offline studio-quality pronunciation without robotic screenreaders.

const DB_NAME = 'writyy_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_cache';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

// Retrieve cached audio Blob for a word
export async function getCachedAudioBlob(word) {
  if (!word) return null;
  const key = word.trim().toLowerCase();

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        if (req.result && req.result instanceof Blob) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// Save audio Blob to IndexedDB
export async function saveAudioBlob(word, blob) {
  if (!word || !blob) return false;
  const key = word.trim().toLowerCase();

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

// Get count of cached words in offline storage
export async function getCachedAudioCount() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();

      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch (err) {
    return 0;
  }
}

// Fetch audio from standard studio dictionary sources and return a Blob
export async function fetchWordAudioBlob(word) {
  if (!word) return null;
  const cleanWord = word.trim().toLowerCase();

  // Tier 1: Real standard American dictionary studio pronunciation (type=2: US neutral)
  const source1 = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
  
  // Tier 2: Google Static Dictionary US sound
  const source2 = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${cleanWord}--_us_1.mp3`;

  // Tier 3: Google TTS US Standard Neutral Voice
  const source3 = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;

  const sources = [source1, source2, source3];

  for (const url of sources) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });

      if (response.ok) {
        const blob = await response.blob();
        if (blob && blob.size > 1000) {
          // Valid audio found! Save in offline DB
          await saveAudioBlob(cleanWord, blob);
          return blob;
        }
      }
    } catch (e) {
      // Try next source
    }
  }

  return null;
}

// Batch download audio for a list of words with progress callback
export async function downloadAudioPack(words, onProgress, abortSignal) {
  if (!Array.isArray(words) || words.length === 0) return { downloaded: 0, total: 0 };

  const uniqueWords = [...new Set(words.map(w => (typeof w === 'string' ? w : w.word || '').trim().toLowerCase()))].filter(Boolean);
  const total = uniqueWords.length;
  let completed = 0;
  let downloadedCount = 0;

  // Process in small batches of 3 to avoid network throttling
  const batchSize = 3;
  for (let i = 0; i < uniqueWords.length; i += batchSize) {
    if (abortSignal && abortSignal.aborted) break;

    const batch = uniqueWords.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (word) => {
        // Check if already in cache
        const existing = await getCachedAudioBlob(word);
        if (!existing) {
          const blob = await fetchWordAudioBlob(word);
          if (blob) downloadedCount++;
        }
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

  return { downloaded: downloadedCount, total };
}
