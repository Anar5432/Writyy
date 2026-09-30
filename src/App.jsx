import React, { useState, useEffect, useRef } from 'react';
import { CEFR_LEVELS } from './data/words';
import { speechService } from './utils/audio';
import { getCachedAudioCount, downloadAudioPack } from './utils/audioCache';
import { sfx } from './utils/sfx';
import { getStoredData, saveStoredData, resetAllProgress } from './utils/storage';
import './App.css';

export default function App() {
  // Global State
  const [data, setData] = useState(() => getStoredData());
  const [activeTab, setActiveTab] = useState('study'); // 'study' | 'review' | 'search' | 'stats' | 'add'
  const [selectedLevel, setSelectedLevel] = useState('IELTS_FOCUS'); // 'ALL', 'A1'..'C1', 'IELTS_FOCUS'
  const [audioSpeed, setAudioSpeed] = useState(0.9);
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
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewInput, setReviewInput] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);

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

  // Save changes to localStorage
  useEffect(() => {
    saveStoredData(data);
  }, [data]);

  // Update audio speed
  useEffect(() => {
    speechService.setRate(audioSpeed);
  }, [audioSpeed]);

  // Toast notification helper
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Initialize/filter Study Queue whenever selectedLevel or data changes
  useEffect(() => {
    let filtered = [...data.allWords];
    if (selectedLevel === 'IELTS_FOCUS') {
      filtered = filtered.filter(w => w.level === 'B2' || w.level === 'C1');
    } else if (selectedLevel !== 'ALL') {
      filtered = filtered.filter(w => w.level === selectedLevel);
    }
    const masteredIds = new Set(data.stack1_mastered.map(w => w.id));
    let unmastered = filtered.filter(w => !masteredIds.has(w.id));
    if (unmastered.length === 0) {
      unmastered = filtered;
    }
    const shuffled = [...unmastered].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setCurrentIndex(0);
    resetStudyInputs();
  }, [selectedLevel, data.allWords.length]);

  // Review Queue snapshot - only refreshed when reviewStackType changes or explicitly opened
  useEffect(() => {
    if (activeTab === 'review') {
      const list = reviewStackType === 'stack2' ? data.stack2_spelling : data.stack3_meaning;
      setReviewQueue([...list]);
      setReviewIndex(0);
      resetReviewInputs();
    }
  }, [reviewStackType, activeTab]);

  const currentWord = queue[currentIndex];
  const currentReviewWord = reviewQueue[reviewIndex];

  // Play audio with waveform animation state
  const playCurrentAudio = (wordToSpeak) => {
    const target = wordToSpeak || (activeTab === 'review' ? (currentReviewWord ? currentReviewWord.word : '') : (currentWord ? currentWord.word : ''));
    if (!target) return;

    speechService.speak(
      target,
      () => setIsPlayingAudio(true),
      () => setIsPlayingAudio(false)
    );
  };

  // Auto-play audio when study word appears
  useEffect(() => {
    if (activeTab === 'study' && queue[currentIndex] && !submitted) {
      const timer = setTimeout(() => {
        playCurrentAudio(queue[currentIndex].word);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [activeTab, currentIndex, selectedLevel, submitted]);

  // Auto-play audio when review word appears (Fixes review auto-pronunciation!)
  useEffect(() => {
    if (activeTab === 'review' && reviewQueue[reviewIndex] && !reviewSubmitted) {
      const timer = setTimeout(() => {
        playCurrentAudio(reviewQueue[reviewIndex].word);
      }, 350);
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

  // Unlock mobile audio context upon first interaction
  useEffect(() => {
    const handleFirstTouch = () => {
      speechService.initVoices();
      window.removeEventListener('touchstart', handleFirstTouch);
      window.removeEventListener('click', handleFirstTouch);
    };
    window.addEventListener('touchstart', handleFirstTouch, { passive: true });
    window.addEventListener('click', handleFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleFirstTouch);
      window.removeEventListener('click', handleFirstTouch);
    };
  }, []);

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

  // Submit in Study Loop
  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!currentWord || !userInput.trim()) return;

    const trimmedInput = userInput.trim().toLowerCase();
    const correctWord = currentWord.word.toLowerCase();
    const isCorrect = trimmedInput === correctWord;

    let routedStack = '';
    const wordEntry = { ...currentWord, lastTested: new Date().toISOString() };

    if (unknownMeaning) {
      routedStack = 'Stack 3 (Unknown Meaning)';
      setData(prev => ({
        ...prev,
        stack3_meaning: upsertWordList(prev.stack3_meaning, wordEntry),
        stack2_spelling: prev.stack2_spelling.filter(w => w.id !== currentWord.id),
        stack1_mastered: prev.stack1_mastered.filter(w => w.id !== currentWord.id),
        stats: {
          totalTested: prev.stats.totalTested + 1,
          correctSpelling: prev.stats.correctSpelling + (isCorrect ? 1 : 0)
        }
      }));
    } else if (!isCorrect) {
      routedStack = 'Stack 2 (Spelling Error)';
      setData(prev => ({
        ...prev,
        stack2_spelling: upsertWordList(prev.stack2_spelling, wordEntry),
        stack3_meaning: prev.stack3_meaning.filter(w => w.id !== currentWord.id),
        stack1_mastered: prev.stack1_mastered.filter(w => w.id !== currentWord.id),
        stats: {
          totalTested: prev.stats.totalTested + 1,
          correctSpelling: prev.stats.correctSpelling
        }
      }));
    } else {
      routedStack = 'Stack 1 (Mastered)';
      setData(prev => ({
        ...prev,
        stack1_mastered: upsertWordList(prev.stack1_mastered, wordEntry),
        stack2_spelling: prev.stack2_spelling.filter(w => w.id !== currentWord.id),
        stack3_meaning: prev.stack3_meaning.filter(w => w.id !== currentWord.id),
        stats: {
          totalTested: prev.stats.totalTested + 1,
          correctSpelling: prev.stats.correctSpelling + 1
        }
      }));
    }

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
      setTimeout(() => {
        if (queue[nextIdx]) {
          playCurrentAudio(queue[nextIdx].word);
        }
      }, 250);
    } else {
      alert('🎉 Excellent! You have completed all words in this batch.');
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
      }, 150);
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
      }, 150);
    }
  };

  // Submit in Review Mode
  const handleReviewSubmit = (e) => {
    if (e) e.preventDefault();
    if (!currentReviewWord || !reviewInput.trim()) return;

    const trimmedInput = reviewInput.trim().toLowerCase();
    const correctWord = currentReviewWord.word.toLowerCase();
    const isCorrect = trimmedInput === correctWord;

    if (isCorrect) {
      sfx.playCorrect();
      setData(prev => ({
        ...prev,
        stack1_mastered: upsertWordList(prev.stack1_mastered, currentReviewWord),
        stack2_spelling: prev.stack2_spelling.filter(w => w.id !== currentReviewWord.id),
        stack3_meaning: prev.stack3_meaning.filter(w => w.id !== currentReviewWord.id),
        stats: {
          totalTested: prev.stats.totalTested + 1,
          correctSpelling: prev.stats.correctSpelling + 1
        }
      }));
    } else {
      sfx.playIncorrect();
      setData(prev => ({
        ...prev,
        stats: {
          totalTested: prev.stats.totalTested + 1,
          correctSpelling: prev.stats.correctSpelling
        }
      }));
    }

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
      setTimeout(() => {
        if (reviewQueue[nextIdx]) {
          playCurrentAudio(reviewQueue[nextIdx].word);
        }
      }, 200);
    } else {
      alert('🎉 Stack review session completed!');
      setReviewIndex(0);
      resetReviewInputs();
    }
  };

  const upsertWordList = (list, word) => {
    const filtered = list.filter(w => w.id !== word.id);
    return [word, ...filtered];
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

  // Metrics
  const total = data.stats.totalTested || 0;
  const correct = data.stats.correctSpelling || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  
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
    const matchesQuery = item.word.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
                         (item.definition && item.definition.toLowerCase().includes(searchQuery.trim().toLowerCase()));
    const matchesLevel = searchLevel === 'ALL' || item.level === searchLevel;
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
                  className={`speed-pill ${audioSpeed === 0.75 ? 'active' : ''}`}
                  onClick={() => setAudioSpeed(0.75)}
                >
                  0.75x
                </button>
                <button 
                  className={`speed-pill ${audioSpeed === 0.9 ? 'active' : ''}`}
                  onClick={() => setAudioSpeed(0.9)}
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

            {/* Core Card: Combines Image 1 Layout + Image 2 Styling */}
            {currentWord ? (
              <div className="editorial-card">
                {/* Card Editorial Header */}
                <div className="card-top-header">
                  <div className="academic-badge-row">
                    <span className="card-red-pin"></span>
                    <span className="academic-tier-name">
                      {currentWord.level} Academic Vocabulary
                    </span>
                  </div>
                  <span className="batch-index">
                    Words {currentIndex + 1}/{queue.length}
                  </span>
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
                            {lastResult.isCorrectSpelling ? 'Excellent! Spelled Correctly' : 'Spelling Correction Needed'}
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
                <h3>👏 Batch Completed!</h3>
                <p>You have tested all words in this difficulty tier.</p>
                <button 
                  className="cta-red-button"
                  onClick={() => setSelectedLevel('ALL')}
                >
                  Explore All Words →
                </button>
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
                  {['ALL', 'A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => (
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
            {/* Stack Switcher Tabs */}
            <div className="review-toggle-bar">
              <button 
                className={`review-stack-btn ${reviewStackType === 'stack2' ? 'active-s2' : ''}`}
                onClick={() => setReviewStackType('stack2')}
              >
                📝 Stack 2: Spelling ({data.stack2_spelling.length})
              </button>
              <button 
                className={`review-stack-btn ${reviewStackType === 'stack3' ? 'active-s3' : ''}`}
                onClick={() => setReviewStackType('stack3')}
              >
                💡 Stack 3: Meaning ({data.stack3_meaning.length})
              </button>
            </div>

            {reviewQueue.length > 0 && currentReviewWord ? (
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
                            {reviewResult.isCorrectSpelling 
                              ? 'Mastered! Promoted to Stack 1' 
                              : 'Keep practicing'}
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
                <h3>Stack is Empty!</h3>
                <p>No words currently waiting in {reviewStackType === 'stack2' ? 'Stack 2 (Spelling Errors)' : 'Stack 3 (Unknown Meaning)'}.</p>
                <button 
                  className="cta-navy-button"
                  onClick={() => setActiveTab('study')}
                >
                  Return to Dictation
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 4: STATS & IELTS SCORE (Image 2 Stats Banner Style) */}
        {/* ============================================================ */}
        {activeTab === 'stats' && (
          <div className="view-content fade-in">
            {/* 3-Metric Stats Banner (Image 2 style: Lessons 34 | Total Time 3060 | Cost $560) */}
            <div className="stats-metric-card">
              <div className="metric-col">
                <span className="metric-title">Accuracy</span>
                <span className="metric-value blue-val">{accuracy}%</span>
                <span className="metric-sub">{correct} correct</span>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-col">
                <span className="metric-title">Tested</span>
                <span className="metric-value red-val">{total}</span>
                <span className="metric-sub">Attempts</span>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-col">
                <span className="metric-title">IELTS Band</span>
                <span className="metric-value dark-val">{estimatedBand}</span>
                <span className="metric-sub">Estimated</span>
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
                onClick={() => handleStartDownloadAudio(queue.slice(0, 50))}
                disabled={isDownloadingAudio}
              >
                <span>📥 Download Current Deck ({Math.min(queue.length, 50)} Words)</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>~0.5 MB</span>
              </button>

              <button 
                className="btn-download-pack" 
                onClick={() => handleStartDownloadAudio(data.allWords.filter(w => selectedLevel === 'ALL' ? true : w.level === selectedLevel).slice(0, 100))}
                disabled={isDownloadingAudio}
                style={{ background: '#334155' }}
              >
                <span>📥 Download {selectedLevel} Pack (100 Words)</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>~1.2 MB</span>
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
    </div>
  );
}
