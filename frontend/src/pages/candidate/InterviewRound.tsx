import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { attemptApi } from '../../services/api.services'
import { MessageSquare, Volume2, VolumeX, ChevronRight, Send, Square, AlertTriangle, Code2, Play } from 'lucide-react'
import Editor from '@monaco-editor/react'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const LC_LANG_OPTIONS = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python',     label: 'Python'     },
  { value: 'java',       label: 'Java'       },
  { value: 'cpp',        label: 'C++'        },
]

const MAX_RECORD_SECONDS  = 90
const WARN_RECORD_SECONDS = 75
const MIN_ANSWER_SECONDS  = 10
const FILLER_WORDS = ['um','uh','like','you know','basically','literally','actually','so','right','okay','er','hmm']

type BrowserWindow = Window & {
  SpeechRecognition?: new () => any
  webkitSpeechRecognition?: new () => any
}

function speakText(text: string, onEnd?: () => void) {
  if (!window.speechSynthesis) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.rate = 0.92; utt.pitch = 1.0; utt.volume = 1.0; utt.lang = 'en'
  if (onEnd) {
    let called = false
    const done = () => {
      if (called) return
      called = true
      onEnd()
    }
    utt.onend = done
    utt.onerror = done
  }
  const voices = window.speechSynthesis.getVoices()
  const englishVoices = voices.filter(v => /^en(-|$)/i.test(v.lang))
  const preferred = englishVoices.find(v => /Google|Natural|Neural|Samantha|Microsoft|Aria|Jenny|Guy|Daniel/i.test(v.name)) || englishVoices[0]
  if (preferred) utt.voice = preferred
  window.speechSynthesis.speak(utt)
}

function stopSpeaking() { window.speechSynthesis?.cancel() }

export default function InterviewRound() {
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { 
    setAttemptId, setStrikes, setTimer, setRoundTitle, setSessionId, setFaceDescriptor,
    questions, setQuestions, currentIndex, setCurrentIndex,
  } = useOutletContext<any>()
  const [activeFollowUp, setActiveFollowUp] = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [attempt, setAttempt]             = useState<any>(null)
  const [answers, setAnswers]             = useState<Record<string, string>>({})
  const [submitting, setSubmitting]       = useState(false)
  const [interviewMode, setInterviewMode] = useState<'TEXT' | 'AUDIO' | 'TEXT_LIVE_CODING' | 'AUDIO_LIVE_CODING'>('TEXT')
  const [isSpeaking, setIsSpeaking]       = useState(false)
  const [isRecording, setIsRecording]     = useState(false)
  const [audioBlob, setAudioBlob]         = useState<Blob | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [showTimeWarn, setShowTimeWarn]   = useState(false)
  const [sttTranscript, setSttTranscript] = useState('')
  const supportsSpeechRecognition = typeof window !== 'undefined' && !!((window as BrowserWindow).SpeechRecognition || (window as BrowserWindow).webkitSpeechRecognition)

  // ── Inline live coding state ────────────────────────────────
  const [lcPhase, setLcPhase]             = useState<'code' | 'explain' | null>(null)
  const [lcCode, setLcCode]               = useState('')
  const [lcLanguage, setLcLanguage]       = useState('javascript')
  const [lcAnswerId, setLcAnswerId]       = useState('')
  const [lcExplanation, setLcExplanation] = useState('')
  const [lcCodeScore, setLcCodeScore]     = useState<number | null>(null)
  const [lcExplanationPrompt, setLcExplanationPrompt] = useState('')
  const [lcActiveFollowUp, setLcActiveFollowUp] = useState<string | null>(null)
  const [lcSubmitting, setLcSubmitting]   = useState(false)
  const [lcRunning, setLcRunning]         = useState(false)
  const [lcTestResults, setLcTestResults] = useState<any[] | null>(null)
  // Audio explanation for AUDIO_LIVE_CODING
  const [lcAudioBlob, setLcAudioBlob]     = useState<Blob | null>(null)
  const [lcAudioDuration, setLcAudioDuration] = useState(0)
  const [lcIsRecording, setLcIsRecording] = useState(false)
  const [lcSttTranscript, setLcSttTranscript] = useState('')
  const lcChunksRef   = useRef<Blob[]>([])
  const lcRecorderRef = useRef<MediaRecorder | null>(null)
  const lcTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const lcSpeechRecognitionRef = useRef<any>(null)
  const lcSttFinalTranscriptRef = useRef('')
  const lcIsRecordingRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamRef        = useRef<MediaStream | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const audioDurationRef = useRef(0)
  const isRecordingRef = useRef(false)
  const autoSubmitOnStopRef = useRef(false)
  const speechRecognitionRef = useRef<any>(null)
  const sttFinalTranscriptRef = useRef('')

  const stopSpeechToText = useCallback(() => {
    const recognition = speechRecognitionRef.current
    if (!recognition) return
    try {
      recognition.onend = null
      recognition.stop()
    } catch {
      // Ignore stop errors from browsers that already ended recognition.
    }
    speechRecognitionRef.current = null
  }, [])

  const startSpeechToText = useCallback(() => {
    if (!supportsSpeechRecognition) return
    stopSpeechToText()

    const SpeechRecognitionCtor = (window as BrowserWindow).SpeechRecognition || (window as BrowserWindow).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const item = event.results[i]
        const spoken = item?.[0]?.transcript?.trim()
        if (!spoken) continue
        if (item.isFinal) finalChunk += `${spoken} `
        else interimChunk += `${spoken} `
      }
      if (finalChunk) {
        sttFinalTranscriptRef.current = `${sttFinalTranscriptRef.current} ${finalChunk}`.trim()
      }
      const merged = `${sttFinalTranscriptRef.current} ${interimChunk}`.trim()
      setSttTranscript(merged)
    }
    recognition.onerror = (event: any) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        toast.error('Speech-to-text blocked. You can still type the transcript manually.')
      }
    }
    recognition.onend = () => {
      if (isRecordingRef.current && speechRecognitionRef.current === recognition) {
        try { recognition.start() } catch { /* noop */ }
      }
    }

    speechRecognitionRef.current = recognition
    try { recognition.start() } catch { /* noop */ }
  }, [stopSpeechToText, supportsSpeechRecognition])

  const stopLcSpeechToText = useCallback(() => {
    const recognition = lcSpeechRecognitionRef.current
    if (!recognition) return
    try {
      recognition.onend = null
      recognition.stop()
    } catch {
      // Ignore stop errors when the recognition session has already ended.
    }
    lcSpeechRecognitionRef.current = null
  }, [])

  const startLcSpeechToText = useCallback(() => {
    if (!supportsSpeechRecognition) return
    stopLcSpeechToText()

    const SpeechRecognitionCtor = (window as BrowserWindow).SpeechRecognition || (window as BrowserWindow).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const item = event.results[i]
        const spoken = item?.[0]?.transcript?.trim()
        if (!spoken) continue
        if (item.isFinal) finalChunk += `${spoken} `
        else interimChunk += `${spoken} `
      }
      if (finalChunk) {
        lcSttFinalTranscriptRef.current = `${lcSttFinalTranscriptRef.current} ${finalChunk}`.trim()
      }
      const merged = `${lcSttFinalTranscriptRef.current} ${interimChunk}`.trim()
      setLcSttTranscript(merged)
    }
    recognition.onerror = (event: any) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        toast.error('Speech-to-text blocked. You can still type the explanation transcript manually.')
      }
    }
    recognition.onend = () => {
      if (lcIsRecordingRef.current && lcSpeechRecognitionRef.current === recognition) {
        try { recognition.start() } catch { /* noop */ }
      }
    }

    lcSpeechRecognitionRef.current = recognition
    try { recognition.start() } catch { /* noop */ }
  }, [stopLcSpeechToText, supportsSpeechRecognition])

  useEffect(() => {
    startAttempt()
    return () => { stopSpeaking(); stopRecording(); stopLcRecording(); stopLcSpeechToText(); clearTimers() }
  }, [roundId])

  // Auto-dictate + auto-start recording when question changes
  useEffect(() => {
    if (loading || questions.length === 0) return
    const q = questions[currentIndex]
    const textToSpeak = activeFollowUp || q?.prompt
    if (!textToSpeak) return

    // For live coding questions in a mixed round, don't auto-record
    const isLcQuestion = !!q?.liveCodingProblem
    const isAudioMode = interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING'
    const shouldAutoRecord = isAudioMode && !isLcQuestion

    clearTimers()
    autoSubmitOnStopRef.current = false
    audioDurationRef.current = 0
    sttFinalTranscriptRef.current = ''
    setSttTranscript('')
    setAudioBlob(null)
    setAudioDuration(0)
    setShowTimeWarn(false)
    setIsSpeaking(true)

    const onTTSEnd = () => {
      setIsSpeaking(false)
      if (shouldAutoRecord) {
        ttsTimerRef.current = setTimeout(() => startRecording(), 800)
      }
    }
    speakText(textToSpeak, onTTSEnd)

    if (shouldAutoRecord) {
      const fallbackMs = (textToSpeak.length / 12) * 1000 + 4000
      ttsTimerRef.current = setTimeout(() => {
        stopSpeaking()
        setIsSpeaking(false)
        startRecording()
      }, fallbackMs)
    }
  }, [currentIndex, loading, questions, interviewMode, activeFollowUp])

  function clearTimers() {
    if (ttsTimerRef.current) {
      clearTimeout(ttsTimerRef.current)
      ttsTimerRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
    stopSpeechToText()
  }

  const startAttempt = async () => {
    try {
      setLoading(true)
      const data = await attemptApi.start(roundId!)
      setAttempt(data.attempt)
      if (setAttemptId)      setAttemptId(data.attempt.id)
      if (setSessionId)      setSessionId(data.sessionId)
      if (setFaceDescriptor) setFaceDescriptor(data.faceDescriptor)
      setQuestions(data.questions)
      
      const initial: Record<string, string> = {}
      if (data.interviewAnswers) {
        data.interviewAnswers.forEach((a: any) => { initial[a.questionId] = a.textAnswer || '' })
      }
      setAnswers(initial)

      setRoundTitle('AI Interview')
      setTimer(data.attempt.timeLimitMinutes * 60)
      setStrikes(data.attempt.strikeCount)
      const rawMode = data.interviewMode || 'TEXT'
      setInterviewMode(rawMode as any)
      // Pre-set LC phase for the first question if it's a live coding one
      setLcPhase(null)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start attempt')
      navigate('/candidate/lobby')
    } finally { setLoading(false) }
  }

  const handleReplay = () => {
    if (isRecording) stopRecording()
    autoSubmitOnStopRef.current = false
    audioDurationRef.current = 0
    sttFinalTranscriptRef.current = ''
    setSttTranscript('')
    setAudioBlob(null)
    clearTimers()
    setIsSpeaking(true)
    const q = questions[currentIndex]
    const textToSpeak = activeFollowUp || q.prompt
    const isAudioMode = interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING'
    const isLcQuestion = !!q?.liveCodingProblem
    speakText(textToSpeak, () => {
      setIsSpeaking(false)
      if (isAudioMode && !isLcQuestion) ttsTimerRef.current = setTimeout(() => startRecording(), 800)
    })
  }

  const handleStopTTS = () => {
    clearTimers(); stopSpeaking(); setIsSpeaking(false)
    const q = questions[currentIndex]
    const isAudioMode = interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING'
    const isLcQuestion = !!q?.liveCodingProblem
    if (isAudioMode && !isLcQuestion) ttsTimerRef.current = setTimeout(() => startRecording(), 400)
  }

  const startRecording = async () => {
    if (isRecordingRef.current || submitting) return
    isRecordingRef.current = true
    try {
      if (ttsTimerRef.current) {
        clearTimeout(ttsTimerRef.current)
        ttsTimerRef.current = null
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const elapsedFromClock = recordingStartedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000))
          : 0
        const finalDuration = Math.min(MAX_RECORD_SECONDS, Math.max(audioDurationRef.current, elapsedFromClock))
        audioDurationRef.current = finalDuration
        setAudioDuration(finalDuration)

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stopSpeechToText()
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null

        if (autoSubmitOnStopRef.current) {
          autoSubmitOnStopRef.current = false
          void submitCurrentAnswer({ forcedAudioBlob: blob, forcedAudioDuration: finalDuration, fromAutoTimeout: true })
        }
      }
      recorder.start(250)
      recordingStartedAtRef.current = Date.now()
      audioDurationRef.current = 0
      setAudioBlob(null)
      setIsRecording(true)
      setAudioDuration(0)
      setShowTimeWarn(false)
      setSttTranscript('')
      sttFinalTranscriptRef.current = ''

      durationTimerRef.current = setInterval(() => {
        if (!recordingStartedAtRef.current) return
        const elapsed = Math.min(MAX_RECORD_SECONDS, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000))
        audioDurationRef.current = elapsed
        setAudioDuration(prev => (prev === elapsed ? prev : elapsed))
        setShowTimeWarn(elapsed >= WARN_RECORD_SECONDS)
      }, 250)

      startSpeechToText()

      autoStopRef.current = setTimeout(() => {
        autoSubmitOnStopRef.current = true
        toast('90 seconds completed. Submitting your answer...', { icon: '⏱' })
        stopRecording()
      }, MAX_RECORD_SECONDS * 1000)
    } catch {
      isRecordingRef.current = false
      recordingStartedAtRef.current = null
      setIsRecording(false)
      toast.error('Microphone access denied. Please allow mic access.')
    }
  }

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    else streamRef.current?.getTracks().forEach(t => t.stop())

    const elapsedOnStop = recordingStartedAtRef.current
      ? Math.min(MAX_RECORD_SECONDS, Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)))
      : audioDurationRef.current
    audioDurationRef.current = elapsedOnStop
    setAudioDuration(elapsedOnStop)

    isRecordingRef.current = false
    recordingStartedAtRef.current = null
    stopSpeechToText()

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    setIsRecording(false)
    setShowTimeWarn(false)
  }, [stopSpeechToText])

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Compute delivery metrics from transcript + duration
  function computeDeliveryMetrics(transcript: string, durationSecs: number) {
    const words          = transcript.trim().split(/\s+/).filter(Boolean)
    const wordCount      = words.length
    const fillerWordCount = words.filter(w => FILLER_WORDS.includes(w.toLowerCase().replace(/[^a-z]/g, ''))).length
    const fillerWordRatio = wordCount > 0 ? fillerWordCount / wordCount : 0
    const speechDuration  = Math.min(wordCount * 0.4, durationSecs)
    const silenceRatio    = durationSecs > 0 ? Math.max(0, 1 - speechDuration / durationSecs) : 0
    const wordsPerMinute  = speechDuration > 0 ? (wordCount / speechDuration) * 60 : 0

    let score = 10
    if (wordsPerMinute < 60)   score -= 2.5
    else if (wordsPerMinute < 100) score -= 1
    else if (wordsPerMinute > 200) score -= 2
    else if (wordsPerMinute > 180) score -= 1
    if (silenceRatio > 0.6)    score -= 2.5
    else if (silenceRatio > 0.4) score -= 1
    if (fillerWordRatio > 0.15) score -= 2
    else if (fillerWordRatio > 0.08) score -= 1
    if (durationSecs < MIN_ANSWER_SECONDS) score -= 3

    return {
      durationSeconds: durationSecs,
      speechDuration,
      silenceRatio,
      wordsPerMinute,
      wordCount,
      fillerWordCount,
      fillerWordRatio,
      deliveryScore: Math.max(0, Math.min(10, score)),
    }
  }

 // ── Inline live coding helpers ───────────────────────────────
  const resetLcState = () => {
      lcIsRecordingRef.current = false
      stopLcSpeechToText()
      if (lcTimerRef.current) {
        clearInterval(lcTimerRef.current)
        lcTimerRef.current = null
      }
    setLcPhase(null); setLcCode(''); setLcAnswerId(''); setLcExplanation('')
    setLcCodeScore(null); setLcExplanationPrompt(''); setLcTestResults(null)
    setLcAudioBlob(null); setLcAudioDuration(0); setLcIsRecording(false)
     setLcActiveFollowUp(null)
     setLcSttTranscript('')
     lcSttFinalTranscriptRef.current = ''
  }

  const handleLcRunCode = async () => {
    if (!lcCode.trim()) { toast.error('Write some code first.'); return }
    setLcRunning(true); setLcTestResults(null)
    try {
      const res = await attemptApi.runCoding({
        attemptId: attempt.id, questionId: questions[currentIndex].id,
        sourceCode: lcCode, language: lcLanguage,
      })
      setLcTestResults(res.results)
      if (res.passed === res.total) toast.success('All test cases passed! 🎉')
      else toast.error(`${res.total - res.passed} test case(s) failed.`)
    } catch { toast.error('Execution failed') }
    finally { setLcRunning(false) }
  }

  const handleLcSubmitCode = async () => {
    if (!lcCode.trim()) { toast.error('Please write some code first.'); return }
    setLcSubmitting(true)
    try {
      const res = await attemptApi.submitLiveCodingCode({
        attemptId: attempt.id, questionId: questions[currentIndex].id,
        language: lcLanguage, sourceCode: lcCode,
      })
      setLcAnswerId(res.answerId)
      setLcCodeScore(res.codeScore)
      setLcExplanationPrompt(res.explanationPrompt)
      setLcActiveFollowUp(null)
      setLcSttTranscript('')
      lcSttFinalTranscriptRef.current = ''
      setLcPhase('explain')
    } catch { toast.error('Failed to submit code') }
    finally { setLcSubmitting(false) }
  }

  const startLcRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      lcChunksRef.current = []
      lcSttFinalTranscriptRef.current = ''
      setLcSttTranscript('')
      setLcAudioBlob(null)
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      lcRecorderRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) lcChunksRef.current.push(e.data) }
      mr.onstop = () => {
        setLcAudioBlob(new Blob(lcChunksRef.current, { type: 'audio/webm' }))
        stopLcSpeechToText()
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start(250)
      lcIsRecordingRef.current = true
      setLcIsRecording(true); setLcAudioDuration(0)
      lcTimerRef.current = setInterval(() => setLcAudioDuration(d => d + 1), 1000)
      startLcSpeechToText()
    } catch { toast.error('Microphone access denied') }
  }

  const stopLcRecording = () => {
    if (lcRecorderRef.current?.state === 'recording') lcRecorderRef.current.stop()
    lcIsRecordingRef.current = false
    stopLcSpeechToText()
    if (lcTimerRef.current) {
      clearInterval(lcTimerRef.current)
      lcTimerRef.current = null
    }
    setLcIsRecording(false)
  }

  const handleLcSubmitExplanation = async () => {
    const q = questions[currentIndex]
    setLcSubmitting(true)
    try {
      const isAudioExplain = interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING'
      let res: any
      if (isAudioExplain) {
        // Audio explanation — send as multipart
        if (!lcAudioBlob) { toast.error('Please record your explanation.'); setLcSubmitting(false); return }
        const verifiedLcTranscript = lcSttTranscript.trim()
        const fd = new FormData()
        fd.append('attemptId', attempt.id)
        fd.append('answerId', lcAnswerId)
        fd.append('questionId', q.id)
        if (lcActiveFollowUp) fd.append('askedPrompt', lcActiveFollowUp)
        fd.append('sttTranscript', verifiedLcTranscript)
        fd.append('audio', lcAudioBlob, 'explanation.webm')
        res = await attemptApi.submitLiveCodingExplain(fd)
      } else {
        // Text explanation — evaluate via normal interview answer endpoint
        if (!lcExplanation.trim() || lcExplanation.trim().split(/\s+/).length < 10) {
          toast.error('Please write at least 10 words explaining your solution.'); setLcSubmitting(false); return
        }
        res = await attemptApi.submitInterview({
          attemptId: attempt.id, questionId: q.id,
          mode: 'TEXT',
          askedPrompt: lcActiveFollowUp || undefined,
          textAnswer: lcExplanation,
          timeTakenSeconds: 0,
        })
      }

      if (res?.followUp && !lcActiveFollowUp) {
        toast('Follow-up question!', { icon: '💬' })
        setLcActiveFollowUp(res.followUp)
        setLcExplanation('')
        setLcAudioBlob(null)
        setLcAudioDuration(0)
        setLcSttTranscript('')
        lcSttFinalTranscriptRef.current = ''
        return
      }

      // Advance to next question
      resetLcState()
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1)
        // If next question is also live coding, activate its code phase
        const next = questions[currentIndex + 1]
        if (next?.liveCodingProblem) { setLcPhase('code'); setLcCode(next.liveCodingStarter?.javascript || '') }
      } else {
        await handleFinish()
      }
    } catch { toast.error('Failed to submit explanation') }
    finally { setLcSubmitting(false) }
  }

  async function submitCurrentAnswer(options?: { forcedAudioBlob?: Blob; forcedAudioDuration?: number; fromAutoTimeout?: boolean }) {
    if (submitting || !attempt) return

    const q = questions[currentIndex]
    if (!q) return

    const qId = q.id
    const isLcQuestion = !!q.liveCodingProblem

    // If this is a live coding question in a mixed round, the LC submit flow handles it.
    if (isLcQuestion && lcPhase !== null) {
      if (!options?.fromAutoTimeout) {
        toast('Please submit your code and explanation using the buttons above.', { icon: '💡' })
      }
      return
    }

    const isTextMode = interviewMode === 'TEXT' || interviewMode === 'TEXT_LIVE_CODING'
    const isAudioMode = interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING'

    if (isTextMode) {
      if (!answers[qId]?.trim()) { toast.error('Please type your answer.'); return }
      if (answers[qId].trim().split(/\s+/).length < 10) { toast.error('Min 10 words required.'); return }
    }

    const effectiveAudioBlob = options?.forcedAudioBlob ?? audioBlob
    const effectiveAudioDuration = options?.forcedAudioDuration ?? audioDurationRef.current ?? audioDuration
    let audioToSubmit: Blob | null = null

    if (isAudioMode) {
      if (isRecordingRef.current && !options?.forcedAudioBlob) {
        toast('Recording is still in progress. Please wait a moment.', { icon: '🎙️' })
        return
      }
      if (!effectiveAudioBlob) {
        toast.error('Please record your answer.')
        return
      }
      audioToSubmit = effectiveAudioBlob
    }

    stopSpeaking()
    setSubmitting(true)

    try {
      let res: any
      if (isTextMode) {
        res = await attemptApi.submitInterview({
          attemptId: attempt.id,
          questionId: qId,
          mode: 'TEXT',
          askedPrompt: activeFollowUp || undefined,
          textAnswer: answers[qId],
          timeTakenSeconds: 0,
        })
      } else {
        const verifiedTranscript = sttTranscript.trim()
        const metrics = computeDeliveryMetrics(verifiedTranscript, effectiveAudioDuration)
        const fd = new FormData()
        fd.append('attemptId', attempt.id)
        fd.append('questionId', qId)
        fd.append('mode', 'AUDIO')
        fd.append('timeTakenSeconds', String(effectiveAudioDuration))
        fd.append('durationSeconds', String(effectiveAudioDuration))
        fd.append('speechDuration', String(metrics.speechDuration))
        fd.append('silenceRatio', String(metrics.silenceRatio))
        fd.append('wordsPerMinute', String(metrics.wordsPerMinute))
        fd.append('wordCount', String(metrics.wordCount))
        fd.append('fillerWordCount', String(metrics.fillerWordCount))
        fd.append('fillerWordRatio', String(metrics.fillerWordRatio))
        fd.append('deliveryScore', String(metrics.deliveryScore))
        fd.append('sttTranscript', verifiedTranscript)
        if (activeFollowUp) fd.append('askedPrompt', activeFollowUp)
        fd.append('audio', audioToSubmit!, `answer-${qId}.webm`)
        res = await attemptApi.submitInterviewAudio(fd)
      }

      if (res?.followUp && !activeFollowUp) {
        toast('Follow-up question!', { icon: '💬' })
        setActiveFollowUp(res.followUp)
        setAnswers(prev => ({ ...prev, [qId]: '' }))
        setAudioBlob(null)
        setAudioDuration(0)
        audioDurationRef.current = 0
        setSttTranscript('')
        sttFinalTranscriptRef.current = ''
        return
      }

      setActiveFollowUp(null)
      setAudioBlob(null)
      setAudioDuration(0)
      audioDurationRef.current = 0
      setSttTranscript('')
      sttFinalTranscriptRef.current = ''

      if (currentIndex < questions.length - 1) {
        const next = questions[currentIndex + 1]
        if (next?.liveCodingProblem) {
          setLcPhase('code')
          setLcCode(next.liveCodingStarter?.javascript || '')
        }
        setCurrentIndex(currentIndex + 1)
      } else {
        await handleFinish()
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = async () => {
    await submitCurrentAnswer()
  }

  async function handleFinish() {
    try {
      const res = await attemptApi.complete(attempt.id)
      const outcome = res.advancement?.outcome
      if (outcome === 'ADVANCED')           navigate('/candidate/lobby',      { state: { advancement: res.advancement } })
      else if (outcome === 'ALL_ROUNDS_COMPLETE') navigate('/candidate/complete')
      else if (outcome === 'REJECTED')      navigate('/candidate/terminated', { state: { reason: res.advancement?.reason, type: 'failed' } })
      else if (outcome === 'FLAGGED')       navigate('/candidate/complete',   { state: { pendingReview: true } })
      else                                  navigate('/candidate/lobby')
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to finish.') }
  }

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', gap:12 }}>
        <div className="spinner" />
        <span style={{ color:'var(--text-secondary)', fontSize:'0.875rem' }}>Preparing interview...</span>
      </div>
    )
  }

  const q = questions[currentIndex]
  if (!q) return <div style={{ padding:40, color:'var(--text-secondary)' }}>No questions available.</div>

  const isLiveCodingQ = !!q.liveCodingProblem
  // Auto-activate live coding phase when arriving at a live coding question
  if (isLiveCodingQ && lcPhase === null) {
    setTimeout(() => { setLcPhase('code'); setLcCode(q.liveCodingStarter?.javascript || '') }, 0)
  }

  const isLast    = currentIndex === questions.length - 1
  const isTextMode  = interviewMode === 'TEXT' || interviewMode === 'TEXT_LIVE_CODING'
  const isAudioMode = interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING'
  const canSubmit = isLiveCodingQ
    ? false  // LC questions use their own submit buttons, not handleNext
    : isTextMode
      ? (answers[q.id] || '').trim().split(/\s+/).length >= 10
      : !!audioBlob && !isRecording
  const isNearLimit = audioDuration >= WARN_RECORD_SECONDS

  // ── Live coding question inline render ────────────────────────
  if (isLiveCodingQ) {
    const lcPassedCount = lcTestResults?.filter((r: any) => r.passed).length ?? 0
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(99,102,241,0.4)' }}>
            <Code2 size={22} color="white" />
          </div>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', marginBottom: 2 }}>Live Coding Challenge</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Question {currentIndex + 1} of {questions.length}</span>
              <span className="badge badge-primary" style={{ fontSize: '0.6rem' }}>{lcPhase === 'explain' ? 'PHASE 2: EXPLAIN' : 'PHASE 1: CODE'}</span>
            </div>
          </div>
        </div>

        {lcPhase === 'code' && (
          <>
            <div className="card" style={{ background: 'var(--bg-elevated)', padding: '20px 24px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing:'0.08em', marginBottom: 10 }}>Problem</div>
              <div style={{ color: 'var(--text-primary)', lineHeight: 1.75, fontSize: '0.95rem', background: 'transparent' }} className="markdown-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{q.liveCodingProblem}</ReactMarkdown>
              </div>
              {(q.liveCodingTestCases || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Sample Test Cases</div>
                  {(q.liveCodingTestCases || []).map((tc: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 12, fontSize: '0.82rem', marginBottom: 6, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-muted)', minWidth: 60 }}>Input:</span><code style={{ color: 'var(--cream)' }}>{tc.input}</code>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 16 }}>→</span>
                      <code style={{ color: '#fb8a1e' }}>{tc.expectedOutput}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Language:</label>
              {LC_LANG_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setLcLanguage(opt.value)}
                  className={`btn btn-sm ${lcLanguage === opt.value ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.75rem', padding: '3px 10px' }}>{opt.label}</button>
              ))}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', height: 320 }}>
              <div style={{ padding: '6px 12px', background: '#1a1a2e', borderBottom: '1px solid #334155', fontSize: '0.75rem', color: '#64748b' }}>Code Editor</div>
              <Editor key={`lc-${q.id}-${lcLanguage}`} height="278px" language={lcLanguage}
                value={lcCode} theme="vs-dark"
                onChange={val => setLcCode(val ?? '')}
                options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, wordWrap: 'on', fontFamily: "'Cascadia Code','Fira Code',monospace", automaticLayout: true }}
              />
            </div>

            {lcTestResults && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: lcPassedCount === lcTestResults.length ? 'var(--green-dark)' : 'var(--red)' }}>{lcPassedCount}/{lcTestResults.length} test cases passed</div>
                {lcTestResults.map((r: any, i: number) => (
                  <div key={i} style={{ color: r.passed ? 'var(--green-dark)' : 'var(--red)', marginBottom: 4 }}>
                    {r.passed ? '✓' : '✗'} Case {i + 1} — Expected: <code>{r.expectedOutput}</code> Got: <code>{r.actualOutput || 'no output'}</code>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={handleLcRunCode} disabled={lcRunning} style={{ gap: 6 }}>
                <Play size={13} /> {lcRunning ? 'Running…' : 'Run Tests'}
              </button>
              <button className="btn btn-primary" onClick={handleLcSubmitCode} disabled={lcSubmitting} style={{ minWidth: 150, gap: 8 }}>
                {lcSubmitting ? <><div className="spinner spinner-sm" /> Submitting…</> : <><Code2 size={14} /> Submit Code</>}
              </button>
            </div>
          </>
        )}

        {lcPhase === 'explain' && (
          <>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Code Score</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#22c55e' }}>{((lcCodeScore ?? 0) * 10).toFixed(0)}%</div>
              </div>
              <div style={{ color: 'var(--orange)', fontWeight: 600, fontSize: '0.9rem' }}>Phase 2: Explain Your Solution</div>
            </div>

            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                {lcActiveFollowUp ? 'Follow-up Prompt' : 'AI Prompt'}
              </div>
              <p style={{ color: 'var(--cream)', fontSize: '0.95rem', margin: 0 }}>{lcActiveFollowUp || lcExplanationPrompt}</p>
            </div>

            <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, overflow: 'auto', fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-muted)', margin: 0, maxHeight: 180 }}>{lcCode}</pre>

            {(interviewMode === 'TEXT' || interviewMode === 'TEXT_LIVE_CODING') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea value={lcExplanation} onChange={e => setLcExplanation(e.target.value)}
                  placeholder={lcActiveFollowUp ? 'Answer the follow-up question with concrete technical details...' : 'Explain your approach, time/space complexity, and any trade-offs...'}
                  className="form-textarea"
                  style={{ minHeight: 160, fontSize: '0.95rem', lineHeight: 1.65, background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lcExplanation.trim().split(/\s+/).filter(Boolean).length} words (min 10)</span>
              </div>
            )}

            {(interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING') && (
              <div style={{ background: 'var(--bg-elevated)', border: `1px solid ${lcIsRecording ? 'rgba(251,55,30,0.4)' : 'var(--border)'}`, borderRadius: 14, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
                {lcIsRecording && <p style={{ color: 'var(--red)', fontWeight: 600 }}>🔴 Recording — speak clearly and naturally.</p>}
                {lcAudioBlob && !lcIsRecording && <p style={{ color: 'var(--green-dark)' }}>✓ Explanation recorded ({lcAudioDuration}s)</p>}
                {!lcAudioBlob && !lcIsRecording && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{lcActiveFollowUp ? 'Record your follow-up response based on your previous explanation.' : 'Record your explanation of the code you just wrote.'}</p>}

                <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:8, textAlign:'left', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                    <span style={{ color:'var(--text-primary)', fontSize:'0.8rem', fontWeight:600 }}>Speech-to-Text Verification</span>
                    <span style={{ color:'var(--text-muted)', fontSize:'0.72rem' }}>{lcSttTranscript.trim().split(/\s+/).filter(Boolean).length} words</span>
                  </div>
                  <textarea
                    value={lcSttTranscript}
                    onChange={(e) => {
                      setLcSttTranscript(e.target.value)
                      lcSttFinalTranscriptRef.current = e.target.value
                    }}
                    placeholder={supportsSpeechRecognition
                      ? 'Live transcript appears here while recording. Edit it if needed before submitting.'
                      : 'Automatic speech-to-text is unavailable in this browser. Type what you spoke to verify it.'}
                    className="form-textarea"
                    style={{ minHeight: 96, fontSize:'0.9rem', lineHeight:1.55, background:'var(--bg-elevated)', color:'var(--text-primary)', resize:'vertical' }}
                  />
                  <span style={{ color:'var(--text-muted)', fontSize:'0.73rem' }}>
                    {supportsSpeechRecognition
                      ? (lcIsRecording ? 'Listening in English (en)... transcript updates live.' : 'Review and adjust the transcript before you continue.')
                      : 'Enable Chrome/Edge speech recognition for live transcript support.'}
                  </span>
                </div>

                <button className={`btn ${lcIsRecording ? 'btn-danger' : 'btn-primary'}`}
                  onClick={lcIsRecording ? stopLcRecording : startLcRecording}
                  style={{ width: 56, height: 56, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {lcIsRecording ? <Square size={20} /> : <span style={{ fontSize: '1.2rem' }}>🎙️</span>}
                </button>
                {lcAudioBlob && !lcIsRecording && (
                  <button className="btn btn-outline btn-sm" onClick={() => { setLcAudioBlob(null); setLcAudioDuration(0); setLcSttTranscript(''); lcSttFinalTranscriptRef.current = '' }}>Re-record</button>
                )}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleLcSubmitExplanation} disabled={lcSubmitting} style={{ alignSelf: 'flex-end', minWidth: 180, gap: 8 }}>
              {lcSubmitting
                ? <><div className="spinner spinner-sm" /> Submitting…</>
                : isLast ? <><Send size={15} /> Finish Interview</> : <>Submit & Continue <ChevronRight size={15} /></>}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'32px 20px', width:'100%', display:'flex', flexDirection:'column', gap:24 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:56, height:56, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg, var(--orange), var(--red))', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px var(--orange-glow)' }}>
          <MessageSquare size={26} color="white" />
        </div>
        <div>
          <h2 style={{ color:'var(--text-primary)', fontSize:'1.3rem', marginBottom:2 }}>AI Interview</h2>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>Question {currentIndex + 1} of {questions.length}</span>
            <span className={`badge ${isAudioMode ? 'badge-teal' : 'badge-primary'}`} style={{ fontSize:'0.6rem' }}>
              {interviewMode === 'TEXT_LIVE_CODING' ? '💻 TEXT + CODING' : interviewMode === 'AUDIO_LIVE_CODING' ? '🎙️💻 AUDIO + CODING' : interviewMode === 'AUDIO' ? '🎙️ AUDIO' : '📝 TEXT'}
            </span>
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className="card" style={{ background:'var(--bg-elevated)', padding:'28px 28px 22px', position:'relative', border:'1px solid var(--border)' }}>
        <div style={{ position:'absolute', top:-10, left:20, background:'var(--orange)', color:'white', fontSize:'0.65rem', fontWeight:700, padding:'2px 10px', borderRadius:4 }}>AI INTERVIEWER</div>
        {activeFollowUp && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:10, fontSize:'0.68rem', color:'var(--orange)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--orange)' }} /> Follow-up Question
          </div>
        )}
        <p style={{ color:'var(--text-primary)', fontSize:'1.15rem', lineHeight:1.65, fontWeight:500, marginBottom:18 }}>{activeFollowUp || q.prompt}</p>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {isSpeaking ? (
            <>
              <button className="btn btn-sm btn-ghost" onClick={handleStopTTS} style={{ gap:6, fontSize:'0.8rem' }}>
                <VolumeX size={14} /> Skip & Start Recording
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div className="pulse" style={{ width:7, height:7, borderRadius:'50%', background:'var(--orange)' }} />
                <span style={{ fontSize:'0.78rem', color:'var(--orange)' }}>Reading question...</span>
              </div>
            </>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={handleReplay} style={{ gap:6, fontSize:'0.8rem' }}>
              <Volume2 size={14} /> Replay Question
            </button>
          )}
        </div>
      </div>

      {/* TEXT MODE */}
      {(interviewMode === 'TEXT' || interviewMode === 'TEXT_LIVE_CODING') && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <textarea
            value={answers[q.id] || ''}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            placeholder="Type your answer here..."
            className="form-textarea"
            style={{ minHeight:180, fontSize:'1rem', lineHeight:1.65, background:'var(--bg-card)', color:'var(--text-primary)' }}
          />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', color:'var(--text-muted)' }}>
            <span>
              {(answers[q.id] || '').trim().split(/\s+/).filter(Boolean).length} words{' '}
              <span style={{ color: (answers[q.id] || '').trim().split(/\s+/).filter(Boolean).length < 10 ? 'var(--red)' : 'var(--green-dark)' }}>
                {(answers[q.id] || '').trim().split(/\s+/).filter(Boolean).length < 10 ? '(min 10 words)' : '✓'}
              </span>
            </span>
            <span>Be specific and detailed</span>
          </div>
        </div>
      )}

      {/* AUDIO MODE */}
      {(interviewMode === 'AUDIO' || interviewMode === 'AUDIO_LIVE_CODING') && (
        <div style={{ background:'var(--bg-elevated)', borderRadius:14, border:`1px solid ${isRecording ? 'rgba(251,55,30,0.4)' : 'var(--border)'}`, padding:'28px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:18, textAlign:'center', transition:'border-color 0.3s' }}>

          {isSpeaking && <p style={{ color:'var(--text-secondary)', fontSize:'0.9rem' }}>🔊 Listen carefully — recording starts automatically when the question finishes.</p>}

          {isRecording && !showTimeWarn && <p style={{ color:'var(--red)', fontSize:'0.9rem', fontWeight:600 }}>🔴 Recording in progress — speak clearly and naturally.</p>}

          {isRecording && showTimeWarn && (
            <div style={{ background:'var(--orange-soft)', border:'1px solid var(--orange)', borderRadius:8, padding:'10px 16px', display:'flex', alignItems:'center', gap:8, color:'var(--orange)', fontSize:'0.85rem', fontWeight:600 }}>
              <AlertTriangle size={16} />
              {MAX_RECORD_SECONDS - audioDuration} seconds left — start wrapping up
            </div>
          )}

          {audioBlob && !isRecording && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              <p style={{ color:'var(--green-dark)', fontSize:'0.9rem' }}>✓ Answer recorded ({formatDuration(audioDuration)})</p>
            </div>
          )}

          <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:8, textAlign:'left', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <span style={{ color:'var(--text-primary)', fontSize:'0.8rem', fontWeight:600 }}>Speech-to-Text Verification</span>
              <span style={{ color:'var(--text-muted)', fontSize:'0.72rem' }}>{sttTranscript.trim().split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <textarea
              value={sttTranscript}
              onChange={(e) => {
                setSttTranscript(e.target.value)
                sttFinalTranscriptRef.current = e.target.value
              }}
              placeholder={supportsSpeechRecognition
                ? 'Live transcript appears here while recording. Edit it if needed before submitting.'
                : 'Automatic speech-to-text is unavailable in this browser. Type what you spoke to verify it.'}
              className="form-textarea"
              style={{ minHeight: 96, fontSize:'0.9rem', lineHeight:1.55, background:'var(--bg-elevated)', color:'var(--text-primary)', resize:'vertical' }}
            />
            <span style={{ color:'var(--text-muted)', fontSize:'0.73rem' }}>
              {supportsSpeechRecognition
                ? (isRecording ? 'Listening in English (en)... transcript updates live.' : 'Review and adjust the transcript before you continue.')
                : 'Enable Chrome/Edge speech recognition for live transcript support.'}
            </span>
          </div>

          {/* Recording UI */}
          {isRecording && (
            <>
              <div style={{ position:'relative', width:80, height:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid var(--red)', opacity:0.4, animation:'pulse 1s ease infinite' }} />
                <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px var(--red-glow)' }}>
                  <Square size={22} color="white" />
                </div>
              </div>
              <span style={{ fontFamily:'JetBrains Mono, monospace', fontSize:'1.4rem', fontWeight:700, color: isNearLimit ? 'var(--orange)' : 'var(--red)' }}>
                {formatDuration(audioDuration)}
                <span style={{ fontSize:'0.7rem', fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>/ {formatDuration(MAX_RECORD_SECONDS)}</span>
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:3, height:28 }}>
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} style={{ width:3, borderRadius:3, background: isNearLimit ? 'var(--orange)' : 'var(--red)', height:`${10 + Math.sin(i * 0.8) * 8}px`, animation:`pulse ${0.35 + i * 0.07}s ease infinite` }} />
                ))}
              </div>
              <button className="btn btn-outline btn-sm" onClick={stopRecording} style={{ gap:6 }}>
                <Square size={13} /> Stop & Review
              </button>
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--border)', paddingTop:20 }}>
        <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
          {isAudioMode ? 'English TTS plays first, then recording auto-starts and auto-submits at 90s.' : 'Use specific examples from your experience'}
        </div>
        <button className="btn btn-primary" onClick={handleNext} disabled={submitting || !canSubmit || isSpeaking} style={{ minWidth:160, gap:8 }}>
          {submitting
            ? <><div className="spinner spinner-sm" /> Processing...</>
            : isLast ? <><Send size={16} /> Finish Interview</> : <>Next Question <ChevronRight size={16} /></>
          }
        </button>
      </div>
    </div>
  )
}