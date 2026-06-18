import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { drawSketchyBoxes, Prediction } from '../utils/draw';
import { speakObject } from '../utils/speech';

interface LogEntry {
  id: number;
  time: string;
  text: string;
  confidence?: number;
  type: 'detect' | 'init' | 'unidentified';
}

export default function Scanner() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [threshold, setThreshold] = useState(50);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([{
    id: 0, time: new Date().toTimeString().split(' ')[0], text: 'SYSTEM INIT', type: 'init'
  }]);
  const [isLoading, setIsLoading] = useState(false);

  const requestRef = useRef<number>();
  const lastLogTime = useRef<Record<string, number>>({});

  useEffect(() => {
    // We do not load the model automatically to save bandwidth until user clicks "START"
    // But we can if we want to. Let's wait until they hit start.
  }, []);

  const addLog = useCallback((text: string, type: 'detect' | 'init' | 'unidentified', confidence?: number) => {
    setLogs(prev => {
      const now = new Date().toTimeString().split(' ')[0];
      const newLog = { id: Date.now() + Math.random(), time: now, text, type, confidence };
      return [newLog, ...prev].slice(0, 50); // keep last 50
    });
  }, []);

  const detectFrame = useCallback(async () => {
    if (!isScanning) return;
    if (!webcamRef.current || !webcamRef.current.video || !model || !canvasRef.current) return;
    
    const video = webcamRef.current.video;
    if (video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }
    
    // Ensure canvas internal size matches video intrinsic size
    if (canvasRef.current.width !== video.videoWidth) {
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
    }

    try {
      const predictions = await model.detect(video);
      const filtered = predictions.filter(p => (p.score * 100) >= threshold);
      
      drawSketchyBoxes(canvasRef.current, filtered);
      
      const now = Date.now();
      filtered.forEach(pred => {
        speakObject(pred.class, voiceEnabled);
        
        // Debounce logs per class
        const lastLog = lastLogTime.current[pred.class] || 0;
        if (now - lastLog > 2000) {
          addLog(`DETECTED: ${pred.class.toUpperCase()}`, 'detect', Math.round(pred.score * 100));
          lastLogTime.current[pred.class] = now;
        }
      });
      
    } catch (e) {
      console.error("Detection error: ", e);
    }
    
    requestRef.current = requestAnimationFrame(detectFrame);
  }, [isScanning, model, threshold, voiceEnabled, addLog]);

  useEffect(() => {
    if (isScanning && model) {
      requestRef.current = requestAnimationFrame(detectFrame);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isScanning, model, detectFrame]);

  const toggleScanner = async () => {
    if (isScanning) {
      setIsScanning(false);
      // Clear canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      addLog('SCANNER STOPPED', 'init');
    } else {
      setIsLoading(true);
      if (!model) {
        addLog('LOADING MODEL...', 'init');
        try {
          const loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
          setModel(loadedModel);
          addLog('MODEL LOADED', 'init');
        } catch (e) {
          addLog('MODEL LOAD FAILED', 'error' as any);
          setIsLoading(false);
          return;
        }
      }
      setIsScanning(true);
      setIsLoading(false);
      addLog('SCANNER STARTED', 'init');
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* Background layer */}
      <div className="absolute inset-0 z-0 bg-[#0c0c0c] flex items-center justify-center">
        {!isScanning && !isLoading && (
          <div className="text-off-white/30 font-mono text-sm tracking-widest">CAMERA OFFLINE</div>
        )}
      </div>

      {/* Video & Canvas Overlay */}
      {isScanning && (
        <div className="absolute inset-0 z-10 w-full h-full overflow-hidden flex items-center justify-center bg-black">
          {/* @ts-ignore */}
          <Webcam 
            audio={false}
            ref={webcamRef} 
            mirrored={true}
            videoConstraints={{ facingMode: "environment" }}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div className="absolute inset-0 bg-[#0c0c0c]/20 z-20 pointer-events-none" />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover z-30 pointer-events-none"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-40 bg-[#0c0c0c]/80 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="w-12 h-12 border-2 border-neon-green/30 border-t-neon-green rounded-full animate-spin mb-4"></div>
          <p className="font-mono text-neon-green text-sm tracking-widest animate-pulse">LOADING NEURAL NET...</p>
        </div>
      )}

      {/* Left Aligned Scrolling Log Panel */}
      <div className="fixed bottom-32 md:bottom-28 left-4 md:left-8 w-64 h-48 glass-panel z-50 p-4 overflow-hidden flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="font-mono text-xs font-bold text-neon-green border-b border-neon-green/20 pb-2 mb-3 tracking-widest">
          DETECTION LOG
        </div>
        <div className="flex-1 overflow-y-auto font-sans text-xs text-off-white space-y-2 pr-2 custom-scrollbar">
          {logs.map((log) => (
            <div key={log.id} className="flex justify-between items-center text-[10px] md:text-xs">
              <span className="text-neon-green/70 font-mono">[{log.time}]</span>
              <span className={`truncate flex-1 ml-2 ${log.type === 'init' ? 'opacity-50' : ''}`}>
                {log.text}
              </span>
              {log.confidence !== undefined && (
                <span className={log.type === 'unidentified' ? 'text-investigative-red ml-2' : 'text-neon-green ml-2'}>
                  [{log.confidence}%]
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Center Control Console */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] md:w-full max-w-md glass-panel p-5 z-50 flex flex-col space-y-5 shadow-[0_4px_24px_rgba(0,0,0,0.6)] border border-neon-green/40">
        <button 
          onClick={toggleScanner}
          disabled={isLoading}
          className={`w-full py-3 font-mono text-sm md:text-base font-bold rounded-none transition-colors glitch-hover relative overflow-hidden group shadow-[0_0_15px_rgba(2,247,27,0.4)] ${
            isScanning 
              ? 'bg-transparent border border-neon-green text-neon-green hover:bg-neon-green/10' 
              : 'bg-neon-green border border-neon-green text-[#0c0c0c] hover:bg-neon-green/90'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="relative z-10 flex items-center justify-center gap-2 tracking-widest">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {isScanning ? 'STOP SCANNER' : 'START SCANNER'}
          </span>
        </button>

        <div className="flex items-center justify-between space-x-6">
          {/* Threshold Slider */}
          <div className="flex-1 flex flex-col space-y-2">
            <div className="flex justify-between items-center font-mono text-xs font-bold text-off-white tracking-wider">
              <span>THRESHOLD</span>
              <span className="text-neon-green">{threshold}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={threshold} 
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Voice Toggle */}
          <div className="flex flex-col items-center justify-center space-y-2 border-l border-neon-green/20 pl-6">
            <span className="font-mono text-xs font-bold text-off-white tracking-wider">VOICE</span>
            <div 
              className="relative inline-block w-10 h-5 cursor-pointer"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
            >
              <div className={`absolute inset-0 border border-neon-green/40 transition-colors duration-200 ${voiceEnabled ? 'bg-neon-green' : 'bg-[#0c0c0c]'}`} />
              <div className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-none transition-transform duration-200 ${voiceEnabled ? 'bg-[#0c0c0c] translate-x-[18px]' : 'bg-off-white'}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
