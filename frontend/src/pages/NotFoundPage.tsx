import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: `
          radial-gradient(ellipse 60% 50% at 20% 50%, rgba(251,133,30,0.08) 0%, transparent 70%),
          radial-gradient(ellipse 50% 60% at 80% 50%, rgba(35,151,156,0.07) 0%, transparent 70%),
          var(--bg-base)
        `,
      }}
    >
      <div className="card fade-in" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(251,55,30,0.12)',
              color: 'var(--red)',
            }}
          >
            <AlertTriangle size={24} />
          </div>
        </div>

        <h1 style={{ marginBottom: '8px', color: 'var(--cream)' }}>404 - Page Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          The page you are looking for does not exist or was moved.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            <Home size={16} /> Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
