// High-Fidelity Audio & Speech Service for Writyy
// 1. Instant Offline Playback via IndexedDB Studio Audio Cache
// 2. Real Standard Neutral English Dictionary Studio Recording (Type 2 - US Standard)
// 3. Fallback High-Quality Web Speech Synthesis (locked strictly to en-US neutral voice)

import { getCachedAudioBlob, fetchWordAudioBlob } from './audioCache';

class SpeechService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioPlayer = typeof window !== 'undefined' ? new Audio() : null;
    this.voices = [];
    this.rate = 0.92; // Natural, clear pacing for vocabulary learning
    this.pitch = 1.0;
    this.selectedVoice = null;
    this.isSpeaking = false;
    this.safetyTimer = null;
    this.currentObjectUrl = null;

    if (this.synth) {
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
      if (typeof window !== 'undefined') {
        setTimeout(() => this.initVoices(), 300);
        setTimeout(() => this.initVoices(), 1000);
        setTimeout(() => this.initVoices(), 2500);
      }
    }
  }

  initVoices() {
    if (!this.synth) return;
    const all = this.synth.getVoices();
    if (!all || all.length === 0) return;
    this.voices = all;

    // Filter strictly for English voices
    const englishVoices = this.voices.filter(v => 
      v.lang && (v.lang.startsWith('en') || v.lang.startsWith('en-') || v.lang.startsWith('en_'))
    );

    if (englishVoices.length === 0) return;

    // Standard Neutral Voice Priority: Standard American (General American / International)
    // Avoids heavy British accents or foreign robotic voices
    const neutralUsVoice = englishVoices.find(v => 
      v.name.includes('Samantha') || // iOS default clear US voice
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

    this.stop();

    // Safety watchdog: ensure isSpeaking resets after 4s max
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.safetyTimer = setTimeout(() => {
      if (this.isSpeaking) {
        this.cleanupObjectUrl();
        this.isSpeaking = false;
        if (onEnd) onEnd();
      }
    }, 4500);

    const handleStart = () => {
      this.isSpeaking = true;
      if (onStart) onStart();
    };

    const handleEnd = () => {
      if (this.safetyTimer) clearTimeout(this.safetyTimer);
      this.cleanupObjectUrl();
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    // 1. TIER 1: Check Offline IndexedDB Studio Audio Cache
    try {
      const cachedBlob = await getCachedAudioBlob(cleanWord);
      if (cachedBlob && cachedBlob.size > 1000 && this.audioPlayer) {
        this.cleanupObjectUrl();
        this.currentObjectUrl = URL.createObjectURL(cachedBlob);
        this.playHtmlAudio(this.currentObjectUrl, handleStart, handleEnd, () => {
          // If object url playback fails, fall through to online/synthesis
          this.playOnlineOrSynthesize(cleanWord, handleStart, handleEnd);
        });
        return;
      }
    } catch (e) {
      // IndexedDB lookup skipped
    }

    // 2. TIER 2 & 3: Play Online Real Studio Dictionary Audio (Standard Neutral)
    this.playOnlineOrSynthesize(cleanWord, handleStart, handleEnd);
  }

  playOnlineOrSynthesize(cleanWord, handleStart, handleEnd) {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (isOnline && this.audioPlayer) {
      // Standard neutral dictionary pronunciation (Type 2: US standard studio recording)
      const primaryUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`;
      const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;

      // In background, fetch blob and cache to IndexedDB for permanent offline use
      fetchWordAudioBlob(cleanWord).catch(() => {});

      this.playHtmlAudio(primaryUrl, handleStart, handleEnd, () => {
        // Fallback to secondary US online stream
        this.playHtmlAudio(fallbackUrl, handleStart, handleEnd, () => {
          // Absolute offline/failure fallback to SpeechSynthesis
          this.speakWithSynthesis(cleanWord, handleStart, handleEnd);
        });
      });
    } else {
      // Device is offline and word not yet cached: use local speech synthesis with neutral US voice
      this.speakWithSynthesis(cleanWord, handleStart, handleEnd);
    }
  }

  playHtmlAudio(url, onStart, onEnd, onError) {
    if (!this.audioPlayer) {
      if (onError) onError();
      return;
    }

    this.audioPlayer.pause();
    this.audioPlayer.src = url;
    this.audioPlayer.playbackRate = this.rate || 0.92;

    this.audioPlayer.onplay = () => {
      onStart();
    };

    this.audioPlayer.onended = () => {
      onEnd();
    };

    this.audioPlayer.onerror = () => {
      if (onError) onError();
    };

    const playPromise = this.audioPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        if (onError) onError();
      });
    }
  }

  speakWithSynthesis(text, onStart, onEnd) {
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate || 0.92;
      utterance.pitch = this.pitch || 1.0;
      
      // Standard Neutral English (en-US, not thick British or foreign)
      utterance.lang = 'en-US';

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
        if (this.selectedVoice.lang) {
          utterance.lang = this.selectedVoice.lang;
        }
      }

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        if (onEnd) onEnd();
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
