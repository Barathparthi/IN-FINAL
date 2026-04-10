import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, UserCheck, ArrowRight, Camera, Mail, Key, RefreshCcw } from 'lucide-react'
import { ProctoringCamera } from '../../components/ProctoringCamera'
import { useAuthStore } from '../../store/authStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { candidateApi } from '../../services/api.services'
import toast from 'react-hot-toast'

export default function IdentityVerificationPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [step, setStep] = useState<'otp' | 'biometric'>('otp')
  const [otp, setOtp] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [enrolled, setEnrolled] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['candidate', 'profile'],
    queryFn: candidateApi.getProfile
  })

  const sendOtpMutation = useMutation({
    mutationFn: candidateApi.sendKycOtp,
    onSuccess: () => toast.success('Verification code sent to your email'),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send verification code')
  })

  const verifyOtpMutation = useMutation({
    mutationFn: candidateApi.verifyKycOtp,
    onSuccess: () => {
      toast.success('Email verified successfully')
      setStep('biometric')
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Invalid verification code')
  })

  useEffect(() => {
    if (profile?.kycVerifiedAt) {
      setStep('biometric')
    }
    if (profile?.faceDescriptor) {
      setEnrolled(true)
    }
  }, [profile])

  // Auto-send OTP on mount if not verified
  useEffect(() => {
    if (profile && !profile.kycVerifiedAt && step === 'otp' && !sendOtpMutation.isPending && !sendOtpMutation.isSuccess) {
      sendOtpMutation.mutate()
    }
  }, [profile, step])

  const handleEnrollComplete = () => {
    setEnrolled(true)
    qc.invalidateQueries({ queryKey: ['candidate', 'profile'] })
  }

  const handleContinue = () => {
    if (user?.mustChangePassword) {
      navigate('/force-change-password')
    } else {
      navigate('/candidate/resume-upload')
    }
  }

  if (!profile) return <div className="spinner" />

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--dark)',
      color: 'var(--cream)',
      padding: '20px'
    }}>
      <div className="card fade-in" style={{ maxWidth: '800px', width: '100%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <UserCheck size={48} color="var(--orange)" style={{ margin: '0 auto 16px' }} />
          <h1>KYC <span style={{ color: 'var(--orange)' }}>Verification</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            To ensure a secure testing environment, please complete the two-step verification below.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: step === 'otp' ? '1fr' : '320px 1fr', gap: '40px', alignItems: 'start' }}>

          {/* LEFT SIDE: STEP INDICATORS OR CAMERA */}
          {step === 'biometric' ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ProctoringCamera
                candidateId={profile.id}
                sessionId="enrollment"
                referenceDescriptor={null}
                onEnrollComplete={handleEnrollComplete}
              />
            </div>
          ) : (
            <div style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
              <div className="card" style={{ background: 'var(--bg-elevated)', padding: '32px', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(251,133,30,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                  <Mail size={32} color="var(--orange)" />
                </div>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Check your email</h2>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  We've sent a 6-digit verification code to<br />
                  <strong style={{ color: 'var(--cream)' }}>{profile.user.email}</strong>
                </p>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ position: 'relative' }}>
                    <Key size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="000000"
                      className="form-input"
                      maxLength={6}
                      style={{ paddingLeft: '40px', textAlign: 'center', letterSpacing: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginBottom: '16px' }}
                  disabled={otp.length !== 6 || verifyOtpMutation.isPending}
                  onClick={() => verifyOtpMutation.mutate(otp)}
                >
                  {verifyOtpMutation.isPending ? 'Verifying...' : 'Verify Email'}
                </button>

                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%' }}
                  disabled={sendOtpMutation.isPending}
                  onClick={() => sendOtpMutation.mutate()}
                >
                  <RefreshCcw size={14} className={sendOtpMutation.isPending ? 'spin' : ''} /> Resend Code
                </button>
              </div>
            </div>
          )}

          {/* RIGHT SIDE: INSTRUCTIONS */}
          {(step === 'biometric' || true) && step !== 'otp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--green-dark)', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', background: 'var(--green-dark)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <ShieldCheck size={18} color="#fff" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Email Verified</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Identity proof stage 1 cleared via secure OTP challenge.
                    </p>
                  </div>
                </div>
              </div>

              <div className="card" style={{ background: 'var(--bg-elevated)', border: enrolled ? '1px solid var(--green-dark)' : '1px solid var(--orange)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', background: enrolled ? 'var(--green-dark)' : 'var(--orange)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                     {enrolled ? <ShieldCheck size={18} color="#fff" /> : <Camera size={18} color="#fff" />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>ID & Biometric Capture</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <strong>IMPORTANT:</strong> Hold your physical ID card (Aadhar, Work ID, etc.) next to your face so both are clearly visible in the camera before taking the photo.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem', opacity: enrolled ? 1 : 0.6 }}
                  disabled={!enrolled}
                  onClick={handleContinue}
                >
                  Continue to Assessment <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        {step === 'biometric' && (
          <div style={{ marginTop: '32px', padding: '16px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Camera size={14} color="var(--orange)" />
              Proctoring Requirement: Your capture must contain both your face and a valid ID card for the attempt to be valid.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
