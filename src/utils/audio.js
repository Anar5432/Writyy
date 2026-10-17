// High-Fidelity Audio & Speech Service for Writyy
// Features:
// 1. Strict Atomic Play Token Locking (Prevents overlapping, double-sounds, or race conditions)
// 2. Instant Offline Playback via IndexedDB Studio Audio Cache
// 3. Real Standard Neutral American English Dictionary Studio Recording (Type 2 - US Standard)
// 4. Clean Fallbacks with AbortError filtering (never mistakenly triggers synthesis on pause)

import { getCachedAudioBlob, fetchWordAudioBlob } from './audioCache';

// Configure AudioSession to 'ambient' so mobile OSes (iOS Safari/PWA & Android)
// mix our sound with background apps (Spotify, YouTube, Podcasts) instead of pausing them!
export function configureAmbientAudio() {
  if (typeof navigator !== 'undefined') {
    if ('audioSession' in navigator) {
      try {
        if (navigator.audioSession.type !== 'ambient') {
          navigator.audioSession.type = 'ambient';
        }
      } catch (e) {
        // Safe fallback for older mobile engines
      }
    }
    // Prevent Writyy from hijacking lock screen / Control Center media controls from Spotify/YouTube
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch (e) {}
    }
  }
}

class SpeechService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioPlayer = typeof window !== 'undefined' ? new Audio() : null;
    this.audioCtx = null;
    this.voices = [];
    this.rate = 1.05;
    this.pitch = 1.0;
    this.selectedVoice = null;
    this.isSpeaking = false;
    this.safetyTimer = null;
    this.currentObjectUrl = null;
    this.currentPlayToken = 0; // Atomic token to prevent duplicate or overlapping playback

    // Immediately set ambient mode on startup
    configureAmbientAudio();

    if (this.audioPlayer) {
      try {
        this.audioPlayer.preload = 'auto';
        if ('preservesPitch' in this.audioPlayer) {
          this.audioPlayer.preservesPitch = true;
        }
      } catch (e) {}
    }

    if (this.synth) {
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
      if (typeof window !== 'undefined') {
        setTimeout(() => this.initVoices(), 300);
        setTimeout(() => this.initVoices(), 1200);
      }
    }
  }

  getAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioCtx = new AudioCtx();
        } catch (e) {}
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        this.audioCtx.resume().catch(() => {});
      } catch (e) {}
    }
    return this.audioCtx;
  }

  initVoices() {
    if (!this.synth) return;
    const all = this.synth.getVoices();
    if (!all || all.length === 0) return;
    this.voices = all;

    const englishVoices = this.voices.filter(v => 
      v.lang && (v.lang.startsWith('en') || v.lang.startsWith('en-') || v.lang.startsWith('en_'))
    );

    if (englishVoices.length === 0) return;

    // Standard Neutral Voice Priority: Standard American (General American / International)
    const neutralUsVoice = englishVoices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Google US English') ||
      v.name.includes('Natural') ||
      v.name.includes('Ava') ||
      v.name.includes('Allison') ||
      v.name.includes('Zira') ||
      v.name.includes('Alex') ||
      v.lang === 'en-US'
    );

    const fallbackEnVoice = englishVoices.find(v => v.lang.includes('US')) || englishVoices[0];
    this.selectedVoice = neutralUsVoice || fallbackEnVoice;
  }

  // Warm up audio system cleanly without playing sounds that interrupt background Spotify or YouTube
  unlockAudio() {
    configureAmbientAudio();
    this.initVoices();
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.synth && this.synth.paused) {
      try {
        this.synth.resume();
      } catch (e) {}
    }
  }

  setRate(newRate) {
    this.rate = Math.max(0.6, Math.min(1.4, newRate));
    if (this.audioPlayer) {
      this.audioPlayer.playbackRate = this.rate;
    }
  }

  async speak(text, onStart, onEnd) {
    if (!text) return;
    const cleanWord = text.trim();
    if (!cleanWord) return;

    // 1. Immediately increment token & stop any ongoing sound
    const token = ++this.currentPlayToken;
    this.stop();

    // Safety watchdog: ensure isSpeaking resets after 4s max
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.safetyTimer = setTimeout(() => {
      if (this.currentPlayToken === token && this.isSpeaking) {
        this.cleanupObjectUrl();
        this.isSpeaking = false;
        if (onEnd) onEnd();
      }
    }, 4500);

    const handleStart = () => {
      if (this.currentPlayToken !== token) return;
      this.isSpeaking = true;
      if (onStart) onStart();
    };

    const handleEnd = () => {
      if (this.currentPlayToken !== token) return;
      if (this.safetyTimer) clearTimeout(this.safetyTimer);
      this.cleanupObjectUrl();
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    // 2. TIER 1: Check Offline IndexedDB Studio Audio Cache
    try {
      const cachedBlob = await getCachedAudioBlob(cleanWord);
      // Abort if another sound was requested while awaiting cache
      if (this.currentPlayToken !== token) return;

      if (cachedBlob && cachedBlob.size > 1000 && this.audioPlayer) {
        this.cleanupObjectUrl();
        this.currentObjectUrl = URL.createObjectURL(cachedBlob);
        this.playHtmlAudio(this.currentObjectUrl, token, handleStart, handleEnd, () => {
          if (this.currentPlayToken !== token) return;
          this.playOnlineOrSynthesize(cleanWord, token, handleStart, handleEnd);
        });
        return;
      }
    } catch (e) {
      if (this.currentPlayToken !== token) return;
    }

    // 3. TIER 2 & 3: Play Online Real Studio Dictionary Audio (Standard Neutral)
    this.playOnlineOrSynthesize(cleanWord, token, handleStart, handleEnd);
  }

  playOnlineOrSynthesize(cleanWord, token, handleStart, handleEnd) {
    if (this.currentPlayToken !== token) return;

    if (this.audioPlayer) {
      // Primary: Youdao standard neutral US dictionary recording
      // NOTE: Service Worker caches this in 'writyy-audio-v1' so it plays 100% OFFLINE from cache!
      const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;
      const gstaticUrl = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${cleanWord}--_us_1.mp3`;

      // Pre-cache in background if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetchWordAudioBlob(cleanWord).catch(() => {});
      }

      this.playHtmlAudio(youdaoUrl, token, handleStart, handleEnd, () => {
        if (this.currentPlayToken !== token) return;
        this.playHtmlAudio(googleUrl, token, handleStart, handleEnd, () => {
          if (this.currentPlayToken !== token) return;
          this.playHtmlAudio(gstaticUrl, token, handleStart, handleEnd, () => {
            if (this.currentPlayToken !== token) return;
            this.speakWithSynthesis(cleanWord, token, handleStart, handleEnd);
          });
        });
      });
    } else {
      this.speakWithSynthesis(cleanWord, token, handleStart, handleEnd);
    }
  }

  playHtmlAudio(url, token, onStart, onEnd, onError) {
    if (!this.audioPlayer || this.currentPlayToken !== token) {
      return;
    }

    // Always enforce ambient session so background audio like Spotify or YouTube is never interrupted
    configureAmbientAudio();

    let errorHandled = false;
    let playTimeout = null;

    const triggerErrorOnce = () => {
      if (errorHandled) return;
      errorHandled = true;
      if (playTimeout) clearTimeout(playTimeout);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
      }
      if (this.currentPlayToken === token && onError) {
        onError();
      }
    };

    // Stalled / slow network safety fallback for mobile (1.4s)
    playTimeout = setTimeout(() => {
      triggerErrorOnce();
    }, 1400);

    try {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
      this.audioPlayer.src = url;
      this.audioPlayer.playbackRate = this.rate || 1.05;

      this.audioPlayer.onplay = () => {
        if (playTimeout) clearTimeout(playTimeout);
        configureAmbientAudio();
        if (this.currentPlayToken === token) {
          onStart();
        }
      };

      this.audioPlayer.onended = () => {
        if (playTimeout) clearTimeout(playTimeout);
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
        }
        if (this.currentPlayToken === token) {
          onEnd();
        }
      };

      this.audioPlayer.onerror = (e) => {
        if (playTimeout) clearTimeout(playTimeout);
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
        }
        triggerErrorOnce();
      };

      const playPromise = this.audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err && err.name === 'AbortError') {
            return;
          }
          if (this.currentPlayToken === token) {
            triggerErrorOnce();
          }
        });
      }
    } catch (err) {
      triggerErrorOnce();
    }
  }

  speakWithSynthesis(text, token, onStart, onEnd) {
    if (!this.synth || this.currentPlayToken !== token) {
      if (onEnd) onEnd();
      return;
    }

    try {
      if (this.synth.paused) {
        this.synth.resume();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      this.activeUtterance = utterance; // Prevent GC bug on iOS / Android!
      utterance.rate = this.rate || 1.0;
      utterance.pitch = this.pitch || 1.0;
      utterance.lang = 'en-US';

      if (!this.selectedVoice) {
        this.initVoices();
      }

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
        if (this.selectedVoice.lang) {
          utterance.lang = this.selectedVoice.lang;
        }
      }

      utterance.onstart = () => {
        if (this.currentPlayToken === token && onStart) onStart();
      };

      utterance.onend = () => {
        this.activeUtterance = null;
        if (this.currentPlayToken === token && onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        this.activeUtterance = null;
        if (this.currentPlayToken === token && onEnd) onEnd();
      };

      this.synth.speak(utterance);
    } catch (err) {
      this.activeUtterance = null;
      console.warn('Speech synthesis error:', err);
      if (onEnd) onEnd();
    }
  }

  cleanupObjectUrl() {
    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch (e) {}
      this.currentObjectUrl = null;
    }
  }

  stop() {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    this.cleanupObjectUrl();
    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.onplay = null;
        this.audioPlayer.onended = null;
        this.audioPlayer.onerror = null;
      } catch (e) {}
    }
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {}
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
    this.isSpeaking = false;
  }
}

export const speechService = new SpeechService();
