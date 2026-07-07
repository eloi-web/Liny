import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import {
  CameraOff,
  Eye,
  EyeOff,
  List,
  Loader2,
  Play,
  RefreshCw,
  Settings,
  ShieldAlert,
  Square,
  ZoomIn,
} from 'lucide-react';
import CalibrationPanel from './CalibrationPanel';
import CaptureGallery, { Capture, CaptureThumbnail } from './CaptureGallery';
import { useDetectorModel } from '../hooks/useDetectorModel';
import { detectObjects } from '../utils/detector';
import { drawSketchyBoxes, getSciFiLabel, Prediction } from '../utils/draw';
import { speakObject } from '../utils/speech';

const MAX_CAPTURES = 20;

const MOBILE_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
};

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration errors on unsupported environments
    }
  }
};

interface LogEntry {
  id: number;
  time: string;
  text: string;
  confidence?: number;
  type: 'detect' | 'init' | 'unidentified' | 'error' | 'success';
}

export default function Scanner() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [scanInterval, setScanInterval] = useState(250);
  const [threshold, setThreshold] = useState(30);
  const [isScanning, setIsScanning] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 0,
      time: new Date().toTimeString().split(' ')[0],
      text: 'SYSTEM INITIALIZED & READY',
      type: 'init',
    },
  ]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [showLogs, setShowLogs] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [currentFps, setCurrentFps] = useState(60);
  const [adaptiveThrottleActive, setAdaptiveThrottleActive] = useState(false);
  const [sweepMs, setSweepMs] = useState<number | null>(null);

  const thresholdRef = useRef(30);
  const voiceEnabledRef = useRef(false);
  const scanIntervalRef = useRef(250);
  const loopActive = useRef(false);
  const requestRef = useRef<number | null>(null);
  const lastLogTime = useRef<Record<string, number>>({});
  const lastFpsTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const runInferenceRef = useRef<() => void>(() => undefined);
  const detectFrameRef = useRef<() => void>(() => undefined);
  const inferenceBusyRef = useRef(false);
  const firstSweepDoneRef = useRef(false);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const predictionsRef = useRef<Prediction[]>([]);
  const hudVisibleRef = useRef(true);

  const addLog = useCallback(
    (text: string, type: LogEntry['type'], confidence?: number) => {
      setLogs((prev) => {
        const now = new Date().toTimeString().split(' ')[0];
        const newLog = { id: Date.now() + Math.random(), time: now, text, type, confidence };
        return [newLog, ...prev].slice(0, 50);
      });
    },
    [],
  );

  const {
    modelLoaded,
    isLoading,
    downloadProgress,
    modelReadyRef,
    loadModel,
    unloadModel,
  } = useDetectorModel({ addLog });

  useEffect(() => {
    hudVisibleRef.current = hudVisible;
  }, [hudVisible]);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);
  useEffect(() => {
    scanIntervalRef.current = scanInterval;
  }, [scanInterval]);
  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('.cursor-pointer') ||
        target.closest('input[type="range"]')
      ) {
        vibrate(10);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (showControls) {
      document.body.classList.add('calibration-open');
    } else {
      document.body.classList.remove('calibration-open');
    }
    return () => document.body.classList.remove('calibration-open');
  }, [showControls]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (devices.filter((d) => d.kind === 'videoinput').length > 1) {
            setHasMultipleCameras(true);
          }
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('Device enumeration failed:', err);
          }
        });
    }
  }, []);

  const processPredictionsLogs = useCallback(
    (predictions: Prediction[]) => {
      if (!isScanning) return;

      const now = Date.now();
      predictions.forEach((pred) => {
        const friendlyLabel = getSciFiLabel(pred.class);
        speakObject(pred.class, voiceEnabledRef.current, `Target identified: ${friendlyLabel}`);

        const lastLog = lastLogTime.current[pred.class] || 0;
        if (lastLog === 0) {
          vibrate(30);
        }

        if (now - lastLog > 3000) {
          addLog(`${friendlyLabel.toUpperCase()} IDENTIFIED`, 'detect', Math.round(pred.score * 100));
          lastLogTime.current[pred.class] = now;
        }
      });
    },
    [isScanning, addLog],
  );

  const runInference = useCallback(async () => {
    if (!loopActive.current) return;

    const webcam = webcamRef.current;
    const video = webcam?.video;
    if (
      video?.readyState === 4 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      modelReadyRef.current &&
      !inferenceBusyRef.current
    ) {
      try {
        inferenceBusyRef.current = true;

        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }

        const MAX_DIM = 640;
        let targetWidth = video.videoWidth;
        let targetHeight = video.videoHeight;

        if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight / targetWidth) * MAX_DIM);
            targetWidth = MAX_DIM;
          } else {
            targetWidth = Math.round((targetWidth / targetHeight) * MAX_DIM);
            targetHeight = MAX_DIM;
          }
        }

        const offscreen = offscreenCanvasRef.current;
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;

        const octx = offscreen.getContext('2d');
        if (octx) {
          octx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const sweepStart = Date.now();
          const rawPredictions = await detectObjects(
            offscreen,
            thresholdRef.current / 100,
            (message) => addLog(`INFERENCE FAULT: ${message}`, 'error'),
          );
          predictionsRef.current = rawPredictions;
          const passMs = Date.now() - sweepStart;
          setSweepMs(passMs);
          if (!firstSweepDoneRef.current) {
            firstSweepDoneRef.current = true;
            addLog(
              `NEURAL SWEEP ONLINE — ${(passMs / 1000).toFixed(1)}s PER PASS, ${rawPredictions.length} TARGETS`,
              'init',
            );
            if (passMs > 5000) {
              addLog('SLOW DEVICE DETECTED — HOLD CAMERA STEADY BETWEEN SWEEPS', 'unidentified');
            }
          }
          processPredictionsLogs(rawPredictions);
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('Transformers inference processing crashed: ', e);
        }
      } finally {
        inferenceBusyRef.current = false;
      }
    }

    const effectiveScanInterval = adaptiveThrottleActive
      ? Math.max(500, scanIntervalRef.current)
      : scanIntervalRef.current;

    setTimeout(() => runInferenceRef.current(), effectiveScanInterval);
  }, [adaptiveThrottleActive, processPredictionsLogs, modelReadyRef, addLog]);

  const detectFrame = useCallback(() => {
    if (!loopActive.current) return;
    if (!webcamRef.current?.video || !canvasRef.current) {
      requestRef.current = requestAnimationFrame(() => detectFrameRef.current());
      return;
    }

    const video = webcamRef.current.video;
    if (video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(() => detectFrameRef.current());
      return;
    }

    const canvas = canvasRef.current;

    if (video.clientWidth > 0 && video.clientHeight > 0) {
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
    }

    frameCountRef.current++;
    const fpsNow = Date.now();
    if (lastFpsTimeRef.current === 0) {
      lastFpsTimeRef.current = fpsNow;
    }
    const elapsed = fpsNow - lastFpsTimeRef.current;
    if (elapsed >= 1000) {
      const calculatedFps = Math.round((frameCountRef.current * 1000) / elapsed);
      setCurrentFps(calculatedFps);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = fpsNow;

      if (calculatedFps < 55) {
        if (!adaptiveThrottleActive) {
          setAdaptiveThrottleActive(true);
          addLog('FRAME JITTER TRIGGERED (FPS < 55) — COOLDOWN ECO ACTIVE [500ms]', 'unidentified');
        }
      } else if (calculatedFps >= 57 && adaptiveThrottleActive) {
        setAdaptiveThrottleActive(false);
        addLog('STABLE INTERACTIVE FRAME RATE COMMITTED — SCAN MULTIPLIER RECOVERED', 'init');
      }
    }

    const offscreen = offscreenCanvasRef.current;
    if (canvas.width > 0 && canvas.height > 0 && offscreen && offscreen.width > 0) {
      const scaleX = canvas.width / offscreen.width;
      const scaleY = canvas.height / offscreen.height;

      const scaled = predictionsRef.current.map((pred) => ({
        ...pred,
        bbox: [
          pred.bbox[0] * scaleX,
          pred.bbox[1] * scaleY,
          pred.bbox[2] * scaleX,
          pred.bbox[3] * scaleY,
        ] as [number, number, number, number],
      }));

      if (hudVisibleRef.current) {
        drawSketchyBoxes(canvas, scaled);
      } else {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    if (loopActive.current) {
      requestRef.current = requestAnimationFrame(() => detectFrameRef.current());
    }
  }, [adaptiveThrottleActive, addLog]);

  useEffect(() => {
    runInferenceRef.current = runInference;
    detectFrameRef.current = detectFrame;
  }, [runInference, detectFrame]);

  useEffect(() => {
    if (isScanning && modelLoaded) {
      loopActive.current = true;
      lastFpsTimeRef.current = Date.now();
      requestRef.current = requestAnimationFrame(() => detectFrameRef.current());
      runInferenceRef.current();
    } else {
      loopActive.current = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    }

    return () => {
      loopActive.current = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isScanning, modelLoaded, detectFrame, runInference]);

  useEffect(() => {
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      unloadModel();
    };
  }, [unloadModel]);

  const handleCameraError = useCallback(
    (err: string | DOMException) => {
      const name = typeof err === 'string' ? err : err.name;
      let errorMsg =
        'Permission Denied. Please click the camera icon in your address bar to allow browser access.';
      if (name === 'NotReadableError') {
        errorMsg =
          'Camera in use by another application or tab. Please close other software and retry.';
      }
      setPermissionError(errorMsg);
      addLog(`CAMERA ERROR: ${name || 'ACCESS DENIED'}`, 'error');
      setIsScanning(false);
      unloadModel();
    },
    [addLog, unloadModel],
  );

  const toggleScanner = async () => {
    if (isScanning) {
      setIsScanning(false);
      firstSweepDoneRef.current = false;
      setSweepMs(null);
      predictionsRef.current = [];
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      unloadModel();
      addLog('SCANNER ENGAGED OFFLINE', 'init');
    } else {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setPermissionError(
          'Mobile browsers require HTTPS for camera access. Deploy the app over HTTPS or use a secure tunnel (e.g. ngrok).',
        );
        addLog('MOBILE CAMERA REQUIRES HTTPS — open via https:// or localhost', 'error');
        return;
      }

      setPermissionError(null);
      setIsScanning(true);
      addLog('REAL-TIME DIAGNOSTICS INITIATED', 'init');
      await loadModel();
    }
  };

  const captureScreenshot = () => {
    vibrate([50, 50, 50]);
    if (!webcamRef.current?.video || !canvasRef.current) return;

    const video = webcamRef.current.video;
    const overlayCanvas = canvasRef.current;

    const saveCanvas = document.createElement('canvas');
    saveCanvas.width = video.videoWidth;
    saveCanvas.height = video.videoHeight;
    const saveCtx = saveCanvas.getContext('2d');
    if (!saveCtx) return;

    saveCtx.drawImage(video, 0, 0, saveCanvas.width, saveCanvas.height);

    if (hudVisibleRef.current) {
      saveCtx.drawImage(
        overlayCanvas,
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height,
        0,
        0,
        saveCanvas.width,
        saveCanvas.height,
      );
    }

    try {
      const dataUrl = saveCanvas.toDataURL('image/jpeg', 0.9);
      const uniqueLabels = Array.from(
        new Set(predictionsRef.current.map((p) => getSciFiLabel(p.class))),
      );

      const newCapture: Capture = {
        id: Date.now().toString(),
        dataUrl,
        timestamp: Date.now(),
        labels: uniqueLabels,
      };

      setCaptures((prev) => [newCapture, ...prev].slice(0, MAX_CAPTURES));
      addLog('SNAPSHOT SAVED TO GALLERY', 'success');

      const flash = document.createElement('div');
      flash.className =
        'fixed inset-0 bg-white z-[200] opacity-100 pointer-events-none transition-opacity duration-300';
      document.body.appendChild(flash);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          flash.classList.add('opacity-0');
          flash.classList.remove('opacity-100');
          setTimeout(() => document.body.removeChild(flash), 300);
        });
      });
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('Snapshot extraction faulted: ', e);
      }
      addLog('SNAP FAULT: RESOURCE LOCKED', 'error');
    }
  };

  return (
    <div className="w-full h-full relative">
      <div
        className="absolute inset-0 z-0 flex flex-col items-center justify-center p-6 text-center bg-oil-black transition-all duration-300"
        style={{
          backgroundImage: !isScanning
            ? 'linear-gradient(rgba(12, 12, 12, 0.35), rgba(12, 12, 12, 0.45)), url("/patterns_1.jpg")'
            : 'none',
          backgroundRepeat: 'repeat',
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      >
        {!isScanning && !isLoading && (
          <div className="max-w-md p-8 border border-white/10 glass-panel rounded-2xl flex flex-col items-center shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-5 text-off-white animate-pulse border border-white/5">
              <CameraOff className="w-7 h-7 opacity-70 text-neon-green" />
            </div>
            <h2 className="font-mono text-lg font-bold tracking-widest text-off-white mb-2 uppercase">
              LENS TERMINAL
            </h2>
            <p className="text-xs text-gray-400 font-sans mb-6 max-w-sm leading-relaxed">
              Press "START SCANNER" to trigger local webcam diagnostics. Your video remains 100%
              private and processed on device.
            </p>
            <button
              onClick={toggleScanner}
              className="px-6 py-3 bg-white text-black font-semibold font-mono text-xs rounded-xl hover:bg-white/90 transition-all border border-white shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 tracking-widest duration-150 cursor-pointer uppercase"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              START SCANNER
            </button>
          </div>
        )}
      </div>

      {isScanning && (
        <div className="absolute inset-0 z-10 w-full h-full overflow-hidden flex items-center justify-center bg-black">
          <div
            className="w-full h-full transition-transform duration-200 ease-out flex items-center justify-center"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
            }}
          >
            <Webcam
              audio={false}
              ref={webcamRef}
              mirrored={facingMode === 'user'}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                ...MOBILE_VIDEO_CONSTRAINTS,
                facingMode,
              }}
              onUserMediaError={handleCameraError}
              className="w-full h-full object-cover"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div className="absolute inset-0 bg-black/10 z-20 pointer-events-none" />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover z-30 pointer-events-none"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      )}

      {isScanning && isLoading && (
        <div className="fixed top-36 left-4 right-4 z-80 mx-auto max-w-md glass-panel border border-white/10 rounded-2xl p-4 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.8)] pointer-events-none">
          <Loader2 className="w-5 h-5 text-neon-green animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] text-gray-300 tracking-widest uppercase truncate">
              Loading model — camera preview is live
            </p>
            {downloadProgress > 0 && downloadProgress < 100 && (
              <>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-neon-green transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="font-mono text-[9px] text-gray-500 mt-1">{downloadProgress}%</p>
              </>
            )}
          </div>
        </div>
      )}

      {!isScanning && isLoading && (
        <div className="absolute inset-0 z-40 bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-white animate-spin mb-4" />
          <p className="font-mono text-gray-400 text-xs tracking-widest animate-pulse uppercase">
            CONFIGURING neural PIPELINE...
          </p>
        </div>
      )}

      {permissionError && !isScanning && (
        <div className="absolute inset-0 z-40 bg-black/95 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md">
          <div className="max-w-md p-6 border border-red-500/20 bg-red-950/20 rounded-xl flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="font-mono text-sm font-bold tracking-widest text-off-white mb-2 uppercase">
              CAMERA ACCESS RESTRICTED
            </h3>
            <p className="text-xs text-gray-300 font-sans mb-6 leading-relaxed">{permissionError}</p>
            <div className="flex gap-4">
              <button
                onClick={toggleScanner}
                className="px-5 py-2 bg-white text-black font-semibold font-mono text-xs rounded-xl hover:bg-white/90 transition-all border border-white flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                RETRY PERMISSION
              </button>
              <button
                onClick={() => setPermissionError(null)}
                className="px-4 py-2 border border-white/20 hover:border-white/40 text-gray-300 font-mono text-xs rounded-xl transition-colors"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {isScanning && hudVisible && (
        <div className="fixed top-20 left-4 md:left-8 z-40 flex flex-wrap items-center gap-3">
          <div className="glass-panel px-3.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
            </span>
            <span className="font-mono text-[10px] md:text-sm font-bold text-off-white tracking-widest uppercase">
              SCANNING ACTIVE
            </span>
          </div>

          <div
            className={`glass-panel px-3.5 py-1.5 rounded-lg border flex items-center gap-2 duration-150 ${adaptiveThrottleActive ? 'border-red-500/30 text-red-400 bg-red-950/20' : 'border-white/10 text-off-white bg-black/40'}`}
          >
            <span className="font-mono text-[10px] md:text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
              RENDER: {currentFps} FPS
              {adaptiveThrottleActive && (
                <span className="text-[9px] animate-pulse text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded ml-1 font-black leading-none">
                  ECO ACTIVE
                </span>
              )}
            </span>
          </div>

          {sweepMs !== null && (
            <div
              className={`glass-panel px-3.5 py-1.5 rounded-lg border flex items-center gap-2 ${sweepMs > 4000 ? 'border-yellow-500/30 text-yellow-300' : 'border-white/10 text-off-white'}`}
            >
              <span className="font-mono text-[10px] md:text-xs font-bold tracking-widest uppercase">
                SWEEP: {(sweepMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {zoom > 1.0 && (
            <div className="glass-panel px-3.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5 text-neon-green">
              <ZoomIn className="w-3.5 h-3.5 animate-pulse text-neon-green" />
              <span className="font-mono text-[10px] md:text-xs font-bold tracking-widest uppercase text-neon-green">
                ZOOM: {zoom.toFixed(1)}X
              </span>
            </div>
          )}
        </div>
      )}

      {isScanning && (
        <div className="fixed top-20 right-4 md:right-8 z-40 flex items-center gap-2">
          <button
            onClick={() => setHudVisible(!hudVisible)}
            className={`p-2.5 glass-panel border rounded-xl duration-150 cursor-pointer ${hudVisible ? 'text-neon-green border-neon-green/35 bg-neon-green/5' : 'text-off-white border-white/15 hover:text-neon-green hover:border-white/30'}`}
            title={hudVisible ? 'Hide Overlays' : 'Show Overlays'}
          >
            {hudVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {hudVisible && (
            <button
              onClick={() => setShowControls(!showControls)}
              className={`p-2.5 glass-panel border rounded-xl duration-150 cursor-pointer ${showControls ? 'text-neon-green border-neon-green/35 bg-neon-green/5' : 'text-off-white border-white/15 hover:text-neon-green hover:border-white/30'}`}
              title="Calibration Setup"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {isScanning && hudVisible && showLogs && (
        <div className="fixed bottom-24 md:bottom-8 left-4 md:left-8 w-72 md:w-80 h-48 md:h-56 glass-panel z-40 p-4 overflow-hidden flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.8)] rounded-xl border border-white/10 transition-all duration-300">
          <div className="font-mono text-xs font-bold text-off-white border-b border-white/10 pb-2 mb-3 tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold uppercase tracking-wider text-off-white">
              <List className="w-3.5 h-3.5 opacity-80" />
              DETECTION LOGS
            </span>
            <button
              onClick={() => setShowLogs(false)}
              className="text-gray-400 hover:text-white font-mono text-[9px] border border-white/10 px-1.5 py-0.5 rounded-xl cursor-pointer duration-100 uppercase"
            >
              CLOSE
            </button>
          </div>
          <div className="flex-1 overflow-y-auto font-sans text-sm text-gray-200 pr-1 custom-scrollbar flex flex-col gap-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex justify-between items-start text-xs md:text-sm py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 rounded px-1 transition-colors duration-100"
              >
                <span className="text-gray-500 font-mono shrink-0 mr-2 text-[10px]">
                  [{log.time}]
                </span>
                <span
                  className={`flex-1 wrap-break-word font-bold uppercase tracking-wide ${log.type === 'init' ? 'text-gray-400 font-mono text-xs normal-case' : log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'success' ? 'text-neon-green font-bold' : 'text-gray-100'}`}
                >
                  {log.text}
                </span>
                {log.confidence !== undefined && (
                  <span
                    className={
                      log.type === 'unidentified'
                        ? 'text-red-400 ml-2 font-mono text-xs'
                        : 'text-neon-green font-mono ml-2 font-black text-xs'
                    }
                  >
                    [{log.confidence}%]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isScanning && hudVisible && showControls && (
        <CalibrationPanel
          scanInterval={scanInterval}
          threshold={threshold}
          zoom={zoom}
          facingMode={facingMode}
          showLogs={showLogs}
          voiceEnabled={voiceEnabled}
          hasMultipleCameras={hasMultipleCameras}
          onScanIntervalChange={setScanInterval}
          onThresholdChange={setThreshold}
          onZoomChange={setZoom}
          onFacingModeToggle={() =>
            setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
          }
          onShowLogsToggle={() => setShowLogs((prev) => !prev)}
          onVoiceEnabledToggle={() => setVoiceEnabled((prev) => !prev)}
          onClose={() => setShowControls(false)}
        />
      )}

      {isScanning && (
        <div className="fixed bottom-8 left-0 right-0 z-40 flex flex-col items-center justify-center px-4">
          <div className="flex items-center justify-between w-full max-w-[320px] sm:max-w-[380px] mx-auto glass-panel p-2 rounded-4xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <CaptureThumbnail captures={captures} onOpen={() => setIsGalleryOpen(true)} />

            <button
              onClick={captureScreenshot}
              className="w-[72px] h-[72px] rounded-full bg-transparent border-4 border-white/80 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer shrink-0"
            >
              <div className="w-[56px] h-[56px] bg-white rounded-full transition-transform active:scale-90 shadow-lg" />
            </button>

            <button
              onClick={toggleScanner}
              disabled={isLoading}
              className="w-14 h-14 rounded-full bg-black/80 text-off-white hover:bg-white hover:text-black border-2 border-white/20 hover:border-white flex flex-col items-center justify-center shadow-[0_4px_32px_rgba(0,0,0,0.85)] duration-200 cursor-pointer shrink-0"
              title="Stop Scanner"
            >
              <Square className="w-5 h-5 fill-current text-current" />
            </button>
          </div>
        </div>
      )}

      <CaptureGallery
        isOpen={isGalleryOpen}
        captures={captures}
        onClose={() => setIsGalleryOpen(false)}
      />
    </div>
  );
}
