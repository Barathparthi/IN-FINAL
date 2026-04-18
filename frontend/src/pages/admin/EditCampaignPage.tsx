import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi } from '../../services/api.services'
import toast from 'react-hot-toast'
import { Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import Step1Meta from '../../components/campaign-wizard/Step1Meta'
import Step2Pipeline from '../../components/campaign-wizard/Step2Pipeline'
import Step3RoundConfig from '../../components/campaign-wizard/Step3RoundConfig'
import Step4InterviewConfig from '../../components/campaign-wizard/Step4InterviewConfig'
import Step5Proctoring from '../../components/campaign-wizard/Step5Proctoring'
import Step6Review from '../../components/campaign-wizard/Step6Review'

import type {CampaignFormData } from './CreateCampaignPage'

const STEPS = [
  { label: 'Campaign Meta', short: '1' },
  { label: 'Pipeline', short: '2' },
  { label: 'Round Config', short: '3' },
  { label: 'Interview', short: '4' },
  { label: 'Proctoring', short: '5' },
  { label: 'Review', short: '6' },
]

const defaultForm: CampaignFormData = {
  name: '', role: '', department: '', jobDescription: '',
  rounds: [],
  maxStrikes: 3,
  violationToggles: {
    PHONE_DETECTED:   'STRIKE' as const,
    FACE_AWAY:        'STRIKE' as const,
    MULTIPLE_FACES:   'STRIKE' as const,
    TAB_SWITCH:       'STRIKE' as const,
    FOCUS_LOSS:       'STRIKE' as const,
    BACKGROUND_VOICE: 'FLAG'   as const,
  },
  interviewMode: 'TEXT',
  interviewDepth: 'DEEP',
  followUpEnabled: true,
}

function resolveHiringType(camp: any): 'CAMPUS' | 'LATERAL' {
  if (camp?.hiringType === 'CAMPUS' || camp?.hiringType === 'LATERAL') {
    return camp.hiringType
  }

  const rounds = camp?.rounds?.length ? camp.rounds : (camp?.pipelineConfig?.rounds || [])
  return rounds.some((r: any) => r?.roundType === 'MCQ') ? 'CAMPUS' : 'LATERAL'
}

export default function EditCampaignPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<CampaignFormData>(defaultForm)
  const [isHydrated, setIsHydrated] = useState(false)

  const { data: camp, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignApi.getOne(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (camp && !isHydrated) {
      const hiringType = resolveHiringType(camp)

      setForm({
        name: camp.name || '',
        role: camp.role || '',
        department: camp.department || '',
        jobDescription: camp.jobDescription || '',
        hiringType,
        expiresAt: camp.expiresAt ? new Date(camp.expiresAt).toISOString().split('T')[0] : undefined,
        maxCandidates: camp.maxCandidates || undefined,
        rounds: (camp.rounds?.length ? camp.rounds : (camp.pipelineConfig?.rounds || [])).map((r: any) => {
          const cfg = (typeof r.roundConfig === 'string' ? JSON.parse(r.roundConfig) : r.roundConfig) || r;
          
          return { 
            ...r,
            ...cfg,
            id: r.id || crypto.randomUUID(),
            totalQuestions: cfg.totalQuestions || cfg.problemCount || cfg.questionCount || 0,
            topicTags: cfg.topicTags || cfg.aptitudeTopics || cfg.dsaTopics || [],
            resumeSplitPercent: cfg.resumeSplit || cfg.resumeSplitPercent || 0,
            questionMode: cfg.questionMode || (cfg.aptitudeTopics?.length || cfg.dsaTopics?.length ? 'DSA' : 'JD-BASED'),
            passMarkPercent: cfg.passMarkPercent || 60,
            failAction: cfg.failAction || 'MANUAL_REVIEW'
          };
        }),
        maxStrikes: camp.pipelineConfig?.proctoring?.maxStrikes || 3,
        violationToggles: camp.pipelineConfig?.proctoring?.violations || {
          PHONE_DETECTED: 'STRIKE', FACE_AWAY: 'STRIKE', MULTIPLE_FACES: 'STRIKE',
          TAB_SWITCH: 'STRIKE', FOCUS_LOSS: 'STRIKE', BACKGROUND_VOICE: 'FLAG',
        },
        interviewMode: camp.pipelineConfig?.rounds?.find((r: any) => r.roundType === 'INTERVIEW')?.interviewMode || 
                       camp.pipelineConfig?.rounds?.find((r: any) => r.roundType === 'INTERVIEW')?.interviewMode || 'TEXT',
        interviewDepth: camp.pipelineConfig?.rounds?.find((r: any) => r.roundType === 'INTERVIEW')?.depth || 
                        camp.pipelineConfig?.rounds?.find((r: any) => r.roundType === 'INTERVIEW')?.interviewDepth || 'DEEP',
        followUpEnabled: camp.pipelineConfig?.rounds?.find((r: any) => r.roundType === 'INTERVIEW')?.followUpEnabled ?? true,
      })
      setIsHydrated(true)
    }
  }, [camp, isHydrated])

  const update = (patch: Partial<CampaignFormData>) =>
    setForm(prev => ({ ...prev, ...patch }))

  const hasInterviewRound = form.rounds.some(
    r => r.roundType === 'INTERVIEW'
  )
  const resolvedHiringType: 'CAMPUS' | 'LATERAL' = form.hiringType || 'LATERAL'

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        role: form.role,
        department: form.department || undefined,
        jobDescription: form.jobDescription,
        hiringType: resolvedHiringType,
        expiresAt: (form.expiresAt && form.expiresAt.trim() !== '') ? new Date(form.expiresAt).toISOString() : null,
        maxCandidates: form.maxCandidates || undefined,
        pipelineConfig: {
          timerMode: 'SHARED',
          proctoring: {
            maxStrikes: form.maxStrikes,
            violations: form.violationToggles,
          },
          rounds: form.rounds.map((r, i) => {
            const mapped: any = {
              roundType: r.roundType,
              order:     i + 1,
              timeLimitMinutes: r.timeLimitMinutes,
              passMarkPercent:  r.passMarkPercent,
              failAction:       r.failAction || 'MANUAL_REVIEW',
            }

            if (r.roundType === 'MCQ') {
              mapped.totalQuestions    = r.totalQuestions;
              mapped.aptitudeTopics     = r.topicTags;
              mapped.questionMode      = r.questionMode || 'JD_BASED';
              mapped.shuffleQuestions  = r.shuffleQuestions;
              mapped.negativeMarking   = r.negativeMarking;
              mapped.penaltyPerWrong   = r.penaltyPerWrong;
              mapped.marksPerQuestion  = r.marksPerQuestion;
              mapped.difficultyEasy    = r.difficultyEasy;
              mapped.difficultyMedium  = r.difficultyMedium;
              mapped.difficultyHard    = r.difficultyHard;
            } else if (r.roundType === 'CODING') {
              mapped.problemCount      = r.totalQuestions;
              mapped.dsaTopics         = r.topicTags;
              mapped.questionMode      = r.questionMode || 'JD_BASED';
              mapped.allowedLanguages  = r.allowedLanguages;
              mapped.difficultyEasy    = r.difficultyEasy;
              mapped.difficultyMedium  = r.difficultyMedium;
              mapped.difficultyHard    = r.difficultyHard;
            } else if (r.roundType === 'INTERVIEW') {
              mapped.questionCount     = r.totalQuestions;
              // Use round-specific settings if present, otherwise fallback to global form settings
              mapped.interviewMode     = r.interviewMode || form.interviewMode || 'TEXT';
              mapped.depth             = r.depth || form.interviewDepth || 'DEEP';
              mapped.followUpEnabled   = r.followUpEnabled ?? form.followUpEnabled ?? true;
              mapped.resumeSplit       = r.resumeSplitPercent ?? 0;
              mapped.allowedLanguages  = r.allowedLanguages;
            }
            return mapped
          }),
        },
      }
      return campaignApi.update(id!, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', id] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign updated! Warning: Questions will be regenerated based on this new config.')
      navigate(`/admin/campaigns/${id}`)
    },
    onError: (err: any) => {
      const data = err.response?.data
      if (data?.fields) {
        const fieldMsgs = data.fields.map((f: any) => `${f.field}: ${f.message}`).join(', ')
        toast.error(`Update validation failed: ${fieldMsgs}`, { duration: 6000 })
      } else {
        toast.error(data?.message || data?.error || 'Failed to update campaign')
      }
    },
  })

  const canNext = () => {
    switch (step) {
      case 0: return form.name && form.role && form.jobDescription.length >= 100
      case 1: return form.rounds.length >= 1
      case 2: return form.rounds.every(r => r.timeLimitMinutes && r.timeLimitMinutes > 0)
      case 3: return !hasInterviewRound || !!form.interviewMode
      case 4: return true
      case 5: return true
      default: return false
    }
  }

  const stepProps = { form, update }

  if (isLoading) return <div className="page-loader"><div className="spinner spinner-lg" /><span>Loading campaign configuration...</span></div>

  return (
    <div className="fade-in" style={{ maxWidth: '820px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/campaigns/${id}`)}
          style={{ marginBottom: '12px' }}>
          <ChevronLeft size={15} /> Back to Campaign
        </button>
        <h1 style={{ fontSize: '1.6rem', marginBottom: '4px' }}>Edit Campaign</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Update your hiring pipeline step by step. <strong style={{ color: 'var(--yellow-dark)' }}><AlertTriangle size={13} style={{ display: 'inline' }}/> Updating rounds will reset question pools.</strong>
        </p>
      </div>

      {/* Wizard Steps Indicator */}
      <div className="wizard-steps" style={{ marginBottom: '32px' }}>
        {STEPS.map((s, i) => (
          <div key={i} className="wizard-step" style={{ display: 'flex', alignItems: 'center' }}>
            <div className="wizard-step-info">
              <div className={`wizard-step-circle ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                {i < step ? <Check size={14} /> : s.short}
              </div>
              <div className={`wizard-step-label ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                {s.label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`wizard-connector ${i < step ? 'done' : ''}`}
                style={{ margin: '0 4px', marginTop: '-16px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="card slide-up" key={step}>
        {step === 0 && <Step1Meta {...stepProps} />}
        {step === 1 && <Step2Pipeline {...stepProps} hiringType={resolvedHiringType} />}
        {step === 2 && <Step3RoundConfig {...stepProps} />}
        {step === 3 && <Step4InterviewConfig {...stepProps} hasInterviewRound={hasInterviewRound} />}
        {step === 4 && <Step5Proctoring {...stepProps} />}
        {step === 5 && <Step6Review {...stepProps} onSubmit={() => submit()} isSubmitting={isPending} />}
      </div>

      {/* Navigation */}
      {step < 5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            <ChevronLeft size={16} /> Previous
          </button>
          <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
