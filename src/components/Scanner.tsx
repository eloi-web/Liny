import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { 
  Camera, 
  CameraOff, 
  Volume2, 
  VolumeX, 
  Sliders, 
  List, 
  Play, 
  Square, 
  ShieldAlert,
  Loader2,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  Download,
  ZoomIn,
  ZoomOut,
  X,
  Sparkles,
  Cpu,
  Atom,
  Info,
  Activity,
  Gauge,
  Thermometer
} from 'lucide-react';
import { drawSketchyBoxes, Prediction, getSciFiLabel } from '../utils/draw';
import { speakObject } from '../utils/speech';

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
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

interface Capture {
  id: string;
  dataUrl: string;
  timestamp: number;
  labels: string[];
}

export default function Scanner() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  
  const [modelLoaded, setModelLoaded] = useState(false);
  const [scanInterval, setScanInterval] = useState(250); // defaults to 250ms (smooth for mobile)
  
  const [isScanning, setIsScanning] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([{
    id: 0, 
    time: new Date().toTimeString().split(' ')[0], 
    text: 'SYSTEM INITIALIZED & READY', 
    type: 'init'
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [showLogs, setShowLogs] = useState(true);
  const [showControls, setShowControls] = useState(false); // Close settings by default on launch
  const [hudVisible, setHudVisible] = useState(true);
  
  // Adaptive Performance Metrics
  const [currentFps, setCurrentFps] = useState<number>(60);
  const [adaptiveThrottleActive, setAdaptiveThrottleActive] = useState<boolean>(false);

  // Performance-critical state synchronization to eliminate double loops & lag on change:
  const thresholdRef = useRef(50);
  const voiceEnabledRef = useRef(false);
  const scanIntervalRef = useRef(250);
  const loopActive = useRef(false);
  const lastScanTime = useRef<number>(0);
  const requestRef = useRef<number | null>(null);
  const lastLogTime = useRef<Record<string, number>>({});
  
  // FPS Calculations References
  const lastFpsTimeRef = useRef<number>(Date.now());
  const frameCountRef = useRef<number>(0);

  // Performance-critical Deep Neural network context states and caching
  const localModelRef = useRef<any>(null);
  const localModelLoadingRef = useRef<boolean>(false);
  const inferenceBusyRef = useRef<boolean>(false);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const predictionsRef = useRef<Prediction[]>([]);

  // HUD Visible Ref
  const hudVisibleRef = useRef(true);
  useEffect(() => { hudVisibleRef.current = hudVisible; }, [hudVisible]);

  // Real-time synchronization of state pointers with active loop refs:
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { scanIntervalRef.current = scanInterval; }, [scanInterval]);

  // Global haptic feedback for all interactive elements
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('.cursor-pointer') || target.closest('input[type="range"]')) {
        vibrate(10); // Light tick for interactions
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  // Handle document.body class to cleanly fade out the header and avoid overlapping z-index bugs on mobile
  useEffect(() => {
    if (showControls) {
      document.body.classList.add('calibration-open');
    } else {
      document.body.classList.remove('calibration-open');
    }
    return () => {
      document.body.classList.remove('calibration-open');
    };
  }, [showControls]);

  // Check camera sources on mount to enable rear/front flip toggles
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        if (videoInputs.length > 1) {
          setHasMultipleCameras(true);
        }
      }).catch(err => {
        console.warn('Device enumeration failed:', err);
      });
    }
  }, []);

  const addLog = useCallback((text: string, type: 'detect' | 'init' | 'unidentified' | 'error', confidence?: number) => {
    setLogs(prev => {
      const now = new Date().toTimeString().split(' ')[0];
      const newLog = { id: Date.now() + Math.random(), time: now, text, type, confidence };
      return [newLog, ...prev].slice(0, 50); // limit to last 50
    });
  }, []);

  const processPredictionsLogs = useCallback((rawPredictions: Prediction[]) => {
    if (!isScanning) return;

    const filtered = rawPredictions.filter(p => (p.score * 100) >= thresholdRef.current);
    const now = Date.now();
    filtered.forEach(pred => {
      const friendlyLabel = getSciFiLabel(pred.class);
      
      // Pass the fully localized friendly phrase to the sequential speech assist queue
      speakObject(pred.class, voiceEnabledRef.current, `Target identified: ${friendlyLabel}`);
      
      const lastLog = lastLogTime.current[pred.class] || 0;
      if (lastLog === 0) {
        vibrate(30); // Subtle pulse for new object
      }
      
      if (now - lastLog > 3000) {
        const displayLogText = `${friendlyLabel.toUpperCase()} IDENTIFIED`;
        addLog(displayLogText, 'detect', Math.round(pred.score * 100));
        lastLogTime.current[pred.class] = now;
      }
    });
  }, [isScanning, addLog]);

  // Hugging Face zero-shot object detection loader
  const loadLocalModel = useCallback(async () => {
    if (localModelLoadingRef.current) return;
    localModelLoadingRef.current = true;
    setIsLoading(true);
    setModelLoaded(false);
    addLog(`INITIALIZING QUANTUM ZERO-SHOT DETECTOR...`, 'init');

    try {
      addLog('PREPARING TRANSFORMERS.JS LOCAL ENGINE...', 'init');
      
      const { loadDetectorModel } = await import('../utils/detector');
      
      addLog('DOWNLOADING ZERO-SHOT TRANSFORMER WEIGHTS...', 'init');
      setDownloadProgress(0);
      const loadedModel = await loadDetectorModel((progress) => {
        if (progress.status === 'downloading') {
          // Add up progress logic or just show the latest progress
        } else if (progress.status === 'progress') {
          if (progress.progress !== undefined) {
             setDownloadProgress(Math.round(progress.progress));
          }
        } else if (progress.status === 'done') {
          addLog(`DOWNLOADED: ${progress.file}`, 'success');
        } else if (progress.status === 'initiate') {
          addLog(`INITIATING: ${progress.file}`, 'init');
        }
      });
      
      localModelRef.current = loadedModel;
      setModelLoaded(true);
      setIsLoading(false);
      addLog(`LOCK IDENTIFICATION PIPELINE FULLY CHARGED [SEGFORMER B0]`, 'init');
    } catch (err: any) {
      console.error('Transformers model load faulted:', err);
      addLog(`NEURAL COOLDOWN INITIATED: GRID INITIALIZATION FAULT - ${err.message || String(err)}`, 'error');
      setIsLoading(false);
      setModelLoaded(false);
    } finally {
      localModelLoadingRef.current = false;
    }
  }, [addLog]);

  // Independent background neural inference loop running out-of-band to prevent camera & browser stuttering
  const runInference = useCallback(async () => {
    if (!loopActive.current) return;

    const webcam = webcamRef.current;
    if (webcam && webcam.video && webcam.video.readyState === 4 && localModelRef.current && !inferenceBusyRef.current) {
      try {
        inferenceBusyRef.current = true;
        const video = webcam.video;
        
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
          
          const { detectObjects } = await import('../utils/detector');
          const rawPredictions = await detectObjects(offscreenCanvasRef.current, thresholdRef.current / 100);
          
          if (rawPredictions && rawPredictions.length > 0) {
            const { processMasks } = await import('../utils/draw');
            processMasks(rawPredictions);
          }

          predictionsRef.current = rawPredictions || [];
          
          processPredictionsLogs(rawPredictions || []);
        }
      } catch (e) {
        console.error("Transformers inference processing crashed: ", e);
      } finally {
        inferenceBusyRef.current = false;
      }
    }

    const effectiveScanInterval = adaptiveThrottleActive 
      ? Math.max(500, scanIntervalRef.current) 
      : scanIntervalRef.current;

    // Schedule next out-of-band prediction tick
    setTimeout(runInference, effectiveScanInterval);
  }, [adaptiveThrottleActive, processPredictionsLogs]);

  // Performance-optimal 60 FPS drawing and animation loop (runs unblocked by inference)
  const detectFrame = useCallback(() => {
    if (!loopActive.current) return;
    if (!webcamRef.current || !webcamRef.current.video || !canvasRef.current) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }
    
    const video = webcamRef.current.video;
    if (video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }
    
    const canvas = canvasRef.current;

    // Auto-update canvas resolution matching physical container display size
    if (video.clientWidth > 0 && video.clientHeight > 0) {
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
    }

    // Monitor real-time main-thread FPS to adapt dynamically to thermals & hardware
    frameCountRef.current++;
    const fpsNow = Date.now();
    const elapsed = fpsNow - lastFpsTimeRef.current;
    if (elapsed >= 1000) {
      const calculatedFps = Math.round((frameCountRef.current * 1000) / elapsed);
      setCurrentFps(calculatedFps);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = fpsNow;

      // Adaptive throttle scaling
      if (calculatedFps < 55) {
        if (!adaptiveThrottleActive) {
          setAdaptiveThrottleActive(true);
          addLog('FRAME JITTER TRIGGERED (FPS < 55) — COOLDOWN ECO ACTIVE [500ms]', 'unidentified');
        }
      } else if (calculatedFps >= 57) {
        if (adaptiveThrottleActive) {
          setAdaptiveThrottleActive(false);
          addLog('STABLE INTERACTIVE FRAME RATE COMMITTED — SCAN MULTIPLIER RECOVERED', 'init');
        }
      }
    }

    // Map the latest out-of-band coordinates to current 60fps canvas size and draw
    const offscreen = offscreenCanvasRef.current;
    if (canvas.width > 0 && canvas.height > 0 && offscreen && offscreen.width > 0) {
      const scaleX = canvas.width / offscreen.width;
      const scaleY = canvas.height / offscreen.height;
      const rawPredictions = predictionsRef.current || [];

      const scaled = rawPredictions.map(pred => {
        let scaledBbox: [number, number, number, number] | undefined = undefined;
        if (pred.bbox) {
          scaledBbox = [
            pred.bbox[0] * scaleX,
            pred.bbox[1] * scaleY,
            pred.bbox[2] * scaleX,
            pred.bbox[3] * scaleY
          ];
        }
        
        return {
          ...pred,
          bbox: scaledBbox,
          scaleX,
          scaleY
        };
      });

      const filtered = scaled.filter(p => (p.score * 100) >= thresholdRef.current);
      
      if (hudVisibleRef.current) {
        drawSketchyBoxes(canvas, filtered);
      } else {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    
    if (loopActive.current) {
      requestRef.current = requestAnimationFrame(detectFrame);
    }
  }, [adaptiveThrottleActive, addLog]);

  useEffect(() => {
    if (isScanning && modelLoaded) {
      loopActive.current = true;
      requestRef.current = requestAnimationFrame(detectFrame);
      // Run the background non-blocking inference loop
      runInference();
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

  // Request native permission explicitly before mounting stream to avoid silent blocks
  const requestCameraPermissionDirectly = async (): Promise<boolean> => {
    try {
      addLog('REQUESTING PRIVACY CONSENT...', 'init');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } });
      // Stop stream immediately as we just wanted to prompt the permission window
      stream.getTracks().forEach(track => track.stop());
      setPermissionError(null);
      return true;
    } catch (err: any) {
      console.error("Camera access failed", err);
      let errorMsg = "Permission Denied. Please click the camera icon in your address bar to allow browser access.";
      if (err.name === 'NotReadableError') {
        errorMsg = "Camera in use by another application or tab. Please close other software and retry.";
      }
      setPermissionError(errorMsg);
      addLog(`CAMERA ERROR: ${err.name || 'ACCESS DENIED'}`, 'error');
      return false;
    }
  };

  // Dynamic hot-swap of SSD model when changed by the user in settings
  useEffect(() => {
    if (isScanning) {
      loadLocalModel();
    }
  }, [isScanning, loadLocalModel]);

  // Clean refs when scan halts or unmounts completely
  useEffect(() => {
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const toggleScanner = async () => {
    if (isScanning) {
      setIsScanning(false);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      addLog('SCANNER ENGAGED OFFLINE', 'init');
    } else {
      setIsLoading(true);
      
      // Explicitly request video stream to trigger browser prompt
      const hasPermission = await requestCameraPermissionDirectly();
      if (!hasPermission) {
        setIsLoading(false);
        return;
      }

      setIsScanning(true);
      addLog('REAL-TIME DIAGNOSTICS INITIATED', 'init');
      
      await loadLocalModel();
    }
  };

  const captureScreenshot = () => {
    vibrate([50, 50, 50]); // Double buzz on capture
    if (!webcamRef.current || !webcamRef.current.video || !canvasRef.current) return;
    const video = webcamRef.current.video;
    const overlayCanvas = canvasRef.current;

    const saveCanvas = document.createElement('canvas');
    saveCanvas.width = video.videoWidth;
    saveCanvas.height = video.videoHeight;
    const saveCtx = saveCanvas.getContext('2d');
    if (!saveCtx) return;

    // Draw video frame
    saveCtx.drawImage(video, 0, 0, saveCanvas.width, saveCanvas.height);

    // Draw canvas sketches overlay if HUD is visible
    if (hudVisibleRef.current) {
      saveCtx.drawImage(overlayCanvas, 0, 0, saveCanvas.width, saveCanvas.height);
    }

    try {
      const dataUrl = saveCanvas.toDataURL('image/jpeg', 0.9);
      
      const currentLabels = (predictionsRef.current || [])
        .filter(p => (p.score * 100) >= thresholdRef.current)
        .map(p => getSciFiLabel(p.class));
        
      const uniqueLabels = Array.from(new Set(currentLabels));

      const newCapture: Capture = {
        id: Date.now().toString(),
        dataUrl,
        timestamp: Date.now(),
        labels: uniqueLabels
      };

      setCaptures(prev => [newCapture, ...prev]);
      addLog('SNAPSHOT SAVED TO GALLERY', 'success');
      
      // Flash effect
      const flash = document.createElement('div');
      flash.className = 'fixed inset-0 bg-white z-[200] opacity-100 pointer-events-none transition-opacity duration-300';
      document.body.appendChild(flash);
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          flash.classList.add('opacity-0');
          flash.classList.remove('opacity-100');
          setTimeout(() => document.body.removeChild(flash), 300);
        });
      });
      
    } catch (e) {
      console.error('Snapshot extraction faulted: ', e);
      addLog('SNAP FAULT: RESOURCE LOCKED', 'error');
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* Background Layer (Camera Offline State) */}
      <div 
        className="absolute inset-0 z-0 flex flex-col items-center justify-center p-6 text-center bg-[#0C0C0C] transition-all duration-300"
        style={{
          backgroundImage: !isScanning ? 'linear-gradient(rgba(12, 12, 12, 0.35), rgba(12, 12, 12, 0.45)), url("/patterns_1.jpg")' : 'none',
          backgroundRepeat: 'repeat',
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      >
        {!isScanning && !isLoading && (
          <div className="max-w-md p-8 border border-white/10 glass-panel rounded-2xl flex flex-col items-center shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-5 text-off-white animate-pulse border border-white/5">
              <CameraOff className="w-7 h-7 opacity-70 text-neon-green" />
            </div>
            <h2 className="font-mono text-lg font-bold tracking-widest text-off-white mb-2 uppercase">LENS TERMINAL</h2>
            <p className="text-xs text-gray-400 font-sans mb-6 max-w-sm leading-relaxed">
              Press "START SCANNER" to trigger local webcam diagnostics. Your video remains 100% private and processed on device.
            </p>
            <button 
              onClick={toggleScanner}
              className="px-6 py-3 bg-white text-black font-semibold font-mono text-xs rounded-xl hover:bg-white/90 transition-all border border-white shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 tracking-widest duration-150 cursor-pointer uppercase font-bold"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              START SCANNER
            </button>
          </div>
        )}
      </div>

      {/* Video & Canvas Overlay */}
      {isScanning && (
        <div className="absolute inset-0 z-10 w-full h-full overflow-hidden flex items-center justify-center bg-black">
          <div 
            className="w-full h-full transition-transform duration-200 ease-out flex items-center justify-center"
            style={{ 
              transform: `scale(${zoom})`, 
              transformOrigin: 'center center',
              width: '100%',
              height: '100%'
            }}
          >
            {/* @ts-ignore */}
            <Webcam 
              audio={false}
              ref={webcamRef} 
              mirrored={facingMode === 'user'}
              screenshotFormat="image/jpeg"
              videoConstraints={{ 
                facingMode: facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: 1.777777778
              }}
              className="w-full h-full object-cover"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Transparent high contrast overlay */}
            <div className="absolute inset-0 bg-black/10 z-20 pointer-events-none" />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover z-30 pointer-events-none"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-40 bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-white animate-spin mb-4" />
          <p className="font-mono text-gray-400 text-xs tracking-widest animate-pulse uppercase">CONFIGURING neural PIPELINE...</p>
          {downloadProgress > 0 && downloadProgress < 100 && (
            <div className="w-64 mt-4">
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
              </div>
              <p className="font-mono text-[10px] text-gray-500 text-center mt-2">DOWNLOADING MODEL WEIGHTS: {downloadProgress}%</p>
            </div>
          )}
        </div>
      )}

      {/* Permission Refusal Overlay */}
      {permissionError && !isScanning && (
        <div className="absolute inset-0 z-40 bg-black/95 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md">
          <div className="max-w-md p-6 border border-red-500/20 bg-red-950/20 rounded-xl flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="font-mono text-sm font-bold tracking-widest text-off-white mb-2 uppercase font-mono">CAMERA ACCESS RESTRICTED</h3>
            <p className="text-xs text-gray-300 font-sans mb-6 leading-relaxed">
              {permissionError}
            </p>
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

      {/* Quick Status Bar Overlays (Rendered when HUD is visible) */}
      {isScanning && hudVisible && (
        <div className="fixed top-20 left-4 md:left-8 z-40 flex flex-wrap items-center gap-3">
          <div className="glass-panel px-3.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green"></span>
            </span>
            <span className="font-mono text-[10px] md:text-sm font-bold text-off-white tracking-widest uppercase">
              SCANNING ACTIVE
            </span>
          </div>

          {/* Real-time main-thread frame timings & auto-throttle eco states */}
          <div className={`glass-panel px-3.5 py-1.5 rounded-lg border flex items-center gap-2 duration-150 ${adaptiveThrottleActive ? 'border-red-500/30 text-red-400 bg-red-950/20' : 'border-white/10 text-off-white bg-black/40'}`}>
            <span className="font-mono text-[10px] md:text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
              RENDER: {currentFps} FPS
              {adaptiveThrottleActive && (
                <span className="text-[9px] animate-pulse text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded ml-1 font-black leading-none">
                  ECO ACTIVE
                </span>
              )}
            </span>
          </div>

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



      {/* Quick Settings Gear Controller: Beautiful buttons floating in Top Right */}
      {isScanning && (
        <div className="fixed top-20 right-4 md:right-8 z-40 flex items-center gap-2">
          {/* Complete HUD Toggle */}
          <button 
            onClick={() => setHudVisible(!hudVisible)}
            className={`p-2.5 glass-panel border rounded-xl duration-150 cursor-pointer ${hudVisible ? 'text-neon-green border-neon-green/35 bg-neon-green/5' : 'text-off-white border-white/15 hover:text-neon-green hover:border-white/30'}`}
            title={hudVisible ? "Hide Overlays" : "Show Overlays"}
          >
            {hudVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Unified Calibration Setup Gear Icon */}
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

      {/* Left Aligned Collapsible Log Panel */}
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
              <div key={log.id} className="flex justify-between items-start text-xs md:text-sm py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 rounded px-1 transition-colors duration-100">
                <span className="text-gray-500 font-mono flex-shrink-0 mr-2 text-[10px]">[{log.time}]</span>
                <span className={`flex-1 break-words font-bold uppercase tracking-wide ${log.type === 'init' ? 'text-gray-400 font-mono text-xs normal-case' : log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'success' ? 'text-neon-green font-bold' : 'text-gray-100'}`}>
                  {log.text}
                </span>
                {log.confidence !== undefined && (
                  <span className={log.type === 'unidentified' ? 'text-red-400 ml-2 font-mono text-xs' : 'text-neon-green font-mono ml-2 font-black text-xs'}>
                    [{log.confidence}%]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Centered Scrollable Calibration Dialog (Fully responsive, centers safely, easily scrollable) */}
      {isScanning && hudVisible && showControls && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm md:max-w-md glass-panel border border-white/10 rounded-2xl p-5 md:p-6 shadow-[0_8px_40px_rgba(0,0,0,0.95)] flex flex-col max-h-[85vh] overflow-y-auto custom-scrollbar text-off-white space-y-5" id="calibration-modal">
            {/* Header */}
            <div className="font-mono text-xs font-bold text-off-white border-b border-white/10 pb-3 flex items-center justify-between tracking-widest">
              <span className="flex items-center gap-2 text-neon-green font-bold uppercase">
                <Sliders className="w-4 h-4 text-neon-green" />
                CALIBRATION SETUP
              </span>
              <button 
                onClick={() => setShowControls(false)}
                className="text-gray-400 hover:text-white duration-100 cursor-pointer p-1 hover:bg-white/5 rounded-md"
                title="Close Calibration"
              >
                <X className="w-5 h-5 text-off-white" />
              </button>
            </div>

            {/* NEURAL MODEL SELECTION */}
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center font-mono text-xs font-bold tracking-wider text-off-white">
                <span className="opacity-80 uppercase font-mono">Detection Pipeline</span>
                <span className="text-neon-green font-bold uppercase font-mono">SEGFORMER B0</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-snug font-sans">
                Currently running Hugging Face Transformers SegFormer B0 for Image Segmentation.
              </p>
            </div>

            {/* SCAN TICK PULSE FREQUENCY */}
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
                    onClick={() => setScanInterval(ms)}
                    className={`py-1.5 text-[9px] font-mono font-bold rounded-xl duration-150 uppercase cursor-pointer border ${scanInterval === ms ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.15)]' : 'bg-transparent text-gray-300 border-white/10 hover:border-white/30'}`}
                  >
                    {ms === 100 ? '100ms (High)' : ms === 250 ? '250ms (Mid)' : '500ms (Eco)'}
                  </button>
                ))}
              </div>
            </div>

            {/* DIGITAL TELESCOPE DEVIATION (ZOOM) */}
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
                  onClick={() => setZoom(prev => Math.max(1.0, prev - 0.5))}
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
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-3 cursor-pointer bg-white/10 accent-neon-green"
                />
                <button 
                  onClick={() => setZoom(prev => Math.min(4.0, prev + 0.5))}
                  disabled={zoom >= 4.0}
                  className="p-1 px-2.5 bg-white/5 border border-white/10 hover:border-white/30 rounded-xl text-gray-300 hover:text-white text-xs disabled:opacity-20 cursor-pointer duration-100"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>



            {/* DUAL CAMERA SECTOR FLIPPER */}
            {(hasMultipleCameras || (typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))) && (
              <div className="flex items-center justify-between py-2 border-t border-white/10 pt-2 font-mono text-xs">
                <span className="font-bold text-off-white opacity-80 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  OPTICAL SOURCE
                </span>
                <button 
                  onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                  className="px-3 py-1.5 glass-panel text-off-white hover:text-white border border-white/20 hover:border-white/40 text-[10px] font-bold rounded-xl duration-150 uppercase cursor-pointer tracking-wider"
                >
                  {facingMode === 'user' ? 'FRONT CAMERA' : 'REAR CAMERA'}
                </button>
              </div>
            )}

            {/* SECTOR LIST TOGGLES: Speech & Diagnostics Log */}
            <div className="flex flex-col space-y-3 border-t border-white/10 pt-3 font-mono">
              {/* Log Panel Enable */}
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
                  onClick={() => setShowLogs(!showLogs)}
                >
                  <div className={`absolute inset-0 border border-white/20 transition-colors duration-200 rounded-full ${showLogs ? 'bg-neon-green border-neon-green' : 'bg-[#0c0c0c]'}`} />
                  <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-transform duration-200 ${showLogs ? 'bg-black translate-x-[18px]' : 'bg-white'}`} />
                </div>
              </div>

              {/* Speak Assist Enable */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-col space-y-0.5">
                  <span className="text-xs font-bold text-off-white opacity-80 flex items-center gap-1.5">
                    {voiceEnabled ? <Volume2 className="w-3.5 h-3.5 text-neon-green" /> : <VolumeX className="w-3.5 h-3.5 opacity-55" />}
                    AUDIO ASSIST
                  </span>
                  <span className="text-[10px] text-gray-400 font-sans">Read matching targets out loud</span>
                </div>
                <div 
                  className="relative inline-block w-10 h-5 cursor-pointer select-none"
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                >
                  <div className={`absolute inset-0 border border-white/20 transition-colors duration-200 rounded-full ${voiceEnabled ? 'bg-neon-green border-neon-green' : 'bg-[#0c0c0c]'}`} />
                  <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-transform duration-200 ${voiceEnabled ? 'bg-black translate-x-[18px]' : 'bg-white'}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Low-Profile Start/Stop Trigger Console at Bottom Viewport */}
      {isScanning && (
        <div className="fixed bottom-8 left-0 right-0 z-40 flex flex-col items-center justify-center px-4">
          <div className="flex items-center justify-between w-full max-w-[320px] sm:max-w-[380px] mx-auto glass-panel p-2 rounded-[2rem] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            
            {/* Gallery Thumbnail */}
            <div 
              onClick={() => setIsGalleryOpen(true)}
              className="w-14 h-14 rounded-full overflow-hidden bg-black/80 border-2 border-white/20 cursor-pointer hover:border-white transition-colors flex-shrink-0 relative group shadow-inner"
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

            {/* Shutter Button */}
            <button 
              onClick={captureScreenshot}
              className="w-[72px] h-[72px] rounded-full bg-transparent border-[4px] border-white/80 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer flex-shrink-0"
            >
              <div className="w-[56px] h-[56px] bg-white rounded-full transition-transform active:scale-90 shadow-lg"></div>
            </button>

            {/* Stop Scanner */}
            <button 
              onClick={toggleScanner}
              disabled={isLoading}
              className="w-14 h-14 rounded-full bg-black/80 text-off-white hover:bg-white hover:text-black border-2 border-white/20 hover:border-white flex flex-col items-center justify-center shadow-[0_4px_32px_rgba(0,0,0,0.85)] duration-200 cursor-pointer flex-shrink-0"
              title="Stop Scanner"
            >
              <Square className="w-5 h-5 fill-current text-current" />
            </button>
          </div>
        </div>
      )}

      {/* Gallery Slide-up Drawer */}
      <div 
        className={`fixed inset-x-0 bottom-0 z-50 bg-[#0c0c0c] border-t border-white/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isGalleryOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: '88vh' }}
      >
        <div className="w-full h-full flex flex-col pt-3 px-5 pb-8 overflow-hidden relative">
          {/* Drawer handle */}
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-5 cursor-pointer" onClick={() => setIsGalleryOpen(false)} />
          
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-white tracking-tight uppercase font-mono flex items-center gap-2">
              <Camera className="w-5 h-5 text-neon-green" />
              CAPTURE LOG
            </h2>
            <button 
              onClick={() => setIsGalleryOpen(false)}
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
                {captures.map(capture => (
                  <div key={capture.id} className="group relative rounded-xl overflow-hidden border border-white/10 bg-[#151515] aspect-[3/4] shadow-lg">
                    <img src={capture.dataUrl} alt="Capture" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-3.5">
                      <div className="text-[10px] font-mono text-white/50 mb-2">
                        {new Date(capture.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {capture.labels.length > 0 ? capture.labels.slice(0, 3).map((label, idx) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-neon-green/10 border border-neon-green/30 text-neon-green rounded text-[9px] font-bold font-mono uppercase truncate max-w-full">
                            {label}
                          </span>
                        )) : (
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
                    {/* Download Button overlay */}
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
    </div>
  );
}
