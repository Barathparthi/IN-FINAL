import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Mic, CheckCircle, AlertCircle, RefreshCw, Monitor, Shield, Cpu } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import { useQuery } from '@tanstack/react-query'
import { candidateApi } from '../../services/api.services'

export default function PermissionsGatePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const videoRef = useRef<HTMLVideoElement>(null)

  const [cameraState, setCameraState] = useState<'pending' | 'testing' | 'success' | 'failed'>('pending')
  const [micState, setMicState] = useState<'pending' | 'testing' | 'success' | 'failed'>('pending')
  const [monitorState, setMonitorState] = useState<'pending' | 'success' | 'failed'>('pending')
  const [processState, setProcessState] = useState<'pending' | 'success' | 'failed'>('pending')
  const [vmState, setVmState] = useState<'pending' | 'success' | 'failed'>('pending')
  const [unauthorizedApps, setUnauthorizedApps] = useState<string[]>([])
  const [volumeLevel, setVolumeLevel] = useState(0)

  const isElectron = (window as any).electronAPI?.isElectron

  useEffect(() => {
    if (isElectron) {
      // Layer 4: Clear clipboard on entry
      (window as any).electronAPI.clearClipboard();

      // Layer 1: Run Monitor check automatically
      (window as any).electronAPI.checkMonitors().then((res: any) => {
         setMonitorState(res.isAllowed ? 'success' : 'failed');
      });

      // Layer 6: Run VM check automatically
      (window as any).electronAPI.checkVM().then((res: any) => {
         setVmState(!res.isVM ? 'success' : 'failed');
      });

      // Layer 1: Run Process check automatically
      (window as any).electronAPI.checkProcesses().then((res: any) => {
         if (res.unauthorized.length > 0) {
           setUnauthorizedApps(res.unauthorized);
           setProcessState('failed');
         } else {
           setProcessState('success');
         }
      });
    }
  }, [isElectron])

  const testPermissions = async () => {
    setCameraState('testing')
    setMicState('testing')

    // Re-run electron checks
    if (isElectron) {
        const mon = await (window as any).electronAPI.checkMonitors();
        setMonitorState(mon.isAllowed ? 'success' : 'failed');

        const vm = await (window as any).electronAPI.checkVM();
        setVmState(!vm.isVM ? 'success' : 'failed');

        const proc = await (window as any).electronAPI.checkProcesses();
        if (proc.unauthorized.length > 0) {
            setUnauthorizedApps(proc.unauthorized);
            setProcessState('failed');
        } else {
            setProcessState('success');
        }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      setCameraState('success')
      setMicState('success')

      // Set up Audio Context to detect microphone activity
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)

      analyser.smoothingTimeConstant = 0.8
      analyser.fftSize = 1024
      microphone.connect(analyser)

      const updateVolume = () => {
        if (micState === 'failed') return;
        const array = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(array)
        let values = 0
        for (let i = 0; i < array.length; i++) {
          values += array[i]
        }
        const average = values / array.length
        setVolumeLevel(average)
        
        if (stream.active) {
          requestAnimationFrame(updateVolume)
        }
      }
      
      updateVolume()

    } catch (err: any) {
      console.error('Camera/Mic permission error:', err)
      toast.error('Permissions denied. Please allow camera and microphone access to continue.')
      setCameraState('failed')
      setMicState('failed')
    }
  }

  const { data: profile } = useQuery({
    queryKey: ['candidate', 'profile'],
    queryFn:  candidateApi.getProfile
  })

  useEffect(() => {
    if (profile?.status === 'READY' || profile?.status === 'IN_PROGRESS') {
       navigate('/candidate/lobby')
    } else if (profile?.status === 'TERMINATED' || profile?.status === 'REJECTED') {
       navigate('/candidate/terminated')
    } else if (profile?.status === 'COMPLETED') {
       navigate('/candidate/complete')
    }
  }, [profile])

  const handleContinue = () => {
    sessionStorage.setItem('permissions_granted', 'true')
    
    // Stop tracks
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
    }

    if (user?.mustChangePassword) {
      navigate('/force-change-password')
    } else {
      navigate('/candidate/identity-verification')
    }
  }

  useEffect(() => {
    return () => {
      // Cleanup tracks on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [videoRef])

  const bothWorking = cameraState === 'success' && 
                      micState === 'success' && 
                      (monitorState === 'success' || !isElectron) &&
                      (processState === 'success' || !isElectron) &&
                      (vmState === 'success' || !isElectron);

  const securityCheckCompleted = isElectron 
    ? (monitorState !== 'pending' && processState !== 'pending' && vmState !== 'pending')
    : true;

  // Browser Mode Warning Header
  const browserWarning = !isElectron && (
    <div style={{ 
      background: 'rgba(251, 133, 30, 0.1)', 
      border: '1px solid var(--orange)', 
      borderRadius: '8px', 
      padding: '12px 16px', 
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      textAlign: 'left'
    }}>
      <AlertCircle size={24} color="var(--orange)" style={{ flexShrink: 0 }} />
      <div style={{ fontSize: '0.85rem' }}>
        <strong style={{ color: 'var(--orange)', display: 'block', marginBottom: '2px' }}>Browser Mode Enabled</strong>
        You are attending via a standard browser. Advanced proctoring features (background app scanning, multimonitor detection) are disabled.
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      padding: '20px'
    }}>
      <div className="card fade-in" style={{ maxWidth: '700px', width: '100%', padding: '40px' }}>
        <h1 style={{ marginBottom: '8px', textAlign: 'center' }}>
          <span style={{ color: 'var(--orange)' }}>System</span> Check
        </h1>
        {browserWarning}
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
          To ensure a fair and supervised assessment environment, we require hardware and integrity verification.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
          
          {/* Camera Card */}
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '12px', padding: '16px',
            border: `1px solid ${cameraState === 'success' ? 'var(--green-dark)' : cameraState === 'failed' ? 'var(--red)' : 'var(--border)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
          }}>
            <div style={{ color: cameraState === 'success' ? 'var(--green-dark)' : 'var(--text-muted)' }}>
              <Camera size={32} />
            </div>
            
            <div style={{ width: '100%', height: '120px', background: 'var(--bg-hover)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
              {cameraState === 'success' ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', color: 'var(--green)' }}>Live</div>
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {cameraState === 'testing' ? 'Connecting...' : cameraState === 'failed' ? 'Camera failed' : 'Camera inactive'}
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
               {cameraState === 'success' ? <><CheckCircle size={14} color="var(--green-dark)" /> Camera OK</> : <span>Camera check</span>}
            </div>
          </div>

          {/* Microphone Card */}
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '12px', padding: '16px',
            border: `1px solid ${micState === 'success' ? 'var(--green-dark)' : micState === 'failed' ? 'var(--red)' : 'var(--border)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
          }}>
            <div style={{ color: micState === 'success' ? 'var(--green-dark)' : 'var(--text-muted)' }}>
              <Mic size={32} />
            </div>
            
            <div style={{ width: '100%', height: '120px', background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', borderRadius: '8px' }}>
              {micState === 'success' ? (
                <>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mic Level</div>
                  <div style={{ width: '80%', height: '12px', background: 'var(--bg-base)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ 
                      height: '100%', width: `${Math.min(100, volumeLevel * 2.5)}%`, 
                      background: 'var(--orange)', transition: 'width 0.1s ease-out'
                    }} />
                  </div>
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                   {micState === 'testing' ? 'Connecting...' : 'Mic inactive'}
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
               {micState === 'success' ? <><CheckCircle size={14} color="var(--green-dark)" /> Audio OK</> : <span>Audio check</span>}
            </div>
          </div>

          {/* Monitor Check Card */}
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '12px', padding: '16px',
            border: `1px solid ${monitorState === 'success' ? 'var(--green-dark)' : monitorState === 'failed' ? 'var(--red)' : 'var(--border)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
          }}>
            <div style={{ color: monitorState === 'success' ? 'var(--green-dark)' : 'var(--text-muted)' }}>
              <Monitor size={32} />
            </div>
            <div style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Display Count</div>
               <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {monitorState === 'failed' ? 'Multiple monitors detected. Please disconnect to continue.' : 'Only one monitor allowed.'}
               </div>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
               {isElectron ? (
                 <>
                  {monitorState === 'success' && <><CheckCircle size={14} color="var(--green-dark)" /> Single Display</>}
                  {monitorState === 'failed' && <><AlertCircle size={14} color="var(--red)" /> Multimonitor</>}
                  {monitorState === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Checking...</span>}
                 </>
               ) : (
                 <span style={{ color: 'var(--text-muted)' }}>N/A (Browser)</span>
               )}
            </div>
          </div>

          {/* Process Check Card */}
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '12px', padding: '16px',
            border: `1px solid ${processState === 'success' ? 'var(--green-dark)' : processState === 'failed' ? 'var(--red)' : 'var(--border)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
          }}>
            <div style={{ color: processState === 'success' ? 'var(--green-dark)' : 'var(--text-muted)' }}>
              <Shield size={32} />
            </div>
            <div style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Security Scan</div>
               <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {processState === 'failed' ? `Close: ${unauthorizedApps.join(', ')}` : 'Scanning for blocked apps...'}
               </div>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
               {isElectron ? (
                 <>
                  {processState === 'success' && <><CheckCircle size={14} color="var(--green-dark)" /> System Verified</>}
                  {processState === 'failed' && <><AlertCircle size={14} color="var(--red)" /> Unauthorized Apps</>}
                  {processState === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Scanning...</span>}
                 </>
               ) : (
                 <span style={{ color: 'var(--text-muted)' }}>N/A (Browser)</span>
               )}
            </div>
          </div>

          {/* Virtual Machine Check Card */}
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: '12px', padding: '16px',
            border: `1px solid ${vmState === 'success' ? 'var(--green-dark)' : vmState === 'failed' ? 'var(--red)' : 'var(--border)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
          }}>
            <div style={{ color: vmState === 'success' ? 'var(--green-dark)' : 'var(--text-muted)' }}>
              <Cpu size={32} />
            </div>
            <div style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Physical Hardware</div>
               <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {vmState === 'failed' ? 'Virtual Machine detected. Assessment must be taken on physical hardware.' : 'Verifying hardware integrity...'}
               </div>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
               {isElectron ? (
                 <>
                  {vmState === 'success' && <><CheckCircle size={14} color="var(--green-dark)" /> Genuine Device</>}
                  {vmState === 'failed' && <><AlertCircle size={14} color="var(--red)" /> Virtualized OS</>}
                  {vmState === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Checking...</span>}
                 </>
               ) : (
                 <span style={{ color: 'var(--text-muted)' }}>N/A (Browser)</span>
               )}
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!bothWorking || !securityCheckCompleted ? (
            <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1rem' }} onClick={testPermissions} disabled={cameraState === 'testing'}>
              <RefreshCw size={18} className={cameraState === 'testing' ? 'spin' : ''} /> 
              {cameraState === 'testing' ? 'Testing Hardware...' : 'Run Hardware Check'}
            </button>
          ) : (
            <button className="btn btn-success" style={{ width: '100%', padding: '14px', fontSize: '1rem' }} onClick={handleContinue}>
              Access Secured Assessment <CheckCircle size={18} />
            </button>
          )}

          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '12px', lineHeight: '1.4' }}>
             Assessment is locked to this device. <br/> 
             Unauthorized shortcuts (Alt+Tab, PrintScreen) will trigger an immediate strike.
          </div>
        </div>
      </div>
    </div>
  )
}
