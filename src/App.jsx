import React, { useState, useEffect, useRef } from 'react';
import { CEFR_LEVELS } from './data/words';
import { AWL_SUBLISTS, AWL_SUBLIST_INFO, AWL_WORDS, AWL_WORDS_BY_SUBLIST, AWL_MAP } from './data/awlData';
import { speechService } from './utils/audio';
import { getCachedAudioCount, downloadAudioPack, fetchWordAudioBlob } from './utils/audioCache';
import { sfx } from './utils/sfx';
import { getStoredData, saveStoredData, resetAllProgress, ensureAwlEnriched, enrichWordWithAwl, getTodayKey } from './utils/storage';
import { getCurrentUser } from './utils/neonDb';
import { 
  pushProgressToCloud, 
  fetchProgressFromCloud, 
  mergeCloudAndLocal, 
  scheduleCloudSync 
} from './utils/cloudSync';
import AuthModal from './components/AuthModal';
import './App.css';

export default function App() {
  // Global State
  const [data, setData] = useState(() => getStoredData());
  const [activeTab, setActiveTab] = useState('study'); // 'study' | 'review' | 'search' | 'stats' | 'add'
  const [selectedLevel, setSelectedLevel] = useState('IELTS_FOCUS'); // 'ALL', 'A1'..'C1', 'IELTS_FOCUS', 'AWL'
  const [selectedAwlSublist, setSelectedAwlSublist] = useState(1); // 1..10 or 'ALL'
  const [audioSpeed, setAudioSpeed] = useState(1.05);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Study Mode State
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [unknownMeaning, setUnknownMeaning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { isCorrectSpelling, wordObj, routedToStack }

  // Review Mode State
  const [reviewStackType, setReviewStackType] = useState('stack2'); // 'stack2' | 'stack3'
  const [reviewSublist, setReviewSublist] = useState('ALL'); // 'ALL' | 1..10 | 'OTHER'
  const [reviewTabMode, setReviewTabMode] = useState('active'); // 'active' | 'history'
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewInput, setReviewInput] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);

  // Stats Mode State
  const [statsSublistFilter, setStatsSublistFilter] = useState('ALL'); // 'ALL' | 1..10 | 'OTHER'

  // Search Mode State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLevel, setSearchLevel] = useState('ALL');

  // Install PWA State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Custom Word Form State
  const [newWord, setNewWord] = useState('');
  const [newPhonetic, setNewPhonetic] = useState('');
  const [newDef, setNewDef] = useState('');
  const [newExample, setNewExample] = useState('');
  const [newLevel, setNewLevel] = useState('B2');
  const [addSuccessMsg, setAddSuccessMsg] = useState('');

  // Over-the-Air (OTA) Updates State
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [swRegistration, setSwRegistration] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Audio Studio & Offline Pack State
  const [offlineAudioCount, setOfflineAudioCount] = useState(0);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0, percent: 0, currentWord: '' });
  const abortControllerRef = useRef(null);

  // Neon Auth & Cloud Sync State
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const inputRef = useRef(null);
  const reviewInputRef = useRef(null);
  const searchInputRef = useRef(null);

  // Check if running as installed standalone app on phone & setup update listeners
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        setIsStandalone(true);
      }
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Initial check of offline audio cache count
    getCachedAudioCount().then(setOfflineAudioCount).catch(() => {});

    // Listen for new Service Worker update event
    const handleUpdateReady = (e) => {
      console.log('[App] New Over-the-air update available!');
      setUpdateAvailable(true);
      if (e.detail && e.detail.registration) {
        setSwRegistration(e.detail.registration);
      }
    };

    window.addEventListener('writyy-update-ready', handleUpdateReady);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('writyy-update-ready', handleUpdateReady);
    };
  }, []);

  // Handle applying the update and reloading immediately
  const handleApplyUpdate = () => {
    setIsUpdating(true);
    showToast('🚀 Applying update to Writyy...');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      const reg = swRegistration || (typeof window !== 'undefined' ? window.__WRITYY_SW_REGISTRATION__ : null);
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }

    // Safety timeout reload
    setTimeout(() => window.location.reload(), 1500);
  };

  // Manual Check for Updates
  const handleManualCheckUpdate = async () => {
    if (!navigator.onLine) {
      showToast('⚠️ Offline: Please connect to the internet to check for updates.');
      return;
    }
    showToast('Checking for Writyy updates...');
    if (typeof window !== 'undefined' && window.checkForWrityyUpdate) {
      const res = await window.checkForWrityyUpdate();
      if (res.status === 'update-found') {
        setUpdateAvailable(true);
        showToast('🚀 New update ready! Click "Update Now" to apply.');
      } else {
        showToast('✓ Writyy is up to date with the latest features!');
      }
    } else {
      showToast('✓ Writyy is up to date.');
    }
  };

  // Download audio files for offline use into IndexedDB
  const handleStartDownloadAudio = async (targetWords) => {
    if (isDownloadingAudio) return;
    if (!navigator.onLine) {
      showToast('⚠️ Connect to Wi-Fi/Internet to download offline audio.');
      return;
    }

    setIsDownloadingAudio(true);
    abortControllerRef.current = new AbortController();

    try {
      await downloadAudioPack(
        targetWords,
        (prog) => setDownloadProgress(prog),
        abortControllerRef.current.signal
      );
      const updatedCount = await getCachedAudioCount();
      setOfflineAudioCount(updatedCount);
      showToast(`✓ All studio sounds saved! ${updatedCount} words ready offline.`);
    } catch (err) {
      showToast('Audio download interrupted.');
    } finally {
      setIsDownloadingAudio(false);
      setDownloadProgress({ current: 0, total: 0, percent: 0, currentWord: '' });
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsDownloadingAudio(false);
    showToast('Download cancelled.');
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        if (choice && choice.outcome === 'accepted') {
          setIsStandalone(true);
          showToast('Writyy installed to Home Screen!');
        }
        setDeferredPrompt(null);
      });
    } else {
      setShowInstallModal(true);
    }
  };

  // Save changes to localStorage & auto-sync to Firebase Cloud
  // Save changes to localStorage & auto-sync to Neon Cloud Database
  useEffect(() => {
    saveStoredData(data);
    if (currentUser) {
      setIsSyncing(true);
      scheduleCloudSync(currentUser, data);
      const timer = setTimeout(() => setIsSyncing(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [data, currentUser?.email]);

  // Load progress from Neon on initial render or user login
  useEffect(() => {
    if (currentUser) {
      setIsSyncing(true);
      fetchProgressFromCloud(currentUser).then(async (cloudData) => {
        const currentLocal = getStoredData();
        if (cloudData) {
          const merged = mergeCloudAndLocal(currentLocal, cloudData);
          setData(merged);
          saveStoredData(merged);
          await pushProgressToCloud(currentUser, merged);
          setLastSyncTime(new Date());
          showToast('🐘 Synced with Neon Cloud!');
        } else {
          // Push current local vocabulary to create the cloud document
          await pushProgressToCloud(currentUser, currentLocal);
          setLastSyncTime(new Date());
        }
      }).catch((err) => {
        console.warn('[Neon Sync] Load error:', err);
      }).finally(() => {
        setIsSyncing(false);
      });
    }
  }, [currentUser?.email]);

  // Auto-sync offline progress when phone reconnects to internet
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[App] Network reconnected! Auto-syncing offline progress...');
      showToast('📶 Back online! Syncing progress to Neon cloud...');
      if (currentUser) {
        setIsSyncing(true);
        try {
          const currentLocal = getStoredData();
          const cloudData = await fetchProgressFromCloud(currentUser);
          const merged = mergeCloudAndLocal(currentLocal, cloudData);
          setData(merged);
          saveStoredData(merged);
          await pushProgressToCloud(currentUser, merged);
          setLastSyncTime(new Date());
          showToast('✓ Synced with Neon Cloud Database!');
        } catch (err) {
          console.warn('[Auto-sync error]', err);
        } finally {
          setIsSyncing(false);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [currentUser]);

  // Force manual cloud synchronization with Neon
  const handleForceSyncWithCloud = async () => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    setIsSyncing(true);
    showToast('🐘 Syncing with Neon...');
    try {
      const cloudData = await fetchProgressFromCloud(currentUser);
      const currentLocal = getStoredData();
      const merged = mergeCloudAndLocal(currentLocal, cloudData);

      saveStoredData(merged);
      setData(merged);

      const success = await pushProgressToCloud(currentUser, merged);
      setIsSyncing(false);
      if (success) {
        setLastSyncTime(new Date());
        showToast('✓ Neon sync complete! All words synced.');
      } else {
        showToast('⚠️ Sync failed. Check Neon connection.');
      }
    } catch (err) {
      setIsSyncing(false);
      showToast('⚠️ Sync error: ' + (err.message || 'Check connection'));
    }
  };

  // Update audio speed
  useEffect(() => {
    speechService.setRate(audioSpeed);
  }, [audioSpeed]);

  // Toast notification helper
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Initialize Study Queue whenever selectedLevel, selectedAwlSublist, or data.allWords.length changes
  useEffect(() => {
    let pool = [];
    if (selectedLevel === 'AWL') {
      if (selectedAwlSublist === 'ALL') {
        pool = [...AWL_WORDS];
      } else {
        const slNum = Number(selectedAwlSublist);
        pool = [...(AWL_WORDS_BY_SUBLIST[slNum] || [])];
        if (pool.length === 0) {
          pool = AWL_WORDS.filter(w => w.awlSublist === slNum);
        }
      }
    } else if (selectedLevel === 'IELTS_FOCUS') {
      pool = data.allWords.filter(w => w.level === 'B2' || w.level === 'C1');
    } else if (selectedLevel !== 'ALL') {
      pool = data.allWords.filter(w => w.level === selectedLevel);
    } else {
      pool = [...data.allWords];
    }

    // Always enrich words with awlSublist tags
    let filtered = pool.map(enrichWordWithAwl);

    // Deduplicate words by word text
    const seen = new Set();
    filtered = filtered.filter(w => {
      const lower = (w?.word || '').toLowerCase();
      if (!lower || seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    // The user wants ALL words of this sublist in the study queue so they can progress from 1 to N (e.g. 1 to 60)
    // DO NOT filter out mastered words mid-session! The denominator MUST remain the total count of words in this sublist.
    setQueue(filtered);
    setCurrentIndex(0);
    resetStudyInputs();
  }, [selectedLevel, selectedAwlSublist, data.allWords.length]);

  // Review Queue snapshot - refreshed when reviewStackType, reviewSublist, reviewTabMode, or stack data changes
  useEffect(() => {
    if (activeTab === 'review') {
      let sourceList = [];
      if (reviewTabMode === 'active') {
        sourceList = reviewStackType === 'stack2' ? data.stack2_spelling : data.stack3_meaning;
      } else {
        // Review History / Repetition Bank: all words ever struggled with
        sourceList = data.struggledHistory || [];
        if (reviewStackType === 'stack2') {
          sourceList = sourceList.filter(w => w.struggleType === 'spelling' || w.struggleType === 'both');
        } else if (reviewStackType === 'stack3') {
          sourceList = sourceList.filter(w => w.struggleType === 'meaning' || w.struggleType === 'both');
        }
      }

      // Filter by sublist
      let filtered = sourceList.map(enrichWordWithAwl);
      if (reviewSublist === 'ALL') {
        // keep all
      } else if (reviewSublist === 'OTHER') {
        filtered = filtered.filter(w => !w.awlSublist && !AWL_MAP.has((w.word || '').toLowerCase()));
      } else {
        const slNum = Number(reviewSublist);
        filtered = filtered.filter(w => {
          const sub = w.awlSublist || AWL_MAP.get((w.word || '').toLowerCase());
          return sub === slNum;
        });
      }

      setReviewQueue(filtered);
      setReviewIndex(prev => (prev >= filtered.length ? 0 : prev));
      resetReviewInputs();
    }
  }, [
    activeTab, 
    reviewStackType, 
    reviewSublist, 
    reviewTabMode, 
    data.stack2_spelling, 
    data.stack3_meaning, 
    data.struggledHistory
  ]);

  const currentWord = queue[currentIndex];
  const currentReviewWord = reviewQueue[reviewIndex];

  // Play audio with waveform animation state
  const playCurrentAudio = (wordToSpeak) => {
    const target = wordToSpeak || (activeTab === 'review' ? (currentReviewWord ? currentReviewWord.word : '') : (currentWord ? currentWord.word : ''));
    if (!target) return;

    if (speechService.synth && speechService.synth.paused) {
      try { speechService.synth.resume(); } catch (e) {}
    }

    speechService.speak(
      target,
      () => setIsPlayingAudio(true),
      () => setIsPlayingAudio(false)
    );
  };

  // Pre-fetch next 2 upcoming words in background so they play in 0ms from local cache without network lag
  useEffect(() => {
    if (activeTab === 'study' && queue.length > 0) {
      const next1 = queue[currentIndex + 1]?.word;
      const next2 = queue[currentIndex + 2]?.word;
      if (next1) fetchWordAudioBlob(next1).catch(() => {});
      if (next2) fetchWordAudioBlob(next2).catch(() => {});
    } else if (activeTab === 'review' && reviewQueue.length > 0) {
      const next1 = reviewQueue[reviewIndex + 1]?.word;
      const next2 = reviewQueue[reviewIndex + 2]?.word;
      if (next1) fetchWordAudioBlob(next1).catch(() => {});
      if (next2) fetchWordAudioBlob(next2).catch(() => {});
    }
  }, [activeTab, currentIndex, reviewIndex, queue.length, reviewQueue.length]);

  // Auto-play audio when study word appears (instant 50ms trigger!)
  useEffect(() => {
    if (activeTab === 'study' && queue[currentIndex] && !submitted) {
      const timer = setTimeout(() => {
        playCurrentAudio(queue[currentIndex].word);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, currentIndex, selectedLevel, submitted]);

  // Auto-play audio when review word appears (instant 50ms trigger!)
  useEffect(() => {
    if (activeTab === 'review' && reviewQueue[reviewIndex] && !reviewSubmitted) {
      const timer = setTimeout(() => {
        playCurrentAudio(reviewQueue[reviewIndex].word);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, reviewIndex, reviewStackType, reviewSubmitted, reviewQueue.length]);

  // Global Enter Key Listener: If on submitted / reveal screen, pressing Enter automatically goes to next word!
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        if (activeTab === 'study' && submitted) {
          e.preventDefault();
          handleNextWord();
        } else if (activeTab === 'review' && reviewSubmitted) {
          e.preventDefault();
          handleNextReviewWord();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, submitted, reviewSubmitted, currentIndex, reviewIndex, queue.length, reviewQueue.length]);

  // Unlock mobile audio context upon first interaction and play waiting card
  useEffect(() => {
    let triggered = false;
    const handleFirstTouch = () => {
      if (triggered) return;
      triggered = true;
      speechService.unlockAudio();
      sfx.getContext();

      // If opening offline or fresh, play the word currently visible on screen
      setTimeout(() => {
        if (activeTab === 'study' && queue[currentIndex] && !submitted) {
          playCurrentAudio(queue[currentIndex].word);
        } else if (activeTab === 'review' && reviewQueue[reviewIndex] && !reviewSubmitted) {
          playCurrentAudio(reviewQueue[reviewIndex].word);
        }
      }, 100);

      window.removeEventListener('touchstart', handleFirstTouch);
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('pointerdown', handleFirstTouch);
    };
    window.addEventListener('touchstart', handleFirstTouch, { passive: true });
    window.addEventListener('click', handleFirstTouch, { passive: true });
    window.addEventListener('pointerdown', handleFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleFirstTouch);
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('pointerdown', handleFirstTouch);
    };
  }, [activeTab, currentIndex, reviewIndex, queue, reviewQueue, submitted, reviewSubmitted]);

  const resetStudyInputs = () => {
    setUserInput('');
    setUnknownMeaning(false);
    setSubmitted(false);
    setLastResult(null);
    // Only auto-focus on desktop with physical keyboard to avoid locking mobile virtual keyboard
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouch) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  };

  const resetReviewInputs = () => {
    setReviewInput('');
    setReviewSubmitted(false);
    setReviewResult(null);
    // Only auto-focus on desktop with physical keyboard to avoid locking mobile virtual keyboard
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouch) {
      setTimeout(() => {
        if (reviewInputRef.current) reviewInputRef.current.focus();
      }, 50);
    }
  };

  const upsertWordList = (list, word) => {
    if (!word) return list || [];
    const wordLower = (word.word || '').toLowerCase();
    const filtered = (list || []).filter(w => w.id !== word.id && (w.word || '').toLowerCase() !== wordLower);
    return [word, ...filtered];
  };

  // Submit in Study Loop
  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!currentWord || !userInput.trim()) return;

    const trimmedInput = userInput.trim().toLowerCase();
    const correctWord = currentWord.word.toLowerCase();
    const isCorrect = trimmedInput === correctWord;

    let routedStack = '';
    const wordEntry = { ...enrichWordWithAwl(currentWord), lastTested: new Date().toISOString() };

    setData(prev => {
      let updatedS1 = [...prev.stack1_mastered];
      let updatedS2 = [...prev.stack2_spelling];
      let updatedS3 = [...prev.stack3_meaning];
      let updatedStruggled = [...(prev.struggledHistory || [])];

      const struggledIdx = updatedStruggled.findIndex(
        w => (w.word || '').toLowerCase() === correctWord
      );

      if (unknownMeaning) {
        routedStack = 'Stack 3 (Unknown Meaning)';
        updatedS3 = upsertWordList(updatedS3, wordEntry);
        updatedS2 = updatedS2.filter(w => w.id !== currentWord.id && (w.word || '').toLowerCase() !== correctWord);
        updatedS1 = updatedS1.filter(w => w.id !== currentWord.id && (w.word || '').toLowerCase() !== correctWord);

        const newStruggledItem = {
          ...wordEntry,
          struggleType: (struggledIdx >= 0 && updatedStruggled[struggledIdx].struggleType === 'spelling') ? 'both' : 'meaning',
          mistakeCount: (struggledIdx >= 0 ? (updatedStruggled[struggledIdx].mistakeCount || 1) : 0) + 1,
          status: 'in_review',
          addedAt: struggledIdx >= 0 ? updatedStruggled[struggledIdx].addedAt : new Date().toISOString(),
          lastTestedAt: new Date().toISOString()
        };
        if (struggledIdx >= 0) {
          updatedStruggled[struggledIdx] = newStruggledItem;
        } else {
          updatedStruggled.unshift(newStruggledItem);
        }
      } else if (!isCorrect) {
        routedStack = 'Stack 2 (Spelling Error)';
        updatedS2 = upsertWordList(updatedS2, wordEntry);
        updatedS3 = updatedS3.filter(w => w.id !== currentWord.id && (w.word || '').toLowerCase() !== correctWord);
        updatedS1 = updatedS1.filter(w => w.id !== currentWord.id && (w.word || '').toLowerCase() !== correctWord);

        const newStruggledItem = {
          ...wordEntry,
          struggleType: (struggledIdx >= 0 && updatedStruggled[struggledIdx].struggleType === 'meaning') ? 'both' : 'spelling',
          mistakeCount: (struggledIdx >= 0 ? (updatedStruggled[struggledIdx].mistakeCount || 1) : 0) + 1,
          status: 'in_review',
          addedAt: struggledIdx >= 0 ? updatedStruggled[struggledIdx].addedAt : new Date().toISOString(),
          lastTestedAt: new Date().toISOString()
        };
        if (struggledIdx >= 0) {
          updatedStruggled[struggledIdx] = newStruggledItem;
        } else {
          updatedStruggled.unshift(newStruggledItem);
        }
      } else {
        routedStack = 'Stack 1 (Mastered)';
        updatedS1 = upsertWordList(updatedS1, wordEntry);
        updatedS2 = updatedS2.filter(w => w.id !== currentWord.id && (w.word || '').toLowerCase() !== correctWord);
        updatedS3 = updatedS3.filter(w => w.id !== currentWord.id && (w.word || '').toLowerCase() !== correctWord);

        // Retain in struggledHistory but mark as mastered (DO NOT DELETE!)
        if (struggledIdx >= 0) {
          updatedStruggled[struggledIdx] = {
            ...updatedStruggled[struggledIdx],
            status: 'mastered',
            lastTestedAt: new Date().toISOString()
          };
        }
      }

      const todayKey = getTodayKey();
      const currentDaily = prev.stats?.daily || {};
      const currentToday = currentDaily[todayKey] || { tested: 0, correct: 0, wrong: 0, xp: 0 };

      const updatedToday = {
        tested: (currentToday.tested || 0) + 1,
        correct: (currentToday.correct || 0) + (isCorrect ? 1 : 0),
        wrong: (currentToday.wrong || 0) + (isCorrect ? 0 : 1),
        xp: (currentToday.xp || 0) + (isCorrect ? 1 : -1)
      };

      const currentXp = typeof prev.stats?.xpBalance === 'number'
        ? prev.stats.xpBalance
        : ((prev.stats?.correctSpelling || 0) - ((prev.stats?.totalTested || 0) - (prev.stats?.correctSpelling || 0)));

      const nextXpBalance = currentXp + (isCorrect ? 1 : -1);

      const nextData = {
        ...prev,
        stack1_mastered: updatedS1,
        stack2_spelling: updatedS2,
        stack3_meaning: updatedS3,
        struggledHistory: updatedStruggled,
        stats: {
          totalTested: (prev.stats?.totalTested || 0) + 1,
          correctSpelling: (prev.stats?.correctSpelling || 0) + (isCorrect ? 1 : 0),
          xpBalance: nextXpBalance,
          daily: {
            ...currentDaily,
            [todayKey]: updatedToday
          }
        }
      };

      saveStoredData(nextData);
      scheduleCloudSync(currentUser, nextData);
      return nextData;
    });

    if (isCorrect) {
      sfx.playCorrect();
    } else {
      sfx.playIncorrect();
    }

    setLastResult({
      isCorrectSpelling: isCorrect,
      typed: trimmedInput,
      wordObj: currentWord,
      routedToStack: routedStack
    });
    setSubmitted(true);
  };

  const handleNextWord = () => {
    if (currentIndex + 1 < queue.length) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      resetStudyInputs();
    } else {
      showToast('🎉 Batch completed! Continuing continuous repetition practice.');
      const reshuffled = [...queue].sort(() => Math.random() - 0.5);
      setQueue(reshuffled);
      setCurrentIndex(0);
      resetStudyInputs();
    }
  };

  const handlePrevWord = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      const prevWordObj = queue[prevIdx];
      setCurrentIndex(prevIdx);
      // Immediately reveal full definition, phonetics, and example of the previous word
      setSubmitted(true);
      setLastResult({
        isCorrectSpelling: true,
        typed: prevWordObj.word,
        wordObj: prevWordObj,
        routedToStack: 'Viewing Previous Word Details'
      });
      setTimeout(() => {
        playCurrentAudio(prevWordObj.word);
      }, 175);
    }
  };

  const handlePrevReviewWord = () => {
    if (reviewIndex > 0) {
      const prevIdx = reviewIndex - 1;
      const prevWordObj = reviewQueue[prevIdx];
      setReviewIndex(prevIdx);
      setReviewSubmitted(true);
      setReviewResult({
        isCorrectSpelling: true,
        typed: prevWordObj.word,
        wordObj: prevWordObj
      });
      setTimeout(() => {
        playCurrentAudio(prevWordObj.word);
      }, 175);
    }
  };

  // Submit in Review Mode
  const handleReviewSubmit = (e) => {
    if (e) e.preventDefault();
    if (!currentReviewWord || !reviewInput.trim()) return;

    const trimmedInput = reviewInput.trim().toLowerCase();
    const correctWord = currentReviewWord.word.toLowerCase();
    const isCorrect = trimmedInput === correctWord;

    setData(prev => {
      let updatedS1 = [...prev.stack1_mastered];
      let updatedS2 = [...prev.stack2_spelling];
      let updatedS3 = [...prev.stack3_meaning];
      let updatedStruggled = [...(prev.struggledHistory || [])];

      const struggledIdx = updatedStruggled.findIndex(
        w => (w.word || '').toLowerCase() === correctWord
      );

      if (isCorrect) {
        sfx.playCorrect();
        updatedS1 = upsertWordList(updatedS1, enrichWordWithAwl(currentReviewWord));
        updatedS2 = updatedS2.filter(w => w.id !== currentReviewWord.id && (w.word || '').toLowerCase() !== correctWord);
        updatedS3 = updatedS3.filter(w => w.id !== currentReviewWord.id && (w.word || '').toLowerCase() !== correctWord);

        // Update status in struggled history to 'mastered' (DO NOT DELETE FROM ARCHIVE!)
        if (struggledIdx >= 0) {
          updatedStruggled[struggledIdx] = {
            ...updatedStruggled[struggledIdx],
            status: 'mastered',
            lastTestedAt: new Date().toISOString()
          };
        }
      } else {
        sfx.playIncorrect();
        // Increment mistake count in struggled history
        if (struggledIdx >= 0) {
          updatedStruggled[struggledIdx] = {
            ...updatedStruggled[struggledIdx],
            mistakeCount: (updatedStruggled[struggledIdx].mistakeCount || 1) + 1,
            status: 'in_review',
            lastTestedAt: new Date().toISOString()
          };
        }
      }

      const todayKey = getTodayKey();
      const currentDaily = prev.stats?.daily || {};
      const currentToday = currentDaily[todayKey] || { tested: 0, correct: 0, wrong: 0, xp: 0 };

      const updatedToday = {
        tested: (currentToday.tested || 0) + 1,
        correct: (currentToday.correct || 0) + (isCorrect ? 1 : 0),
        wrong: (currentToday.wrong || 0) + (isCorrect ? 0 : 1),
        xp: (currentToday.xp || 0) + (isCorrect ? 1 : -1)
      };

      const currentXp = typeof prev.stats?.xpBalance === 'number'
        ? prev.stats.xpBalance
        : ((prev.stats?.correctSpelling || 0) - ((prev.stats?.totalTested || 0) - (prev.stats?.correctSpelling || 0)));

      const nextXpBalance = currentXp + (isCorrect ? 1 : -1);

      const nextData = {
        ...prev,
        stack1_mastered: updatedS1,
        stack2_spelling: updatedS2,
        stack3_meaning: updatedS3,
        struggledHistory: updatedStruggled,
        stats: {
          totalTested: (prev.stats?.totalTested || 0) + 1,
          correctSpelling: (prev.stats?.correctSpelling || 0) + (isCorrect ? 1 : 0),
          xpBalance: nextXpBalance,
          daily: {
            ...currentDaily,
            [todayKey]: updatedToday
          }
        }
      };

      saveStoredData(nextData);
      scheduleCloudSync(currentUser, nextData);
      return nextData;
    });

    setReviewResult({
      isCorrectSpelling: isCorrect,
      typed: trimmedInput,
      wordObj: currentReviewWord
    });
    setReviewSubmitted(true);
  };

  const handleNextReviewWord = () => {
    if (reviewIndex + 1 < reviewQueue.length) {
      const nextIdx = reviewIndex + 1;
      setReviewIndex(nextIdx);
      resetReviewInputs();
    } else {
      showToast('🎉 Review batch completed! Resetting to start.');
      setReviewIndex(0);
      resetReviewInputs();
    }
  };

  // Repeat all struggled words for a specific sublist directly in Study Dictation mode
  const handleRepeatSublistStruggledInStudy = (sublistNum) => {
    let targetWords = [];
    const allStruggled = (data.struggledHistory || []).map(enrichWordWithAwl);

    if (sublistNum === 'ALL') {
      targetWords = allStruggled;
    } else if (sublistNum === 'OTHER') {
      targetWords = allStruggled.filter(w => !w.awlSublist && !AWL_MAP.has((w.word || '').toLowerCase()));
    } else {
      const slNum = Number(sublistNum);
      targetWords = allStruggled.filter(w => {
        const sub = w.awlSublist || AWL_MAP.get((w.word || '').toLowerCase());
        return sub === slNum;
      });
    }

    if (targetWords.length === 0) {
      showToast(`No review history recorded for Sublist ${sublistNum} yet.`);
      return;
    }

    const shuffled = [...targetWords].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setCurrentIndex(0);
    resetStudyInputs();
    setActiveTab('study');
    showToast(`Loaded ${shuffled.length} words from Sublist ${sublistNum} review history into Dictation!`);
    setTimeout(() => {
      if (shuffled[0]) playCurrentAudio(shuffled[0].word);
    }, 300);
  };

  // Practice a single struggled word directly in Study Dictation mode
  const handlePracticeSingleWord = (wordObj) => {
    if (!wordObj || !wordObj.word) return;
    const enriched = enrichWordWithAwl(wordObj);
    const remaining = queue.filter(w => (w.word || '').toLowerCase() !== (enriched.word || '').toLowerCase());
    setQueue([enriched, ...remaining]);
    setCurrentIndex(0);
    resetStudyInputs();
    setActiveTab('study');
    showToast(`Loaded "${enriched.word}" into Active Dictation!`);
    setTimeout(() => {
      playCurrentAudio(enriched.word);
    }, 300);
  };

  // Switch to an AWL Sublist directly
  const handleSelectAwlSublist = (slNum) => {
    setSelectedLevel('AWL');
    setSelectedAwlSublist(slNum);
    setActiveTab('study');
  };

  // Search feature actions: Add word to active practice queue
  const handleAddSearchedWordToQueue = (wordObj) => {
    // Add right in front of the queue
    const remaining = queue.filter(w => w.id !== wordObj.id);
    const updatedQueue = [wordObj, ...remaining];
    setQueue(updatedQueue);
    setCurrentIndex(0);
    resetStudyInputs();
    setActiveTab('study');
    showToast(`Added "${wordObj.word}" to Active Practice Queue!`);
    setTimeout(() => {
      playCurrentAudio(wordObj.word);
    }, 400);
  };

  const handlePushSearchedWordToStack = (wordObj, stackType) => {
    const entry = { ...wordObj, lastTested: new Date().toISOString() };
    if (stackType === 'stack2') {
      setData(prev => ({
        ...prev,
        stack2_spelling: upsertWordList(prev.stack2_spelling, entry)
      }));
      showToast(`Pushed "${wordObj.word}" to Stack 2 (Spelling Review)!`);
    } else {
      setData(prev => ({
        ...prev,
        stack3_meaning: upsertWordList(prev.stack3_meaning, entry)
      }));
      showToast(`Pushed "${wordObj.word}" to Stack 3 (Meaning Review)!`);
    }
  };

  // Add Custom Word
  const handleAddWord = (e) => {
    e.preventDefault();
    if (!newWord.trim()) return;

    const created = {
      id: 'custom_' + Date.now(),
      word: newWord.trim().toLowerCase(),
      phonetic: newPhonetic.trim() || `/${newWord.trim().toLowerCase()}/`,
      level: newLevel,
      pos: 'custom',
      definition: newDef.trim() || 'Custom IELTS vocabulary word.',
      example: newExample.trim() || `Key academic word: "${newWord.trim()}".`
    };

    setData(prev => ({
      ...prev,
      allWords: [created, ...prev.allWords]
    }));

    setAddSuccessMsg(`Added "${created.word}" (${newLevel}) successfully!`);
    setNewWord('');
    setNewPhonetic('');
    setNewDef('');
    setNewExample('');
    setTimeout(() => setAddSuccessMsg(''), 3500);
  };

  // Reset all data
  const handleResetProgress = () => {
    if (window.confirm('Reset all progress stacks and stats back to start?')) {
      const reset = resetAllProgress();
      setData(reset);
      setCurrentIndex(0);
      resetStudyInputs();
    }
  };

  // Metrics & Strict Daily XP
  const todayKey = getTodayKey();
  const todayStats = (data.stats && data.stats.daily && data.stats.daily[todayKey]) || {
    tested: 0,
    correct: 0,
    wrong: 0,
    xp: 0
  };
  const todayTested = todayStats.tested || 0;
  const todayCorrect = todayStats.correct || 0;
  const todayWrong = todayStats.wrong || 0;
  const todayXp = typeof todayStats.xp === 'number' ? todayStats.xp : (todayCorrect - todayWrong);

  const total = data.stats?.totalTested || 0;
  const correct = data.stats?.correctSpelling || 0;
  const wrong = Math.max(0, total - correct);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  
  const xpBalance = typeof data.stats?.xpBalance === 'number'
    ? data.stats.xpBalance
    : (correct - wrong);
  
  let estimatedBand = 'N/A';
  if (total >= 5) {
    if (accuracy >= 92) estimatedBand = '8.5 - 9.0';
    else if (accuracy >= 82) estimatedBand = '7.5 - 8.0';
    else if (accuracy >= 72) estimatedBand = '6.5 - 7.0';
    else if (accuracy >= 60) estimatedBand = '5.5 - 6.0';
    else estimatedBand = '4.5 - 5.0';
  }

  // Filtered Search Results (100% Offline in-memory lookup)
  const filteredSearchResults = data.allWords.filter(item => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q || item.word.toLowerCase().includes(q) ||
                         (item.definition && item.definition.toLowerCase().includes(q));
    const matchesLevel = searchLevel === 'ALL' 
      ? true 
      : searchLevel === 'AWL' 
        ? item.awlSublist != null 
        : item.level === searchLevel;
    return matchesQuery && matchesLevel;
  });

  // Waveform Bar Heights (for animation)
  const waveHeights = [20, 36, 48, 28, 55, 70, 42, 60, 80, 50, 65, 85, 45, 75, 55, 38, 62, 44, 30, 18];

  return (
    <div className="app-canvas">
      {/* Global Toast Notification */}
      {toastMsg && (
        <div className="toast-notification">
          <span>✨ {toastMsg}</span>
        </div>
      )}

      <div className="mobile-shell">
        {/* Over-the-air Update Notification Banner */}
        {updateAvailable && (
          <div className="update-notification-banner">
            <div className="update-banner-content">
              <span className="update-icon">🚀</span>
              <div className="update-text">
                <span className="update-title">New Update Available!</span>
                <span className="update-subtitle">Studio neutral voice & system updates ready.</span>
              </div>
            </div>
            <div className="update-actions">
              <button className="btn-update-now" onClick={handleApplyUpdate} disabled={isUpdating}>
                {isUpdating ? 'Updating...' : 'Update & Reload'}
              </button>
              <button className="btn-update-dismiss" onClick={() => setUpdateAvailable(false)} title="Dismiss">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Top App Header (Image 1 & 2 inspired) */}
        <header className="app-topbar">
          <button 
            className="icon-round-btn" 
            onClick={() => setActiveTab('study')}
            title="Home / Back"
          >
            ‹
          </button>

          <div className="brand-badge" onClick={() => setActiveTab('study')} style={{ cursor: 'pointer' }}>
            <span className="brand-navy">lazy</span>
            <span className="brand-red">writyy</span>
            <span className="brand-dot"></span>
          </div>

          <div className="topbar-right">
            {/* Account XP Balance Badge */}
            <div 
              className={`header-xp-badge ${xpBalance >= 0 ? 'xp-positive' : 'xp-negative'}`}
              onClick={() => setActiveTab('stats')}
              title={`Account XP Balance: ${xpBalance >= 0 ? `+${xpBalance} XP` : `${xpBalance} XP`} (Click to view statistics)`}
              style={{ cursor: 'pointer' }}
            >
              <span>{xpBalance >= 0 ? `+${xpBalance} XP` : `${xpBalance} XP`}</span>
            </div>

            {/* Cloud Sync & Account Button */}
            <button 
              className="header-user-btn"
              onClick={() => setShowAuthModal(true)}
              title={currentUser ? `Signed in as ${currentUser.displayName || currentUser.email}` : "Cloud Sync / Sign In"}
            >
              <span className={`user-sync-dot ${isSyncing ? 'syncing' : ''}`}></span>
              <span>{currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : '☁️ Cloud'}</span>
            </button>

            <button 
              className="header-audio-btn" 
              onClick={() => setShowAudioModal(true)}
              title="Studio Audio & Offline Voice Pack"
            >
              <span>🎧</span>
              <span className="audio-cache-tag">
                {offlineAudioCount > 0 ? `${offlineAudioCount}` : 'Voice'}
              </span>
            </button>
          </div>
        </header>


        {/* Global Navigation Tabs */}
        <nav className="pill-nav-bar">
          <button 
            className={`pill-nav-btn ${activeTab === 'study' ? 'active' : ''}`}
            onClick={() => setActiveTab('study')}
          >
            🎧 Dictation
          </button>
          <button 
            className={`pill-nav-btn ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            🔄 Review
            {(data.stack2_spelling.length + data.stack3_meaning.length) > 0 && (
              <span className="nav-count-badge">
                {data.stack2_spelling.length + data.stack3_meaning.length}
              </span>
            )}
          </button>
          <button 
            className={`pill-nav-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            🔍 Search
          </button>
          <button 
            className={`pill-nav-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            📊 Stats
          </button>
          <button 
            className={`pill-nav-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            ➕ Add
          </button>
        </nav>

        {/* ============================================================ */}
        {/* VIEW 1: AUDITORY DICTATION & ACTIVE RECALL */}
        {/* ============================================================ */}
        {activeTab === 'study' && (
          <div className="view-content fade-in">
            {/* Level Selector Carousel (Image 1 topics filter style) */}
            <div className="section-label-row">
              <span className="section-label">Select Difficulty</span>
              <span className="speed-toggle-container">
                <button 
                  className={`speed-pill ${audioSpeed === 0.85 ? 'active' : ''}`}
                  onClick={() => setAudioSpeed(0.85)}
                >
                  0.85x
                </button>
                <button 
                  className={`speed-pill ${audioSpeed === 1.05 ? 'active' : ''}`}
                  onClick={() => setAudioSpeed(1.05)}
                >
                  1.0x
                </button>
              </span>
            </div>

            <div className="topics-carousel">
              <button 
                className={`topic-chip ${selectedLevel === 'IELTS_FOCUS' ? 'active' : ''}`}
                onClick={() => setSelectedLevel('IELTS_FOCUS')}
              >
                ★ IELTS Academic (B2/C1)
              </button>
              <button 
                className={`topic-chip awl-chip ${selectedLevel === 'AWL' ? 'active' : ''}`}
                onClick={() => setSelectedLevel('AWL')}
              >
                🎓 AWL Sublists (570)
              </button>
              {CEFR_LEVELS.map(lvl => (
                <button 
                  key={lvl}
                  className={`topic-chip ${selectedLevel === lvl ? 'active' : ''}`}
                  onClick={() => setSelectedLevel(lvl)}
                >
                  {lvl}
                </button>
              ))}
              <button 
                className={`topic-chip ${selectedLevel === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedLevel('ALL')}
              >
                All Levels ({data.allWords.length})
              </button>
            </div>

            {/* AWL Sublist Subwindow / Selector Drawer (The "little window below") */}
            {selectedLevel === 'AWL' && (
              <div className="awl-subwindow slide-down">
                <div className="awl-subwindow-header">
                  <div className="awl-info-left">
                    <div className="awl-subwindow-title">
                      <span className="awl-tag-badge">Averil Coxhead AWL</span>
                      <span className="awl-subwindow-heading">
                        {selectedAwlSublist === 'ALL'
                          ? 'Complete Academic Word List (570 Headwords)'
                          : `Sublist ${selectedAwlSublist} (${AWL_SUBLIST_INFO[selectedAwlSublist]?.count || (selectedAwlSublist === 10 ? 30 : 60)} Words)`}
                      </span>
                    </div>
                    <p className="awl-subwindow-desc">
                      {selectedAwlSublist === 'ALL'
                        ? 'Covering all 10 academic frequency sublists designed for university and IELTS study.'
                        : AWL_SUBLIST_INFO[selectedAwlSublist]?.description}
                    </p>
                  </div>

                  <div className="awl-header-actions">
                    <button
                      className="awl-action-btn"
                      title="Download audio pack for offline use"
                      onClick={() => {
                        const wordsToDownload = selectedAwlSublist === 'ALL'
                          ? data.allWords.filter(w => w.awlSublist != null)
                          : data.allWords.filter(w => w.awlSublist === selectedAwlSublist);
                        handleStartDownloadAudio(wordsToDownload);
                      }}
                      disabled={isDownloadingAudio}
                    >
                      {isDownloadingAudio ? '⏳ Caching...' : '📥 Offline Audio Pack'}
                    </button>
                  </div>
                </div>

                {/* Sublists 1 through 10 selector pills */}
                <div className="awl-pills-row">
                  <button
                    className={`awl-sub-pill ${selectedAwlSublist === 'ALL' ? 'active' : ''}`}
                    onClick={() => setSelectedAwlSublist('ALL')}
                  >
                    All (570)
                  </button>
                  {AWL_SUBLISTS.map(sl => {
                    const subCount = AWL_SUBLIST_INFO[sl]?.count || (sl === 10 ? 30 : 60);
                    return (
                      <button
                        key={sl}
                        className={`awl-sub-pill ${selectedAwlSublist === sl ? 'active' : ''}`}
                        onClick={() => setSelectedAwlSublist(sl)}
                      >
                        Sub {sl}
                        <span className="awl-sub-badge">{subCount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Core Card: Combines Image 1 Layout + Image 2 Styling */}
            {currentWord ? (
              <div className="editorial-card">
                {/* Card Editorial Header */}
                <div className="card-top-header">
                  <div className="academic-badge-row">
                    <span className="card-red-pin"></span>
                    <span className="academic-tier-name">
                      {currentWord.awlSublist 
                        ? `AWL Sublist ${currentWord.awlSublist} • ${queue.length} Words Total` 
                        : `${currentWord.level} Academic Vocabulary • ${queue.length} Words Total`}
                    </span>
                  </div>
                  <div className="batch-index-box">
                    <span className="batch-index">
                      Words {currentIndex + 1}/{queue.length}
                    </span>
                    <span className="batch-fraction-pill">
                      {Math.round(((currentIndex + 1) / queue.length) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Visual Sublist Progress Bar (Measures 1/10, 1/2, 2/3 progress) */}
                <div className="sublist-progress-bar-track" title={`Word ${currentIndex + 1} of ${queue.length} (${Math.round(((currentIndex + 1) / queue.length) * 100)}% done)`}>
                  <div 
                    className="sublist-progress-bar-fill" 
                    style={{ width: `${Math.max(2, Math.round(((currentIndex + 1) / queue.length) * 100))}%` }} 
                  />
                </div>

                {/* Central Stage: Pronunciation or Waveform Player */}
                <div className="dictation-hero-stage">
                  <h2 className="hero-instruction-title">
                    {submitted ? 'Spelling Verification' : 'Repeat Pronunciation'}
                  </h2>

                  {/* Waveform Audio Player (From Image 1, styled with Blue & Red from Image 2) */}
                  <div className="waveform-player-container">
                    <button 
                      className={`mini-play-btn ${isPlayingAudio ? 'playing' : ''}`}
                      onClick={() => playCurrentAudio()}
                      title="Play Pronunciation"
                    >
                      {isPlayingAudio ? '⏸' : '▶'}
                    </button>

                    <div className="waveform-bars-wrap">
                      {waveHeights.map((h, i) => (
                        <span 
                          key={i} 
                          className={`wave-bar ${isPlayingAudio ? 'active-pulse' : ''} ${i % 3 === 0 ? 'red-accent' : ''}`}
                          style={{
                            height: isPlayingAudio ? `${Math.max(12, (h * (0.6 + Math.random() * 0.7)))}%` : `${h * 0.45}%`,
                            animationDelay: `${i * 0.05}s`
                          }}
                        />
                      ))}
                    </div>

                    <span className="waveform-time">
                      {isPlayingAudio ? 'Playing' : '00:04'}
                    </span>
                  </div>

                  {/* Floating Circular Audio Button (From Image 1) */}
                  <div className="floating-sound-trigger">
                    <button 
                      className={`floating-sound-btn ${isPlayingAudio ? 'pulsing-ring' : ''}`}
                      onClick={() => playCurrentAudio()}
                    >
                      <span className="speaker-icon">🔊</span>
                    </button>
                    <span className="floating-sound-caption">
                      {isPlayingAudio ? 'Speaking...' : 'Click to hear word'}
                    </span>
                  </div>
                </div>

                {/* TYPING & MEANING PHASE (Pre-submit) */}
                {!submitted ? (
                  <form onSubmit={handleSubmit} className="study-form">
                    <div className="input-group-styled" onClick={() => inputRef.current?.focus()}>
                      <input
                        ref={inputRef}
                        type="text"
                        inputMode="text"
                        enterKeyHint="go"
                        className="hero-spelling-input"
                        placeholder="Type the word you hear..."
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onClick={(e) => e.target.focus()}
                        onTouchEnd={(e) => {
                          e.target.focus();
                        }}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                      />
                    </div>

                    {/* Meaning Check: The Highlight Feature */}
                    <div 
                      className={`meaning-highlight-banner ${unknownMeaning ? 'highlighted' : ''}`}
                      onClick={() => setUnknownMeaning(!unknownMeaning)}
                    >
                      <span className="banner-icon">
                        {unknownMeaning ? '⚠️' : '❓'}
                      </span>
                      <div className="banner-content">
                        <strong>I don't know what this word means</strong>
                        <p>Routes to Stack 3 so definition is permanently shown in review.</p>
                      </div>
                      <div className={`custom-checkbox ${unknownMeaning ? 'checked' : ''}`}>
                        {unknownMeaning ? '✓' : ''}
                      </div>
                    </div>

                    {/* Submit Button (Image 2 style with arrow) */}
                    <button 
                      type="submit" 
                      className="cta-red-button"
                      disabled={!userInput.trim()}
                    >
                      <span>Submit Spelling</span>
                      <span className="btn-arrow-circle">→</span>
                    </button>

                    {/* Pre-submit Previous/Skip Navigation Bar */}
                    <div className="pre-submit-nav-row">
                      <button 
                        type="button" 
                        className="ghost-nav-pill"
                        onClick={handlePrevWord}
                        disabled={currentIndex === 0}
                      >
                        ‹ Previous Word ({currentIndex > 0 ? queue[currentIndex - 1].word : 'None'})
                      </button>
                      <button 
                        type="button" 
                        className="ghost-nav-pill"
                        onClick={handleNextWord}
                        disabled={currentIndex >= queue.length - 1}
                      >
                        Skip Word ›
                      </button>
                    </div>
                  </form>
                ) : (
                  /* POST-SUBMISSION / REVEAL STAGE (Image 1 Congratulations & Comparison + Image 2 Cards) */
                  <div className="reveal-section fade-in">
                    {/* Celebration / Error Card */}
                    <div className={`feedback-banner-card ${lastResult.isCorrectSpelling ? 'success-card' : 'error-card'}`}>
                      <div className="feedback-status-row">
                        <span className="status-badge-icon">
                          {lastResult.isCorrectSpelling ? '🎉' : '❌'}
                        </span>
                        <div>
                          <h3 className="feedback-title">
                            <span>{lastResult.isCorrectSpelling ? 'Excellent! Spelled Correctly' : 'Spelling Correction Needed'}</span>
                            <span className={`feedback-xp-pill ${lastResult.isCorrectSpelling ? 'xp-pill-green' : 'xp-pill-red'}`}>
                              {lastResult.isCorrectSpelling ? '+1 XP' : '-1 XP'}
                            </span>
                          </h3>
                          <span className="routed-pill">
                            {lastResult.routedToStack}
                          </span>
                        </div>
                      </div>

                      {/* Side-by-side comparison if error */}
                      {!lastResult.isCorrectSpelling && (
                        <div className="comparison-box">
                          <div className="typed-box">
                            <span className="comp-label">You typed:</span>
                            <span className="wrong-strike">{lastResult.typed}</span>
                          </div>
                          <div className="correct-box">
                            <span className="comp-label">Correct:</span>
                            <span className="exact-correct">{lastResult.wordObj.word}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Revealed Word in Editorial Fraunces Serif (Image 2 style) */}
                    <div className="editorial-definition-box">
                      <div className="word-hero-line">
                        <h1 className="editorial-word-name">{lastResult.wordObj.word}</h1>
                        <span className="phonetic-tag">{lastResult.wordObj.phonetic || `/${lastResult.wordObj.word}/`}</span>
                        <span className="pos-pill">{lastResult.wordObj.pos}</span>
                        <button 
                          className="replay-mini-pill" 
                          onClick={() => playCurrentAudio(lastResult.wordObj.word)}
                        >
                          🔊 Replay
                        </button>
                      </div>

                      <div className="def-body">
                        <p className="def-line">
                          <strong>Definition:</strong> {lastResult.wordObj.definition}
                        </p>
                        {lastResult.wordObj.example && (
                          <p className="example-line">
                            <strong>Context:</strong> <em>"{lastResult.wordObj.example}"</em>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Navigation bar (Image 2 style: ← Prev 1/312 Next →) */}
                    <div className="pagination-action-bar">
                      <button 
                        className="arrow-nav-btn" 
                        onClick={handlePrevWord}
                        disabled={currentIndex === 0}
                        title="View Previous Word Details"
                      >
                        ← Prev ({currentIndex > 0 ? queue[currentIndex - 1].word : 'Start'})
                      </button>
                      
                      <button 
                        className="cta-red-button next-action-btn"
                        onClick={handleNextWord}
                        autoFocus
                      >
                        <span>Next Word (Enter ↵)</span>
                        <span className="btn-arrow-circle">→</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state-card">
                <span className="empty-icon">🏆</span>
                <h3>{selectedLevel === 'AWL' ? `AWL Sublist ${selectedAwlSublist} Completed!` : 'Batch Completed!'}</h3>
                <p>All words in this tier are completed. Continue practicing and repeating to build automatic fluency!</p>
                <div className="empty-action-buttons">
                  <button 
                    className="cta-red-button"
                    onClick={() => {
                      let reloadPool = [];
                      if (selectedLevel === 'AWL') {
                        if (selectedAwlSublist === 'ALL') reloadPool = [...AWL_WORDS];
                        else reloadPool = [...(AWL_WORDS_BY_SUBLIST[Number(selectedAwlSublist)] || AWL_WORDS)];
                      } else {
                        reloadPool = data.allWords.filter(w => selectedLevel === 'ALL' || w.level === selectedLevel);
                      }
                      const reshuffled = [...reloadPool].sort(() => Math.random() - 0.5);
                      setQueue(reshuffled);
                      setCurrentIndex(0);
                      resetStudyInputs();
                    }}
                  >
                    🔁 Practice & Repeat Words ({selectedLevel === 'AWL' ? (selectedAwlSublist === 10 ? 30 : 60) : 'All'}) →
                  </button>
                  {selectedLevel === 'AWL' && selectedAwlSublist !== 'ALL' && Number(selectedAwlSublist) < 10 && (
                    <button 
                      className="cta-navy-button"
                      onClick={() => {
                        const nextSl = Number(selectedAwlSublist) + 1;
                        setSelectedAwlSublist(nextSl);
                      }}
                    >
                      Next Sublist {Number(selectedAwlSublist) + 1} →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: OFFLINE SEARCH & ADD TO ACTIVE QUEUE */}
        {/* ============================================================ */}
        {activeTab === 'search' && (
          <div className="view-content fade-in">
            <div className="search-view-container">
              <div className="search-header-box">
                <span className="search-tagline">Offline Lexicon ({data.allWords.length} words loaded)</span>
                <h2 className="search-title">Search & Add Words</h2>
                
                {/* Instant Search Bar */}
                <div className="search-input-shell">
                  <span className="search-glass-icon">🔍</span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="search-field"
                    placeholder="Search any word or definition..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchQuery && (
                    <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
                  )}
                </div>

                {/* Level Filter Chips inside search */}
                <div className="search-filter-pills">
                  {['ALL', 'AWL', 'A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => (
                    <button
                      key={lvl}
                      className={`search-filter-pill ${searchLevel === lvl ? 'active' : ''}`}
                      onClick={() => setSearchLevel(lvl)}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results List */}
              <div className="search-results-list">
                {filteredSearchResults.length > 0 ? (
                  filteredSearchResults.map(item => (
                    <div key={item.id} className="search-result-card">
                      <div className="result-card-top">
                        <div className="result-word-meta">
                          <strong className="result-word-heading">{item.word}</strong>
                          <span className="result-phonetic">{item.phonetic}</span>
                          <span className="result-level-badge">{item.level}</span>
                          {item.awlSublist && (
                            <span className="result-awl-badge">AWL Sub {item.awlSublist}</span>
                          )}
                          <span className="result-pos">{item.pos}</span>
                        </div>
                        <button 
                          className="search-audio-btn" 
                          onClick={() => playCurrentAudio(item.word)}
                          title="Listen Pronunciation"
                        >
                          🔊
                        </button>
                      </div>

                      <p className="result-def">{item.definition}</p>
                      {item.example && (
                        <p className="result-example"><em>"{item.example}"</em></p>
                      )}

                      {/* Quick Action Buttons */}
                      <div className="result-action-row">
                        <button 
                          className="action-pill-btn add-queue-btn"
                          onClick={() => handleAddSearchedWordToQueue(item)}
                        >
                          ⚡ Practice Now
                        </button>
                        <button 
                          className="action-pill-btn push-s2-btn"
                          onClick={() => handlePushSearchedWordToStack(item, 'stack2')}
                        >
                          + Stack 2 (Spelling)
                        </button>
                        <button 
                          className="action-pill-btn push-s3-btn"
                          onClick={() => handlePushSearchedWordToStack(item, 'stack3')}
                        >
                          + Stack 3 (Meaning)
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-results-box">
                    <p>No words found matching <strong>"{searchQuery}"</strong>.</p>
                    <button 
                      className="cta-red-button"
                      style={{ marginTop: '12px' }}
                      onClick={() => {
                        setNewWord(searchQuery);
                        setActiveTab('add');
                      }}
                    >
                      <span>Create "{searchQuery}" as Custom Word</span>
                      <span className="btn-arrow-circle">＋</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 3: ADAPTIVE REVIEW MODE (STACK 2 & STACK 3) */}
        {/* ============================================================ */}
        {activeTab === 'review' && (
          <div className="view-content fade-in">
            {/* Top Review Mode Switcher: Active Due vs History Bank */}
            <div className="review-main-mode-toggle">
              <button 
                className={`review-mode-pill ${reviewTabMode === 'active' ? 'active' : ''}`}
                onClick={() => setReviewTabMode('active')}
              >
                🔥 Due for Review ({data.stack2_spelling.length + data.stack3_meaning.length})
              </button>
              <button 
                className={`review-mode-pill ${reviewTabMode === 'history' ? 'active' : ''}`}
                onClick={() => setReviewTabMode('history')}
              >
                📚 Review History Bank ({data.struggledHistory?.length || 0})
              </button>
            </div>

            {/* Stack Switcher Tabs */}
            <div className="review-toggle-bar">
              <button 
                className={`review-stack-btn ${reviewStackType === 'stack2' ? 'active-s2' : ''}`}
                onClick={() => setReviewStackType('stack2')}
              >
                📝 Stack 2: Spelling ({reviewTabMode === 'active' ? data.stack2_spelling.length : (data.struggledHistory || []).filter(w => w.struggleType === 'spelling' || w.struggleType === 'both').length})
              </button>
              <button 
                className={`review-stack-btn ${reviewStackType === 'stack3' ? 'active-s3' : ''}`}
                onClick={() => setReviewStackType('stack3')}
              >
                💡 Stack 3: Meaning ({reviewTabMode === 'active' ? data.stack3_meaning.length : (data.struggledHistory || []).filter(w => w.struggleType === 'meaning' || w.struggleType === 'both').length})
              </button>
            </div>

            {/* AWL Sublist Filter Pills for Review Mode */}
            <div className="review-awl-pills-row">
              <button
                className={`review-sub-pill ${reviewSublist === 'ALL' ? 'active' : ''}`}
                onClick={() => setReviewSublist('ALL')}
              >
                All
              </button>
              {AWL_SUBLISTS.map(sl => {
                const sourceList = reviewTabMode === 'active'
                  ? (reviewStackType === 'stack2' ? data.stack2_spelling : data.stack3_meaning)
                  : (data.struggledHistory || []).filter(w => reviewStackType === 'stack2' ? (w.struggleType === 'spelling' || w.struggleType === 'both') : (w.struggleType === 'meaning' || w.struggleType === 'both'));
                const count = sourceList.filter(w => {
                  const sub = w.awlSublist || AWL_MAP.get((w.word || '').toLowerCase());
                  return sub === sl;
                }).length;
                return (
                  <button
                    key={sl}
                    className={`review-sub-pill ${reviewSublist === sl ? 'active' : ''}`}
                    onClick={() => setReviewSublist(sl)}
                  >
                    Sub {sl}
                    {count > 0 && <span className="review-count-badge">{count}</span>}
                  </button>
                );
              })}
              <button
                className={`review-sub-pill ${reviewSublist === 'OTHER' ? 'active' : ''}`}
                onClick={() => setReviewSublist('OTHER')}
              >
                Other
              </button>
            </div>

            {reviewTabMode === 'active' ? (
              reviewQueue.length > 0 && currentReviewWord ? (
                <div className="editorial-card review-mode-card">
                  <div className="card-top-header">
                    <div className="academic-badge-row">
                      <span className="card-red-pin"></span>
                      <span className="academic-tier-name">
                        {reviewStackType === 'stack2' ? 'Spelling Fix (Known Meaning)' : 'Meaning Learning + Spelling Fix'}
                      </span>
                    </div>
                    <span className="batch-index">
                      Review {reviewIndex + 1}/{reviewQueue.length}
                    </span>
                  </div>

                  {/* STACK 3 ADAPTATION: Permanent Definition Display */}
                  {reviewStackType === 'stack3' && (
                    <div className="permanent-study-box">
                      <div className="box-heading">
                        <span className="pin-symbol">📌</span>
                        <span>Learn Meaning & Memorize Spelling</span>
                      </div>
                      <p className="permanent-def-text">
                        <strong>Definition:</strong> {currentReviewWord.definition}
                      </p>
                      {currentReviewWord.example && (
                        <p className="permanent-example-text">
                          <strong>Context:</strong> <em>"{currentReviewWord.example}"</em>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Auditory Player */}
                  <div className="dictation-hero-stage">
                    <div className="waveform-player-container">
                      <button 
                        className={`mini-play-btn ${isPlayingAudio ? 'playing' : ''}`}
                        onClick={() => playCurrentAudio(currentReviewWord.word)}
                      >
                        {isPlayingAudio ? '⏸' : '▶'}
                      </button>
                      <div className="waveform-bars-wrap">
                        {waveHeights.map((h, i) => (
                          <span 
                            key={i} 
                            className={`wave-bar ${isPlayingAudio ? 'active-pulse' : ''} ${i % 3 === 0 ? 'red-accent' : ''}`}
                            style={{
                              height: isPlayingAudio ? `${Math.max(12, (h * (0.6 + Math.random() * 0.7)))}%` : `${h * 0.45}%`,
                              animationDelay: `${i * 0.05}s`
                            }}
                          />
                        ))}
                      </div>
                      <span className="waveform-time">
                        {currentReviewWord.level}
                      </span>
                    </div>

                    <div className="floating-sound-trigger">
                      <button 
                        className={`floating-sound-btn ${isPlayingAudio ? 'pulsing-ring' : ''}`}
                        onClick={() => playCurrentAudio(currentReviewWord.word)}
                      >
                        <span className="speaker-icon">🔊</span>
                      </button>
                      <span className="floating-sound-caption">Listen to dictation</span>
                    </div>
                  </div>

                  {/* Input form */}
                  {!reviewSubmitted ? (
                    <form onSubmit={handleReviewSubmit} className="study-form">
                      <div className="input-group-styled" onClick={() => reviewInputRef.current?.focus()}>
                        <input
                          ref={reviewInputRef}
                          type="text"
                          inputMode="text"
                          enterKeyHint="go"
                          className="hero-spelling-input"
                          placeholder="Type spelling to verify..."
                          value={reviewInput}
                          onChange={(e) => setReviewInput(e.target.value)}
                          onClick={(e) => e.target.focus()}
                          onTouchEnd={(e) => {
                            e.target.focus();
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                        />
                      </div>

                      <button 
                        type="submit" 
                        className="cta-red-button"
                        disabled={!reviewInput.trim()}
                      >
                        <span>Check Spelling</span>
                        <span className="btn-arrow-circle">→</span>
                      </button>

                      {/* Pre-submit Previous Navigation */}
                      <div className="pre-submit-nav-row">
                        <button 
                          type="button" 
                          className="ghost-nav-pill"
                          onClick={handlePrevReviewWord}
                          disabled={reviewIndex === 0}
                        >
                          ‹ Previous Word ({reviewIndex > 0 ? reviewQueue[reviewIndex - 1].word : 'None'})
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="reveal-section fade-in">
                      <div className={`feedback-banner-card ${reviewResult.isCorrectSpelling ? 'success-card' : 'error-card'}`}>
                        <div className="feedback-status-row">
                          <span className="status-badge-icon">
                            {reviewResult.isCorrectSpelling ? '🌟' : '❌'}
                          </span>
                          <div>
                            <h3 className="feedback-title">
                              <span>
                                {reviewResult.isCorrectSpelling 
                                  ? 'Mastered! Saved to Long-Term Memory' 
                                  : 'Keep practicing'}
                              </span>
                              <span className={`feedback-xp-pill ${reviewResult.isCorrectSpelling ? 'xp-pill-green' : 'xp-pill-red'}`}>
                                {reviewResult.isCorrectSpelling ? '+1 XP' : '-1 XP'}
                              </span>
                            </h3>
                          </div>
                        </div>

                        {!reviewResult.isCorrectSpelling && (
                          <div className="comparison-box">
                            <div className="typed-box">
                              <span className="comp-label">Typed:</span>
                              <span className="wrong-strike">{reviewResult.typed}</span>
                            </div>
                            <div className="correct-box">
                              <span className="comp-label">Correct:</span>
                              <span className="exact-correct">{reviewResult.wordObj.word}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Word Details Box in Review Mode */}
                      <div className="editorial-definition-box">
                        <div className="word-hero-line">
                          <h2 className="editorial-word-name">{reviewResult.wordObj.word}</h2>
                          <span className="phonetic-tag">{reviewResult.wordObj.phonetic || `/${reviewResult.wordObj.word}/`}</span>
                          <span className="pos-pill">{reviewResult.wordObj.pos}</span>
                          <button 
                            className="replay-mini-pill" 
                            onClick={() => playCurrentAudio(reviewResult.wordObj.word)}
                          >
                            🔊 Replay
                          </button>
                        </div>

                        <div className="def-body">
                          <p className="def-line">
                            <strong>Definition:</strong> {reviewResult.wordObj.definition}
                          </p>
                          {reviewResult.wordObj.example && (
                            <p className="example-line">
                              <strong>Context:</strong> <em>"{reviewResult.wordObj.example}"</em>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Review Navigation Bar */}
                      <div className="pagination-action-bar">
                        <button 
                          className="arrow-nav-btn" 
                          onClick={handlePrevReviewWord}
                          disabled={reviewIndex === 0}
                          title="View Previous Review Word Details"
                        >
                          ← Prev ({reviewIndex > 0 ? reviewQueue[reviewIndex - 1].word : 'Start'})
                        </button>

                        <button 
                          className="cta-red-button next-action-btn"
                          onClick={handleNextReviewWord}
                          autoFocus
                        >
                          <span>Next Review Word (Enter ↵)</span>
                          <span className="btn-arrow-circle">→</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state-card">
                  <span className="empty-icon">🎉</span>
                  <h3>
                    {reviewSublist === 'ALL' 
                      ? (reviewStackType === 'stack2' ? 'Stack 2 is Clean!' : 'Stack 3 is Clean!')
                      : `Sublist ${reviewSublist} Review Cleared!`}
                  </h3>
                  <p>
                    {reviewSublist === 'ALL'
                      ? `No words currently waiting in ${reviewStackType === 'stack2' ? 'Stack 2 (Spelling Errors)' : 'Stack 3 (Unknown Meaning)'}.`
                      : `All review words in Sublist ${reviewSublist} have been resolved. They remain stored in your Review History Bank.`}
                  </p>
                  <div className="empty-action-buttons">
                    {(() => {
                      const historyWordsForSub = (data.struggledHistory || []).filter(w => {
                        if (reviewSublist === 'ALL') return true;
                        if (reviewSublist === 'OTHER') return !w.awlSublist && !AWL_MAP.has((w.word || '').toLowerCase());
                        const sub = w.awlSublist || AWL_MAP.get((w.word || '').toLowerCase());
                        return sub === Number(reviewSublist);
                      });
                      return historyWordsForSub.length > 0 ? (
                        <button
                          className="cta-red-button"
                          onClick={() => handleRepeatSublistStruggledInStudy(reviewSublist)}
                        >
                          ⚡ Repeat {reviewSublist === 'ALL' ? 'All' : `Sublist ${reviewSublist}`} Review Words ({historyWordsForSub.length})
                        </button>
                      ) : null;
                    })()}
                    <button
                      className="ghost-pill-btn"
                      onClick={() => setReviewTabMode('history')}
                    >
                      📖 View Review History Bank
                    </button>
                    <button 
                      className="cta-navy-button"
                      onClick={() => setActiveTab('study')}
                    >
                      Return to Dictation
                    </button>
                  </div>
                </div>
              )
            ) : (
              /* Review History Bank View inside Review Tab */
              <div className="review-history-container">
                <div className="history-header-bar">
                  <div>
                    <h3 className="history-title">
                      {reviewSublist === 'ALL' ? 'Complete Review History Bank' : `Sublist ${reviewSublist} History Bank`}
                    </h3>
                    <p className="history-subtitle">
                      {reviewQueue.length} words saved. All words you have ever struggled with are preserved here for repetition.
                    </p>
                  </div>
                  {reviewQueue.length > 0 && (
                    <button
                      className="cta-red-button btn-compact"
                      onClick={() => handleRepeatSublistStruggledInStudy(reviewSublist)}
                    >
                      ⚡ Practice All in Dictation ({reviewQueue.length})
                    </button>
                  )}
                </div>

                {reviewQueue.length === 0 ? (
                  <div className="empty-struggled-banner">
                    <span>No words recorded in history for this filter yet.</span>
                  </div>
                ) : (
                  <div className="struggled-words-grid">
                    {reviewQueue.map((w, idx) => (
                      <div key={w.id || idx} className="struggled-word-card">
                        <div className="struggled-card-header">
                          <div className="struggled-word-name-group">
                            <h4 className="struggled-word-name">{w.word}</h4>
                            <span className="struggled-phonetic">{w.phonetic || `/${w.word}/`}</span>
                            <span className="struggled-pos">{w.pos}</span>
                            <span className="struggled-level-tag">
                              {w.awlSublist ? `AWL Sub ${w.awlSublist}` : w.level}
                            </span>
                          </div>
                          <div className="struggled-badges-group">
                            <span className={`struggled-status-badge ${w.status === 'mastered' ? 'mastered' : 'review'}`}>
                              {w.status === 'mastered' ? '✅ Mastered' : '⚠️ In Review'}
                            </span>
                            <span className="struggled-count-tag">
                              {w.mistakeCount ? `${w.mistakeCount}x` : '1x'}
                            </span>
                          </div>
                        </div>

                        <p className="struggled-def">{w.definition}</p>
                        {w.example && (
                          <p className="struggled-example"><em>"{w.example}"</em></p>
                        )}

                        <div className="struggled-card-footer">
                          <button 
                            className="struggled-audio-btn"
                            onClick={() => playCurrentAudio(w.word)}
                            title="Listen to pronunciation"
                          >
                            🔊 Listen
                          </button>
                          <button 
                            className="struggled-practice-btn"
                            onClick={() => handlePracticeSingleWord(w)}
                            title="Practice this single word in Dictation"
                          >
                            ⚡ Practice
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 4: STATS & IELTS SCORE (Image 2 Stats Banner Style) */}
        {/* ============================================================ */}
        {activeTab === 'stats' && (
          <div className="view-content fade-in">
            {/* Top Metrics Banner */}
            <div className="stats-metric-card">
              <div className="metric-col">
                <span className="metric-title">Accuracy</span>
                <span className="metric-value blue-val">{accuracy}%</span>
                <span className="metric-sub">{correct} correct &bull; {wrong} wrong</span>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-col">
                <span className="metric-title">Words Taken</span>
                <span className="metric-value red-val">{total}</span>
                <span className="metric-sub">Total Attempts</span>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-col">
                <span className="metric-title">IELTS Band</span>
                <span className="metric-value dark-val">{estimatedBand}</span>
                <span className="metric-sub">Estimated</span>
              </div>
            </div>

            {/* Dedicated Strict Daily Performance & XP Section */}
            <div className="stats-xp-program-section">
              <div className="xp-program-header">
                <div className="xp-program-title-wrap">
                  <span className="xp-program-tag">Daily Program</span>
                  <h3 className="xp-program-title">Daily Practice & XP Balance</h3>
                </div>
                <div className="xp-program-rule">
                  Rule: <span className="green-rule-text">+1 XP</span> per correct &bull; <span className="red-rule-text">-1 XP</span> per mistake
                </div>
              </div>

              {/* Strict Daily & XP Grid */}
              <div className="xp-program-grid">
                <div className="xp-program-card neutral-box">
                  <span className="xp-box-label">Words Done Today</span>
                  <span className="xp-box-val neutral-val">{todayTested}</span>
                  <span className="xp-box-sub">Completed today</span>
                </div>

                <div className="xp-program-card green-box">
                  <span className="xp-box-label">Correct Today</span>
                  <span className="xp-box-val green-val">{todayCorrect}</span>
                  <span className="xp-box-sub green-sub">+{todayCorrect} XP earned</span>
                </div>

                <div className="xp-program-card red-box">
                  <span className="xp-box-label">Wrong Today</span>
                  <span className="xp-box-val red-val">{todayWrong}</span>
                  <span className="xp-box-sub red-sub">-{todayWrong} XP deducted</span>
                </div>

                <div className={`xp-program-card balance-box ${xpBalance >= 0 ? 'green-box' : 'red-box'}`}>
                  <span className="xp-box-label">Account XP Balance</span>
                  <span className={`xp-box-val ${xpBalance >= 0 ? 'green-val' : 'red-val'}`}>
                    {xpBalance >= 0 ? `+${xpBalance} XP` : `${xpBalance} XP`}
                  </span>
                  <span className="xp-box-sub">
                    Today: <strong className={todayXp >= 0 ? 'green-sub' : 'red-sub'}>{todayXp >= 0 ? `+${todayXp}` : todayXp} XP</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Stacks Breakdown Grid */}
            <div className="stacks-summary-group">
              <div className="stack-status-card s1-card">
                <div className="status-top">
                  <div className="status-badge s1-badge">Stack 1</div>
                  <span className="status-count">{data.stack1_mastered.length} words</span>
                </div>
                <h4>Mastered Vocabulary</h4>
                <p>Spelled correctly with known meaning. Pushed to long-term memory.</p>
                <div className="chips-list">
                  {data.stack1_mastered.slice(0, 10).map(w => (
                    <span key={w.id} className="chip-pill s1-pill">{w.word}</span>
                  ))}
                  {data.stack1_mastered.length > 10 && (
                    <span className="chip-more">+{data.stack1_mastered.length - 10} more</span>
                  )}
                </div>
              </div>

              <div className="stack-status-card s2-card">
                <div className="status-top">
                  <div className="status-badge s2-badge">Stack 2</div>
                  <span className="status-count">{data.stack2_spelling.length} words</span>
                </div>
                <h4>Spelling Errors</h4>
                <p>You know what the word means, but made a spelling typo. Review spelling.</p>
                <div className="chips-list">
                  {data.stack2_spelling.slice(0, 10).map(w => (
                    <span key={w.id} className="chip-pill s2-pill">{w.word}</span>
                  ))}
                </div>
              </div>

              <div className="stack-status-card s3-card">
                <div className="status-top">
                  <div className="status-badge s3-badge">Stack 3</div>
                  <span className="status-count">{data.stack3_meaning.length} words</span>
                </div>
                <h4>Meaning Unknown</h4>
                <p>Flagged for comprehension. Screen will display definitions during review.</p>
                <div className="chips-list">
                  {data.stack3_meaning.slice(0, 10).map(w => (
                    <span key={w.id} className="chip-pill s3-pill">{w.word}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Dedicated Review Words History & Repetition Bank (Persistent Archive) */}
            <div className="stats-struggled-section">
              <div className="section-header-box">
                <div className="section-title-wrap">
                  <span className="section-pill-tag">Persistent History Archive</span>
                  <h3 className="section-main-title">📚 Review Words & Repetition Bank</h3>
                  <p className="section-desc">
                    Words you struggled with (spelling or unknown meaning) are permanently preserved here by sublist. 
                    Even after mastery, review and repeat any sublist's words anytime without having to practice the entire dictionary.
                  </p>
                </div>
                
                {/* Stats summary of struggled words */}
                <div className="struggled-metrics-row">
                  <div className="struggled-metric-chip">
                    <span className="sm-label">Total History:</span>
                    <span className="sm-val">{data.struggledHistory?.length || 0}</span>
                  </div>
                  <div className="struggled-metric-chip">
                    <span className="sm-label">In Review:</span>
                    <span className="sm-val warning">{(data.struggledHistory || []).filter(w => w.status === 'in_review').length}</span>
                  </div>
                  <div className="struggled-metric-chip">
                    <span className="sm-label">Mastered:</span>
                    <span className="sm-val success">{(data.struggledHistory || []).filter(w => w.status === 'mastered').length}</span>
                  </div>
                </div>
              </div>

              {/* Sublist Filter Pills */}
              <div className="stats-awl-pills-row">
                <button
                  className={`stats-sub-pill ${statsSublistFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatsSublistFilter('ALL')}
                >
                  All ({data.struggledHistory?.length || 0})
                </button>
                {AWL_SUBLISTS.map(sl => {
                  const slWords = (data.struggledHistory || []).filter(w => {
                    const sub = w.awlSublist || AWL_MAP.get((w.word || '').toLowerCase());
                    return sub === sl;
                  });
                  return (
                    <button
                      key={sl}
                      className={`stats-sub-pill ${statsSublistFilter === sl ? 'active' : ''}`}
                      onClick={() => setStatsSublistFilter(sl)}
                    >
                      Sub {sl}
                      {slWords.length > 0 && <span className="stats-sub-badge">{slWords.length}</span>}
                    </button>
                  );
                })}
                <button
                  className={`stats-sub-pill ${statsSublistFilter === 'OTHER' ? 'active' : ''}`}
                  onClick={() => setStatsSublistFilter('OTHER')}
                >
                  Other ({(data.struggledHistory || []).filter(w => !w.awlSublist && !AWL_MAP.has((w.word || '').toLowerCase())).length})
                </button>
              </div>

              {/* Action Banner to practice all struggled words for current sublist */}
              {(() => {
                const currentFiltered = (data.struggledHistory || []).filter(w => {
                  if (statsSublistFilter === 'ALL') return true;
                  if (statsSublistFilter === 'OTHER') return !w.awlSublist && !AWL_MAP.has((w.word || '').toLowerCase());
                  const sub = w.awlSublist || AWL_MAP.get((w.word || '').toLowerCase());
                  return sub === Number(statsSublistFilter);
                });

                if (currentFiltered.length === 0) {
                  return (
                    <div className="empty-struggled-banner">
                      <span>✓ No words sent to review for {statsSublistFilter === 'ALL' ? 'any category' : `Sublist ${statsSublistFilter}`} yet! Keep up the great work.</span>
                    </div>
                  );
                }

                return (
                  <div>
                    <div className="struggled-batch-action-bar">
                      <span className="batch-action-summary">
                        Showing <strong>{currentFiltered.length} words</strong> in {statsSublistFilter === 'ALL' ? 'All Review History' : `Sublist ${statsSublistFilter} History`}
                      </span>
                      <button 
                        className="cta-red-button btn-compact"
                        onClick={() => handleRepeatSublistStruggledInStudy(statsSublistFilter)}
                      >
                        ⚡ Practice These Words in Dictation ({currentFiltered.length})
                      </button>
                    </div>

                    <div className="struggled-words-grid">
                      {currentFiltered.map((w, idx) => (
                        <div key={w.id || idx} className="struggled-word-card">
                          <div className="struggled-card-header">
                            <div className="struggled-word-name-group">
                              <h4 className="struggled-word-name">{w.word}</h4>
                              <span className="struggled-phonetic">{w.phonetic || `/${w.word}/`}</span>
                              <span className="struggled-pos">{w.pos}</span>
                              <span className="struggled-level-tag">
                                {w.awlSublist ? `AWL Sub ${w.awlSublist}` : w.level}
                              </span>
                            </div>
                            <div className="struggled-badges-group">
                              <span className={`struggled-status-badge ${w.status === 'mastered' ? 'mastered' : 'review'}`}>
                                {w.status === 'mastered' ? '✅ Mastered' : '⚠️ In Review'}
                              </span>
                              <span className="struggled-count-tag">
                                {w.mistakeCount ? `${w.mistakeCount}x` : '1x'}
                              </span>
                            </div>
                          </div>

                          <p className="struggled-def">{w.definition}</p>
                          {w.example && (
                            <p className="struggled-example"><em>"{w.example}"</em></p>
                          )}

                          <div className="struggled-card-footer">
                            <button 
                              className="struggled-audio-btn"
                              onClick={() => playCurrentAudio(w.word)}
                              title="Listen to pronunciation"
                            >
                              🔊 Listen
                            </button>
                            <button 
                              className="struggled-practice-btn"
                              onClick={() => handlePracticeSingleWord(w)}
                              title="Practice this single word in Dictation"
                            >
                              ⚡ Practice
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="install-card-helper" onClick={handleInstallClick}>
              <div className="install-card-icon">📲</div>
              <div className="install-card-info">
                <strong>Add Writyy to Phone Home Screen</strong>
                <p>Use 100% offline without internet on bus, metro, or flights.</p>
              </div>
              <span className="install-card-arrow">➔</span>
            </div>

            <div className="reset-bar">
              <button className="reset-link-btn" onClick={handleResetProgress}>
                🗑️ Reset All Progress Stacks
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 5: ADD CUSTOM WORDS */}
        {/* ============================================================ */}
        {activeTab === 'add' && (
          <div className="view-content fade-in">
            <div className="editorial-card">
              <div className="card-top-header">
                <div className="academic-badge-row">
                  <span className="card-red-pin"></span>
                  <span className="academic-tier-name">Custom Vocabulary Intake</span>
                </div>
              </div>

              <h2 className="hero-instruction-title">Add IELTS Words</h2>
              <p className="card-desc">Add words from Cambridge IELTS tests to test yourself via audio dictation.</p>

              {addSuccessMsg && (
                <div className="form-success-banner">{addSuccessMsg}</div>
              )}

              <form onSubmit={handleAddWord} className="add-word-form">
                <div className="form-field">
                  <label>Word (English):</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ubiquitous, surveillance, discrepancy"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                  />
                </div>

                <div className="form-row-dual">
                  <div className="form-field">
                    <label>Phonetics (Optional):</label>
                    <input
                      type="text"
                      placeholder="e.g. /juːˈbɪk.wɪ.təs/"
                      value={newPhonetic}
                      onChange={(e) => setNewPhonetic(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>CEFR Level:</label>
                    <select value={newLevel} onChange={(e) => setNewLevel(e.target.value)}>
                      <option value="A1">A1 Foundation</option>
                      <option value="A2">A2 Elementary</option>
                      <option value="B1">B1 Intermediate</option>
                      <option value="B2">B2 Upper / IELTS 6.5</option>
                      <option value="C1">C1 Advanced / IELTS 7.5-9.0</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>Definition / Translation:</label>
                  <textarea
                    rows="2"
                    placeholder="Definition or meaning in your native language..."
                    value={newDef}
                    onChange={(e) => setNewDef(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Example Sentence:</label>
                  <input
                    type="text"
                    placeholder="e.g. The issue is ubiquitous in urban areas."
                    value={newExample}
                    onChange={(e) => setNewExample(e.target.value)}
                  />
                </div>

                <button type="submit" className="cta-red-button">
                  <span>Add to Vocabulary Bank</span>
                  <span className="btn-arrow-circle">＋</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* PWA Install Guide Modal for Mobile */}
      {showInstallModal && (
        <div className="modal-backdrop" onClick={() => setShowInstallModal(false)}>
          <div className="install-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>📲 Add to Home Screen</h3>
              <button className="modal-close-btn" onClick={() => setShowInstallModal(false)}>✕</button>
            </div>
            
            <p className="modal-sub">Install once to use Writyy 100% offline on the bus, metro, or in flight.</p>

            <div className="guide-os-section">
              <div className="os-badge-header">
                <span className="os-icon">🌐</span>
                <strong>iPhone (Google Chrome / Google App)</strong>
              </div>
              <ol className="guide-step-list">
                <li>Look at the top address bar next to the URL and tap the <strong>Share button</strong> (<span className="kbd-symbol">⎋</span>) or tap the <strong>three dots (⋯)</strong> at the bottom.</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong> (or <em>"Ana Ekrana Ekle"</em> <span className="kbd-symbol">⊞</span>).</li>
                <li>Tap <strong>"Add"</strong> (<em>"Ekle"</em>) in the top-right corner.</li>
              </ol>
            </div>

            <div className="guide-os-section">
              <div className="os-badge-header">
                <span className="os-icon">🍏</span>
                <strong>iPhone (Safari)</strong>
              </div>
              <ol className="guide-step-list">
                <li>Look at the bottom toolbar of Safari and tap the <strong>Share button</strong> (<span className="kbd-symbol">⎋</span>).</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong> (or <em>"Ana Ekrana Ekle"</em> <span className="kbd-symbol">⊞</span>).</li>
                <li>Tap <strong>"Add"</strong> (<em>"Ekle"</em>) in the top-right corner.</li>
              </ol>
            </div>

            <div className="guide-os-section">
              <div className="os-badge-header">
                <span className="os-icon">🤖</span>
                <strong>Android (Chrome)</strong>
              </div>
              <ol className="guide-step-list">
                <li>Tap the <strong>three dots (⋮)</strong> in the top-right corner of Chrome.</li>
                <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                <li>Tap <strong>"Install"</strong> to confirm.</li>
              </ol>
            </div>

            <button className="cta-red-button" onClick={() => setShowInstallModal(false)} style={{ marginTop: '16px' }}>
              <span>Got it, let's practice!</span>
              <span className="btn-arrow-circle">✓</span>
            </button>
          </div>
        </div>
      )}

      {/* Studio Audio & Offline Voice Pack Modal */}
      {showAudioModal && (
        <div className="modal-backdrop" onClick={() => setShowAudioModal(false)}>
          <div className="install-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>🎧 Studio Audio & Offline Pack</h3>
              <button className="modal-close-btn" onClick={() => setShowAudioModal(false)}>✕</button>
            </div>

            <div className="audio-studio-card">
              <span className="audio-voice-badge">
                ✓ Standard Neutral American (Studio Dictionary)
              </span>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 10px 0', lineHeight: 1.4 }}>
                Crystal-clear recorded pronunciation without British accent or robotic screenreader mumbling.
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155' }}>
                  Offline Cached Sounds:
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0284c7' }}>
                  {offlineAudioCount} words ready
                </span>
              </div>
            </div>

            {isDownloadingAudio && (
              <div className="progress-box">
                <div className="progress-header">
                  <span>Downloading studio audio...</span>
                  <span>{downloadProgress.current} / {downloadProgress.total} ({downloadProgress.percent}%)</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${downloadProgress.percent}%` }}></div>
                </div>
                {downloadProgress.currentWord && (
                  <span className="progress-current-word">Caching: "{downloadProgress.currentWord}"</span>
                )}
                <button 
                  onClick={handleCancelDownload}
                  style={{ marginTop: '8px', background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  Cancel Download
                </button>
              </div>
            )}

            <div className="audio-download-row">
              <button 
                className="btn-download-pack" 
                onClick={() => handleStartDownloadAudio(queue)}
                disabled={isDownloadingAudio}
              >
                <span>📥 Download Current Deck ({queue.length} Words)</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Fastest (~{Math.round(queue.length * 0.003 * 10) / 10} MB)</span>
              </button>

              {selectedLevel === 'AWL' ? (
                <button 
                  className="btn-download-pack" 
                  onClick={() => {
                    const wordsToDownload = selectedAwlSublist === 'ALL'
                      ? data.allWords.filter(w => w.awlSublist != null)
                      : data.allWords.filter(w => w.awlSublist === selectedAwlSublist);
                    handleStartDownloadAudio(wordsToDownload);
                  }}
                  disabled={isDownloadingAudio}
                  style={{ background: '#4338ca' }}
                >
                  <span>📥 Download AWL {selectedAwlSublist === 'ALL' ? 'Complete (570 Words)' : `Sublist ${selectedAwlSublist} (${queue.length} Words)`}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Academic Sublist Sound Pack</span>
                </button>
              ) : (
                <button 
                  className="btn-download-pack" 
                  onClick={() => handleStartDownloadAudio(data.allWords.filter(w => selectedLevel === 'ALL' ? true : w.level === selectedLevel))}
                  disabled={isDownloadingAudio}
                  style={{ background: '#334155' }}
                >
                  <span>📥 Download Level {selectedLevel} Pack ({data.allWords.filter(w => selectedLevel === 'ALL' ? true : w.level === selectedLevel).length} Words)</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Recommended for current level</span>
                </button>
              )}

              <button 
                className="btn-download-pack" 
                onClick={() => handleStartDownloadAudio(data.allWords.filter(w => w.awlSublist != null))}
                disabled={isDownloadingAudio}
                style={{ background: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)' }}
              >
                <span>🎓 Download Complete AWL 570 Academic Sound Library</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>All 10 Coxhead Sublists (~1.8 MB)</span>
              </button>

              <button 
                className="btn-download-pack" 
                onClick={() => handleStartDownloadAudio(data.allWords)}
                disabled={isDownloadingAudio}
                style={{ background: 'var(--oxford-blue)' }}
              >
                <span>🚀 Download Complete Offline Sound Library ({data.allWords.length} Words)</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>100% Full Offline Studio Audio (~15 MB)</span>
              </button>

              <button 
                className="btn-download-pack"
                onClick={handleManualCheckUpdate}
                style={{ background: '#f1f5f9', color: '#0f172a', border: '1.5px solid #cbd5e1' }}
              >
                <span>🔄 Check for App Updates (Over-The-Air)</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>v5.0</span>
              </button>
            </div>

            <button className="cta-red-button" onClick={() => setShowAudioModal(false)} style={{ marginTop: '16px' }}>
              <span>Done</span>
              <span className="btn-arrow-circle">✓</span>
            </button>
          </div>
        </div>
      )}

      {/* Neon Cloud Sync & Authentication Modal */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={currentUser}
        onSyncNow={handleForceSyncWithCloud}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        xpBalance={xpBalance}
        todayTested={todayTested}
        todayCorrect={todayCorrect}
        todayWrong={todayWrong}
        onUserAuthChange={(user, initialData) => {
          setCurrentUser(user);
          if (user && initialData) {
            const currentLocal = getStoredData();
            const merged = mergeCloudAndLocal(currentLocal, initialData);
            setData(merged);
            saveStoredData(merged);
            pushProgressToCloud(user, merged);
            setLastSyncTime(new Date());
          }
        }}
      />
    </div>
  );
}
