const lastSpokenTime: Record<string, number> = {};
const speechQueue: string[] = [];
let isQueueProcessing = false;

function processQueue() {
  if (isQueueProcessing || speechQueue.length === 0 || !window.speechSynthesis) return;

  isQueueProcessing = true;
  const text = speechQueue.shift();
  if (!text) {
    isQueueProcessing = false;
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0; // Clear and descriptive rate
  
  utterance.onend = () => {
    isQueueProcessing = false;
    // Short comfortable breath pause between voice logs
    setTimeout(() => {
      processQueue();
    }, 450);
  };

  utterance.onerror = () => {
    isQueueProcessing = false;
    processQueue();
  };

  window.speechSynthesis.speak(utterance);
}

export function speakObject(className: string, voiceEnabled: boolean, sciFiLabel?: string) {
  if (!voiceEnabled) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechQueue.length = 0;
    isQueueProcessing = false;
    return;
  }
  
  if (!window.speechSynthesis) return;
  
  const now = Date.now();
  // Only speak if we haven't spoken this object in the last 6 seconds
  if (!lastSpokenTime[className] || now - lastSpokenTime[className] > 6000) {
    // Generate pleasant immersive audio announcement
    const textToSpeak = sciFiLabel 
      ? `${sciFiLabel}`
      : `Target identified: ${className}`;
    
    if (!speechQueue.includes(textToSpeak)) {
      speechQueue.push(textToSpeak);
      processQueue();
    }
    lastSpokenTime[className] = now;
  }
}
