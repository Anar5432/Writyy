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

// Determine active user email from session
export const getActiveUserEmail = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const GLOBAL_SIGNOUT_FLAG = 'writyy_force_signout_all_devices_v2';
      if (!localStorage.getItem(GLOBAL_SIGNOUT_FLAG)) {
        localStorage.removeItem('writyy_neon_session');
        localStorage.removeItem('writyy_guest_session');
        localStorage.setItem(GLOBAL_SIGNOUT_FLAG, 'done');
        return null;
      }
      const raw = localStorage.getItem('writyy_neon_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.email) {
          return parsed.email.trim().toLowerCase();
        }
      }
    }
  } catch (e) {}
  return null;
};

// Return account-scoped storage key
export const getUserStorageKey = (userOrEmail) => {
  let email = null;
  if (userOrEmail !== undefined && userOrEmail !== null) {
    email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail?.email;
  } else {
    email = getActiveUserEmail();
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    return 'writyy_guest_data';
  }

  const safeKey = email.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `writyy_user_${safeKey}_data`;
};

export const getStoredData = (userOrEmail) => {
  const targetKey = getUserStorageKey(userOrEmail);
  try {
    let raw = typeof localStorage !== 'undefined' ? localStorage.getItem(targetKey) : null;
    
    // If guest key has nothing, check legacy storage keys so guest work is never lost
    if (!raw && targetKey === 'writyy_guest_data' && typeof localStorage !== 'undefined') {
      raw = localStorage.getItem('writyy_app_data_v2') || localStorage.getItem('writyy_app_data_v1');
    }

    if (!raw) {
      return initializeDefaultData(userOrEmail);
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

    const notes = Array.isArray(parsed.notes) && parsed.notes.length > 0 
      ? parsed.notes 
      : getInitialSampleNotes();

    const merged = {
      allWords: words,
      stack1_mastered: (parsed.stack1_mastered || []).map(enrichWordWithAwl),
      stack2_spelling: (parsed.stack2_spelling || []).map(enrichWordWithAwl),
      stack3_meaning: (parsed.stack3_meaning || []).map(enrichWordWithAwl),
      struggledHistory: initialStruggled,
      notes,
      history: parsed.history || [],
      stats: {
        totalTested,
        correctSpelling,
        xpBalance,
        daily: rawStats.daily || {}
      }
    };

    saveStoredData(merged, userOrEmail);
    return merged;
  } catch (err) {
    console.error('Failed to load from localStorage:', err);
    return initializeDefaultData(userOrEmail);
  }
};

export const saveStoredData = (data, userOrEmail) => {
  const targetKey = getUserStorageKey(userOrEmail);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(targetKey, JSON.stringify(data));
    }
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
};

export const getInitialSampleNotes = () => [
  {
    id: 'note_ielts_collocations_sample',
    title: 'IELTS Academic Writing Task 2 - High-Band Collocations',
    icon: '💡',
    tag: 'IELTS',
    pinned: true,
    content: `### High-Band Academic Collocations for Essays

• **play a pivotal role in**
  e.g. *Education plays a pivotal role in fostering economic equality.*

• **exert a profound influence on**
  e.g. *Modern digital media exerts a profound influence on teenage psychology.*

• **pose a severe threat to**
  e.g. *Industrial runoff poses a severe threat to coastal biodiversity.*

• **reap substantial benefits from**
  e.g. *Communities reap substantial benefits from public transit investments.*

• **bridge the socioeconomic divide**
  e.g. *Targeted scholarships bridge the socioeconomic divide between rural and urban youth.*

• **strike a delicate balance between**
  e.g. *Governments must strike a delicate balance between industrial growth and environmental conservation.*`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_spelling_rules_sample',
    title: 'Tricky Spelling Checklist & Silent Letters',
    icon: '⚡',
    tag: 'Spelling',
    pinned: false,
    content: `### High-Frequency IELTS Misspellings Checklist

[x] accommodate (double 'c', double 'm')
[x] privilege (no 'd', ends in -ege)
[ ] conscientious (c-i-e-n)
[ ] embarrassment (double 'r', double 's')
[ ] pronunciation (pro-NUN-ciation, not pronounce)
[ ] hierarchy (i before e)
[ ] definitely (finite inside definitely: d-e-f-i-n-i-t-e-l-y)

> 💡 Rule of Thumb: When a suffix begins with a vowel, drop the silent final 'e' (argue → arguing, achieve → achievable).`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_awl_focus_sample',
    title: 'AWL Sublist 1 - Word Family Matrix',
    icon: '🎯',
    tag: 'Vocabulary',
    pinned: false,
    content: `### Core Academic Word Roots

• **analyze** (Verb)
  - Noun: *analysis*, *analyst*
  - Adjective: *analytical*
  - Adverb: *analytically*
  - Collocation: *conduct a thorough analysis*

• **approach** (Noun / Verb)
  - Adjective: *approachable*
  - Collocation: *adopt an innovative approach to solving problems*

• **concept** (Noun)
  - Verb: *conceptualize*
  - Adjective: *conceptual*
  - Collocation: *abstract concept*, *grasp the core concept*`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const initializeDefaultData = (userOrEmail) => {
  const initial = {
    allWords: ensureAwlEnriched(INITIAL_WORDS),
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    struggledHistory: [],
    notes: getInitialSampleNotes(),
    history: [],
    stats: { 
      totalTested: 0, 
      correctSpelling: 0,
      xpBalance: 0,
      daily: {}
    }
  };
  saveStoredData(initial, userOrEmail);
  return initial;
};

export const resetAllProgress = (userOrEmail) => {
  const current = getStoredData(userOrEmail);
  const resetData = {
    allWords: ensureAwlEnriched(current.allWords || INITIAL_WORDS),
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    struggledHistory: [],
    notes: current.notes || getInitialSampleNotes(),
    history: [],
    stats: { 
      totalTested: 0, 
      correctSpelling: 0,
      xpBalance: 0,
      daily: {}
    }
  };
  saveStoredData(resetData, userOrEmail);
  return resetData;
};

