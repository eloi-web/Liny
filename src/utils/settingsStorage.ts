export interface PersistedSettings {
  scanInterval: number;
  threshold: number;
  voiceEnabled: boolean;
  facingMode: 'user' | 'environment';
  zoom: number;
  showLogs: boolean;
  hudVisible: boolean;
}

const STORAGE_KEY = 'liny-settings-v1';

const DEFAULTS: PersistedSettings = {
  scanInterval: 250,
  threshold: 30,
  voiceEnabled: false,
  facingMode: 'environment',
  zoom: 1,
  showLogs: true,
  hudVisible: true,
};

const ALLOWED_INTERVALS = new Set([100, 250, 500]);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

let cachedInitial: PersistedSettings | null = null;

/** One-shot read for React lazy state initializers. */
export function getInitialSettings(): PersistedSettings {
  if (!cachedInitial) cachedInitial = loadSettings();
  return cachedInitial;
}

export function loadSettings(): PersistedSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };

    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const scanInterval = ALLOWED_INTERVALS.has(Number(parsed.scanInterval))
      ? Number(parsed.scanInterval)
      : DEFAULTS.scanInterval;
    const threshold = clamp(Number(parsed.threshold) || DEFAULTS.threshold, 5, 95);
    const zoom = clamp(Number(parsed.zoom) || DEFAULTS.zoom, 1, 3);
    const facingMode = parsed.facingMode === 'user' ? 'user' : 'environment';

    return {
      scanInterval,
      threshold,
      voiceEnabled: Boolean(parsed.voiceEnabled),
      facingMode,
      zoom,
      showLogs: parsed.showLogs !== false,
      hudVisible: parsed.hudVisible !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: PersistedSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota / private mode — ignore.
  }
}
