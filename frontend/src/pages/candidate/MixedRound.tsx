import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { attemptApi } from '../../services/api.services'
import { 
  ChevronLeft, ChevronRight, Play, 
  MessageSquare, Sun, Moon, Type, AlignLeft
} from 'lucide-react'
import toast from 'react-hot-toast'
import Editor from '@monaco-editor/react'
import { withOfflineRetry } from '../../utils/offlineQueue'
import { useRef } from 'react'

const LANG_OPTIONS = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python',     label: 'Python'     },
  { value: 'java',       label: 'Java'       },
  { value: 'cpp',        label: 'C++'        },
  { value: 'c',          label: 'C'          },
]

const FONT_SIZES = [12, 13, 14, 15, 16, 18]


export default function MixedRound() {
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { 
    setAttemptId, setStrikes, setTimer, setRoundTitle,
    questions, setQuestions, currentIndex, setCurrentIndex,
    setSessionId, setFaceDescriptor
  } = useOutletContext<any>()
  
  const metricsRef = useRef<Record<string, { keystrokes: number, backspaces: number, pastes: number }>>({})
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

  // State for different question types
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({})
  const [codingCodes, setCodingCodes] = useState<Record<string, Record<string, string>>>({})
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({})
  const [selectedLanguage, setSelectedLanguage] = useState('javascript')
  const [running, setRunning] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState('')
  const [interviewMode] = useState<'TEXT' | 'AUDIO'>('TEXT')
  
  // Coding UI local state
  const [fontSize, setFontSize] = useState(13)
  const [darkTheme, setDarkTheme] = useState(true)
  const [lineNums, setLineNums] = useState(true)

  useEffect(() => {
    startAttempt()
  }, [roundId])

  const startAttempt = async () => {
    try {
      setLoading(true)
      const data = await attemptApi.start(roundId!)
      setAttempt(data.attempt)
      if (setAttemptId) setAttemptId(data.attempt.id)
      if (setSessionId) setSessionId(data.sessionId)
      if (setFaceDescriptor) setFaceDescriptor(data.faceDescriptor)
      setQuestions(data.questions)
      
      const initialCodes: Record<string, Record<string, string>> = {}
      const initialMCQ:   Record<string, string> = {}
      const initialInt:   Record<string, string> = {}

      if (data.mcqAnswers)       data.mcqAnswers.forEach((a: any) => initialMCQ[a.questionId] = a.selectedOptionId)
      if (data.interviewAnswers) data.interviewAnswers.forEach((a: any) => initialInt[a.questionId] = a.textAnswer || '')

      data.questions.forEach((q: any) => {
        if (q.type === 'CODING') {
          initialCodes[q.id] = { ...(q.starterCode || {}) }
          const sub = data.codingSubmissions?.[q.id]
          if (sub) {
            initialCodes[q.id][sub.language] = sub.sourceCode
            setSelectedLanguage(sub.language)
          }
        }
      })

      setCodingCodes(initialCodes)
      setMcqAnswers(initialMCQ)
      setInterviewAnswers(initialInt)
      
      setRoundTitle('Mixed Assessment')
      setTimer(data.attempt.timeLimitMinutes * 60)
      setStrikes(data.attempt.strikeCount)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start attempt')
      navigate('/candidate/lobby')
    } finally {
      setLoading(false)
    }
  }

  // ── MCQ Handlers ──────────────────────────────────────────
  const handleMcqSelect = (optionId: string) => {
    const qId = questions[currentIndex].id
    setMcqAnswers({ ...mcqAnswers, [qId]: optionId })
    attemptApi.submitMCQ({
      attemptId: attempt.id,
      questionId: qId,
      selectedOptionId: optionId,
      timeTakenSeconds: 0
    }).catch(console.error)
  }

  // ── Coding Handlers ───────────────────────────────────────
  const handleCodeChange = (value: string | undefined) => {
    const qId = questions[currentIndex].id
    setCodingCodes(prev => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || {}),
        [selectedLanguage]: value || ''
      }
    }))
  }

  const handleEditorMount = (editor: any, monaco: any) => {
    editor.onKeyDown((e: any) => {
      const qId = questions[currentIndex]?.id
      if (!qId) return
      if (!metricsRef.current[qId]) metricsRef.current[qId] = { keystrokes: 0, backspaces: 0, pastes: 0 }
      
      metricsRef.current[qId].keystrokes++
      if (e.keyCode === monaco.KeyCode.Backspace) {
        metricsRef.current[qId].backspaces++
      }
    })
    editor.onDidPaste(() => {
      const qId = questions[currentIndex]?.id
      if (!qId) return
      if (!metricsRef.current[qId]) metricsRef.current[qId] = { keystrokes: 0, backspaces: 0, pastes: 0 }
      metricsRef.current[qId].pastes++
    })
  }

  const handleRunCode = async () => {
    setRunning(true)
    setConsoleOutput('Executing...')
    try {
      const qId = questions[currentIndex].id
      let lang = selectedLanguage.toLowerCase()
      if (lang === 'cpp') lang = 'c++'
      if (lang === 'javascript') lang = 'node'

      const data = await attemptApi.runCoding({
        attemptId: attempt.id,
        questionId: qId,
        sourceCode: codingCodes[qId]?.[selectedLanguage] || '',
        language: selectedLanguage,
      })

      const lines = (data.results || []).map((result: any) => {
        const header = `Case ${result.caseIndex + 1}: ${result.passed ? 'PASSED' : 'FAILED'}`
        return result.actualOutput ? `${header}\n${result.actualOutput}` : header
      })
      
      setConsoleOutput(lines.join('\n\n') || 'Execution completed.')
      if (data.passed === data.total) toast.success('All test cases passed!')
      else toast.error(`${data.total - data.passed} test case(s) failed.`)

      // Save draft to backend
      attemptApi.submitCoding({
        attemptId: attempt.id,
        questionId: qId,
        sourceCode: codingCodes[qId]?.[selectedLanguage] || '',
        language: selectedLanguage,
        keystrokeMetrics: metricsRef.current[qId] || { keystrokes: 0, backspaces: 0, pastes: 0 }
      }).catch(() => {})
    } catch (err: any) {
      toast.error('Execution failed')
      setConsoleOutput('Error: ' + (err.response?.data?.message || err.message))
    } finally {
      setRunning(false)
    }
  }

  // ── Interview Handlers ───────────────────────────────────
  const handleInterviewChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInterviewAnswers({ ...interviewAnswers, [questions[currentIndex].id]: e.target.value })
  }

  const handleNext = async () => {
    const q = questions[currentIndex]
    
    // Auto-submit interview before moving?
    if (q.type === 'INTERVIEW_PROMPT') {
      if (!interviewAnswers[q.id]) {
        toast.error('Please provide an answer.')
        return
      }
      setSubmitting(true)
      try {
        await attemptApi.submitInterview({
          attemptId: attempt.id,
          questionId: q.id,
          mode: interviewMode,
          textAnswer: interviewAnswers[q.id],
          timeTakenSeconds: 0
        })
      } catch (err) {
        toast.error('Failed to save answer')
        setSubmitting(false)
        return
      }
      setSubmitting(false)
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      handleFinish()
    }
  }

  const handleFinish = async () => {
    if (!window.confirm('Submit your assessment?')) return
    setSubmitting(true)
    try {
      const res = await withOfflineRetry(() => attemptApi.complete(attempt.id))
      if (res.advancement?.outcome === 'ADVANCED') {
        toast.success('Assessment submitted! Advancing to next round...')
        navigate(`/candidate/assessment/${res.advancement.nextRound.id}`)
      } else {
        toast.success('Assessment submitted!')
        navigate('/candidate/lobby')
      }
    } catch (err) {
      toast.error('Failed to complete')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="spinner" />

  const q = questions[currentIndex]
  if (!q) return <div>No questions assigned.</div>

  const renderMCQ = () => (
    <div style={{ padding: '0 24px', maxWidth: '800px', width: '100%' }}>
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px' }}>
          <span>QUESTION {currentIndex + 1} OF {questions.length}</span>
          <span style={{ color: 'var(--orange)' }}>{q.difficulty}</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', color: 'var(--cream)' }}>{q.stem}</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px' }}>
        {(q.options as any[]).map((opt: any) => (
          <label key={opt.id} style={{
            padding: '16px 20px', borderRadius: '10px',
            border: `1px solid ${mcqAnswers[q.id] === opt.id ? 'var(--orange)' : 'var(--border)'}`,
            background: mcqAnswers[q.id] === opt.id ? 'rgba(251, 133, 30, 0.05)' : 'var(--bg-elevated)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <input type="radio" checked={mcqAnswers[q.id] === opt.id} onChange={() => handleMcqSelect(opt.id)} />
            <span style={{ color: mcqAnswers[q.id] === opt.id ? 'var(--cream)' : 'var(--text-secondary)' }}>{opt.text}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
        <button className="btn btn-secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex(currentIndex - 1)}>
          <ChevronLeft size={18} /> Previous
        </button>
        <button className="btn btn-primary" onClick={handleNext}>
          {currentIndex === questions.length - 1 ? 'Finish' : 'Next'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )

  const renderCoding = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', height: '100%', overflow: 'hidden', gap: '1px', background: 'var(--border)', borderRadius: '12px' }}>
      <div style={{ padding: '24px 28px', overflowY: 'auto', background: 'var(--bg-card)' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ padding:'3px 12px', borderRadius:20, background:'rgba(99,102,241,0.15)', color:'#818cf8', fontWeight:700 }}>TASK {currentIndex + 1} OF {questions.length}</span>
          <span style={{ padding:'3px 10px', borderRadius:20, background:'rgba(251,191,36,0.15)', color:'#fbbf24', fontWeight:600 }}>{q.difficulty || 'MEDIUM'}</span>
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cream)', marginBottom: '14px', lineHeight: 1.3 }}>{q.problemTitle}</h2>
        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: '0.9rem', marginBottom:'24px', whiteSpace:'pre-wrap' }}>{q.problemStatement}</div>

        {(q.examples && (q.examples as any[]).length > 0) && (
          <div style={{ marginBottom:16 }}>
             {q.examples.map((ex: any, i: number) => (
                <div key={i} style={{ marginBottom:16 }}>
                  <h4 style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--cream)', marginBottom:8, letterSpacing:'0.08em', textTransform:'uppercase' }}>Example {i + 1}</h4>
                  <div style={{ background:'var(--bg-elevated)', borderRadius:10, border:'1px solid var(--border)', overflow:'hidden' }}>
                    <div style={{ padding:'10px 16px 6px', display:'flex', gap:8, flexWrap:'wrap' }}><span style={{ color:'var(--text-muted)', fontSize:'0.82rem', minWidth:56 }}>Input:</span><code style={{ color:'var(--cream)', fontFamily:'monospace', fontSize:'0.82rem' }}>{ex.input}</code></div>
                    <div style={{ padding:'6px 16px 10px', display:'flex', gap:8, flexWrap:'wrap' }}><span style={{ color:'var(--text-muted)', fontSize:'0.82rem', minWidth:56 }}>Output:</span><code style={{ color:'#fb8a1e', fontFamily:'monospace', fontSize:'0.82rem' }}>{ex.output}</code></div>
                  </div>
                </div>
             ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', overflow:'hidden', background: '#0a0a0a' }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:6,
          padding:'8px 14px', background:'#1a1a2e', borderBottom:'1px solid var(--border)', flexShrink:0
        }}>
           <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
             <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} style={{ background:'#0f0f23', color:'#e2e8f0', border:'1px solid #334155', borderRadius:6, padding:'4px 8px', fontSize:'0.82rem', cursor:'pointer', fontWeight:600 }}>
                {LANG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
             </select>
             <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ background:'#0f0f23', color:'#94a3b8', border:'1px solid #334155', borderRadius:6, padding:'4px 6px', fontSize:'0.78rem', cursor:'pointer' }}>
                {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
             </select>
             <button onClick={() => setDarkTheme(d => !d)} title="Toggle Theme" style={{ background:'#0f0f23', border:'1px solid #334155', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center' }}>
                {darkTheme ? <Sun size={13}/> : <Moon size={13}/>}
             </button>
             <button onClick={() => setLineNums(l => !l)} title="Toggle line numbers" style={{ background: lineNums ? 'rgba(99,102,241,0.2)' : '#0f0f23', border:'1px solid ' + (lineNums ? '#6366f1' : '#334155'), borderRadius:6, padding:'4px 8px', cursor:'pointer', color: lineNums ? '#818cf8' : '#94a3b8', display:'flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:600 }}>
                <Type size={11}/> 1:1
             </button>
           </div>
           <button onClick={handleRunCode} disabled={running} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 18px', borderRadius:8, border:'none', cursor: running ? 'not-allowed' : 'pointer', fontWeight:700, fontSize:'0.85rem', background: running ? '#1e293b' : 'linear-gradient(135deg,#22c55e,#16a34a)', color: running ? '#64748b' : '#fff', transition:'all 0.2s', boxShadow: running ? 'none' : '0 0 16px rgba(34,197,94,0.3)' }}>
              {running ? <><div className="spinner spinner-sm" style={{ borderTopColor:'#64748b' }} /> Wait…</> : <><Play size={14} style={{ fill:'#fff' }}/> Run Code</>}
           </button>
        </div>

        <div style={{ flex: 1, position:'relative' }}>
          <Editor
            height="100%"
            language={selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage}
            theme={darkTheme ? 'vs-dark' : 'light'}
            value={codingCodes[q.id]?.[selectedLanguage] || ''}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize,
              fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono',monospace",
              lineNumbers: lineNums ? 'on' : 'off',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </div>

        <div style={{ height: '140px', background: '#0a0a14', borderTop: '2px solid #1e293b', flexShrink:0, display:'flex', flexDirection:'column' }}>
           <div style={{ padding: '6px 14px', background: '#1a1a2e', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '0.75rem', display:'flex', gap:6, alignItems:'center' }}>
              <AlignLeft size={12}/> CONSOLE OUTPUT
           </div>
           <div style={{ flex:1, overflowY: 'auto', padding:'12px 16px' }}>
              {!consoleOutput && !running && <div style={{ color:'#475569', fontSize:'0.85rem', fontFamily:'monospace' }}>Ready to execute...</div>}
              {running && <div style={{ color:'#64748b', fontSize:'0.85rem', fontFamily:'monospace' }}>Executing...</div>}
              {!running && consoleOutput && <pre style={{ color: '#86efac', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin:0 }}>{consoleOutput}</pre>}
           </div>
        </div>
        
        <div style={{ padding: '10px 16px', background: '#1a1a2e', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexShrink:0 }}>
           <button className="btn btn-sm btn-secondary" onClick={() => setCurrentIndex(currentIndex - 1)} disabled={currentIndex === 0}>
              <ChevronLeft size={14} /> Previous
           </button>
           <button className="btn btn-sm btn-primary" onClick={handleNext}>
              {currentIndex === questions.length - 1 ? 'Finish Assessment' : 'Next Task'} <ChevronRight size={14} />
           </button>
        </div>
      </div>
    </div>
  )

  const renderInterview = () => (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '0 24px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <MessageSquare size={24} color="var(--orange)" />
        <h2 style={{ color: 'var(--cream)', fontSize: '1.2rem' }}>Candidate Interview | Q{currentIndex + 1}</h2>
      </div>

      <div className="card" style={{ background: 'rgba(251, 133, 30, 0.05)', padding: '24px', marginBottom: '24px', borderLeft: '3px solid var(--orange)' }}>
         <p style={{ color: 'var(--cream)', fontSize: '1.1rem', lineHeight: 1.5 }}>{q.prompt}</p>
      </div>

      <textarea 
        value={interviewAnswers[q.id] || ''} 
        onChange={handleInterviewChange}
        placeholder="Type your answer..."
        style={{ width: '100%', minHeight: '180px', background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', outline: 'none' }}
      />

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={() => setCurrentIndex(currentIndex - 1)} disabled={currentIndex === 0}>Back</button>
        <button className="btn btn-primary" onClick={handleNext} disabled={submitting}>
          {submitting ? 'Saving...' : currentIndex === questions.length - 1 ? 'Complete Assessment' : 'Next Question'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: '24px', height: '100%', alignItems: 'stretch' }}>
       {/* Left: Main Assessment */}
       <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
          {q.type === 'MCQ' && renderMCQ()}
          {q.type === 'CODING' && renderCoding()}
          {q.type === 'INTERVIEW_PROMPT' && renderInterview()}
       </div>

       {/* Right: Proctoring Hub */}
       <div style={{ width: '300px', flexShrink: 0 }}>
          <div className="card" style={{ background: 'var(--bg-elevated)', padding: '16px' }}>
             <h4 style={{ fontSize: '0.8rem', color: 'var(--cream)', marginBottom: '8px' }}>Candidate Resources</h4>
             <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '16px' }}>
                <li>Do not leave the browser tab.</li>
                <li>Stay in good lighting.</li>
                <li>Your video is being monitored by AI.</li>
             </ul>
          </div>
       </div>
    </div>
  )
}
