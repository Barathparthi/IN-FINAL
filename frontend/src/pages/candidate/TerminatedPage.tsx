import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldAlert, AlertTriangle } from 'lucide-react'
import { authApi } from '../../services/api.services'
import { useAuthStore } from '../../store/authStore'

export default function TerminatedPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { clearAuth } = useAuthStore()
  const [secondsLeft, setSecondsLeft] = useState(10)
  
  // Might receive type = 'proctoring' | 'failed' + reason
  const type = location.state?.type || 'proctoring'
  const reason = location.state?.reason || 'Unknown error. Your session was ended.'

  const isElectron = !!(window as any).electronBridge?.isElectron
  const handleExit = async () => {
    try {
      await authApi.logout()
    } catch (err) {
      console.error('Logout error:', err)
    }
    clearAuth()
    if (isElectron) {
      (window as any).electronBridge.notifyTestComplete()
    } else {
      navigate('/login')
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    const timeout = setTimeout(() => {
      handleExit()
    }, 10000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '40px' }}>
        
        {type === 'proctoring' ? (
          <>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--red-soft)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <ShieldAlert size={40} />
            </div>
            <h1 style={{ color: 'var(--cream)', fontSize: '1.8rem', marginBottom: '16px' }}>Terminal Violation</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '32px' }}>
              Your session was ended due to repeated proctoring violations. Your recruiter has been notified of the incidents captured during your assessment.
            </p>
          </>
        ) : (
          <>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--orange-soft)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <AlertTriangle size={40} />
            </div>
            <h1 style={{ color: 'var(--cream)', fontSize: '1.8rem', marginBottom: '16px' }}>Assessment Did Not Pass</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '32px' }}>
              You did not meet the required pass mark for this round. {reason}
            </p>
          </>
        )}

        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 18,
          fontSize: '0.85rem', color: 'var(--text-secondary)',
        }}>
          You will be redirected to login in <strong style={{ color: 'var(--text-primary)' }}>{secondsLeft}</strong> second{secondsLeft !== 1 ? 's' : ''}.
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleExit}>
          {isElectron ? 'Exit & Logout' : 'Logout'}
        </button>
      </div>
    </div>
  )
}
