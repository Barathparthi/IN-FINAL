import PDFDocument from 'pdfkit'
import type { Readable } from 'stream'

// ── Brand colours ─────────────────────────────────────────────
const ORANGE  = '#FB851E'
const NAVY    = '#1E2A3A'
const TEAL    = '#23979C'
const GREEN   = '#27AE60'
const RED     = '#E74C3C'
const AMBER   = '#E67E22'
const GRAY    = '#64748B'
const LGRAY   = '#94A3B8'
const DARK    = '#0F172A'
const WHITE   = '#FFFFFF'
const LIGHT   = '#F8FAFC'
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
function classifyRecommendation(fitPct: number, trustScore: number) {
  if (fitPct >= 80 && trustScore >= 80) return { label: 'STRONG HIRE', color: WHITE, bg: GREEN  }
  if (fitPct >= 65 && trustScore >= 65) return { label: 'HIRE',        color: WHITE, bg: TEAL   }
  if (fitPct >= 50 && trustScore >= 50) return { label: 'BORDERLINE',  color: WHITE, bg: AMBER  }
  return                                       { label: 'NO HIRE',     color: WHITE, bg: RED    }
}

// ── Interfaces ────────────────────────────────────────────────
export interface InterviewPreview {
  prompt:           string
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

  const fitPct  = data.scorecard.technicalFitPercent ?? 0
  const trust   = data.scorecard.trustScore ?? 0
  const strikes = data.strikeLog.filter((s: any) => s.isStrike).length
  const rec     = classifyRecommendation(fitPct, trust)

  // HEADER BAND
  doc.rect(0, 0, pw(doc), 78).fill(NAVY)
  doc.fillColor(ORANGE).fontSize(18).font('Helvetica-Bold').text('Indium', MARGIN, 18)
  const logoW = doc.widthOfString('Indium') + 2
  doc.fillColor(WHITE).fontSize(18).font('Helvetica').text('AI', MARGIN + logoW, 18)
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('CANDIDATE ASSESSMENT REPORT', MARGIN, 40)
  doc.fillColor('#64748B').fontSize(7.5).text(
    `Generated: ${data.scorecard.generatedAt ? new Date(data.scorecard.generatedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}`,
    MARGIN, 52
  )
  doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
     .text(data.campaign.name, 0, 22, { align: 'right', width: pw(doc) - MARGIN })
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica')
     .text(data.campaign.role, 0, 36, { align: 'right', width: pw(doc) - MARGIN })
     
  if (data.campaign.hiringType) {
    const typeLabel = (data.campaign.hiringType === 'CAMPUS' ? 'CAMPUS HIRING' : 'LATERAL HIRING')
    doc.fillColor(ORANGE).fontSize(7).font('Helvetica-Bold')
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
  
  const campType = data.campaign.hiringType ? `  ·  ${data.campaign.hiringType} HIRING` : ''
  doc.fillColor(LGRAY).fontSize(8.5).text(`${data.campaign.role}  ·  ${data.campaign.name}${campType}`, MARGIN, doc.y + 3, { width: infoW })

  doc.y = infoY + photoH + 12
  const overviewY = doc.y

  // EXECUTIVE SUMMARY CARD
  const risk = data.scorecard.gapAnalysis?.hiringRisk || 'UNKNOWN'
  const riskColor = risk === 'LOW' ? GREEN : risk === 'MEDIUM' ? AMBER : RED
  
  doc.rect(MARGIN, overviewY, contentW(doc), 180).fill(LIGHT).stroke(BORDER)
  doc.rect(MARGIN, overviewY, 6, 180).fill(rec.bg)
  
  // Recommendation Badge
  doc.rect(MARGIN + 16, overviewY + 16, 120, 24).fill(rec.bg)
  doc.fillColor(WHITE).fontSize(10).font('Helvetica-Bold').text(rec.label, MARGIN + 16, overviewY + 23, { width: 120, align: 'center' })
  
  // Hiring Risk Badge
  doc.rect(MARGIN + 144, overviewY + 16, 100, 24).fill('#FEF2F2').stroke(riskColor)
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
      doc.rect(MARGIN,          tblY, COL1_W, HDR_H).fill(NAVY)
      doc.rect(MARGIN + COL1_W, tblY, COL2_W, HDR_H).fill('#334155')
      doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
         .text('JD SKILL',      MARGIN + 12,          tblY + 9, { width: COL1_W - 20 })
      doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
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
    doc.rect(MARGIN,        hdrY, colW, 20).fill(NAVY)
    doc.rect(MARGIN + colW, hdrY, colW, 20).fill('#334155')
    doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
       .text('CLAIMED ON RESUME',    MARGIN + 10,        hdrY + 6, { width: colW - 20 })
    doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
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

    for (const ia of scorableAnswers) {
      pageCheck(doc, 140)
      const aY = doc.y
      
      const scoreColor = (ia.aiScore ?? 0) >= 7 ? GREEN : (ia.aiScore ?? 0) >= 4 ? AMBER : RED
      doc.rect(MARGIN, aY, 4, 150).fill(scoreColor) // We will adjust height later if needed

      let currentX = MARGIN + 12
      
      // Category Badge
      if (ia.category) {
        pill(doc, currentX, aY, 80, 14, ia.category, TEAL)
        currentX += 86
      }
      
      // Mode Badge
      pill(doc, currentX, aY, 70, 14, ia.mode || 'TEXT', GRAY)
      currentX += 76

      // Lowest score banner
      if (ia === lowestAnswer && (ia.aiScore ?? 0) <= 5) {
        doc.rect(currentX, aY, 110, 14).fill('#FEF2F2').stroke(RED)
        doc.fillColor(RED).fontSize(7).font('Helvetica-Bold').text('! CRITICAL GAP', currentX, aY + 4, { width: 110, align: 'center' })
      }

      doc.y = aY + 20

      // PROMPT or LIVE CODING PROBLEM
      const isLiveCoding = ia.mode.includes('LIVE_CODING')
      doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text(ia.prompt || ia.liveCodingProblem || 'Question Context', MARGIN + 12, doc.y, { width: contentW(doc) - 20 })
      doc.moveDown(0.4)

      // GREEN AND RED FLAG RUBRIC
      if (ia.evaluationRubric) {
        doc.fillColor(GREEN).fontSize(7.5).font('Helvetica-Bold').text('GREEN FLAG: ', MARGIN + 12, doc.y, { continued: true })
        doc.fillColor(DARK).font('Helvetica').text(ia.evaluationRubric.substring(0, 150) + '...', { width: contentW(doc) - 20 })
      }
      doc.moveDown(0.6)

      if (isLiveCoding && ia.codeSubmission) {
        doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold').text('SUBMITTED CODE:', MARGIN + 12, doc.y)
        doc.rect(MARGIN + 12, doc.y + 4, contentW(doc) - 20, 40).fill(NAVY)
        doc.fillColor(GREEN).fontSize(7).font('Courier').text(ia.codeSubmission.substring(0, 300) + (ia.codeSubmission.length > 300 ? '...' : ''), MARGIN + 16, doc.y + 8, { width: contentW(doc) - 28 })
        doc.y += 48
        
        doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold').text(`TEST CASES: ${ia.testCasesPassed ?? 0} / ${ia.testCasesTotal ?? 0} PASSED`, MARGIN + 12, doc.y)
        doc.moveDown(0.4)
      }

      // ANSWER TRANSCRIPT
      const previewText = ia.explainTranscript || ia.answerPreview || 'No response recorded.'
      doc.fillColor(GRAY).fontSize(8.5).font('Helvetica-Oblique').text(`"${previewText}"`, MARGIN + 12, doc.y, { width: contentW(doc) - 20 })

      if (ia.aiReasoning) {
        doc.moveDown(0.5)
        doc.fillColor('#0E7490').fontSize(8).font('Helvetica-Bold').text('AI EVALUATION:', MARGIN + 12, doc.y, { continued: true })
        doc.fillColor(DARK).font('Helvetica').text(` ${ia.aiReasoning}`, { width: contentW(doc) - 20 })
      }

      // COPY PASTE BANNER
      if (isLiveCoding && ia.copiedCodeSignal) {
        doc.moveDown(0.5)
        doc.rect(MARGIN + 12, doc.y, contentW(doc) - 20, 20).fill('#FEF2F2').stroke(RED)
        doc.fillColor(RED).fontSize(8).font('Helvetica-Bold').text('[!] COPY-PASTE SIGNAL DETECTED - Candidate explanation mismatched submitted code', MARGIN + 18, doc.y + 6)
        doc.y += 24
      }

      doc.moveDown(0.8)
      
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

      hRule(doc, BG2)
      doc.moveDown(0.8)
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
    doc.fillColor(DARK).fontSize(9.5).text(data.scorecard.gapAnalysis.behavioralProfile, MARGIN, doc.y, { width: contentW(doc) })
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
  doc.rect(MARGIN, chkY, 4, 110).fill(NAVY)

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

    const barY = ph(doc) - 28   // 28px navy bar anchored to page bottom
    const txtY = barY + 10      // ~vertically centred for 7.5pt font

    doc.rect(0, barY, pw(doc), 28).fill(NAVY)

    doc.fontSize(7.5).font('Helvetica').fillColor('#94A3B8')
    const footerText = `Indium AI  |  Confidential  |  ${footerName}  |  Page ${i + 1} of ${totalPages}`
    const txtX = (pw(doc) - doc.widthOfString(footerText)) / 2
    doc.text(footerText, txtX, txtY, { lineBreak: false })

    doc.y = MARGIN  // prevent overflow state before next switchToPage()
  }

  doc.end()
  return doc as unknown as Readable
}