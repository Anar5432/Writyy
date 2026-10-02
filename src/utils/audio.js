// High-Fidelity Audio & Speech Service for Writyy
// Features:
// 1. Strict Atomic Play Token Locking (Prevents overlapping, double-sounds, or race conditions)
// 2. Instant Offline Playback via IndexedDB Studio Audio Cache
// 3. Real Standard Neutral American English Dictionary Studio Recording (Type 2 - US Standard)
// 4. Clean Fallbacks with AbortError filtering (never mistakenly triggers synthesis on pause)

import { getCachedAudioBlob, fetchWordAudioBlob } from './audioCache';

class SpeechService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioPlayer = typeof window !== 'undefined' ? new Audio() : null;
    this.voices = [];
    this.rate = 1.05;
    this.pitch = 1.0;
    this.selectedVoice = null;
    this.isSpeaking = false;
    this.safetyTimer = null;
    this.currentObjectUrl = null;
    this.currentPlayToken = 0; // Atomic token to prevent duplicate or overlapping playback

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

  unlockAudio() {
    this.initVoices();
    if (this.audioPlayer) {
      try {
        this.audioPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        this.audioPlayer.load();
        const p = this.audioPlayer.play();
        if (p) p.then(() => this.audioPlayer.pause()).catch(() => {});
      } catch (e) {}
    }
    if (this.synth) {
      try {
        if (this.synth.paused) {
          this.synth.resume();
        }
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0.01;
        this.synth.speak(dummy);
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

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (isOnline && this.audioPlayer) {
      // Primary: Youdao standard neutral US dictionary recording (rock-solid on mobile networks worldwide)
      const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
      // Secondary: Google TTS US
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;
      // Tertiary: Google dictionary static recordings
      const gstaticUrl = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${cleanWord}--_us_1.mp3`;

      // In background, fetch blob and cache to IndexedDB for permanent offline use
      fetchWordAudioBlob(cleanWord).catch(() => {});

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

    let errorHandled = false;
    let playTimeout = null;

    const triggerErrorOnce = () => {
      if (errorHandled) return;
      errorHandled = true;
      if (playTimeout) clearTimeout(playTimeout);
      if (this.currentPlayToken === token && onError) {
        onError();
      }
    };

    // Stalled / slow network safety fallback for mobile
    playTimeout = setTimeout(() => {
      triggerErrorOnce();
    }, 1400);

    try {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
      this.audioPlayer.src = url;
      this.audioPlayer.load(); // CRITICAL for mobile Safari & Android Chrome
      this.audioPlayer.playbackRate = this.rate || 1.05;

      this.audioPlayer.onplay = () => {
        if (playTimeout) clearTimeout(playTimeout);
        if (this.currentPlayToken === token) {
          onStart();
        }
      };

      this.audioPlayer.onended = () => {
        if (playTimeout) clearTimeout(playTimeout);
        if (this.currentPlayToken === token) {
          onEnd();
        }
      };

      this.audioPlayer.onerror = (e) => {
        if (playTimeout) clearTimeout(playTimeout);
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
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate || 1.0;
      utterance.pitch = this.pitch || 1.0;
      utterance.lang = 'en-US';

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
        if (this.currentPlayToken === token && onEnd) onEnd();
      };

      utterance.onerror = () => {
        if (this.currentPlayToken === token && onEnd) onEnd();
      };

      this.synth.speak(utterance);
    } catch (err) {
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
    this.isSpeaking = false;
  }
}

export const speechService = new SpeechService();
