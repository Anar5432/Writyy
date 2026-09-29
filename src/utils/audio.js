// High-Fidelity Audio & Speech Service for Writyy
// 1. Crystal-clear Native British Audio (HD MP3 via Google TTS CDN)
// 2. High-Quality Web Speech Synthesis (strict English-only voice mapping, offline-ready)

class SpeechService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioPlayer = typeof window !== 'undefined' ? new Audio() : null;
    this.voices = [];
    this.rate = 0.88; // Slightly deliberate for clear spelling listening
    this.pitch = 1.0;
    this.selectedVoice = null;
    this.isSpeaking = false;
    this.safetyTimer = null;
    this.preferNativeAudio = true;

    if (this.synth) {
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
      // On iOS WebKit, voices load asynchronously without onvoiceschanged firing
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

    // Prioritize high-quality British English voices
    const britishVoice = englishVoices.find(v => 
      v.lang === 'en-GB' || 
      v.name.includes('UK') || 
      v.name.includes('British') || 
      v.name.includes('Daniel') || 
      v.name.includes('Oliver') ||
      v.name.includes('Serena') ||
      v.name.includes('Stephanie') ||
      v.name.includes('Arthur')
    );

    // US English fallback
    const usVoice = englishVoices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Natural') || 
      v.name.includes('Google') || 
      v.lang === 'en-US'
    );

    this.selectedVoice = britishVoice || usVoice || englishVoices[0];
  }

  setRate(newRate) {
    this.rate = Math.max(0.6, Math.min(1.4, newRate));
    if (this.audioPlayer) {
      this.audioPlayer.playbackRate = this.rate;
    }
  }

  speak(text, onStart, onEnd) {
    if (!text) return;
    const cleanWord = text.trim();
    if (!cleanWord) return;

    this.stop();

    // Safety watchdog timer: ensure isSpeaking is always reset after 4s max
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.safetyTimer = setTimeout(() => {
      if (this.isSpeaking) {
        this.isSpeaking = false;
        if (onEnd) onEnd();
      }
    }, 4000);

    const handleStart = () => {
      this.isSpeaking = true;
      if (onStart) onStart();
    };

    const handleEnd = () => {
      if (this.safetyTimer) clearTimeout(this.safetyTimer);
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    // If online, prioritize crystal-clear HD British MP3 audio
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (this.preferNativeAudio && isOnline && this.audioPlayer) {
      const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;
      
      this.audioPlayer.src = audioUrl;
      this.audioPlayer.playbackRate = this.rate || 0.9;

      this.audioPlayer.onplay = () => {
        handleStart();
      };

      this.audioPlayer.onended = () => {
        handleEnd();
      };

      this.audioPlayer.onerror = () => {
        // Fallback to local speech synthesis if network stream fails
        this.speakWithSynthesis(cleanWord, handleStart, handleEnd);
      };

      const playPromise = this.audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser policy blocked HTML5 play, fallback to speech synthesis
          this.speakWithSynthesis(cleanWord, handleStart, handleEnd);
        });
      }
    } else {
      // 100% Offline: use local SpeechSynthesis with verified English voice
      this.speakWithSynthesis(cleanWord, handleStart, handleEnd);
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
      utterance.rate = this.rate || 0.88;
      utterance.pitch = this.pitch || 1.0;
      
      // CRITICAL: Always explicitly set English language tag so foreign/Turkish TTS engines don't mispronounce
      utterance.lang = 'en-GB';

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

  stop() {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
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
