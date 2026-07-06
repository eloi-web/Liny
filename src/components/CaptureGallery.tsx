import { Camera, Download, List, X } from 'lucide-react';

export interface Capture {
  id: string;
  dataUrl: string;
  timestamp: number;
  labels: string[];
}

interface CaptureGalleryProps {
  isOpen: boolean;
  captures: Capture[];
  onClose: () => void;
}

export default function CaptureGallery({ isOpen, captures, onClose }: CaptureGalleryProps) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 bg-[#0c0c0c] border-t border-white/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ height: '88vh' }}
    >
      <div className="w-full h-full flex flex-col pt-3 px-5 pb-8 overflow-hidden relative">
        <div
          className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-5 cursor-pointer"
          onClick={onClose}
        />

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black text-white tracking-tight uppercase font-mono flex items-center gap-2">
            <Camera className="w-5 h-5 text-neon-green" />
            CAPTURE LOG
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pb-6 pr-1">
          {captures.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
              <Camera className="w-16 h-16 opacity-20" />
              <p className="font-mono text-xs tracking-widest">NO CAPTURES DETECTED</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {captures.map((capture) => (
                <div
                  key={capture.id}
                  className="group relative rounded-xl overflow-hidden border border-white/10 bg-[#151515] aspect-3/4 shadow-lg"
                >
                  <img src={capture.dataUrl} alt="Capture" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-3.5">
                    <div className="text-[10px] font-mono text-white/50 mb-2">
                      {new Date(capture.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {capture.labels.length > 0 ? (
                        capture.labels.slice(0, 3).map((label, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 bg-neon-green/10 border border-neon-green/30 text-neon-green rounded text-[9px] font-bold font-mono uppercase truncate max-w-full"
                          >
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-white/50 rounded text-[9px] font-bold font-mono uppercase">
                          NO SUBJECTS
                        </span>
                      )}
                      {capture.labels.length > 3 && (
                        <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-white/50 rounded text-[9px] font-bold font-mono">
                          +{capture.labels.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={capture.dataUrl}
                    download={`liny-${capture.timestamp}.jpg`}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-white hover:text-black text-white shadow-lg"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CaptureThumbnail({
  captures,
  onOpen,
}: {
  captures: Capture[];
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="w-14 h-14 rounded-full overflow-hidden bg-black/80 border-2 border-white/20 cursor-pointer hover:border-white transition-colors shrink-0 relative group shadow-inner"
    >
      {captures.length > 0 ? (
        <>
          <img src={captures[0].dataUrl} alt="Recent capture" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <List className="w-5 h-5 text-white" />
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-white/5 flex items-center justify-center">
          <List className="w-5 h-5 text-white/50" />
        </div>
      )}
    </div>
  );
}
