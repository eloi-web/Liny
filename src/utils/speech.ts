const lastSpokenTime: Record<string, number> = {};

export function speakObject(className: string, voiceEnabled: boolean) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  
  const now = Date.now();
  // Only speak if we haven't spoken this object in the last 5 seconds
  if (!lastSpokenTime[className] || now - lastSpokenTime[className] > 5000) {
    const utterance = new SpeechSynthesisUtterance(`Detected ${className}`);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    lastSpokenTime[className] = now;
  }
}
