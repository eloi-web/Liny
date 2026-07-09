import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import {
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
import { detectObjects, retuneDetector } from '../utils/detector';
import { drawSketchyBoxes, getSciFiLabel, hasActiveAnimations, Prediction } from '../utils/draw';
import { speakObject } from '../utils/speech';

const MAX_CAPTURES = 20;

const IS_MOBILE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// Smaller capture on phones cuts JPEG encode cost and worker preprocessing.
const CAPTURE_MAX_DIM = IS_MOBILE ? 384 : 640;
// Results older than this describe a frame the user has already moved away from.
const STALE_PREDICTIONS_MS = 3000;
// Sweeps slower than this trigger a resolution downgrade and mute voice announcements.
const SLOW_SWEEP_MS = 2500;

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
  const predictionsTimestampRef = useRef(0);
  const predictionsVersionRef = useRef(0);
  const lastDrawnVersionRef = useRef(-1);
  const overlayDirtyRef = useRef(false);
  const overlayClearedRef = useRef(true);
  const lastPassMsRef = useRef(0);
  const retunePendingRef = useRef(false);
  const retuneAtFloorRef = useRef(false);
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
    overlayDirtyRef.current = true;
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
    (predictions: Prediction[], allowVoice: boolean) => {
      if (!isScanning) return;

      const now = Date.now();
      predictions.forEach((pred) => {
        const friendlyLabel = getSciFiLabel(pred.class);
        if (allowVoice) {
          speakObject(pred.class, voiceEnabledRef.current, `Target identified: ${friendlyLabel}`);
        }

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

        let targetWidth = video.videoWidth;
        let targetHeight = video.videoHeight;

        if (targetWidth > CAPTURE_MAX_DIM || targetHeight > CAPTURE_MAX_DIM) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight / targetWidth) * CAPTURE_MAX_DIM);
            targetWidth = CAPTURE_MAX_DIM;
          } else {
            targetWidth = Math.round((targetWidth / targetHeight) * CAPTURE_MAX_DIM);
            targetHeight = CAPTURE_MAX_DIM;
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
          predictionsTimestampRef.current = Date.now();
          predictionsVersionRef.current++;
          const passMs = Date.now() - sweepStart;
          lastPassMsRef.current = passMs;
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

          // Auto-downgrade model input resolution when the device cannot keep up.
          if (passMs > SLOW_SWEEP_MS && !retuneAtFloorRef.current && !retunePendingRef.current) {
            retunePendingRef.current = true;
            retuneDetector((info) => {
              retunePendingRef.current = false;
              retuneAtFloorRef.current = info.atFloor;
              addLog(
                `ECO VISION MODE — INPUT RESOLUTION REDUCED TO ${info.shortestEdge}px`,
                'unidentified',
              );
            });
          }

          processPredictionsLogs(rawPredictions, passMs <= SLOW_SWEEP_MS);
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

    // On slow devices, give the CPU breathing room between sweeps so the
    // camera and UI stay responsive instead of freezing back-to-back.
    const nextDelay = Math.max(effectiveScanInterval, lastPassMsRef.current / 2);

    setTimeout(() => runInferenceRef.current(), nextDelay);
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
        overlayDirtyRef.current = true;
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
      const predictionsAge = Date.now() - predictionsTimestampRef.current;
      const isStale = predictionsTimestampRef.current === 0 || predictionsAge > STALE_PREDICTIONS_MS;

      if (!hudVisibleRef.current || isStale) {
        // Clear outdated boxes once instead of drawing what the camera saw seconds ago.
        if (!overlayClearedRef.current) {
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          overlayClearedRef.current = true;
          lastDrawnVersionRef.current = predictionsVersionRef.current;
          overlayDirtyRef.current = false;
        }
      } else {
        // Rough.js path generation is expensive; redraw only when something changed
        // or a lock-on entry animation is in progress, not on every rAF tick.
        const needsRedraw =
          overlayDirtyRef.current ||
          lastDrawnVersionRef.current !== predictionsVersionRef.current ||
          hasActiveAnimations();

        if (needsRedraw) {
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

          drawSketchyBoxes(canvas, scaled);
          overlayClearedRef.current = false;
          overlayDirtyRef.current = false;
          lastDrawnVersionRef.current = predictionsVersionRef.current;
        }
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
      predictionsTimestampRef.current = 0;
      predictionsVersionRef.current = 0;
      lastDrawnVersionRef.current = -1;
      overlayClearedRef.current = true;
      lastPassMsRef.current = 0;
      retunePendingRef.current = false;
      retuneAtFloorRef.current = false;
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
        className="absolute inset-0 z-0 flex flex-col justify-end bg-oil-black transition-all duration-300 bg-no-repeat bg-center bg-cover md:bg-contain md:bg-right"
        style={{
          backgroundImage: !isScanning
            ? 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0.35) 100%), url("/home-bg.png")'
            : 'none',
        }}
      >
        {!isScanning && !isLoading && (
          <div className="w-full max-w-2xl px-6 md:px-12 pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1.5rem))] md:pb-20 flex flex-col items-start text-left">
            <h1 className="font-boxlines text-6xl md:text-8xl text-off-white leading-none mb-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
              LINY
            </h1>
            <p className="text-sm md:text-base text-gray-300 font-sans mb-8 max-w-md leading-relaxed">
              Real-time object detection through your camera. Your video remains 100% private and
              processed on device.
            </p>
            <button
              onClick={toggleScanner}
              className="w-full sm:w-[450px] h-12 px-10 bg-white text-black font-semibold font-mono text-sm rounded-full hover:bg-white/90 transition-all border border-white flex items-center justify-center gap-2 tracking-wide duration-150 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start scanner
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
