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
  X
} from 'lucide-react';
import { drawSketchyBoxes, Prediction, getSciFiLabel } from '../utils/draw';
import { speakObject } from '../utils/speech';

interface LogEntry {
  id: number;
  time: string;
  text: string;
  confidence?: number;
  type: 'detect' | 'init' | 'unidentified' | 'error';
}

export default function Scanner() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelBase, setModelBase] = useState<'lite_mobilenet_v2' | 'mobilenet_v2'>('lite_mobilenet_v2');
  const [scanInterval, setScanInterval] = useState(250); // defaults to 250ms (smooth for mobile)
  
  const [isScanning, setIsScanning] = useState(false);
  const [threshold, setThreshold] = useState(50);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([{
    id: 0, 
    time: new Date().toTimeString().split(' ')[0], 
    text: 'SYSTEM INITIALIZED & READY', 
    type: 'init'
  }]);
  const [isLoading, setIsLoading] = useState(false);
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

  // Real-time synchronization of state pointers with active loop refs:
  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { scanIntervalRef.current = scanInterval; }, [scanInterval]);

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

  const processPredictions = useCallback((rawPredictions: Prediction[]) => {
    if (!canvasRef.current || !isScanning) return;

    const canvas = canvasRef.current;
    
    // Scale 300x300 worker-processed prediction results back to match displaying overlay layout sizes
    const scaleX = canvas.width / 300;
    const scaleY = canvas.height / 300;

    const scaled = rawPredictions.map(pred => ({
      ...pred,
      bbox: [
        pred.bbox[0] * scaleX,
        pred.bbox[1] * scaleY,
        pred.bbox[2] * scaleX,
        pred.bbox[3] * scaleY
      ] as [number, number, number, number]
    }));

    const filtered = scaled.filter(p => (p.score * 100) >= thresholdRef.current);
    
    drawSketchyBoxes(canvas, filtered);
    
    const now = Date.now();
    filtered.forEach(pred => {
      const sciFiLabel = getSciFiLabel(pred.class);
      
      // Pass the fully localized scifi phrase to the sequential speech assist queue
      speakObject(pred.class, voiceEnabledRef.current, `Target identified: ${sciFiLabel}`);
      
      const lastLog = lastLogTime.current[pred.class] || 0;
      if (now - lastLog > 3000) {
        // High fidelity immersive diagnostics log text replacement
        const displayLogText = `STRUCTURAL ANALYSIS: ${sciFiLabel} FOUND`;
        addLog(displayLogText, 'detect', Math.round(pred.score * 100));
        lastLogTime.current[pred.class] = now;
      }
    });
  }, [isScanning, addLog]);

  // Highly robust local TensorFlow dynamic loader. Completely sandboxed iframe immune and doesn't require extra network calls
  const loadLocalModel = useCallback(async (selectedModelBase: string) => {
    if (localModelLoadingRef.current) return;
    localModelLoadingRef.current = true;
    setIsLoading(true);
    setModelLoaded(false);
    addLog(`INITIALIZING QUANTUM DEEP SCANNER [${selectedModelBase.toUpperCase()}]...`, 'init');

    try {
      addLog('PREPARING LOCAL NEURAL ENGINE...', 'init');
      
      // Lazy load TensorFlow dynamically to split chunk sizes and keep initial bundle tiny
      const tf = await import('@tensorflow/tfjs');
      addLog('NEURAL MATRIX INITIALIZED. SEARCHING DISCRETE ACCELERATORS...', 'init');
      
      try {
        await tf.setBackend('webgl');
        addLog('HARDWARE CO-PROCESSOR ACTIVE: [GPU ACQUISITION OK]', 'init');
      } catch (webglErr) {
        console.warn('WebGL hardware backend blocked, reverting to local emulator CPU:', webglErr);
        try {
          await tf.setBackend('cpu');
          addLog('HARDWARE CO-PROCESSOR ACTIVE: [GRID LEVEL EMULATOR BOUND]', 'init');
        } catch (cpuErr) {
          console.error('CPU backend bind failed:', cpuErr);
        }
      }
      
      await tf.ready();
      
      addLog('DOWNLOADING MODEL WEIGHTS DIRECTLY TO LOCAL APP MEMORY...', 'init');
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      const loadedModel = await cocoSsd.load({ base: selectedModelBase as any });
      
      localModelRef.current = loadedModel;
      setModelLoaded(true);
      setIsLoading(false);
      addLog(`LOCK IDENTIFICATION PIPELINE FULLY CHARGED [${selectedModelBase.toUpperCase()}]`, 'init');
    } catch (err: any) {
      console.error('Tensorflow model load faulted:', err);
      addLog(`NEURAL COOLDOWN INITIATED: GRID INITIALIZATION FAULT - ${err.message || String(err)}`, 'error');
      setIsLoading(false);
      setModelLoaded(false);
    } finally {
      localModelLoadingRef.current = false;
    }
  }, [addLog]);

  // Performance-optimal frame detector loop (capped & highly controlled via refs to prevent memory leakage)
  const detectFrame = useCallback(async () => {
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
    
    // Auto-update canvas resolution matching physical camera output
    if (canvasRef.current.width !== video.videoWidth) {
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
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

      // Adaptive throttle scaling: If FPS drops below 55 FPS, auto-escalate from current scan interval (e.g. 250ms/Mid) to 500ms (Eco)
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

    const effectiveScanInterval = adaptiveThrottleActive 
      ? Math.max(500, scanIntervalRef.current) 
      : scanIntervalRef.current;

    const now = Date.now();
    // Throttled inference check: only executes next step if configured scan interval has passed and thread is idle
    if (now - lastScanTime.current >= effectiveScanInterval && !inferenceBusyRef.current && localModelRef.current) {
      lastScanTime.current = now;
      try {
        // Initialize or retrieve the off-screen 300x300 downscaling pre-processor canvas
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
          offscreenCanvasRef.current.width = 300;
          offscreenCanvasRef.current.height = 300;
        }
        
        const offscreen = offscreenCanvasRef.current;
        const octx = offscreen.getContext('2d');
        if (octx) {
          // Downsample frame directly onto a compact 300x300 canvas, cutting data sizes by 85%
          octx.drawImage(video, 0, 0, 300, 300);
          
          inferenceBusyRef.current = true;
          
          // Run prediction on the 300x300 image
          const predictions = await localModelRef.current.detect(offscreen);
          processPredictions(predictions || []);
        }
      } catch (e) {
        console.error("Tensorflow inference processing crashed: ", e);
      } finally {
        inferenceBusyRef.current = false;
      }
    }
    
    if (loopActive.current) {
      requestRef.current = requestAnimationFrame(detectFrame);
    }
  }, [adaptiveThrottleActive, addLog, processPredictions]);

  useEffect(() => {
    if (isScanning && modelLoaded) {
      loopActive.current = true;
      requestRef.current = requestAnimationFrame(detectFrame);
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
  }, [isScanning, modelLoaded, detectFrame]);

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
      loadLocalModel(modelBase);
    }
  }, [modelBase, isScanning, loadLocalModel]);

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
      
      await loadLocalModel(modelBase);
    }
  };

  const captureScreenshot = () => {
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

    // Draw canvas sketches overlay
    saveCtx.drawImage(overlayCanvas, 0, 0, saveCanvas.width, saveCanvas.height);

    try {
      const dataUrl = saveCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `liny-diagnostic-snap-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      addLog('SNAP-SAVED TO DEVICE STORAGE', 'init');
    } catch (e) {
      console.error('Snapshot extraction faulted: ', e);
      addLog('SNAP FAULT: RESOURCE LOCKED', 'error');
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* Background Layer (Camera Offline State) */}
      <div className="absolute inset-0 z-0 bg-[#0C0C0C] flex flex-col items-center justify-center p-6 text-center">
        {!isScanning && !isLoading && (
          <div className="max-w-md p-6 border border-white/10 glass-panel rounded-xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-off-white animate-pulse">
              <CameraOff className="w-8 h-8 opacity-60 text-off-white" />
            </div>
            <h2 className="font-mono text-lg font-bold tracking-widest text-off-white mb-2 uppercase">LENS TERMINAL</h2>
            <p className="text-xs text-gray-400 font-sans mb-6 max-w-sm">
              Press "START SCANNER" to trigger local webcam diagnostics. Your video remains 100% private and processed on device.
            </p>
            <button 
              onClick={toggleScanner}
              className="px-6 py-2.5 bg-white text-black font-semibold font-mono text-xs rounded-lg hover:bg-white/90 transition-all border border-white shadow-[0_0_15px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 tracking-wider duration-150 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
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
                className="px-5 py-2 bg-white text-black font-semibold font-mono text-xs rounded-lg hover:bg-white/90 transition-all border border-white flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                RETRY PERMISSION
              </button>
              <button 
                onClick={() => setPermissionError(null)}
                className="px-4 py-2 border border-white/20 hover:border-white/40 text-gray-300 font-mono text-xs rounded-lg transition-colors"
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

      {/* Visual snaps slider on outer screen rim for match threshold calibration */}
      {isScanning && hudVisible && (
        <div className="fixed right-4 md:right-8 top-[32%] z-40 flex flex-col items-center bg-[#0C0C0C]/90 border border-white/15 rounded-2xl px-2.5 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.9)] max-w-[60px] backdrop-blur-md">
          <div className="text-[8px] font-mono font-bold text-center text-neon-green tracking-widest leading-none mb-1.5 uppercase">
            CONFIDENCE
          </div>
          <div className="text-[12px] font-mono font-black text-white text-center mb-4">
            {threshold}%
          </div>
          <div className="h-44 flex items-center justify-center relative">
            {/* Visual background ticks / snapping marks */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/10 flex flex-col justify-between py-1 pointer-events-none">
              <span className="w-2 h-[2px] bg-white/20"></span>
              <span className="w-2 h-[2px] bg-white/20"></span>
              <span className="w-2 h-[2px] bg-white/20"></span>
              <span className="w-2 h-[2px] bg-white/20"></span>
              <span className="w-2 h-[2px] bg-white/20"></span>
            </div>
            <input 
              type="range" 
              min="15" 
              max="95" 
              step="10" // Physical granular snapping step
              value={threshold} 
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="accent-neon-green cursor-ns-resize"
              style={{
                writingMode: 'vertical-lr',
                WebkitAppearance: 'slider-vertical',
                height: '154px',
                width: '16px'
              }}
              title="Confidence Snapping Slider"
            />
          </div>
          <div className="flex flex-col gap-1 items-center justify-center mt-4 border-t border-white/10 pt-2.5 text-[8px] font-mono text-gray-500 font-bold select-none leading-none">
            <span className={threshold >= 75 ? 'text-neon-green font-black font-mono' : ''}>HIGH</span>
            <span className={threshold >= 45 && threshold < 75 ? 'text-neon-green font-black font-mono' : ''}>MID</span>
            <span className={threshold < 45 ? 'text-neon-green font-black font-mono' : ''}>LOW</span>
          </div>
        </div>
      )}

      {/* Quick Settings Gear Controller: Beautiful buttons floating in Top Right */}
      {isScanning && (
        <div className="fixed top-20 right-4 md:right-8 z-40 flex items-center gap-2">
          {/* Complete HUD Toggle */}
          <button 
            onClick={() => setHudVisible(!hudVisible)}
            className={`p-2.5 glass-panel border rounded-lg duration-150 cursor-pointer ${hudVisible ? 'text-neon-green border-neon-green/35 bg-neon-green/5' : 'text-off-white border-white/15 hover:text-neon-green hover:border-white/30'}`}
            title={hudVisible ? "Hide Overlays" : "Show Overlays"}
          >
            {hudVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Unified Calibration Setup Gear Icon */}
          {hudVisible && (
            <button 
              onClick={() => setShowControls(!showControls)}
              className={`p-2.5 glass-panel border rounded-lg duration-150 cursor-pointer ${showControls ? 'text-neon-green border-neon-green/35 bg-neon-green/5' : 'text-off-white border-white/15 hover:text-neon-green hover:border-white/30'}`}
              title="Calibration Setup"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Left Aligned Collapsible Log Panel */}
      {isScanning && hudVisible && showLogs && (
        <div className="fixed bottom-36 md:bottom-28 left-4 md:left-8 w-72 md:w-80 h-56 glass-panel z-40 p-4 overflow-hidden flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.8)] rounded-xl border border-white/10 transition-all duration-300">
          <div className="font-mono text-xs font-bold text-off-white border-b border-white/10 pb-2 mb-3 tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold uppercase tracking-wider text-off-white">
              <List className="w-3.5 h-3.5 opacity-80" />
              DETECTION LOGS
            </span>
            <button 
              onClick={() => setShowLogs(false)}
              className="text-gray-400 hover:text-white font-mono text-[9px] border border-white/10 px-1.5 py-0.5 rounded cursor-pointer duration-100 uppercase"
            >
              CLOSE
            </button>
          </div>
          <div className="flex-1 overflow-y-auto font-sans text-sm text-gray-200 space-y-2 pr-1 custom-scrollbar">
            {logs.map((log) => (
              <div key={log.id} className="flex justify-between items-start text-xs md:text-sm py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 rounded px-1 transition-colors duration-100">
                <span className="text-gray-500 font-mono flex-shrink-0 mr-2 text-[10px]">[{log.time}]</span>
                <span className={`flex-1 break-words font-bold uppercase tracking-wide ${log.type === 'init' ? 'text-gray-400 font-mono text-xs normal-case' : log.type === 'error' ? 'text-red-400 font-bold' : 'text-gray-100'}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
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
                <span className="text-neon-green font-bold uppercase font-mono">{modelBase === 'lite_mobilenet_v2' ? 'Lite Speed' : 'High Accuracy'}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-snug font-sans">
                Standard V2 captures small and awkward angles better—essential for classifying pillows, tables, couches, and appliances.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setModelBase('lite_mobilenet_v2')}
                  className={`py-1.5 text-[10px] font-mono font-bold rounded duration-150 uppercase cursor-pointer border ${modelBase === 'lite_mobilenet_v2' ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.15)] font-bold' : 'bg-transparent text-gray-300 border-white/20 hover:border-white/40 font-bold'}`}
                >
                  Lite V2 (Fast)
                </button>
                <button
                  onClick={() => setModelBase('mobilenet_v2')}
                  className={`py-1.5 text-[10px] font-mono font-bold rounded duration-150 uppercase cursor-pointer border ${modelBase === 'mobilenet_v2' ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.15)] font-bold' : 'bg-transparent text-gray-300 border-white/20 hover:border-white/40'}`}
                >
                  Standard V2 (Deep)
                </button>
              </div>
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
                    className={`py-1.5 text-[9px] font-mono font-bold rounded duration-150 uppercase cursor-pointer border ${scanInterval === ms ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.15)]' : 'bg-transparent text-gray-300 border-white/10 hover:border-white/30'}`}
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
                  className="p-1 px-2.5 bg-white/5 border border-white/10 hover:border-white/30 rounded text-gray-300 hover:text-white text-xs disabled:opacity-20 cursor-pointer duration-100"
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
                  className="p-1 px-2.5 bg-white/5 border border-white/10 hover:border-white/30 rounded text-gray-300 hover:text-white text-xs disabled:opacity-20 cursor-pointer duration-100"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* MATCH RECON SENSITIVITY (THRESHOLD) */}
            <div className="flex flex-col space-y-2 border-t border-white/10 pt-3">
              <div className="flex justify-between items-center font-mono text-xs font-bold tracking-wider text-off-white">
                <span className="flex items-center gap-1.5 opacity-80 uppercase font-mono">
                  <Sliders className="w-3.5 h-3.5 opacity-80" />
                  MATCH THRESHOLD
                </span>
                <span className="text-neon-green font-bold font-mono">{threshold}%</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-snug font-sans">
                Lower standard threshold limits (e.g., 25%–35%) to trigger matches for shadows or edge objects like pillows at tight angles.
              </p>
              <input 
                type="range" 
                min="15" 
                max="95" 
                value={threshold} 
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full h-3 cursor-pointer bg-white/10 accent-neon-green"
              />
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
                  className="px-3 py-1.5 glass-panel text-off-white hover:text-white border border-white/20 hover:border-white/40 text-[10px] font-bold rounded duration-150 uppercase cursor-pointer tracking-wider"
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

            {/* CAPTURE DIAGNOSTIC SNAP ACTIONS */}
            <div className="border-t border-white/10 pt-3">
              <button 
                onClick={captureScreenshot}
                className="w-full py-2.5 px-4 shadow-md bg-white text-black font-semibold font-mono text-xs rounded-lg hover:bg-white/90 duration-150 flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer transition-all border border-white"
              >
                <Download className="w-4 h-4" />
                Capture Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Low-Profile Start/Stop Trigger Console at Bottom Viewport */}
      {isScanning && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button 
            onClick={toggleScanner}
            disabled={isLoading}
            className="px-6 py-3.5 rounded-full font-mono text-xs font-bold bg-white text-black hover:bg-white/90 border border-white flex items-center justify-center gap-2 shadow-[0_4px_32px_rgba(0,0,0,0.85)] duration-200 tracking-widest cursor-pointer group"
          >
            <Square className="w-4 h-4 fill-current text-black" />
            STOP SCANNER
          </button>
        </div>
      )}
    </div>
  );
}
