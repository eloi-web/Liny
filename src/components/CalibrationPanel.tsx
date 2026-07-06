import {
  List,
  RefreshCw,
  Sliders,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface CalibrationPanelProps {
  scanInterval: number;
  threshold: number;
  zoom: number;
  facingMode: 'user' | 'environment';
  showLogs: boolean;
  voiceEnabled: boolean;
  hasMultipleCameras: boolean;
  onScanIntervalChange: (ms: number) => void;
  onThresholdChange: (value: number) => void;
  onZoomChange: (value: number) => void;
  onFacingModeToggle: () => void;
  onShowLogsToggle: () => void;
  onVoiceEnabledToggle: () => void;
  onClose: () => void;
}

export default function CalibrationPanel({
  scanInterval,
  threshold,
  zoom,
  facingMode,
  showLogs,
  voiceEnabled,
  hasMultipleCameras,
  onScanIntervalChange,
  onThresholdChange,
  onZoomChange,
  onFacingModeToggle,
  onShowLogsToggle,
  onVoiceEnabledToggle,
  onClose,
}: CalibrationPanelProps) {
  const showCameraFlip =
    hasMultipleCameras ||
    (typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className="w-full max-w-sm md:max-w-md glass-panel border border-white/10 rounded-2xl p-5 md:p-6 shadow-[0_8px_40px_rgba(0,0,0,0.95)] flex flex-col max-h-[85vh] overflow-y-auto custom-scrollbar text-off-white space-y-5"
        id="calibration-modal"
      >
        <div className="font-mono text-xs font-bold text-off-white border-b border-white/10 pb-3 flex items-center justify-between tracking-widest">
          <span className="flex items-center gap-2 text-neon-green font-bold uppercase">
            <Sliders className="w-4 h-4 text-neon-green" />
            CALIBRATION SETUP
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white duration-100 cursor-pointer p-1 hover:bg-white/5 rounded-md"
            title="Close Calibration"
          >
            <X className="w-5 h-5 text-off-white" />
          </button>
        </div>

        <div className="flex flex-col space-y-2">
          <div className="flex justify-between items-center font-mono text-xs font-bold tracking-wider text-off-white">
            <span className="opacity-80 uppercase font-mono">Detection Pipeline</span>
            <span className="text-neon-green font-bold uppercase font-mono">DETR RESNET-50</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug font-sans">
            Currently running Hugging Face Transformers DETR ResNet-50.
          </p>
        </div>

        <div className="flex flex-col space-y-2 border-t border-white/10 pt-3">
          <div className="flex justify-between items-center font-mono text-xs font-bold tracking-wider text-off-white">
            <span className="opacity-80 uppercase font-mono">Confidence Threshold</span>
            <span className="text-neon-green font-bold font-mono">{threshold}%</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug font-sans">
            Raise the threshold to ignore uncertain detections and reduce false positives.
          </p>
          <input
            type="range"
            min="10"
            max="90"
            step="5"
            value={threshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            className="w-full h-3 cursor-pointer bg-white/10 accent-neon-green"
          />
        </div>

        <div className="flex flex-col space-y-2 border-t border-white/10 pt-3">
          <div className="flex justify-between items-center font-mono text-xs font-bold tracking-wider text-off-white">
            <span className="opacity-80 uppercase font-mono">Neural Interval</span>
            <span className="text-neon-green font-bold font-mono">{scanInterval}ms</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug font-sans">
            Slowing the check rate cuts processor heat, preventing native framing jitter or camera freeze on cell-phones.
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {[100, 250, 500].map((ms) => (
              <button
                key={ms}
                onClick={() => onScanIntervalChange(ms)}
                className={`py-1.5 text-[9px] font-mono font-bold rounded-xl duration-150 uppercase cursor-pointer border ${scanInterval === ms ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.15)]' : 'bg-transparent text-gray-300 border-white/10 hover:border-white/30'}`}
              >
                {ms === 100 ? '100ms (High)' : ms === 250 ? '250ms (Mid)' : '500ms (Eco)'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col space-y-2 border-t border-white/10 pt-3">
          <div className="flex justify-between items-center font-mono text-xs font-bold tracking-wider text-off-white">
            <span className="flex items-center gap-1.5 opacity-80 uppercase font-mono">
              <ZoomIn className="w-3.5 h-3.5" />
              LONG RANGE ZOOM
            </span>
            <span className="text-neon-green font-bold font-mono">{zoom.toFixed(1)}x</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug font-sans">
            Digitally enlarges distant objects to feed denser, crisper outlines into the identification grid.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onZoomChange(Math.max(1.0, zoom - 0.5))}
              disabled={zoom <= 1.0}
              className="p-1 px-2.5 bg-white/5 border border-white/10 hover:border-white/30 rounded-xl text-gray-300 hover:text-white text-xs disabled:opacity-20 cursor-pointer duration-100"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.1"
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="flex-1 h-3 cursor-pointer bg-white/10 accent-neon-green"
            />
            <button
              onClick={() => onZoomChange(Math.min(4.0, zoom + 0.5))}
              disabled={zoom >= 4.0}
              className="p-1 px-2.5 bg-white/5 border border-white/10 hover:border-white/30 rounded-xl text-gray-300 hover:text-white text-xs disabled:opacity-20 cursor-pointer duration-100"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showCameraFlip && (
          <div className="flex items-center justify-between py-2 border-t border-white/10 pt-2 font-mono text-xs">
            <span className="font-bold text-off-white opacity-80 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              OPTICAL SOURCE
            </span>
            <button
              onClick={onFacingModeToggle}
              className="px-3 py-1.5 glass-panel text-off-white hover:text-white border border-white/20 hover:border-white/40 text-[10px] font-bold rounded-xl duration-150 uppercase cursor-pointer tracking-wider"
            >
              {facingMode === 'user' ? 'FRONT CAMERA' : 'REAR CAMERA'}
            </button>
          </div>
        )}

        <div className="flex flex-col space-y-3 border-t border-white/10 pt-3 font-mono">
          <div className="flex items-center justify-between">
            <div className="flex flex-col space-y-0.5">
              <span className="text-xs font-bold text-off-white opacity-80 flex items-center gap-1.5">
                <List className="w-3.5 h-3.5" />
                DETECTION LOG
              </span>
              <span className="text-[10px] text-gray-400 font-sans">Toggle visual tracking log</span>
            </div>
            <div
              className="relative inline-block w-10 h-5 cursor-pointer select-none"
              onClick={onShowLogsToggle}
            >
              <div
                className={`absolute inset-0 border border-white/20 transition-colors duration-200 rounded-full ${showLogs ? 'bg-neon-green border-neon-green' : 'bg-[#0c0c0c]'}`}
              />
              <div
                className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-transform duration-200 ${showLogs ? 'bg-black translate-x-[18px]' : 'bg-white'}`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col space-y-0.5">
              <span className="text-xs font-bold text-off-white opacity-80 flex items-center gap-1.5">
                {voiceEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-neon-green" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 opacity-55" />
                )}
                AUDIO ASSIST
              </span>
              <span className="text-[10px] text-gray-400 font-sans">Read matching targets out loud</span>
            </div>
            <div
              className="relative inline-block w-10 h-5 cursor-pointer select-none"
              onClick={onVoiceEnabledToggle}
            >
              <div
                className={`absolute inset-0 border border-white/20 transition-colors duration-200 rounded-full ${voiceEnabled ? 'bg-neon-green border-neon-green' : 'bg-[#0c0c0c]'}`}
              />
              <div
                className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-transform duration-200 ${voiceEnabled ? 'bg-black translate-x-[18px]' : 'bg-white'}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
