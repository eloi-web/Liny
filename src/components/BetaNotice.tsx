import { useState } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'liny-beta-notice-dismissed';

function wasDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode / quota — ignore.
  }
}

export default function BetaNotice() {
  const [visible, setVisible] = useState(() => !wasDismissed());

  if (!visible) return null;

  const dismiss = () => {
    persistDismissed();
    setVisible(false);
  };

  return (
    <div
      role="status"
      className="fixed right-4 md:right-8 z-50 w-[min(100%-2rem,20rem)] rounded-xl border border-white/10 overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.55)] top-20 md:top-auto md:bottom-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1rem))]"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.28) 100%), url("/beta-chip-bg.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="relative p-3.5 pr-11">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss beta notice"
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 transition-colors cursor-pointer shadow-sm"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-white uppercase mb-1.5 drop-shadow-sm">
          Beta
        </p>
        <p className="text-xs text-white font-sans leading-relaxed drop-shadow-sm">
          First visit downloads the model. Mobile scans can take a few seconds — that&apos;s expected.
        </p>
      </div>
    </div>
  );
}
