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
    this.rate = 0.92;
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
      // Type 2 = Standard neutral American dictionary studio recording
      const primaryUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
      const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;

      // In background, fetch blob and cache to IndexedDB for permanent offline use
      fetchWordAudioBlob(cleanWord).catch(() => {});

      this.playHtmlAudio(primaryUrl, token, handleStart, handleEnd, () => {
        if (this.currentPlayToken !== token) return;
        // Fallback to secondary US online stream
        this.playHtmlAudio(fallbackUrl, token, handleStart, handleEnd, () => {
          if (this.currentPlayToken !== token) return;
          // Absolute offline/failure fallback to SpeechSynthesis
          this.speakWithSynthesis(cleanWord, token, handleStart, handleEnd);
        });
      });
    } else {
      // Device is offline and word not yet cached: use local speech synthesis with neutral US voice
      this.speakWithSynthesis(cleanWord, token, handleStart, handleEnd);
    }
  }

  playHtmlAudio(url, token, onStart, onEnd, onError) {
    if (!this.audioPlayer || this.currentPlayToken !== token) {
      return;
    }

    let errorHandled = false;
    const triggerErrorOnce = () => {
      if (errorHandled) return;
      errorHandled = true;
      if (this.currentPlayToken === token && onError) {
        onError();
      }
    };

    try {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
      this.audioPlayer.src = url;
      this.audioPlayer.playbackRate = this.rate || 0.92;

      this.audioPlayer.onplay = () => {
        if (this.currentPlayToken === token) {
          onStart();
        }
      };

      this.audioPlayer.onended = () => {
        if (this.currentPlayToken === token) {
          onEnd();
        }
      };

      this.audioPlayer.onerror = (e) => {
        triggerErrorOnce();
      };

      const playPromise = this.audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // If the play was aborted/interrupted by a newer sound call, DO NOT trigger error fallback!
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
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate || 0.92;
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
