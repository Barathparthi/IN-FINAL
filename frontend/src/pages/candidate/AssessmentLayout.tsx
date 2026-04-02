import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Clock, ShieldAlert, Sun, Moon } from 'lucide-react'
import { candidateApi } from '../../services/api.services'
import { ProctoringCamera } from '../../components/ProctoringCamera'
import { useThemeStore } from '../../store/themeStore'
import { useAssessmentLockdown } from '../../hooks/useAssessmentLockdown'

export default function AssessmentLayout() {
  const navigate = useNavigate()
  const { roundId } = useParams()
  const { theme, toggleTheme } = useThemeStore()
  const isElectron = (window as any).electronAPI?.isElectron

  // Violation reporting proxy (to be hooked into ProctoringCamera)
  const reportFnRef = useRef<((type: string, isStrike: boolean, screenshot?: string) => void) | null>(null)

  const { isFullscreen, enterFullscreen } = useAssessmentLockdown({
    onViolationReport: (type) => {
      // Trigger a formal strike with evidence when a lockdown rule is broken
      reportFnRef.current?.(type, true)
    }
  })

  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [roundTitle, setRoundTitle] = useState('')
  const [questions, setQuestions] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [attemptId, setAttemptId] = useState<string | undefined>(undefined)
  const [strikes, setStrikes] = useState(0)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['candidate', 'profile'],
    queryFn: candidateApi.getProfile,
    refetchInterval: 30000, 
  })

  // Timer logic
  useEffect(() => {
    if (timeLeft === null) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null
        if (prev <= 0) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft])
  
  useEffect(() => {
    if (profile && !faceDescriptor) {
       setFaceDescriptor((profile as any).faceDescriptor)
    }
    if (profile && (profile as any).strikeCount !== undefined) {
       setStrikes((profile as any).strikeCount)
    }
  }, [profile])

  useEffect(() => {
    if (isElectron) {
      // Listen for window blur (Tab Switch/Minimizing)
      (window as any).electronAPI.onWindowBlur((screenshot: string) => {
        if (reportFnRef.current) {
          toast.error('Focus Loss Detected! Screen captured and logged.', { duration: 5000 });
          reportFnRef.current('TAB_SWITCH', true, screenshot);
        }
      });
    }

    // Layer 8: Functional Key Lockdown (Renderer Level)
    const handleKeydown = (e: KeyboardEvent) => {
      // 1. Always allow Alphanumeric
      const isAlphanumeric = /^[a-zA-Z0-9]$/.test(e.key)
      
      // 2. Allow Essential Modifiers & Navigation
      const typingHelpers = ['Shift', 'CapsLock', 'Backspace', 'Enter', ' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      
      // 3. Allow Basic Punctuation for answers
      const punctuation = ['.', ',', '?', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', ':', "'", '"', '/', '<', '>', '\\', '|', '`', '~']
      
      const isWhitelisted = [...typingHelpers, ...punctuation].includes(e.key)

      if (!isAlphanumeric && !isWhitelisted && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toast.error(`Control key [${e.key}] is disabled.`, { id: 'key-block' });
      }
    };

    window.addEventListener('keydown', handleKeydown, true);
  }, [isElectron])

  // Layer 9: Background Active Polling
  useEffect(() => {
    if (!isElectron) return
    
    const interval = setInterval(async () => {
      try {
        const electron = (window as any).electronAPI
        
        // 1. Process Check
        const procResult = await electron.checkProcesses()
        if (procResult?.success && procResult.unauthorized?.length > 0) {
          toast.error(`Unauthorized background process detected: ${procResult.unauthorized.join(', ')}`, { duration: 6000 })
          reportFnRef.current?.('TAB_SWITCH', true) // Treat as a major violation
        }

        // 2. Monitor Check
        const monResult = await electron.checkMonitors()
        if (monResult && !monResult.isAllowed) {
          toast.error('Multiple monitors detected during assessment!', { duration: 6000 })
          reportFnRef.current?.('TAB_SWITCH', true) // Treat as a major violation
        }
      } catch (e) {
        console.error('Proctoring polling error:', e)
      }
    }, 30000) // Poll every 30 seconds

    return () => clearInterval(interval)
  }, [isElectron])

  if (isLoading) return <div className="spinner" />
  
  if (!profile) return <Navigate to="/login" replace />
  
  const profileData = profile as any

  if (profileData.status === 'TERMINATED' || profileData.status === 'REJECTED') {
    return <Navigate to="/candidate/terminated" replace state={{ reason: profileData.terminationReason }} />
  } 
  if (profileData.status === 'COMPLETED') {
    return <Navigate to="/candidate/complete" replace />
  }

  const rounds = profileData.campaign?.pipelineConfig?.rounds || []
  const currentRound = rounds.find((r: any) => r.id === roundId)
  const proctoringConfig = profileData.campaign?.pipelineConfig?.proctoring || {}
  const maxStrikes   = proctoringConfig.maxStrikes ?? 10
  const violations   = proctoringConfig.violations  || {}

  // Determine if any visual detection is needed (skip loading models if all camera rules are off)
  const cameraRulesEnabled = ['PHONE_DETECTED','FACE_AWAY','MULTIPLE_FACES'].some(
    k => violations[k] !== false
  )
  const proctoringEnabled = proctoringConfig.enabled !== false // default true

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      
      {/* Fullscreen Guard Overlay */}
      {!isFullscreen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', padding: '40px', textAlign: 'center'
        }}>
          <ShieldAlert size={64} color="var(--orange)" style={{ marginBottom: '24px' }} />
          <h2 style={{ color: '#fff', marginBottom: '12px' }}>Secure Mode Required</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '500px', marginBottom: '32px' }}>
            To ensure the integrity of this assessment, you must remain in fullscreen mode. 
            All developer shortcuts and right-click functions have been disabled.
          </p>
          <button className="btn btn-primary btn-lg" onClick={enterFullscreen}>
            Enter Secure Fullscreen
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{
        height: '60px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
             {profileData.campaign?.name} <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 500 }}>— {roundTitle || currentRound?.type || 'Round'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px', background: strikes > 0 ? 'rgba(239,68,68,0.1)' : 'var(--bg-hover)', borderRadius: '8px', border: `1px solid ${strikes > 0 ? 'var(--red)' : 'var(--border)'}`, color: strikes > 0 ? 'var(--red)' : 'var(--green-dark)' }}>
            <ShieldAlert size={18} />
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
              STRIKES: {strikes}/{maxStrikes}
            </span>
          </div>

          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--bg-hover)', borderRadius: '6px', border: '1px solid var(--border)', color: timeLeft && timeLeft < 300 ? 'var(--red)' : 'var(--green-dark)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            <Clock size={16} />
            {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
          </div>

          {/* Theme Toggle */}
          <button 
            onClick={toggleTheme}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ borderRadius: '50%' }}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        
        {/* Left Sidebar (Navigator placeholder) */}
        <aside style={{ width: '300px', background: 'var(--bg-elevated)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)' }}>
            Question Navigator
          </div>
          <div style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
            {questions.length > 0 ? (
              questions.map((_, i) => (
                <div key={i} 
                  onClick={() => setCurrentIndex(i)}
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i === currentIndex ? 'var(--orange)' : 'var(--bg-hover)',
                    color: i === currentIndex ? '#fff' : 'var(--text-secondary)',
                    border: i === currentIndex ? 'none' : '1px solid var(--border)',
                    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: i === currentIndex ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none'
                  }}>
                  {i + 1}
                </div>
              ))
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No questions loaded</div>
            )}
          </div>

          {/* Integrated Proctoring Camera — only if session is active and proctoring is enabled */}
          {sessionId && proctoringEnabled && (
            <div style={{ padding: '10px', marginTop: 'auto' }}>
              <ProctoringCamera 
                candidateId={profileData.id}
                attemptId={attemptId}
                sessionId={sessionId}
                referenceDescriptor={faceDescriptor}
                strikes={strikes}
                maxStrikes={maxStrikes}
                rules={violations}
                cameraRequired={cameraRulesEnabled}
                onEnrollComplete={(desc) => setFaceDescriptor(desc)}
                onStrikesChange={(count) => setStrikes(count)}
                onReportViolation={(fn) => { reportFnRef.current = fn }}
                onTerminate={() => {
                  toast.error('Assessment terminated due to repeated proctoring violations.')
                  navigate('/candidate/lobby')
                }}
              />
            </div>
          )}
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, padding: '32px', position: 'relative', overflowY: 'auto' }}>
          <Outlet context={{ 
            setTimer: setTimeLeft, setRoundTitle,
            questions, setQuestions, currentIndex, setCurrentIndex,
            attemptId, setAttemptId,
            strikes, setStrikes,
            sessionId, setSessionId,
            faceDescriptor, setFaceDescriptor
          }} />
        </main>
      </div>





    </div>
  )
}
