import { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import * as faceapi from '@vladmandic/face-api';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
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
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const detectionIntervalRef = useRef<any>(null);
  const lastStrikeTime  = useRef(0);
  const audioDetectedStartTime = useRef<number | null>(null);
  const gazeAwayStartTime = useRef<number | null>(null);
  const gazeStrikeFired = useRef(false);
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

  // ===== IRIS DETECTION COMMENTED OUT - UNCOMMENT WHEN NEEDED =====
  /*
  const point = (landmarks: any[], index: number) => landmarks?.[index] || null;
  const averagePoint = (landmarks: any[], indices: number[]) => {
    const points = indices.map((index) => point(landmarks, index)).filter(Boolean)
    if (points.length === 0) return null
    return points.reduce((acc, current) => ({ x: acc.x + current.x, y: acc.y + current.y }), { x: 0, y: 0 })
  };

  const distance = (a: any, b: any) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))

  const getIrisFocusState = (landmarks: any[]) => {
    if (!landmarks || landmarks.length < 478) return null

    const leftIris = averagePoint(landmarks, [468, 469, 470, 471, 472])
    const rightIris = averagePoint(landmarks, [473, 474, 475, 476, 477])
    const leftOuter = point(landmarks, 33)
    const leftInner = point(landmarks, 133)
    const rightOuter = point(landmarks, 362)
    const rightInner = point(landmarks, 263)
    const leftTop = point(landmarks, 159)
    const leftBottom = point(landmarks, 145)
    const rightTop = point(landmarks, 386)
    const rightBottom = point(landmarks, 374)

    if (!leftIris || !rightIris || !leftOuter || !leftInner || !rightOuter || !rightInner) return null

    const leftEyeCenter = {
      x: (leftOuter.x + leftInner.x) / 2,
      y: (leftOuter.y + leftInner.y) / 2,
    }
    const rightEyeCenter = {
      x: (rightOuter.x + rightInner.x) / 2,
      y: (rightOuter.y + rightInner.y) / 2,
    }

    const leftEyeWidth = Math.max(0.0001, distance(leftOuter, leftInner))
    const rightEyeWidth = Math.max(0.0001, distance(rightOuter, rightInner))
    const leftEyeHeight = Math.max(0.0001, distance(leftTop, leftBottom))
    const rightEyeHeight = Math.max(0.0001, distance(rightTop, rightBottom))

    const leftOffsetX = (leftIris.x - leftEyeCenter.x) / leftEyeWidth
    const rightOffsetX = (rightIris.x - rightEyeCenter.x) / rightEyeWidth
    const leftOffsetY = (leftIris.y - leftEyeCenter.y) / leftEyeHeight
    const rightOffsetY = (rightIris.y - rightEyeCenter.y) / rightEyeHeight

    const offsetX = (leftOffsetX + rightOffsetX) / 2
    const offsetY = (leftOffsetY + rightOffsetY) / 2

    // Thresholds: only trigger on significant look-away (not natural screen viewing)
    // Horizontal: ±0.35 (~70% of eye width) - allows natural head tilt
    // Vertical: ±0.30 (~60% of eye height) - accounts for natural iris position
    const HORIZONTAL_THRESHOLD = 0.35
    const VERTICAL_THRESHOLD = 0.30
    
    const lookingAway = Math.abs(offsetX) > HORIZONTAL_THRESHOLD || Math.abs(offsetY) > VERTICAL_THRESHOLD
    const direction = Math.abs(offsetX) > Math.abs(offsetY)
      ? (offsetX > 0 ? 'RIGHT' : 'LEFT')
      : (offsetY > 0 ? 'DOWN' : 'UP')

    return {
      lookingAway,
      direction,
      offsetX,
      offsetY,
      leftIris,
      rightIris,
      leftEyeCenter,
      rightEyeCenter,
    }
  };
  */
  // ===== END IRIS DETECTION SECTION =====

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
        const vision = await FilesetResolver.forVisionTasks(ENV.MEDIAPIPE_VISION_WASM_URL)
        const [coco] = await Promise.all([
           cocoSsd.load({ base: 'lite_mobilenet_v2' }),
           faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
           faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
           faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
        ]);
        if (mounted) {
          modelRef.current = coco;
          faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: ENV.MEDIAPIPE_FACE_LANDMARKER_MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          })
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

        // IRIS DETECTION DISABLED - uncomment above to enable
        // const mediapipeResult = faceLandmarkerRef.current
        //   ? faceLandmarkerRef.current.detectForVideo(video, performance.now())
        //   : null
        // const mediapipeFace = mediapipeResult?.faceLandmarks?.[0] || null

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
          // IRIS DETECTION DISABLED - uncomment code above to enable
          // const irisFocus = mediapipeFace ? getIrisFocusState(mediapipeFace) : null;
          const likelyLookingAway = false; // !!irisFocus?.lookingAway;
          // const gazeDirection = 'CENTER'; // irisFocus?.direction || 'CENTER';

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

        if (!likelyLookingAway) {
          gazeAwayStartTime.current = null;
          gazeStrikeFired.current = false;
        } else if (ruleIsEnabled('FOCUS_LOSS') && !gazeAwayStartTime.current) {
          gazeAwayStartTime.current = now;
        }

        const gazeFocusLossExceeded = !!(
          likelyLookingAway &&
          ruleIsEnabled('FOCUS_LOSS') &&
          gazeAwayStartTime.current &&
          !gazeStrikeFired.current &&
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
          gazeStrikeFired.current = true;
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
               // IRIS RENDERING DISABLED - uncomment below to enable iris dots and bounding boxes
               /*
               const iris = irisFocus;
               const eyeColor = iris?.lookingAway ? '#ef4444' : '#00ff94';
               const irisRadius = 8; // Iris dot radius in pixels

               if (iris?.leftEyeCenter && iris?.rightEyeCenter) {
                 // Scale normalized coordinates to pixel coordinates
                 const leftEyeX = iris.leftEyeCenter.x * canvasRef.current!.width;
                 const leftEyeY = iris.leftEyeCenter.y * canvasRef.current!.height;
                 const rightEyeX = iris.rightEyeCenter.x * canvasRef.current!.width;
                 const rightEyeY = iris.rightEyeCenter.y * canvasRef.current!.height;

                 // Draw eye region bounding boxes
                 const eyeBoxSize = 50;
                 ctx.strokeStyle = eyeColor;
                 ctx.lineWidth = 2;
                 ctx.strokeRect(
                   leftEyeX - eyeBoxSize / 2,
                   leftEyeY - eyeBoxSize / 2,
                   eyeBoxSize,
                   eyeBoxSize
                 );
                 ctx.strokeRect(
                   rightEyeX - eyeBoxSize / 2,
                   rightEyeY - eyeBoxSize / 2,
                   eyeBoxSize,
                   eyeBoxSize
                 );

                 // Draw iris dots
                 ctx.fillStyle = eyeColor;
                 // Left iris
                 if (iris.leftIris) {
                   const irisX = iris.leftIris.x * canvasRef.current!.width;
                   const irisY = iris.leftIris.y * canvasRef.current!.height;
                   ctx.beginPath();
                   ctx.arc(irisX, irisY, irisRadius, 0, Math.PI * 2);
                   ctx.fill();
                   ctx.strokeStyle = '#fff';
                   ctx.lineWidth = 1;
                   ctx.stroke();
                 }
                 // Right iris
                 if (iris.rightIris) {
                   const irisX = iris.rightIris.x * canvasRef.current!.width;
                   const irisY = iris.rightIris.y * canvasRef.current!.height;
                   ctx.beginPath();
                   ctx.arc(irisX, irisY, irisRadius, 0, Math.PI * 2);
                   ctx.fill();
                   ctx.strokeStyle = '#fff';
                   ctx.lineWidth = 1;
                   ctx.stroke();
                 }
               }

               const awaySecs = gazeAwayStartTime.current ? Math.max(0, Math.floor((now - gazeAwayStartTime.current) / 1000)) : 0;
               const gazeLabel = iris?.lookingAway
                 ? `IRIS/GAZE: LOOKING ${gazeDirection} (${awaySecs}s)`
                 : 'IRIS/GAZE: ON SCREEN';

               ctx.fillStyle = iris?.lookingAway ? '#ef4444' : '#00ff94';
               ctx.font = 'bold 12px Arial';
               ctx.fillText(gazeLabel, box.x, Math.max(14, box.y - 18));
               */
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
