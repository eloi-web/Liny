import { useCallback, useRef, useState } from 'react';
import { loadDetectorModel, terminateDetectorWorker } from '../utils/detector';

type LogType = 'detect' | 'init' | 'unidentified' | 'error' | 'success';

interface UseDetectorModelOptions {
  addLog: (text: string, type: LogType, confidence?: number) => void;
}

export function useDetectorModel({ addLog }: UseDetectorModelOptions) {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const modelReadyRef = useRef(false);
  const modelLoadingRef = useRef(false);

  const loadModel = useCallback(async () => {
    if (modelLoadingRef.current || modelReadyRef.current) return;
    modelLoadingRef.current = true;
    setIsLoading(true);
    setModelLoaded(false);
    addLog('INITIALIZING QUANTUM ZERO-SHOT DETECTOR...', 'init');

    try {
      addLog('PREPARING TRANSFORMERS.JS LOCAL ENGINE...', 'init');
      addLog('DOWNLOADING ZERO-SHOT TRANSFORMER WEIGHTS...', 'init');
      setDownloadProgress(0);

      await loadDetectorModel((progress) => {
        if (progress.status === 'progress' && progress.progress !== undefined) {
          setDownloadProgress(Math.round(progress.progress));
        } else if (progress.status === 'done' && progress.file) {
          addLog(`DOWNLOADED: ${progress.file}`, 'success');
        } else if (progress.status === 'initiate' && progress.file) {
          addLog(`INITIATING: ${progress.file}`, 'init');
        }
      });

      modelReadyRef.current = true;
      setModelLoaded(true);
      setIsLoading(false);
      addLog('LOCK IDENTIFICATION PIPELINE FULLY CHARGED [DETR RESNET-50]', 'init');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (import.meta.env.DEV) {
        console.error('Transformers model load faulted:', err);
      }
      addLog(`NEURAL COOLDOWN INITIATED: GRID INITIALIZATION FAULT - ${message}`, 'error');
      setIsLoading(false);
      setModelLoaded(false);
      modelReadyRef.current = false;
    } finally {
      modelLoadingRef.current = false;
    }
  }, [addLog]);

  const unloadModel = useCallback(() => {
    terminateDetectorWorker();
    modelReadyRef.current = false;
    setModelLoaded(false);
  }, []);

  return {
    modelLoaded,
    isLoading,
    downloadProgress,
    modelReadyRef,
    loadModel,
    unloadModel,
  };
}
