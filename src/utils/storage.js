import { INITIAL_WORDS } from '../data/words.js';
import { AWL_WORDS, AWL_MAP } from '../data/awlData.js';

const STORAGE_KEY = 'writyy_app_data_v2'; // Bumped key to load full dictionary

export const enrichWordWithAwl = (wordObj) => {
  if (!wordObj || !wordObj.word) return wordObj;
  const lower = wordObj.word.toLowerCase();
  const sublist = AWL_MAP.get(lower);
  if (sublist != null && wordObj.awlSublist !== sublist) {
    return { ...wordObj, awlSublist: sublist };
  }
  return wordObj;
};

export const ensureAwlEnriched = (wordsList) => {
  const baseList = Array.isArray(wordsList) && wordsList.length > 0 ? wordsList : INITIAL_WORDS;
  const existingSet = new Set(baseList.map(w => (w?.word || '').toLowerCase()));

  // 1. Tag any existing words with their awlSublist
  const enriched = baseList.map(w => enrichWordWithAwl(w));

  // 2. Append any supplemental AWL words that are not in baseList
  const toAppend = [];
  AWL_WORDS.forEach(aw => {
    if (!existingSet.has(aw.word.toLowerCase())) {
      toAppend.push(aw);
    }
  });

  return [...enriched, ...toAppend];
};

export const getTodayKey = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getStoredData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('writyy_app_data_v1');
    if (!raw) {
      return initializeDefaultData();
    }
    const parsed = JSON.parse(raw);
    
    // If previous storage only had starter deck (< 1000 words), upgrade to full 5,941 word database
    let words = parsed.allWords;
    if (!words || words.length < 5000) {
      // Preserve any custom words the user manually added
      const customWords = (words || []).filter(w => w.id && w.id.startsWith('custom_'));
      words = [...customWords, ...INITIAL_WORDS];
    }

    words = ensureAwlEnriched(words);

    // Populate initial struggledHistory from stack 2 and 3 if not yet present
    let initialStruggled = (parsed.struggledHistory || []).map(enrichWordWithAwl);
    if (initialStruggled.length === 0) {
      const fromS2 = (parsed.stack2_spelling || []).map(w => ({
        ...enrichWordWithAwl(w),
        struggleType: 'spelling',
        mistakeCount: 1,
        status: 'in_review',
        addedAt: new Date().toISOString(),
        lastTestedAt: new Date().toISOString()
      }));
      const fromS3 = (parsed.stack3_meaning || []).map(w => ({
        ...enrichWordWithAwl(w),
        struggleType: 'meaning',
        mistakeCount: 1,
        status: 'in_review',
        addedAt: new Date().toISOString(),
        lastTestedAt: new Date().toISOString()
      }));
      initialStruggled = [...fromS2, ...fromS3];
    }

    const rawStats = parsed.stats || {};
    const totalTested = Number(rawStats.totalTested) || 0;
    const correctSpelling = Number(rawStats.correctSpelling) || 0;
    const wrongSpelling = Math.max(0, totalTested - correctSpelling);
    const xpBalance = typeof rawStats.xpBalance === 'number'
      ? rawStats.xpBalance
      : (correctSpelling - wrongSpelling);

    const merged = {
      allWords: words,
      stack1_mastered: (parsed.stack1_mastered || []).map(enrichWordWithAwl),
      stack2_spelling: (parsed.stack2_spelling || []).map(enrichWordWithAwl),
      stack3_meaning: (parsed.stack3_meaning || []).map(enrichWordWithAwl),
      struggledHistory: initialStruggled,
      history: parsed.history || [],
      stats: {
        totalTested,
        correctSpelling,
        xpBalance,
        daily: rawStats.daily || {}
      }
    };

    saveStoredData(merged);
    return merged;
  } catch (err) {
    console.error('Failed to load from localStorage:', err);
    return initializeDefaultData();
  }
};

export const saveStoredData = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
};

export const initializeDefaultData = () => {
  const initial = {
    allWords: ensureAwlEnriched(INITIAL_WORDS),
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    struggledHistory: [],
    history: [],
    stats: { 
      totalTested: 0, 
      correctSpelling: 0,
      xpBalance: 0,
      daily: {}
    }
  };
  saveStoredData(initial);
  return initial;
};

export const resetAllProgress = () => {
  const current = getStoredData();
  const resetData = {
    allWords: ensureAwlEnriched(current.allWords || INITIAL_WORDS),
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    struggledHistory: [],
    history: [],
    stats: { 
      totalTested: 0, 
      correctSpelling: 0,
      xpBalance: 0,
      daily: {}
    }
  };
  saveStoredData(resetData);
  return resetData;
};

