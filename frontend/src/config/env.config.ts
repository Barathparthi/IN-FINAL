const numberFromEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const ENV = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000',
  APP_NAME: import.meta.env.VITE_APP_NAME || 'INDIUM',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  FACE_MODEL_URL: import.meta.env.VITE_FACE_MODEL_URL || 'https://vladmandic.github.io/face-api/model',
  MEDIAPIPE_VISION_WASM_URL:
    import.meta.env.VITE_MEDIAPIPE_VISION_WASM_URL ||
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
  MEDIAPIPE_FACE_LANDMARKER_MODEL_URL:
    import.meta.env.VITE_MEDIAPIPE_FACE_LANDMARKER_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  MEDIAPIPE_OBJECT_DETECTOR_MODEL_URL:
    import.meta.env.VITE_MEDIAPIPE_OBJECT_DETECTOR_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task',
  MEDIAPIPE_OBJECT_SCORE_THRESHOLD: numberFromEnv(import.meta.env.VITE_MEDIAPIPE_OBJECT_SCORE_THRESHOLD, 0.5),
  PROCTORING_GAZE_AWAY_MS: numberFromEnv(import.meta.env.VITE_PROCTORING_GAZE_AWAY_MS, 10000),
  PROCTORING_WARN_COOLDOWN_MS: numberFromEnv(import.meta.env.VITE_PROCTORING_WARN_COOLDOWN_MS, 12000),
}
