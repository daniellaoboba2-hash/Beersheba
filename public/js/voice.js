/* global speechSynthesis, SpeechSynthesisUtterance */
/**
 * VoiceReaderService — abstraction over text-to-speech playback.
 * Today: browser-native speechSynthesis (works offline, no server needed).
 * Production: swap the internals for a generated-audiobook file player
 * (fetch signed URL for chapter.audioSource, play via <audio>) without
 * changing any caller code — the play/pause/resume/stop/rate contract stays.
 */
const VoiceReader = (() => {
  let utterance = null;
  let paragraphs = [];
  let index = 0;
  let rate = 1;
  let onProgress = null;
  let supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  function speakCurrent() {
    if (!supported || index >= paragraphs.length) {
      if (onProgress) onProgress({ done: true });
      return;
    }
    utterance = new SpeechSynthesisUtterance(paragraphs[index]);
    utterance.rate = rate;
    utterance.onend = () => {
      index += 1;
      if (onProgress) onProgress({ index, total: paragraphs.length });
      speakCurrent();
    };
    speechSynthesis.speak(utterance);
  }

  return {
    isSupported: () => supported,
    isPlaying: () => supported && speechSynthesis.speaking && !speechSynthesis.paused,
    load(text, opts) {
      paragraphs = String(text).split(/\n+/).filter(Boolean);
      index = 0;
      onProgress = (opts && opts.onProgress) || null;
    },
    play() {
      if (!supported) return;
      if (speechSynthesis.paused && utterance) speechSynthesis.resume();
      else speakCurrent();
    },
    pause() { if (supported) speechSynthesis.pause(); },
    stop() { if (supported) speechSynthesis.cancel(); index = 0; },
    setRate(r) { rate = r; },
    getRate: () => rate,
  };
})();
