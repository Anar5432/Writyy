import { INITIAL_WORDS } from '../data/words';

const STORAGE_KEY = 'writyy_app_data_v2'; // Bumped key to load full dictionary

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

    const merged = {
      allWords: words,
      stack1_mastered: parsed.stack1_mastered || [],
      stack2_spelling: parsed.stack2_spelling || [],
      stack3_meaning: parsed.stack3_meaning || [],
      history: parsed.history || [],
      stats: parsed.stats || { totalTested: 0, correctSpelling: 0 }
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
    allWords: INITIAL_WORDS,
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    history: [],
    stats: { totalTested: 0, correctSpelling: 0 }
  };
  saveStoredData(initial);
  return initial;
};

export const resetAllProgress = () => {
  const current = getStoredData();
  const resetData = {
    allWords: current.allWords || INITIAL_WORDS,
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    history: [],
    stats: { totalTested: 0, correctSpelling: 0 }
  };
  saveStoredData(resetData);
  return resetData;
};
