import type { CampaignFormData } from '../../pages/admin/CreateCampaignPage'
import { Shield, AlertTriangle, EyeOff, AlertCircle } from 'lucide-react'

type ViolationState = 'STRIKE' | 'FLAG' | false

interface Props {
  form: CampaignFormData
  update: (patch: Partial<CampaignFormData>) => void
}

const VIOLATION_META: Record<string, {
  label: string
  desc: string
  emoji: string
  canFlag: boolean  // whether FLAG-ONLY is a valid option (e.g., BACKGROUND_VOICE is always flag)
}> = {
  PHONE_DETECTED:   { label: 'Phone Detected',   desc: 'Strike when a mobile device is visible in frame',          emoji: '📱', canFlag: true  },
  FACE_AWAY:        { label: 'Face Away',         desc: 'Strike when candidate looks away from screen',             emoji: '👀', canFlag: true  },
  MULTIPLE_FACES:   { label: 'Multiple Faces',    desc: 'Strike when more than one face is detected in the frame',  emoji: '👥', canFlag: true  },
  TAB_SWITCH:       { label: 'Tab Switch',        desc: 'Strike when candidate switches or leaves browser tab',      emoji: '🔀', canFlag: true  },
  FOCUS_LOSS:       { label: 'Focus Loss',        desc: 'Strike when browser window loses focus',                   emoji: '🖥️', canFlag: true  },
  BACKGROUND_VOICE: { label: 'Background Voice',  desc: 'Detects nearby speech — recommended as flag only',         emoji: '🔊', canFlag: false },
}

const STATE_OPTIONS: { value: ViolationState; label: string; color: string; bg: string; icon: React.ReactNode }[] = [
  { value: 'STRIKE', label: 'Strike',    color: '#fb923c', bg: 'rgba(251,133,30,0.15)',  icon: <AlertCircle   size={12} /> },
  { value: 'FLAG',   label: 'Flag Only', color: '#facc15', bg: 'rgba(250,204,21,0.12)',  icon: <AlertTriangle size={12} /> },
  { value: false,    label: 'Disabled',  color: '#64748b', bg: 'rgba(100,116,139,0.1)',  icon: <EyeOff        size={12} /> },
]

export default function Step5Proctoring({ form, update }: Props) {
  const strikes  = form.maxStrikes ?? 3
  const toggles  = form.violationToggles!

  const setState = (key: keyof typeof toggles, val: ViolationState) => {
    update({ violationToggles: { ...toggles, [key]: val } })
  }

  const enabledCount   = Object.values(toggles).filter(v => v !== false).length
  const strikeCount    = Object.values(toggles).filter(v => v === 'STRIKE').length
  const flagOnlyCount  = Object.values(toggles).filter(v => v === 'FLAG').length

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={18} style={{ color: 'var(--orange)' }} />
          Proctoring Configuration
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Configure AI violation detection and automatic termination rules.
          Each rule can be set to <strong>Strike</strong> (counts toward termination),
          <strong> Flag Only</strong> (logged but not penalised), or <strong>Disabled</strong>.
        </p>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: 'rgba(251,133,30,0.15)', color: '#fb923c' }}>
          {strikeCount} Strike rules
        </span>
        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: 'rgba(250,204,21,0.12)', color: '#facc15' }}>
          {flagOnlyCount} Flag-only rules
        </span>
        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>
          {6 - enabledCount} Disabled
        </span>
      </div>

      {/* Max Strikes Slider */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Maximum Strikes</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Session is terminated when this strike count is reached
            </div>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--grad-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1.3rem', color: '#fff',
            boxShadow: '0 4px 12px var(--orange-glow)',
          }}>
            {strikes}
          </div>
        </div>
        <input
          type="range" min={1} max={10} step={1}
          value={strikes}
          onChange={e => update({ maxStrikes: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--orange)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
          <span>1 — Very Strict</span>
          <span>3 — Recommended</span>
          <span>10 — Lenient</span>
        </div>
      </div>

      {/* Violation Rules */}
      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Violation Rules
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(Object.keys(VIOLATION_META) as (keyof typeof toggles)[]).map(key => {
          const meta    = VIOLATION_META[key]
          const current = toggles[key] as ViolationState
          const isOff   = current === false

          return (
            <div
              key={key}
              style={{
                background:   isOff ? 'var(--bg-elevated)' : current === 'FLAG' ? 'rgba(250,204,21,0.05)' : 'rgba(251,133,30,0.06)',
                border:       `1px solid ${isOff ? 'var(--border)' : current === 'FLAG' ? 'rgba(250,204,21,0.25)' : 'rgba(251,133,30,0.25)'}`,
                borderRadius: 'var(--radius-md)',
                padding:      '14px 16px',
                display:      'flex',
                alignItems:   'center',
                gap:          14,
                opacity:      isOff ? 0.55 : 1,
                transition:   'all 0.2s',
              }}
            >
              <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{meta.emoji}</span>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isOff ? 'var(--text-muted)' : 'var(--cream)' }}>
                    {meta.label}
                  </span>
                  {current === 'STRIKE' && (
                    <span style={{ padding: '1px 8px', borderRadius: 12, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(251,133,30,0.2)', color: '#fb923c' }}>
                      STRIKE
                    </span>
                  )}
                  {current === 'FLAG' && (
                    <span style={{ padding: '1px 8px', borderRadius: 12, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(250,204,21,0.2)', color: '#facc15' }}>
                      FLAG ONLY
                    </span>
                  )}
                  {current === false && (
                    <span style={{ padding: '1px 8px', borderRadius: 12, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>
                      DISABLED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{meta.desc}</div>
              </div>

              {/* 3-state segmented control */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, background: 'var(--bg-card)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                {STATE_OPTIONS
                  .filter(opt => meta.canFlag || opt.value !== false || true) // always show all 3
                  .filter(opt => meta.canFlag || opt.value !== 'STRIKE' || true) // keep all for non-canFlag, force them to use FLAG only if needed
                  .map(opt => {
                    const isActive = current === opt.value
                    // Background voice cannot be STRIKE — force it to FLAG or false
                    if (!meta.canFlag && opt.value === 'STRIKE') return null
                    return (
                      <button
                        key={String(opt.value)}
                        onClick={() => setState(key, opt.value)}
                        title={opt.label}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 6, border: 'none',
                          cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                          background: isActive ? opt.bg : 'transparent',
                          color:      isActive ? opt.color : 'var(--text-muted)',
                          transition: 'all 0.15s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    )
                  })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Warning footer */}
      <div style={{
        marginTop: 20,
        background: 'rgba(251,55,30,0.06)',
        border: '1px solid rgba(251,55,30,0.2)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        <span style={{ fontSize: '1.2rem' }}>⚠️</span>
        Sessions exceeding <strong style={{ color: 'var(--red)', margin: '0 4px' }}>{strikes}</strong> strikes
        ({strikeCount} active strike rule{strikeCount !== 1 ? 's' : ''}) will be automatically terminated and flagged for recruiter review.
      </div>
    </div>
  )
}
