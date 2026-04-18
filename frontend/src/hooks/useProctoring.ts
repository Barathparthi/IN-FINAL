import { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import * as faceapi from '@vladmandic/face-api';
import axios from 'axios';
import { ENV } from '../config/env.config';

const FACE_MODEL_URL = ENV.FACE_MODEL_URL;
const API_BASE = ENV.API_BASE_URL;

export interface ViolationEvent {
  type: string;
  isStrike: boolean;
  detectedAt: number;
}

export const useProctoring = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  _candidateId: string,
  sessionId: string,
  referenceDescriptor: number[] | null = null,
  maxStrikes: number = 3,
  rules: Record<string, 'STRIKE' | 'FLAG' | false | boolean> = {},
  attemptId?: string,
  isAudioDetected: boolean = false,
  initialStrikes: number = 0
) => {
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const detectionIntervalRef = useRef<any>(null);
  const lastStrikeTime  = useRef(0);
  const audioDetectedStartTime = useRef<number | null>(null);
  const gazeAwayStartTime = useRef<number | null>(null);
  const lastFocusWarnTime = useRef(0);
  const speechRecognitionRef = useRef<any>(null);
  
  const [loading, setLoading]       = useState(true);
  const [strikes, setStrikes]       = useState(initialStrikes);
  const [status, setStatus]         = useState<'ACTIVE' | 'TERMINATED'>('ACTIVE');
  const [violations, setViolations] = useState<ViolationEvent[]>([]);

  const noFaceStartTime = useRef<number | null>(null);
  const focusLossStartTime = useRef<number | null>(null);

  const [realTimeState, setRealTimeState] = useState({
    noFaceDetected: false,
    multiplePeople: false,
    phoneDetected: false,
    faceMismatch: false,
    focusLost: false
  });

  const STRIKE_COOLDOWN = 8000; 
  const MINUTE_THRESHOLD = 60000; // 1 minute
  const FOCUS_GAZE_THRESHOLD = ENV.PROCTORING_GAZE_AWAY_MS;
  const FOCUS_WARN_COOLDOWN = ENV.PROCTORING_WARN_COOLDOWN_MS;

  const isLikelyLookingAway = (faceDet: any) => {
    const box = faceDet?.detection?.box;
    const landmarks = faceDet?.landmarks;
    if (!box || !landmarks) return false;

    const leftEye = landmarks.getLeftEye?.() || [];
    const rightEye = landmarks.getRightEye?.() || [];
    const nose = landmarks.getNose?.() || [];
    if (leftEye.length === 0 || rightEye.length === 0 || nose.length === 0) return false;

    const avg = (pts: any[]) => pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    const l = avg(leftEye);
    const r = avg(rightEye);
    const n = avg(nose);

    const eyeCenterX = (l.x / leftEye.length + r.x / rightEye.length) / 2;
    const noseCenterX = n.x / nose.length;
    const faceCenterX = box.x + box.width / 2;

    const eyeOffset = Math.abs(eyeCenterX - faceCenterX) / box.width;
    const noseOffset = Math.abs(noseCenterX - faceCenterX) / box.width;

    return eyeOffset > 0.16 || noseOffset > 0.18;
  };

  const triggerFocusWarning = () => {
    const now = Date.now();
    if (now - lastFocusWarnTime.current < FOCUS_WARN_COOLDOWN) return;
    lastFocusWarnTime.current = now;

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('Look at the screen');
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('TTS warning failed:', e);
      }
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (transcript) console.debug('Focus warning STT heard:', transcript);
      };
      recognition.onerror = () => {
        speechRecognitionRef.current = null;
      };
      recognition.onend = () => {
        speechRecognitionRef.current = null;
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
      setTimeout(() => {
        try { recognition.stop(); } catch {}
      }, 3500);
    } catch (e) {
      console.error('STT listener failed:', e);
    }
  };

  const reportViolation = async (type: string, isStrike: boolean, customScreenshot?: string) => {
    const video = videoRef.current;
    const now = Date.now();
    const readableType = type.replace(/_/g, ' ');

    setViolations(prev => {
      if (prev[0]?.type === readableType && (now - prev[0].detectedAt < 3000)) return prev;
      return [{ type: readableType, isStrike, detectedAt: now }, ...prev].slice(0, 5);
    });

    if (isStrike && (now - lastStrikeTime.current > STRIKE_COOLDOWN)) {
      lastStrikeTime.current = now;
      const endpoint = attemptId ? `${API_BASE}/proctoring/violation` : `${API_BASE}/proctoring/violation-log`;
      const screenshot = customScreenshot || (video ? captureSnapshot(video) : '');
      
      const payload = attemptId 
        ? { attemptId, violationType: type, screenshotUrl: screenshot, metadata: { timestamp: new Date().toISOString() } }
        : { sessionId, type, screenshot, timestamp: new Date().toISOString() };

      try {
        const res = await axios.post(endpoint, payload, { 
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } 
        });
        if (res.data.strikeCount !== undefined) {
          setStrikes(res.data.strikeCount);
          if (res.data.terminated) setStatus('TERMINATED');
        }
      } catch (err) {
        console.error('Failed to report violation:', err);
      }
    }
  };

  useEffect(() => {
    const handleBlur = () => {
      if (rules['FOCUS_LOSS'] !== false) {
        focusLossStartTime.current = Date.now();
        setRealTimeState(s => ({ ...s, focusLost: true }));
      }
    };
    const handleFocus = () => {
      focusLossStartTime.current = null;
      setRealTimeState(s => ({ ...s, focusLost: false }));
    };
    const handleVisibility = () => {
      if (document.hidden && rules['TAB_SWITCH'] !== false) {
        // isStrike = true if STRIKE, false if FLAG
        const isStrike = rules['TAB_SWITCH'] !== 'FLAG'
        reportViolation('TAB_SWITCH', isStrike);
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [rules, sessionId, attemptId]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const [coco] = await Promise.all([
           cocoSsd.load({ base: 'lite_mobilenet_v2' }),
           faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
           faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
           faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
        ]);
        if (mounted) {
          modelRef.current = coco;
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to load proctoring models:', e);
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (loading || status === 'TERMINATED') return;

    const detect = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const [predictions, faceDets] = await Promise.all([
          modelRef.current!.detect(video),
          faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
             .withFaceLandmarks().withFaceDescriptors()
        ]);

        let phoneDetected = false;
        let personCount = 0;
        predictions.forEach(p => {
          if (p.class === 'cell phone' || p.class === 'phone') phoneDetected = true;
          if (p.class === 'person') personCount++;
        });

        const faceCount = faceDets.length;
        let faceMismatch = false;
        if (faceCount === 1 && referenceDescriptor) {
           const dist = faceapi.euclideanDistance(faceDets[0].descriptor, new Float32Array(referenceDescriptor));
           if (dist > 0.55) faceMismatch = true;
        }

        const actuallyNoFace = faceCount === 0;
        const multipleFaces = faceCount > 1 || personCount > 1;
        const likelyLookingAway = faceCount === 1 ? isLikelyLookingAway(faceDets[0]) : false;

        if (actuallyNoFace) {
           if (!noFaceStartTime.current) noFaceStartTime.current = Date.now();
        } else {
           noFaceStartTime.current = null;
        }

        setRealTimeState(s => ({
          ...s,
          noFaceDetected: actuallyNoFace,
          multiplePeople: multipleFaces,
          phoneDetected,
          faceMismatch,
          focusLost: !!focusLossStartTime.current || likelyLookingAway
        }));

        const now = Date.now();
        // Helper: is this rule enabled and is it a strike?
        const ruleIsEnabled = (type: string) => rules[type] !== false
        const ruleIsStrike  = (type: string) => rules[type] !== 'FLAG' && rules[type] !== false
        let currentViolationType: string | null = null;

        if (likelyLookingAway && ruleIsEnabled('FOCUS_LOSS') && !gazeAwayStartTime.current) {
          gazeAwayStartTime.current = now;
        }
        if (!likelyLookingAway) {
          gazeAwayStartTime.current = null;
        }

        const gazeFocusLossExceeded = !!(
          likelyLookingAway &&
          ruleIsEnabled('FOCUS_LOSS') &&
          gazeAwayStartTime.current &&
          (now - gazeAwayStartTime.current > FOCUS_GAZE_THRESHOLD)
        );

        if (phoneDetected && ruleIsEnabled('PHONE_DETECTED')) {
          currentViolationType = 'PHONE_DETECTED';
        }
        else if (multipleFaces && ruleIsEnabled('MULTIPLE_FACES')) {
          currentViolationType = 'MULTIPLE_FACES';
        }
        else if (faceMismatch) {
          currentViolationType = 'FACE_MISMATCH';
        }
        else if (noFaceStartTime.current && (now - noFaceStartTime.current > MINUTE_THRESHOLD) && ruleIsEnabled('FACE_AWAY')) {
          currentViolationType = 'FACE_AWAY';
          noFaceStartTime.current = now;
        }
        else if (gazeFocusLossExceeded) {
          currentViolationType = 'FOCUS_LOSS';
          gazeAwayStartTime.current = now;
          triggerFocusWarning();
        }
        else if (focusLossStartTime.current && (now - focusLossStartTime.current > MINUTE_THRESHOLD) && ruleIsEnabled('FOCUS_LOSS')) {
          currentViolationType = 'FOCUS_LOSS';
          focusLossStartTime.current = now;
        }

        if (isAudioDetected) {
           if (!audioDetectedStartTime.current) audioDetectedStartTime.current = now;
           else if (now - audioDetectedStartTime.current > 5000 && ruleIsEnabled('BACKGROUND_VOICE')) {
              reportViolation('BACKGROUND_VOICE', ruleIsStrike('BACKGROUND_VOICE'));
              audioDetectedStartTime.current = now;
           }
        } else {
           audioDetectedStartTime.current = null;
        }

        if (currentViolationType) {
          reportViolation(currentViolationType, ruleIsStrike(currentViolationType));
        }

        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')!;
          canvasRef.current.width = video.videoWidth;
          canvasRef.current.height = video.videoHeight;
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          const drawEyeBox = (points: any[], color: string) => {
            if (!points || points.length === 0) return;
            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const pad = 4;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
          };

          predictions.forEach(p => {
             if (p.class === 'cell phone' || (p.class === 'person' && personCount > 1)) {
                const [x,y,w,h] = p.bbox;
                ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
                ctx.strokeRect(x,y,w,h);
                ctx.fillStyle = '#f59e0b';
                ctx.fillText(p.class.toUpperCase(), x, y-5);
             }
          });
          faceDets.forEach((f, i) => {
             const box = f.detection.box;
             ctx.strokeStyle = i === 0 ? '#00ff94' : '#ef4444'; ctx.lineWidth = 2;
             ctx.strokeRect(box.x, box.y, box.width, box.height);

             if (i === 0) {
               const leftEye = f.landmarks?.getLeftEye?.() || [];
               const rightEye = f.landmarks?.getRightEye?.() || [];
               const eyeColor = likelyLookingAway ? '#ef4444' : '#00ff94';
               drawEyeBox(leftEye, eyeColor);
               drawEyeBox(rightEye, eyeColor);

               const awaySecs = gazeAwayStartTime.current ? Math.max(0, Math.floor((now - gazeAwayStartTime.current) / 1000)) : 0;
               const gazeLabel = likelyLookingAway
                 ? `IRIS/GAZE: LOOKING AWAY (${awaySecs}s)`
                 : 'IRIS/GAZE: ON SCREEN';

               ctx.fillStyle = likelyLookingAway ? '#ef4444' : '#00ff94';
               ctx.font = 'bold 12px Arial';
               ctx.fillText(gazeLabel, box.x, Math.max(14, box.y - 18));
             }
          });
        }
      } catch (e) {
        console.error('Detection frame error:', e);
      }
    };

    detectionIntervalRef.current = setInterval(detect, 1000); 
    return () => clearInterval(detectionIntervalRef.current);
  }, [loading, status, referenceDescriptor, sessionId, videoRef, canvasRef, maxStrikes, isAudioDetected, rules]);

  const captureSnapshot = (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.5);
  };

  return { loading, strikes, violations, status, realTimeState, reportViolation };
};
