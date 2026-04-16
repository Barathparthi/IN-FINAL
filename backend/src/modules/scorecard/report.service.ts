import PDFDocument from 'pdfkit'
import type { Readable } from 'stream'

// ── Brand colours ─────────────────────────────────────────────
const ORANGE  = '#FB851E'
const NAVY    = '#FFFFFF'
const TEAL    = '#23979C'
const GREEN   = '#27AE60'
const RED     = '#E74C3C'
const AMBER   = '#E67E22'
const GRAY    = '#64748B'
const LGRAY   = '#94A3B8'
const DARK    = '#0F172A'
const WHITE   = '#FFFFFF'
const LIGHT   = '#F8FAFC'
const SOFT_HEADER = '#F8FAFC'
const BORDER  = '#E2E8F0'
const BG2     = '#F1F5F9'

// ── Confidence score from delivery metrics ────────────────────
function computeConfidenceScore(wpm: number | null, fillerRatio: number | null, silenceRatio: number | null, duration: number | null): number {
  if (wpm === null && fillerRatio === null) return 5 // Neutral if no audio data
  let score = 10
  const w = wpm || 0
  const f = fillerRatio || 0
  const s = silenceRatio || 0
  const d = duration || 0

  // Pace (WPM)
  if (w < 80)        score -= 3
  else if (w < 110)  score -= 1.5
  else if (w > 190)  score -= 2
  else if (w > 165)  score -= 0.5

  // Fillers
  if (f > 0.20)      score -= 3
  else if (f > 0.12) score -= 1.5
  else if (f > 0.06) score -= 0.5

  // Silence
  if (s > 0.55)      score -= 2
  else if (s > 0.35) score -= 1

  // Duration
  if (d > 0 && d < 20) score -= 2

  return Math.max(0, Math.min(10, score))
}

function confidenceLabel(score: number): { label: string; color: string } {
  if (score >= 8.5) return { label: 'HIGH CONFIDENCE',    color: GREEN }
  if (score >= 6.5) return { label: 'GOOD',               color: TEAL }
  if (score >= 4.5) return { label: 'MODERATE',           color: AMBER }
  return                   { label: 'LOW CONFIDENCE',     color: RED }
}

// ── Hire recommendation ────────────────────────────────────────
function classifyRecommendation(fitPct: number, trustScore: number, hiringType?: string) {
  const isCampus = (hiringType || '').toUpperCase() === 'CAMPUS'

  if (isCampus) {
    if (fitPct >= 76 && trustScore >= 72) return { label: 'FAST-TRACK', color: WHITE, bg: GREEN }
    if (fitPct >= 62 && trustScore >= 62) return { label: 'HIRE',       color: WHITE, bg: TEAL  }
    if (fitPct >= 50 && trustScore >= 52) return { label: 'WATCHLIST',  color: WHITE, bg: AMBER }
    return                                        { label: 'NO HIRE',    color: WHITE, bg: RED   }
  }

  if (fitPct >= 82 && trustScore >= 78) return { label: 'STRONG HIRE', color: WHITE, bg: GREEN }
  if (fitPct >= 68 && trustScore >= 66) return { label: 'HIRE',        color: WHITE, bg: TEAL  }
  if (fitPct >= 54 && trustScore >= 55) return { label: 'BORDERLINE',  color: WHITE, bg: AMBER }
  return                                       { label: 'NO HIRE',      color: WHITE, bg: RED   }
}

function getHiringTrackLabels(hiringType?: string) {
  const isCampus = (hiringType || '').toUpperCase() === 'CAMPUS'
  return {
    isCampus,
    reportTitle: isCampus
      ? 'Fresher Hiring - Campus Report'
      : 'Experienced Talent Hiring - Lateral Report',
    topTrackLabel: isCampus
      ? 'FRESHER HIRING - CAMPUS'
      : 'EXPERIENCED TALENT HIRING - LATERAL',
    compactBadge: isCampus ? 'FRESHER HIRING' : 'EXPERIENCED TALENT',
    inlineTrack: isCampus ? 'FRESHER HIRING - CAMPUS' : 'EXPERIENCED TALENT HIRING - LATERAL',
    detailsTrack: isCampus ? 'Fresher Hiring - Campus' : 'Experienced Talent Hiring - Lateral',
  }
}

// ── Interfaces ────────────────────────────────────────────────
export interface InterviewPreview {
  prompt:           string
  answerText?:      string
  answerPreview:    string
  category?:        string
  evaluationRubric?: string
  liveCodingProblem?: string
  codeSubmission?:  string
  explainTranscript?: string
  testCasesPassed?: number
  testCasesTotal?:  number
  copiedCodeSignal?: boolean
  aiScore?:         number | null
  aiReasoning?:     string | null
  communicationScore?: number | null
  confidenceScore?:    number | null
  deliveryScore?:   number | null
  wordsPerMinute?:  number | null
  fillerWordRatio?: number | null
  silenceRatio?:    number | null
  durationSeconds?: number | null
  fillerWordCount?: number | null
  wordCount?:       number | null
  isFollowUp?:      boolean
  followUpPrompt?:  string
  mode:             string
}

export interface ReportData {
  candidate: { firstName: string; lastName: string; email: string }
  candidatePhoto?: Buffer | null
  campaign:  { name: string; role: string; hiringType?: string }
  scorecard: {
    technicalFitPercent?: number
    trustScore?:          number
    roundScores:          any[]
    gapAnalysis?:         any
    recruiterNotes?:      string
    recruiterRating?:     number
    generatedAt?:         string
  }
  strikeLog:         any[]
  interviewPreviews: InterviewPreview[]
}

type SkillStatus = 'MATCHED' | 'PARTIAL' | 'MISSING'
type SkillSplitRow = {
  priority: 'Must Have' | 'Good To Have' | 'Nice To Have'
  skill: string
  status: SkillStatus
  evidence?: string
  comment?: string
}

function normalizeSkillStatus(value: any): SkillStatus {
  const s = String(value || '').toUpperCase()
  if (s.includes('MISS') || s.includes('GAP') || s.includes('NO')) return 'MISSING'
  if (s.includes('PART')) return 'PARTIAL'
  if (s.includes('MATCH') || s.includes('YES') || s.includes('HAVE')) return 'MATCHED'
  return 'PARTIAL'
}

function normalizeSkillEntries(raw: any, priority: SkillSplitRow['priority'], defaultStatus: SkillStatus): SkillSplitRow[] {
  const rows: SkillSplitRow[] = []
  const arr = Array.isArray(raw) ? raw : []

  for (const entry of arr) {
    if (!entry) continue
    if (typeof entry === 'string') {
      rows.push({ priority, skill: entry, status: defaultStatus })
      continue
    }

    const skill = String(entry.skill || entry.name || entry.topic || '').trim()
    if (!skill) continue
    rows.push({
      priority,
      skill,
      status: normalizeSkillStatus(entry.status || defaultStatus),
      evidence: entry.evidence ? String(entry.evidence) : '',
      comment: entry.comment ? String(entry.comment) : '',
    })
  }
  return rows
}

function collectSkillSplitRows(gap: any): SkillSplitRow[] {
  const split = gap?.jdSkillSplit || gap?.jdSkillCoverage || gap?.resumeJDSkillSplit || {}

  const must = normalizeSkillEntries(
    split.mustHave || split.must || split.required || split.priority1,
    'Must Have',
    'PARTIAL',
  )
  const good = normalizeSkillEntries(
    split.goodToHave || split.good || split.preferred || split.priority2,
    'Good To Have',
    'PARTIAL',
  )
  const nice = normalizeSkillEntries(
    split.niceToHave || split.nice || split.bonus || split.priority3,
    'Nice To Have',
    'PARTIAL',
  )

  const rows = [...must, ...good, ...nice]
  if (rows.length > 0) return rows

  // Fallback for older scorecards.
  const fallback = [
    ...normalizeSkillEntries((gap?.jdMatchedSkills || []).map((skill: string) => ({ skill, status: 'MATCHED' })), 'Must Have', 'MATCHED'),
    ...normalizeSkillEntries((gap?.jdMissingSkills || []).map((skill: string) => ({ skill, status: 'MISSING' })), 'Must Have', 'MISSING'),
  ]
  return fallback
}

function skillStatusColor(status: SkillStatus) {
  if (status === 'MATCHED') return GREEN
  if (status === 'MISSING') return RED
  return AMBER
}

function scoreToPerformanceLabel(score: number): 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'WEAK' {
  if (score >= 8) return 'EXCELLENT'
  if (score >= 6.5) return 'GOOD'
  if (score >= 5) return 'AVERAGE'
  return 'WEAK'
}

function performanceColor(label: string) {
  if (label === 'EXCELLENT') return GREEN
  if (label === 'GOOD') return TEAL
  if (label === 'AVERAGE') return AMBER
  return RED
}

function collectTechnicalRows(gap: any, previews: InterviewPreview[]) {
  const rows: Array<{ skill: string; score: number; label: string; comment: string }> = []
  const matrix = Array.isArray(gap?.technicalSkillMatrix) ? gap.technicalSkillMatrix : []

  for (const item of matrix) {
    const skill = String(item?.skill || item?.topic || item?.name || '').trim()
    if (!skill) continue
    const rawScore = Number(item?.performanceScore ?? item?.score ?? item?.rating ?? 0)
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(10, rawScore)) : 0
    const label = String(item?.performanceLabel || '').toUpperCase() || scoreToPerformanceLabel(score)
    const comment = String(item?.comment || item?.evidence || 'Evidence captured from interview performance.')
    rows.push({ skill, score, label, comment })
  }

  if (rows.length > 0) return rows.slice(0, 10)

  // Fallback using category averages when AI matrix is missing.
  const catMap = new Map<string, { sum: number; count: number; reason?: string }>()
  previews.forEach((p) => {
    if (p.aiScore == null || !p.category) return
    const key = String(p.category).trim()
    const cur = catMap.get(key) || { sum: 0, count: 0, reason: p.aiReasoning || '' }
    cur.sum += p.aiScore
    cur.count += 1
    if (!cur.reason && p.aiReasoning) cur.reason = p.aiReasoning
    catMap.set(key, cur)
  })

  for (const [skill, m] of catMap.entries()) {
    const score = m.count > 0 ? m.sum / m.count : 0
    const label = scoreToPerformanceLabel(score)
    const comment = m.reason ? String(m.reason).slice(0, 140) : 'Derived from interview category scores.'
    rows.push({ skill, score, label, comment })
  }

  return rows.slice(0, 10)
}

// ── Helpers ───────────────────────────────────────────────────
function ph(doc: any) { return doc.page.height }
function pw(doc: any) { return doc.page.width  }
const MARGIN = 45
function contentW(doc: any) { return pw(doc) - MARGIN * 2 }

function pageCheck(doc: any, needed = 60) {
  if (doc.y + needed > ph(doc) - 55) doc.addPage()
}

function hRule(doc: any, color = BORDER) {
  doc.moveTo(MARGIN, doc.y).lineTo(pw(doc) - MARGIN, doc.y).lineWidth(0.5).stroke(color)
}

function sectionTitle(doc: any, title: string) {
  pageCheck(doc, 45)
  doc.moveDown(0.6)
  // Orange accent bar
  doc.rect(MARGIN, doc.y, 4, 15).fill(ORANGE)
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
     .text(title, MARGIN + 10, doc.y + 1, { width: contentW(doc) - 10 })
  doc.moveDown(0.15)
  hRule(doc, BORDER)
  doc.moveDown(0.35)
}

function pill(doc: any, x: number, y: number, w: number, h: number, text: string, bg: string, fg = WHITE) {
  doc.rect(x, y, w, h).fill(bg)
  doc.fillColor(fg).fontSize(8).font('Helvetica-Bold')
     .text(text, x, y + (h - 8) / 2 + 1, { width: w, align: 'center' })
}

function scoreBar(doc: any, x: number, y: number, w: number, h: number, pct: number, passMark: number, color: string) {
  doc.rect(x, y, w, h).fill(BG2)
  const fill = Math.min(w, (Math.max(0, pct) / 100) * w)
  if (fill > 0) doc.rect(x, y, fill, h).fill(color)
  const pmX = x + (passMark / 100) * w
  doc.moveTo(pmX, y - 2).lineTo(pmX, y + h + 2).lineWidth(1).stroke(LGRAY)
  doc.fillColor(LGRAY).fontSize(6.5).font('Helvetica')
     .text(`${passMark}%`, pmX - 8, y + h + 3, { width: 20, align: 'center' })
}

// ── Main PDF generator ────────────────────────────────────────
export function generateReportPDF(data: ReportData): Readable {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true, bufferPages: true })

  const hiringType = (data.campaign.hiringType || 'LATERAL').toUpperCase()
  const trackLabels = getHiringTrackLabels(hiringType)
  const isCampus = trackLabels.isCampus
  const trackAccent = isCampus ? TEAL : ORANGE
  const trackTitle = trackLabels.reportTitle

  const fitPct  = data.scorecard.technicalFitPercent ?? 0
  const trust   = data.scorecard.trustScore ?? 0
  const strikes = data.strikeLog.filter((s: any) => s.isStrike).length
  const rec     = classifyRecommendation(fitPct, trust, hiringType)

  // HEADER BAND
  doc.rect(0, 0, pw(doc), 78).fill(NAVY).stroke(BORDER)
  doc.fillColor(ORANGE).fontSize(18).font('Helvetica-Bold').text('ihire', MARGIN, 18)
  const logoW = doc.widthOfString('ihire') + 2
  doc.fillColor(DARK).fontSize(18).font('Helvetica').text('AI', MARGIN + logoW, 18)
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text(trackTitle.toUpperCase(), MARGIN, 40)
  doc.fillColor('#64748B').fontSize(7.5).text(
    `Generated: ${data.scorecard.generatedAt ? new Date(data.scorecard.generatedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}`,
    MARGIN, 52
  )
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
     .text(data.campaign.name, 0, 22, { align: 'right', width: pw(doc) - MARGIN })
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica')
     .text(data.campaign.role, 0, 36, { align: 'right', width: pw(doc) - MARGIN })
     
  if (data.campaign.hiringType) {
    const typeLabel = trackLabels.topTrackLabel
    doc.fillColor(trackAccent).fontSize(7).font('Helvetica-Bold')
       .text(typeLabel, 0, 50, { align: 'right', width: pw(doc) - MARGIN })
  }

  doc.y = 88
  const infoY   = doc.y
  const photoW  = 72
  const photoH  = 88
  const photoX  = pw(doc) - MARGIN - photoW

  if (data.candidatePhoto) {
    try {
      doc.rect(photoX - 1, infoY - 1, photoW + 2, photoH + 2).fill(BORDER)
      doc.image(data.candidatePhoto, photoX, infoY, { width: photoW, height: photoH, cover: [photoW, photoH] })
    } catch {
      doc.rect(photoX, infoY, photoW, photoH).fill(BG2)
    }
  } else {
    doc.rect(photoX, infoY, photoW, photoH).fill(BG2).stroke(BORDER)
  }

  const infoW = photoX - MARGIN - 12
  doc.fillColor(DARK).fontSize(20).font('Helvetica-Bold').text(`${data.candidate.firstName} ${data.candidate.lastName}`, MARGIN, infoY, { width: infoW })
  doc.fillColor(GRAY).fontSize(9.5).font('Helvetica').text(data.candidate.email, MARGIN, doc.y + 2, { width: infoW })
  
  const campType = data.campaign.hiringType ? `  ·  ${trackLabels.inlineTrack}` : ''
  doc.fillColor(LGRAY).fontSize(8.5).text(`${data.campaign.role}  ·  ${data.campaign.name}${campType}`, MARGIN, doc.y + 3, { width: infoW })

  doc.y = infoY + photoH + 12
  const overviewY = doc.y

  // EXECUTIVE SUMMARY CARD
  const risk = data.scorecard.gapAnalysis?.hiringRisk || 'UNKNOWN'
  const riskColor = risk === 'LOW' ? GREEN : risk === 'MEDIUM' ? AMBER : RED
  
  doc.rect(MARGIN, overviewY, contentW(doc), 180).fill(LIGHT).stroke(BORDER)
  doc.rect(MARGIN, overviewY, 6, 180).fill(rec.bg)
  
  // Recommendation Badge
  doc.rect(MARGIN + 16, overviewY + 16, 120, 24).fill(WHITE).stroke(rec.bg)
  doc.fillColor(rec.bg).fontSize(10).font('Helvetica-Bold').text(rec.label, MARGIN + 16, overviewY + 23, { width: 120, align: 'center' })

  // Hiring track badge
  doc.rect(MARGIN + 252, overviewY + 16, 130, 24).fill(WHITE).stroke(trackAccent)
  doc.fillColor(trackAccent).fontSize(8).font('Helvetica-Bold').text(trackLabels.compactBadge, MARGIN + 252, overviewY + 23, { width: 130, align: 'center' })
  
  // Hiring Risk Badge
  doc.rect(MARGIN + 144, overviewY + 16, 100, 24).fill(WHITE).stroke(riskColor)
  doc.fillColor(riskColor).fontSize(9).font('Helvetica-Bold').text(`RISK: ${risk}`, MARGIN + 144, overviewY + 23, { width: 100, align: 'center' })

  // Fit & Trust
  doc.fillColor(LGRAY).fontSize(8).text('Tech Fit', pw(doc) - MARGIN - 110, overviewY + 16)
  doc.fillColor(fitPct >= 60 ? GREEN : RED).fontSize(16).font('Helvetica-Bold').text(`${fitPct.toFixed(0)}%`, pw(doc) - MARGIN - 110, overviewY + 28)

  doc.fillColor(LGRAY).fontSize(8).font('Helvetica').text('Trust Score', pw(doc) - MARGIN - 50, overviewY + 16)
  doc.fillColor(trust >= 70 ? GREEN : RED).fontSize(16).font('Helvetica-Bold').text(`${trust.toFixed(0)}%`, pw(doc) - MARGIN - 50, overviewY + 28)

  doc.moveTo(MARGIN + 16, overviewY + 52).lineTo(pw(doc) - MARGIN - 16, overviewY + 52).stroke(BORDER)

  // AI Summary
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(data.scorecard.gapAnalysis?.aiSummary || 'No summary available.', MARGIN + 16, overviewY + 62, { width: contentW(doc) - 32 })

  // Top Strength & Gap
  const strength = data.scorecard.gapAnalysis?.strengths?.[0] || 'None identified'
  const gap = data.scorecard.gapAnalysis?.gaps?.[0] || 'None identified'
  const boxW = (contentW(doc) - 40) / 2
  
  doc.rect(MARGIN + 16, overviewY + 115, boxW, 50).fill(WHITE).stroke(BORDER)
  doc.fillColor(GREEN).fontSize(8).font('Helvetica-Bold').text('TOP STRENGTH', MARGIN + 24, overviewY + 123)
  doc.fillColor(DARK).font('Helvetica').text(strength, MARGIN + 24, overviewY + 135, { width: boxW - 16, height: 26 })

  doc.rect(MARGIN + 24 + boxW, overviewY + 115, boxW, 50).fill(WHITE).stroke(BORDER)
  doc.fillColor(RED).fontSize(8).font('Helvetica-Bold').text('TOP GAP', MARGIN + 32 + boxW, overviewY + 123)
  doc.fillColor(DARK).font('Helvetica').text(gap, MARGIN + 32 + boxW, overviewY + 135, { width: boxW - 16, height: 26 })

  doc.y = overviewY + 195

  // Candidate details block
  sectionTitle(doc, 'Candidate Details')
  const detailsY = doc.y
  doc.rect(MARGIN, detailsY, contentW(doc), 74).fill(LIGHT).stroke(BORDER)
  doc.rect(MARGIN, detailsY, 4, 74).fill(trackAccent)
  const leftX = MARGIN + 12
  const rightX = MARGIN + contentW(doc) / 2 + 6

  doc.fillColor(LGRAY).fontSize(7.2).font('Helvetica-Bold').text('NAME', leftX, detailsY + 10)
  doc.fillColor(DARK).fontSize(10.2).font('Helvetica').text(`${data.candidate.firstName} ${data.candidate.lastName}`, leftX, detailsY + 21, { width: contentW(doc) / 2 - 24 })

  doc.fillColor(LGRAY).fontSize(7.2).font('Helvetica-Bold').text('EMAIL', leftX, detailsY + 40)
  doc.fillColor(DARK).fontSize(9.2).font('Helvetica').text(data.candidate.email, leftX, detailsY + 51, { width: contentW(doc) / 2 - 24 })

  doc.fillColor(LGRAY).fontSize(7.2).font('Helvetica-Bold').text('ROLE / CAMPAIGN', rightX, detailsY + 10)
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(`${data.campaign.role} • ${data.campaign.name}`, rightX, detailsY + 21, { width: contentW(doc) / 2 - 24 })

  doc.fillColor(LGRAY).fontSize(7.2).font('Helvetica-Bold').text('HIRING TRACK', rightX, detailsY + 40)
  doc.fillColor(trackAccent).fontSize(9.2).font('Helvetica-Bold').text(trackLabels.detailsTrack, rightX, detailsY + 51)

  doc.y = detailsY + 86
  sectionTitle(doc, 'Assessment Rounds')
  const rounds = (data.scorecard.roundScores || [])
    .slice().sort((a: any, b: any) => (a.roundOrder || 0) - (b.roundOrder || 0))

  for (const round of rounds) {
    pageCheck(doc, 55)
    const pct      = round.percentScore ?? round.percent ?? 0
    const passMark = round.passMarkPercent ?? 60
    const passed   = round.passed ?? (pct >= passMark)
    const rowY     = doc.y
    doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(`Round ${round.roundOrder || '?'} — ${round.roundType || 'Unknown'}`, MARGIN, rowY + 2, { width: 165 })
    scoreBar(doc, MARGIN + 170, rowY + 4, 160, 10, pct, passMark, passed ? GREEN : RED)
    doc.fillColor(passed ? GREEN : RED).fontSize(11).font('Helvetica-Bold').text(`${pct.toFixed(1)}%`, MARGIN + 338, rowY + 1)
    pill(doc, pw(doc) - MARGIN - 42, rowY, 42, 18, passed ? 'PASS' : 'FAIL', passed ? GREEN : RED)
    doc.y = rowY + 34
    hRule(doc, '#F1F5F9')
  }

  if (data.scorecard.gapAnalysis) {
    const gap = data.scorecard.gapAnalysis
    
    // ── Resume vs Job Description Alignment ─────────────────────
    if (gap.resumeJDFitScore != null || gap.resumeEvaluationNotes) {
      pageCheck(doc, 100)
      sectionTitle(doc, 'Resume vs Job Description Alignment')

      const fitScore = gap.resumeJDFitScore ?? 0
      const fitColor = fitScore >= 80 ? GREEN : fitScore >= 50 ? AMBER : RED
      const fitBg    = fitScore >= 80 ? '#F0FDF4' : fitScore >= 50 ? '#FFFBEB' : '#FEF2F2'

      // Measure note text height so the card auto-sizes
      const noteText   = gap.resumeEvaluationNotes || ''
      const scoreBoxW  = 96
      const noteColW   = contentW(doc) - scoreBoxW - 28
      doc.fontSize(8.5)
      const noteH      = gap.resumeEvaluationNotes
        ? doc.heightOfString(noteText, { width: noteColW })
        : 0
      const cardH = Math.max(64, noteH + 28)

      const cardY = doc.y

      // Outer card
      doc.rect(MARGIN, cardY, contentW(doc), cardH).fill(LIGHT).stroke(BORDER)
      // Accent left bar
      doc.rect(MARGIN, cardY, 4, cardH).fill(fitColor)
      // Score panel background
      doc.rect(MARGIN + 4, cardY, scoreBoxW, cardH).fill(fitBg)
      // Vertical divider
      doc.moveTo(MARGIN + 4 + scoreBoxW, cardY + 8)
         .lineTo(MARGIN + 4 + scoreBoxW, cardY + cardH - 8)
         .lineWidth(0.5).stroke(BORDER)

      // Score label
      doc.fillColor(LGRAY).fontSize(7).font('Helvetica-Bold')
         .text('MATCH SCORE', MARGIN + 12, cardY + 14, { width: scoreBoxW - 8 })
      // Score value
      doc.fillColor(fitColor).fontSize(28).font('Helvetica-Bold')
         .text(`${fitScore}%`, MARGIN + 12, cardY + 26, { width: scoreBoxW - 8 })

      // Notes text — contained inside the right column
      if (gap.resumeEvaluationNotes) {
        doc.fillColor(DARK).fontSize(8.5).font('Helvetica')
           .text(gap.resumeEvaluationNotes,
             MARGIN + 4 + scoreBoxW + 14,
             cardY + 14,
             { width: noteColW, lineGap: 2 }
           )
      }

      doc.y = cardY + cardH + 14
    }

    // ── Resume vs JD priority split (Must/Good/Nice) ───────────
    const skillSplitRows = collectSkillSplitRows(gap)
    if (skillSplitRows.length > 0) {
      pageCheck(doc, 90)
      sectionTitle(doc, 'Resume vs JD Match Split (Must / Good / Nice)')

      const cols = {
        priority: 96,
        skill: 160,
        status: 92,
        comment: contentW(doc) - 96 - 160 - 92,
      }

      const drawSplitHeader = (y: number) => {
        doc.rect(MARGIN, y, cols.priority, 24).fill(WHITE).stroke(BORDER)
        doc.rect(MARGIN + cols.priority, y, cols.skill, 24).fill(SOFT_HEADER).stroke(BORDER)
        doc.rect(MARGIN + cols.priority + cols.skill, y, cols.status, 24).fill(WHITE).stroke(BORDER)
        doc.rect(MARGIN + cols.priority + cols.skill + cols.status, y, cols.comment, 24).fill(SOFT_HEADER).stroke(BORDER)

        doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold').text('JD PRIORITY', MARGIN + 8, y + 9, { width: cols.priority - 12 })
        doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold').text('SKILL', MARGIN + cols.priority + 8, y + 9, { width: cols.skill - 12 })
        doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold').text('MATCH', MARGIN + cols.priority + cols.skill + 8, y + 9, { width: cols.status - 12, align: 'center' })
        doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold').text('COMMENTS / EVIDENCE', MARGIN + cols.priority + cols.skill + cols.status + 8, y + 9, { width: cols.comment - 12 })
      }

      let y = doc.y
      drawSplitHeader(y)
      y += 24
      for (const row of skillSplitRows.slice(0, 18)) {
        const rowH = 26
        if (y + rowH > ph(doc) - 55) {
          doc.addPage()
          y = doc.y
          drawSplitHeader(y)
          y += 24
        }

        doc.rect(MARGIN, y, cols.priority, rowH).fill(WHITE).stroke(BORDER)
        doc.rect(MARGIN + cols.priority, y, cols.skill, rowH).fill(LIGHT).stroke(BORDER)
        doc.rect(MARGIN + cols.priority + cols.skill, y, cols.status, rowH).fill(WHITE).stroke(BORDER)
        doc.rect(MARGIN + cols.priority + cols.skill + cols.status, y, cols.comment, rowH).fill(LIGHT).stroke(BORDER)

        doc.fillColor(DARK).fontSize(7.8).font('Helvetica-Bold').text(row.priority.toUpperCase(), MARGIN + 8, y + 8, { width: cols.priority - 12 })
        doc.fillColor(DARK).fontSize(8.2).font('Helvetica').text(row.skill, MARGIN + cols.priority + 8, y + 8, { width: cols.skill - 12 })

        const sColor = skillStatusColor(row.status)
        const pillW = 64
        const pillX = MARGIN + cols.priority + cols.skill + (cols.status - pillW) / 2
        doc.rect(pillX, y + 6, pillW, 14).fill(sColor)
        doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold').text(row.status, pillX, y + 10, { width: pillW, align: 'center' })

        const cText = row.comment || row.evidence || 'Assessment evidence available in detailed Q&A.'
        doc.fillColor(DARK).fontSize(7.8).font('Helvetica').text(cText, MARGIN + cols.priority + cols.skill + cols.status + 8, y + 8, { width: cols.comment - 12, ellipsis: true })

        y += rowH
      }

      doc.y = y + 12
    }

    // ── JD Fitness Table ─────────────────────────────────────────
    const jdMatchedSkills = (gap.jdMatchedSkills || []) as string[]
    const jdMissingSkills = (gap.jdMissingSkills || []) as string[]
    const fitnessRows = [
      ...jdMatchedSkills.map((s: string) => ({ skill: s, label: 'MATCHED',  color: GREEN })),
      ...jdMissingSkills.map((s: string) => ({ skill: s, label: 'MISSING',  color: RED   }))
    ]

    if (fitnessRows.length > 0) {
      const ROW_H   = 26
      const HDR_H   = 26
      const COL1_W  = contentW(doc) - 130
      const COL2_W  = 130
      const tableH  = HDR_H + fitnessRows.length * ROW_H + 2

      pageCheck(doc, tableH + 50)
      sectionTitle(doc, 'JD Fitness')

      const tblY = doc.y

      // ── Header row
      doc.rect(MARGIN,          tblY, COL1_W, HDR_H).fill(WHITE).stroke(BORDER)
      doc.rect(MARGIN + COL1_W, tblY, COL2_W, HDR_H).fill(SOFT_HEADER).stroke(BORDER)
      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
         .text('JD SKILL',      MARGIN + 12,          tblY + 9, { width: COL1_W - 20 })
      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
         .text('RESUME MATCH',  MARGIN + COL1_W + 10, tblY + 9, { width: COL2_W - 20, align: 'center' })

      // ── Data rows
      fitnessRows.forEach((row, idx) => {
        const rY   = tblY + HDR_H + idx * ROW_H
        const bgFill = idx % 2 === 0 ? WHITE : LIGHT

        // Cell backgrounds
        doc.rect(MARGIN,          rY, COL1_W, ROW_H).fill(bgFill).stroke(BORDER)
        doc.rect(MARGIN + COL1_W, rY, COL2_W, ROW_H).fill(bgFill).stroke(BORDER)

        // Skill name
        doc.fillColor(DARK).fontSize(9).font('Helvetica')
           .text(row.skill, MARGIN + 12, rY + 8, { width: COL1_W - 24 })

        // RAG pill
        const PILL_W = 74
        const pillX  = MARGIN + COL1_W + (COL2_W - PILL_W) / 2
        doc.rect(pillX, rY + 6, PILL_W, 14).fill(row.color)
        doc.fillColor(WHITE).fontSize(7.5).font('Helvetica-Bold')
           .text(row.label, pillX, rY + 10, { width: PILL_W, align: 'center' })
      })

      doc.y = tblY + HDR_H + fitnessRows.length * ROW_H + 14
    }

    // RESUME CLAIM VS INTERVIEW PERFORMANCE MISMATCH TABLE
    pageCheck(doc, 80)
    sectionTitle(doc, 'Resume Claim vs Interview Performance')

    const mismatchRows = gap.gaps?.slice(0, 3) || ['No specific gaps identified']
    const hdrY = doc.y
    const colW  = contentW(doc) / 2

    // Header row
     doc.rect(MARGIN,        hdrY, colW, 20).fill(WHITE).stroke(BORDER)
     doc.rect(MARGIN + colW, hdrY, colW, 20).fill(SOFT_HEADER).stroke(BORDER)
     doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
       .text('CLAIMED ON RESUME',    MARGIN + 10,        hdrY + 6, { width: colW - 20 })
     doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
       .text('INTERVIEW PERFORMANCE', MARGIN + colW + 10, hdrY + 6, { width: colW - 20 })
    doc.y = hdrY + 20

    for (const gapText of mismatchRows) {
      pageCheck(doc, 30)
      const rY = doc.y
      doc.rect(MARGIN,        rY, colW, 30).fill(LIGHT).stroke(BORDER)
      doc.rect(MARGIN + colW, rY, colW, 30).fill(WHITE).stroke(BORDER)
      doc.fillColor(DARK).fontSize(8).font('Helvetica')
         .text('Implied proficiency', MARGIN + 10, rY + 8, { width: colW - 20 })
      doc.fillColor(RED).font('Helvetica-Bold')
         .text(gapText, MARGIN + colW + 10, rY + 8, { width: colW - 20 })
      doc.y = rY + 30
    }
    doc.moveDown(0.8)
  }

  // CATEGORY PERFORMANCE BREAKDOWN
  const catMap = new Map<string, { sum: number, count: number }>()
  data.interviewPreviews.forEach(ia => {
    if (ia.aiScore != null && ia.category) {
      const c = catMap.get(ia.category.toUpperCase()) || { sum: 0, count: 0 }
      c.sum += ia.aiScore
      c.count += 1
      catMap.set(ia.category.toUpperCase(), c)
    }
  })
  if (catMap.size > 0) {
    pageCheck(doc, 50 + catMap.size * 20)
    sectionTitle(doc, 'Category Performance Breakdown')
    for (const [cat, metric] of catMap.entries()) {
      const rowY = doc.y
      const avg = metric.sum / metric.count
      const color = avg >= 7 ? GREEN : avg >= 4 ? AMBER : RED
      doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text(cat, MARGIN, rowY + 2, { width: 150 })
      scoreBar(doc, MARGIN + 160, rowY + 4, 180, 8, avg * 10, 60, color)
      doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text(`${avg.toFixed(1)}/10`, MARGIN + 350, rowY + 2)
      doc.y = rowY + 20
    }
  }

  // BEHAVIORAL + TECHNICAL SUMMARY TABLES
  {
    const gap = data.scorecard.gapAnalysis || {}
    const audioAnswers = data.interviewPreviews.filter((p) => p.mode === 'AUDIO')
    const hasComm = audioAnswers.length > 0
    const avgComm = hasComm
      ? audioAnswers.reduce((s, a) => s + (a.communicationScore || 0), 0) / audioAnswers.length
      : 0
    const avgWPM = hasComm
      ? audioAnswers.reduce((s, a) => s + (a.wordsPerMinute || 0), 0) / audioAnswers.length
      : 0
    const avgFiller = hasComm
      ? audioAnswers.reduce((s, a) => s + (a.fillerWordRatio || 0), 0) / audioAnswers.length
      : 0
    const avgSilence = hasComm
      ? audioAnswers.reduce((s, a) => s + (a.silenceRatio || 0), 0) / audioAnswers.length
      : 0
    const avgDuration = hasComm
      ? audioAnswers.reduce((s, a) => s + (a.durationSeconds || 0), 0) / audioAnswers.length
      : 0

    const bs = gap.behavioralScores || {}
    const communicationScore = Number.isFinite(Number(bs.communication))
      ? Math.max(0, Math.min(10, Number(bs.communication)))
      : (hasComm ? avgComm : 6)
    const confidenceScore = Number.isFinite(Number(bs.confidence))
      ? Math.max(0, Math.min(10, Number(bs.confidence)))
      : computeConfidenceScore(hasComm ? avgWPM : null, hasComm ? avgFiller : null, hasComm ? avgSilence : null, hasComm ? avgDuration : null)
    const leadershipScore = Number.isFinite(Number(bs.leadership))
      ? Math.max(0, Math.min(10, Number(bs.leadership)))
      : (isCampus ? null : Math.max(0, Math.min(10, ((communicationScore + confidenceScore) / 2) - 0.2)))

    pageCheck(doc, 170)
    sectionTitle(doc, 'Behavioral Snapshot (Communication, Confidence, Leadership)')

    const cardY = doc.y
    const cardGap = 12
    const cardW = (contentW(doc) - (cardGap * 2)) / 3
    const cardH = 72

    const drawBehaviorCard = (x: number, title: string, value: number | null) => {
      const display = value == null ? 'N/A' : `${value.toFixed(1)}/10`
      const color = value == null ? GRAY : (value >= 7 ? GREEN : value >= 5 ? AMBER : RED)
      doc.rect(x, cardY, cardW, cardH).fill(LIGHT).stroke(BORDER)
      doc.fillColor(LGRAY).fontSize(7.3).font('Helvetica-Bold').text(title.toUpperCase(), x + 10, cardY + 10)
      doc.fillColor(color).fontSize(18).font('Helvetica-Bold').text(display, x + 10, cardY + 28)
    }

    drawBehaviorCard(MARGIN, 'Communication', communicationScore)
    drawBehaviorCard(MARGIN + cardW + cardGap, 'Confidence', confidenceScore)
    drawBehaviorCard(MARGIN + (cardW + cardGap) * 2, 'Leadership', leadershipScore)

    const behavioralComment = String(bs.comment || gap.behavioralProfile || (isCampus
      ? 'Leadership score may be intentionally light for campus profiles where evidence is limited.'
      : 'Leadership is inferred from ownership depth, prioritization and decision quality in interview answers.'))
    doc.y = cardY + cardH + 10
    doc.fillColor(DARK).fontSize(8.5).font('Helvetica').text(behavioralComment, MARGIN, doc.y, { width: contentW(doc) })
    doc.moveDown(0.9)

    const technicalRows = collectTechnicalRows(gap, data.interviewPreviews)
    if (technicalRows.length > 0) {
      pageCheck(doc, 120)
      sectionTitle(doc, 'Technical Skill Matrix')

      const cols = {
        skill: 170,
        performance: 112,
        comments: contentW(doc) - 170 - 112,
      }

      const drawTechnicalHeader = (y: number) => {
        doc.rect(MARGIN, y, cols.skill, 24).fill(WHITE).stroke(BORDER)
        doc.rect(MARGIN + cols.skill, y, cols.performance, 24).fill(SOFT_HEADER).stroke(BORDER)
        doc.rect(MARGIN + cols.skill + cols.performance, y, cols.comments, 24).fill(WHITE).stroke(BORDER)
        doc.fillColor(DARK).fontSize(7.8).font('Helvetica-Bold').text('SKILL', MARGIN + 8, y + 9, { width: cols.skill - 12 })
        doc.fillColor(DARK).fontSize(7.8).font('Helvetica-Bold').text('PERFORMANCE', MARGIN + cols.skill + 8, y + 9, { width: cols.performance - 12, align: 'center' })
        doc.fillColor(DARK).fontSize(7.8).font('Helvetica-Bold').text('COMMENTS', MARGIN + cols.skill + cols.performance + 8, y + 9, { width: cols.comments - 12 })
      }

      let y = doc.y
      drawTechnicalHeader(y)
      y += 24
      for (const row of technicalRows.slice(0, 10)) {
        const rowH = 25
        if (y + rowH > ph(doc) - 55) {
          doc.addPage()
          y = doc.y
          drawTechnicalHeader(y)
          y += 24
        }

        doc.rect(MARGIN, y, cols.skill, rowH).fill(WHITE).stroke(BORDER)
        doc.rect(MARGIN + cols.skill, y, cols.performance, rowH).fill(LIGHT).stroke(BORDER)
        doc.rect(MARGIN + cols.skill + cols.performance, y, cols.comments, rowH).fill(WHITE).stroke(BORDER)

        doc.fillColor(DARK).fontSize(8.2).font('Helvetica').text(row.skill, MARGIN + 8, y + 8, { width: cols.skill - 12 })

        const scoreLabel = row.label || scoreToPerformanceLabel(row.score)
        const scoreColor = performanceColor(scoreLabel)
        const pX = MARGIN + cols.skill + 12
        doc.rect(pX, y + 5, cols.performance - 24, 14).fill(scoreColor)
        doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold').text(`${scoreLabel} (${row.score.toFixed(1)}/10)`, pX, y + 9, { width: cols.performance - 24, align: 'center' })

        doc.fillColor(DARK).fontSize(7.8).font('Helvetica').text(row.comment, MARGIN + cols.skill + cols.performance + 8, y + 8, { width: cols.comments - 12, ellipsis: true })

        y += rowH
      }

      doc.y = y + 8
    }
  }

  // INTERVIEW PERFORMANCE SECTION
  const audioAnswers = data.interviewPreviews.filter(p => p.mode === 'AUDIO')
  const textAnswers  = data.interviewPreviews.filter(p => p.answerPreview?.trim())

  if (textAnswers.length > 0 || audioAnswers.length > 0) {
    pageCheck(doc, 100)
    sectionTitle(doc, 'Interview Performance')

    if (audioAnswers.length > 0) {
      const audioMetrics = audioAnswers.filter(a => a.wordsPerMinute != null && a.wordsPerMinute > 0)
      const hasAudio = audioMetrics.length > 0
      const avgWPM      = hasAudio ? audioMetrics.reduce((s, a) => s + (a.wordsPerMinute || 0), 0) / audioMetrics.length : 0
      const avgFiller   = hasAudio ? audioMetrics.reduce((s, a) => s + (a.fillerWordRatio || 0), 0) / audioMetrics.length : 0
      const avgSilence  = hasAudio ? audioMetrics.reduce((s, a) => s + (a.silenceRatio || 0), 0) / audioMetrics.length : 0
      const avgDuration = hasAudio ? audioMetrics.reduce((s, a) => s + (a.durationSeconds || 0), 0) / audioMetrics.length : 0
      const confScore   = computeConfidenceScore(hasAudio ? avgWPM : null, hasAudio ? avgFiller : null, avgSilence, avgDuration)
      const confLabel   = confidenceLabel(confScore)

      const commY    = doc.y
      const commBoxH = 80
      doc.rect(MARGIN, commY, contentW(doc), commBoxH).fill(LIGHT).stroke(BORDER)
      doc.rect(MARGIN, commY, 4, commBoxH).fill(TEAL)

      const badgeW = 120
      doc.rect(MARGIN + 12, commY + 12, badgeW, 22).fill(confLabel.color)
      doc.fillColor(WHITE).fontSize(7.5).font('Helvetica-Bold').text(confLabel.label, MARGIN + 12, commY + 19, { width: badgeW, align: 'center' })
      doc.fillColor(TEAL).fontSize(26).font('Helvetica-Bold').text(`${confScore.toFixed(1)}`, MARGIN + 12, commY + 38, { width: badgeW, align: 'center' })
      doc.fillColor(LGRAY).fontSize(8.5).text('/ 10 Confidence', MARGIN + 12, commY + 62, { width: badgeW, align: 'center' })

      const mtx = [
        { label: 'Avg Pace',      val: `${avgWPM.toFixed(0)} wpm`,   color: avgWPM >= 110 && avgWPM <= 170 ? GREEN : AMBER },
        { label: 'Filler Words',  val: `${(avgFiller * 100).toFixed(1)}%`, color: avgFiller < 0.08 ? GREEN : RED },
        { label: 'Silence Ratio', val: `${(avgSilence * 100).toFixed(0)}%`, color: avgSilence < 0.3 ? GREEN : AMBER },
        { label: 'Avg Duration',  val: `${avgDuration.toFixed(0)}s`, color: avgDuration > 30 ? GREEN : RED },
      ]
      mtx.forEach((m, i) => {
        const mx = MARGIN + 150 + i * 90
        doc.fillColor(LGRAY).fontSize(7).text(m.label, mx, commY + 15)
        doc.fillColor(m.color).fontSize(14).font('Helvetica-Bold').text(m.val, mx, commY + 28)
      })
      doc.y = commY + commBoxH + 20
    }

    doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('Submission Timeline', MARGIN, doc.y)
    doc.moveDown(0.6)

    const scorableAnswers = data.interviewPreviews.filter(p => p.prompt || p.liveCodingProblem)
    const lowestAnswer = [...scorableAnswers].filter(a => a.aiScore != null).sort((a, b) => (a.aiScore!) - (b.aiScore!))[0]
    const followUpResponseIndexes = new Set<number>()

    for (let i = 0; i < scorableAnswers.length - 1; i += 1) {
      const current = scorableAnswers[i]
      const next = scorableAnswers[i + 1]
      const currentQuestion = current.prompt || current.liveCodingProblem || ''
      const nextQuestion = next.prompt || next.liveCodingProblem || ''

      if (current.isFollowUp && currentQuestion && currentQuestion === nextQuestion) {
        followUpResponseIndexes.add(i + 1)
      }
    }

    for (let idx = 0; idx < scorableAnswers.length; idx += 1) {
      const ia = scorableAnswers[idx]
      pageCheck(doc, 185)
      const aY = doc.y
      
      const scoreColor = (ia.aiScore ?? 0) >= 7 ? GREEN : (ia.aiScore ?? 0) >= 4 ? AMBER : RED
      doc.rect(MARGIN + 4, aY, contentW(doc) - 4, 150).fill('#F8FAFC').stroke(BORDER)
      doc.rect(MARGIN, aY, 4, 150).fill(scoreColor) // Adjusted after full content render
      const scoreLabel = ia.aiScore != null ? `${ia.aiScore.toFixed(1)}/10` : 'N/A'
      const isFollowUpResponse = followUpResponseIndexes.has(idx)
      const previousAnswer = idx > 0 ? scorableAnswers[idx - 1] : null

      let currentX = MARGIN + 12
      const chipY = aY + 2

      // Question number badge
      pill(doc, currentX, chipY, 34, 14, `Q${idx + 1}`, SOFT_HEADER, DARK)
      currentX += 40

      // Follow-up marker
      if (isFollowUpResponse) {
        pill(doc, currentX, chipY, 78, 14, 'FOLLOW-UP', ORANGE)
        currentX += 84
      }
      
      // Category Badge
      if (ia.category) {
        pill(doc, currentX, chipY, 80, 14, ia.category, TEAL)
        currentX += 86
      }
      
      // Mode Badge
      pill(doc, currentX, chipY, 70, 14, ia.mode || 'TEXT', GRAY)
      currentX += 76

      // Per-question score badge
      pill(doc, pw(doc) - MARGIN - 74, chipY, 64, 14, scoreLabel, scoreColor)

      // Lowest score banner
      if (ia === lowestAnswer && (ia.aiScore ?? 0) <= 5) {
        const criticalX = Math.min(currentX, pw(doc) - MARGIN - 74 - 116)
        doc.rect(criticalX, chipY, 110, 14).fill('#FEF2F2').stroke(RED)
        doc.fillColor(RED).fontSize(7).font('Helvetica-Bold').text('! CRITICAL GAP', criticalX, chipY + 4, { width: 110, align: 'center' })
      }

      doc.y = aY + 24

      if (isFollowUpResponse) {
        const followUpPrompt = previousAnswer?.followUpPrompt?.trim() || 'Dynamic follow-up based on previous answer.'
        const followY = doc.y
        const followH = Math.max(28, doc.heightOfString(followUpPrompt, { width: contentW(doc) - 34, lineGap: 1 }) + 12)
        doc.rect(MARGIN + 12, followY, contentW(doc) - 20, followH).fill('#FFF7ED').stroke('#FDBA74')
        doc.fillColor(ORANGE).fontSize(7.5).font('Helvetica-Bold').text('FOLLOW-UP QUESTION', MARGIN + 18, followY + 6)
        doc.fillColor(DARK).fontSize(8).font('Helvetica-Oblique').text(followUpPrompt, MARGIN + 18, followY + 15, { width: contentW(doc) - 34, lineGap: 1 })
        doc.y = followY + followH + 6
      }

      // PROMPT or LIVE CODING PROBLEM
      const isLiveCoding = ia.mode.includes('LIVE_CODING')
      doc.fillColor(DARK).fontSize(9.3).font('Helvetica-Bold').text(ia.prompt || ia.liveCodingProblem || 'Question Context', MARGIN + 12, doc.y, { width: contentW(doc) - 20, lineGap: 1 })
      doc.moveDown(0.45)

      // GREEN AND RED FLAG RUBRIC
      if (ia.evaluationRubric) {
        doc.fillColor(GREEN).fontSize(7.5).font('Helvetica-Bold').text('GREEN FLAG', MARGIN + 12, doc.y)
        doc.fillColor(DARK).fontSize(8).font('Helvetica').text(ia.evaluationRubric.substring(0, 170) + '...', MARGIN + 12, doc.y + 10, { width: contentW(doc) - 20, lineGap: 1 })
        doc.y += 10
      }
      doc.moveDown(0.6)

      if (isLiveCoding && ia.codeSubmission) {
        doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold').text('SUBMITTED CODE:', MARGIN + 12, doc.y)
        doc.rect(MARGIN + 12, doc.y + 4, contentW(doc) - 20, 40).fill(SOFT_HEADER).stroke(BORDER)
        doc.fillColor('#166534').fontSize(7).font('Courier').text(ia.codeSubmission.substring(0, 300) + (ia.codeSubmission.length > 300 ? '...' : ''), MARGIN + 16, doc.y + 8, { width: contentW(doc) - 28 })
        doc.y += 48
        
        doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold').text(`TEST CASES: ${ia.testCasesPassed ?? 0} / ${ia.testCasesTotal ?? 0} PASSED`, MARGIN + 12, doc.y)
        doc.moveDown(0.4)
      }

      // ANSWER TRANSCRIPT
      const previewText = ia.explainTranscript || ia.answerPreview || 'No response recorded.'
      const previewY = doc.y
      const previewH = Math.max(30, doc.heightOfString(`"${previewText}"`, { width: contentW(doc) - 32, lineGap: 1 }) + 12)
      doc.rect(MARGIN + 12, previewY, contentW(doc) - 20, previewH).fill('#F1F5F9').stroke(BORDER)
      doc.fillColor(GRAY).fontSize(8.4).font('Helvetica-Oblique').text(`"${previewText}"`, MARGIN + 18, previewY + 6, { width: contentW(doc) - 32, lineGap: 1 })
      doc.y = previewY + previewH

      if (ia.aiReasoning) {
        doc.moveDown(0.45)
        doc.fillColor('#0E7490').fontSize(8).font('Helvetica-Bold').text('AI EVALUATION', MARGIN + 12, doc.y)
        doc.fillColor(DARK).fontSize(8.2).font('Helvetica').text(ia.aiReasoning, MARGIN + 12, doc.y + 10, { width: contentW(doc) - 20, lineGap: 1.2 })
        doc.y += 8
      }

      // COPY PASTE BANNER
      if (isLiveCoding && ia.copiedCodeSignal) {
        doc.moveDown(0.5)
        doc.rect(MARGIN + 12, doc.y, contentW(doc) - 20, 20).fill('#FEF2F2').stroke(RED)
        doc.fillColor(RED).fontSize(8).font('Helvetica-Bold').text('[!] COPY-PASTE SIGNAL DETECTED - Candidate explanation mismatched submitted code', MARGIN + 18, doc.y + 6)
        doc.y += 24
      }

      doc.moveDown(0.75)
      
      const mY = doc.y
      const rowScores: any[] = []
      if (ia.mode === 'AUDIO') {
        const cS = ia.confidenceScore ?? computeConfidenceScore(ia.wordsPerMinute || 0, ia.fillerWordRatio || 0, ia.silenceRatio || 0, ia.durationSeconds || 0)
        rowScores.push({ l: 'Confidence', v: `${cS.toFixed(1)}/10`, c: confidenceLabel(cS).color })
        const commS = ia.communicationScore ?? 0
        rowScores.push({ l: 'Communication', v: `${commS.toFixed(1)}/10`, c: commS >= 7 ? GREEN : AMBER })
      } else {
        if (ia.aiScore != null) rowScores.push({ l: 'Content Score', v: `${ia.aiScore.toFixed(1)}/10`, c: scoreColor })
      }
      if (ia.wordsPerMinute) rowScores.push({ l: 'Pace', v: `${ia.wordsPerMinute.toFixed(0)} wpm`, c: GRAY })
      if (ia.durationSeconds) rowScores.push({ l: 'Duration', v: `${ia.durationSeconds.toFixed(0)}s`, c: GRAY })

      let sx = MARGIN + 12
      for (const rs of rowScores) {
        doc.fillColor(LGRAY).fontSize(6.5).text(rs.l, sx, mY)
        doc.fillColor(rs.c).fontSize(9).font('Helvetica-Bold').text(rs.v, sx, mY + 8)
        sx += 80
      }
      doc.y = mY + 25
      
      // Fix left border height based on final Y
      const endY = doc.y
      doc.rect(MARGIN, aY, 4, endY - aY).fill(scoreColor)

      hRule(doc, BORDER)
      doc.moveDown(0.95)
    }
  }

  if (data.strikeLog.length > 0) {
    pageCheck(doc, 60)
    sectionTitle(doc, 'Proctoring Violations')
    for (const strike of data.strikeLog) {
      pageCheck(doc, 32)
      const color = strike.isStrike ? RED : AMBER
      const label = strike.isStrike ? `Strike ${strike.strikeNumber}` : 'Flag'
      const vY = doc.y
      
      pill(doc, MARGIN, vY, 60, 16, label, color)
      
      doc.fillColor(DARK).fontSize(9).font('Helvetica').text(String(strike.violationType).replace(/_/g, ' '), MARGIN + 68, vY + 4, { continued: true })
      doc.fillColor(LGRAY).fontSize(8).text(`   ${new Date(strike.occurredAt).toLocaleString('en-IN')}`)
      
      if (strike.screenshotUrl) {
        doc.fillColor(TEAL).fontSize(7.5).font('Helvetica-Bold')
           .text('VIEW EVIDENCE [->]', MARGIN + 68, doc.y + 1, { 
             link: strike.screenshotUrl,
             underline: true 
           })
      }
      
      doc.y = Math.max(doc.y, vY + 28)
    }
  }

  // RED FLAGS / CREDIBILITY
  if (data.scorecard.gapAnalysis?.resumeCredibilityReason) {
    pageCheck(doc, 70)
    sectionTitle(doc, 'Credibility Signals & Plagiarism')

    // Copy/paste alert
    if (data.scorecard.gapAnalysis.copiedCodeDetected) {
      const alertY = doc.y
      doc.rect(MARGIN, alertY, contentW(doc), 24).fill('#FEF2F2').stroke(RED)
      doc.fillColor(RED).fontSize(9).font('Helvetica-Bold')
         .text('[!] AI COPY-PASTE SIGNALS DETECTED IN LIVE CODING', MARGIN + 10, alertY + 7, { width: contentW(doc) - 20 })
      doc.y = alertY + 30
    }

    const cred = data.scorecard.gapAnalysis.resumeCredibility
    const credColor = cred === 'HIGH' ? GREEN : cred === 'MEDIUM' ? AMBER : RED
    const credY = doc.y
    doc.fillColor(credColor).fontSize(8).font('Helvetica-Bold')
       .text(`RESUME CREDIBILITY: ${cred}`, MARGIN, credY)
    doc.moveDown(0.3)
    doc.rect(MARGIN, doc.y, contentW(doc), 36).fill(LIGHT).stroke(BORDER)
    doc.fillColor(DARK).fontSize(8.5).font('Helvetica')
       .text(data.scorecard.gapAnalysis.resumeCredibilityReason, MARGIN + 10, doc.y + 8, { width: contentW(doc) - 20 })
    doc.y += 44
  }

  // BEHAVIORAL PROFILE
  if (data.scorecard.gapAnalysis?.behavioralProfile) {
    pageCheck(doc, 60)
    sectionTitle(doc, 'Behavioral & Communication Profile')
    doc.fillColor(DARK).fontSize(9.5).font('Helvetica').text(data.scorecard.gapAnalysis.behavioralProfile, MARGIN, doc.y, { width: contentW(doc), lineGap: 1.5 })
    doc.moveDown(1.5)
  }

  if (data.scorecard.recruiterNotes) {
    pageCheck(doc, 60)
    sectionTitle(doc, 'Recruiter Notes')
    if (data.scorecard.recruiterRating) {
      const stars = '*'.repeat(data.scorecard.recruiterRating) + '-'.repeat(5 - data.scorecard.recruiterRating)
      doc.fillColor(ORANGE).fontSize(12).font('Helvetica-Bold').text(stars, MARGIN, doc.y)
      doc.moveDown(0.4)
    }
    doc.fillColor(DARK).fontSize(9.5).font('Helvetica').text(data.scorecard.recruiterNotes, MARGIN, doc.y, { width: contentW(doc) })
  }

  // ONBOARDING RECOMMENDATIONS
  if (data.scorecard.gapAnalysis?.onboardingRecommendations?.length > 0) {
    pageCheck(doc, 80)
    sectionTitle(doc, 'Onboarding Recommendations')
    data.scorecard.gapAnalysis.onboardingRecommendations.forEach((rec: string) => {
      doc.fillColor(DARK).fontSize(9).font('Helvetica').text(`•  ${rec}`, MARGIN + 10, doc.y, { width: contentW(doc) - 20 })
      doc.moveDown(0.4)
    })
    doc.moveDown(1)
  }

  // HIRE / NO HIRE CHECKLIST
  pageCheck(doc, 160)
  sectionTitle(doc, 'Hire / No Hire Checklist')

  const audioAnswersList = data.interviewPreviews.filter(p => p.mode === 'AUDIO')
  const avgCommScore = audioAnswersList.length > 0
    ? audioAnswersList.reduce((s, a) => s + (a.communicationScore || 0), 0) / audioAnswersList.length
    : 10

  const checks = [
    { label: 'Technical fundamentals solid', passed: fitPct >= 65 },
    { label: 'Communication clear',          passed: avgCommScore >= 6.5 },
    { label: 'Resume credible',              passed: data.scorecard.gapAnalysis?.resumeCredibility !== 'LOW' },
    { label: 'No proctoring violations',     passed: strikes === 0 },
    { label: 'Behavioural answers specific', passed: true },
    { label: 'Live coding genuine',          passed: !data.scorecard.gapAnalysis?.copiedCodeDetected }
  ]

  const chkY = doc.y
  doc.rect(MARGIN, chkY, contentW(doc), 110).fill(LIGHT).stroke(BORDER)
  doc.rect(MARGIN, chkY, 4, 110).fill(trackAccent)

  let leftY  = chkY + 18
  let rightY = chkY + 18
  checks.forEach((chk, idx) => {
    const isLeft = idx < 3
    const cy = isLeft ? leftY : rightY
    const cx = isLeft ? MARGIN + 20 : MARGIN + contentW(doc) / 2 + 10
    const mark      = chk.passed ? 'OK' : 'NO'
    const markColor = chk.passed ? GREEN : RED

    doc.rect(cx, cy, 20, 14).fill(markColor)
    doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold')
       .text(mark, cx, cy + 3, { width: 20, align: 'center' })
    doc.fillColor(DARK).fontSize(9).font('Helvetica')
       .text(chk.label, cx + 26, cy + 3, { width: contentW(doc) / 2 - 50 })

    if (isLeft) leftY  += 28
    else        rightY += 28
  })
  doc.y = Math.max(leftY, rightY) + 16

  // ── Footer — one pass per buffered page ──────────────────────
  // Rules:
  //  1. Cache totalPages BEFORE the loop — never use range.count inside.
  //  2. Use lineBreak:false so PDFKit never advances doc.y past the bottom.
  //  3. Reset doc.y = MARGIN after each footer so switchToPage() never
  //     sees an overflow state and inserts a blank page.
  //  4. Manual x-centering via widthOfString() is more reliable than
  //     align:'center' when drawing near the page bottom.
  const range      = (doc as any).bufferedPageRange()
  const totalPages = range.count
  const footerName = `${data.candidate.firstName} ${data.candidate.lastName}`

  for (let i = 0; i < totalPages; i++) {
    (doc as any).switchToPage(range.start + i)

    const barY = ph(doc) - 28   // 28px footer bar anchored to page bottom
    const txtY = barY + 10      // ~vertically centred for 7.5pt font

    doc.rect(0, barY, pw(doc), 28).fill(WHITE).stroke(BORDER)

    doc.fontSize(7.5).font('Helvetica').fillColor('#94A3B8')
    const footerText = `ihire  |  Confidential  |  ${footerName}  |  Page ${i + 1} of ${totalPages}`
    const txtX = (pw(doc) - doc.widthOfString(footerText)) / 2
    doc.text(footerText, txtX, txtY, { lineBreak: false })

    doc.y = MARGIN  // prevent overflow state before next switchToPage()
  }

  doc.end()
  return doc as unknown as Readable
}