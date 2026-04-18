import PDFDocument from 'pdfkit'
import type { Readable } from 'stream'
import type { ReportData, InterviewPreview } from './report.service'

// ── Brand colours ─────────────────────────────────────────────
const ORANGE  = '#FB851E'      // Primary
const TEAL    = '#23979C'      // Secondary
const GREEN   = '#86FE90'      // Success
const RED     = '#FB371E'      // Danger / Alert
const AMBER   = '#EDFC81'      // Warning / Accent (Yellow)
const GRAY    = '#3A3A3A'      // Base
const LGRAY   = '#EFEAE3'      // Cream — light text / surfaces
const DARK    = '#3A3A3A'      // Base / Surfaces
const WHITE   = '#FFFFFF'      // Page background / contrast
const LIGHT   = '#EFEAE3'      // Cream surfaces
const BORDER  = '#EFEAE3'      // Cream borders
const BG_CODE = '#3A3A3A'      // Dark code background
const CODE_FG = '#86FE90'      // Green code text on dark bg

const MARGIN = 40
function ph(doc: any) { return doc.page.height }
function pw(doc: any) { return doc.page.width  }
function cw(doc: any) { return pw(doc) - MARGIN * 2 }

function pageCheck(doc: any, needed = 60) {
  if (doc.y + needed > ph(doc) - 50) doc.addPage()
}

function hRule(doc: any, color = BORDER, lm = MARGIN) {
  doc.moveTo(lm, doc.y).lineTo(pw(doc) - lm, doc.y).lineWidth(0.5).stroke(color)
}

// ── Section title with teal left accent ──────────────────────
function sectionTitle(doc: any, title: string) {
  pageCheck(doc, 40)
  doc.moveDown(0.7)
  doc.rect(MARGIN, doc.y, 4, 14).fill(TEAL)
  doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold')
     .text(title.toUpperCase(), MARGIN + 10, doc.y + 1, { width: cw(doc) - 10 })
  doc.moveDown(0.15)
  hRule(doc, BORDER)
  doc.moveDown(0.4)
}

// ── Pill badge ────────────────────────────────────────────────
function pill(doc: any, x: number, y: number, w: number, h: number, text: string, bg: string, fg = WHITE) {
  doc.rect(x, y, w, h).fill(bg)
  doc.fillColor(fg).fontSize(7.5).font('Helvetica-Bold')
     .text(text, x, y + (h - 7.5) / 2 + 1, { width: w, align: 'center' })
}



// ── Recommendation classify ───────────────────────────────────
function classifyRec(fitPct: number, trustScore: number) {
  if (fitPct >= 76 && trustScore >= 72) return { label: 'FAST-TRACK', bg: GREEN }
  if (fitPct >= 62 && trustScore >= 62) return { label: 'HIRE',       bg: TEAL  }
  if (fitPct >= 50 && trustScore >= 52) return { label: 'WATCHLIST',  bg: AMBER }
  return                                       { label: 'NO HIRE',    bg: RED   }
}

// ── Simple bar chart for section scores ──────────────────────
function drawBarChart(doc: any, chartX: number, chartY: number, chartW: number, chartH: number, barData: { label: string; value: number; max: number }[]) {
  const barCount  = barData.length
  if (barCount === 0) return

  const BAR_AREA_H = chartH - 24   // leave room for x-axis labels
  const barW  = Math.min(40, (chartW - 20) / barCount - 8)
  const gap   = (chartW - barW * barCount) / (barCount + 1)

  // Axes
  doc.moveTo(chartX, chartY).lineTo(chartX, chartY + BAR_AREA_H).lineWidth(0.5).stroke(DARK)
  doc.moveTo(chartX, chartY + BAR_AREA_H).lineTo(chartX + chartW, chartY + BAR_AREA_H).lineWidth(0.5).stroke(DARK)

  barData.forEach((bar, i) => {
    const bx    = chartX + gap + i * (barW + gap)
    const ratio = Math.max(0, Math.min(1, bar.value / (bar.max || 100)))
    const bh    = Math.max(2, ratio * BAR_AREA_H)
    const by    = chartY + BAR_AREA_H - bh
    const color = ratio >= 0.7 ? GREEN : ratio >= 0.5 ? TEAL : RED

    doc.rect(bx, by, barW, bh).fill(color)

    // Value label above bar
    doc.fillColor(DARK).fontSize(7).font('Helvetica-Bold')
       .text(`${bar.value.toFixed(1)}`, bx, by - 11, { width: barW, align: 'center' })

    // X-axis label (truncate if needed)
    const labelText = bar.label.length > 9 ? bar.label.slice(0, 8) + '…' : bar.label
    doc.fillColor(GRAY).fontSize(6.5).font('Helvetica')
       .text(labelText, bx - 4, chartY + BAR_AREA_H + 5, { width: barW + 8, align: 'center' })
  })
}

// ──────────────────────────────────────────────────────────────
//  MAIN ENTRY
// ──────────────────────────────────────────────────────────────
export function generateCampusReportPDF(data: ReportData): Readable {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true, bufferPages: true })

  const fitPct  = data.scorecard.technicalFitPercent ?? 0
  const trust   = data.scorecard.trustScore ?? 0
  const rec     = classifyRec(fitPct, trust)
  const strikes = data.strikeLog.filter((s: any) => s.isStrike).length
  const tabSwitch = data.strikeLog.filter((s: any) => s.violationType?.toLowerCase().includes('tab')).length
  const fsExit    = data.strikeLog.filter((s: any) => s.violationType?.toLowerCase().includes('fullscreen') || s.violationType?.toLowerCase().includes('full_screen')).length
  const candidateName = `${data.candidate.firstName} ${data.candidate.lastName}`

  // Round scores sorted
  const rounds = (data.scorecard.roundScores || [])
    .slice().sort((a: any, b: any) => (a.roundOrder || 0) - (b.roundOrder || 0))

  // ── PAGE 1: HEADER ───────────────────────────────────────────
  // Top banner
  const bannerH = 56
  doc.rect(0, 0, pw(doc), bannerH).fill(DARK)
  doc.fillColor(ORANGE).fontSize(20).font('Helvetica-Bold').text('iHire', MARGIN, 14)
  const logoW = doc.widthOfString('iHire') + 2
  doc.fillColor(WHITE).fontSize(20).font('Helvetica').text('AI', MARGIN + logoW, 14)
  doc.fillColor(TEAL).fontSize(7.5).font('Helvetica-Bold')
     .text('CAMPUS ASSESSMENT REPORT', MARGIN, 38)
  doc.fillColor(WHITE).fontSize(7).font('Helvetica')
     .text(
       `Generated: ${data.scorecard.generatedAt ? new Date(data.scorecard.generatedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}`,
       0, 42, { align: 'right', width: pw(doc) - MARGIN }
     )
  doc.y = bannerH + 10

  // ── CANDIDATE IDENTITY ROW ──────────────────────────────────
  const idY = doc.y
  const photoW = 66, photoH = 80
  const photoX = pw(doc) - MARGIN - photoW

  // if (data.candidatePhoto) {
  //   try {
  //     doc.rect(photoX - 1, idY - 1, photoW + 2, photoH + 2).fill(BORDER)
  //     doc.image(data.candidatePhoto, photoX, idY, { width: photoW, height: photoH, cover: [photoW, photoH] })
  //   } catch {
  //     doc.rect(photoX, idY, photoW, photoH).fill(LIGHT).stroke(BORDER)
  //   }
  // } else {
  //   doc.rect(photoX, idY, photoW, photoH).fill(LIGHT).stroke(BORDER)
  //   doc.fillColor(DARK).fontSize(7).font('Helvetica').text('No Photo', photoX, idY + photoH / 2 - 4, { width: photoW, align: 'center' })
  // }

  const infoW = photoX - MARGIN - 12
  doc.fillColor(DARK).fontSize(19).font('Helvetica-Bold').text(candidateName, MARGIN, idY, { width: infoW })
  doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(data.candidate.email, MARGIN, doc.y + 2, { width: infoW })
  doc.fillColor(DARK).fontSize(8).text(`${data.campaign.role}  ·  ${data.campaign.name}  ·  Fresher Hiring - Campus`, MARGIN, doc.y + 3, { width: infoW })

  // Recommendation badge inline
  const recY = doc.y + 8
  doc.rect(MARGIN, recY, 110, 22).fill(rec.bg)
  doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold').text(rec.label, MARGIN, recY + 7, { width: 110, align: 'center' })

  doc.y = idY + photoH + 14

  // ── TWO-COLUMN LAYOUT: Assessment Details | Trust Insights ──
  const colW  = cw(doc) / 2 - 6
  const leftX  = MARGIN
  const rightX = MARGIN + colW + 12

  // --- Left card: Assessment Details ---
  const cardY = doc.y
  const cardH = 190

  doc.rect(leftX, cardY, colW, cardH).fill(LIGHT).stroke(BORDER)
  doc.fillColor(DARK).fontSize(9.5).font('Helvetica-Bold').text('Assessment Details', leftX + 10, cardY + 10)
  hRule(doc, BORDER, leftX)

  const ld = (label: string, value: string, yOff: number, valueColor = DARK) => {
    doc.fillColor(TEAL).fontSize(7.2).font('Helvetica-Bold').text(label, leftX + 10, cardY + yOff)
    doc.fillColor(valueColor).fontSize(9).font('Helvetica-Bold').text(value, leftX + 10, cardY + yOff + 11, { width: colW - 20 })
  }

  // Assessment Name
  ld('Assessment Name', data.campaign.name, 28, ORANGE)

  // Start / End date from round attempts (use first round)
  const firstRound: any = rounds[0] || {}
  const startStr = firstRound.startedAt ? new Date(firstRound.startedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const endStr   = firstRound.completedAt ? new Date(firstRound.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  // Start/End side-by-side
  const halfW = (colW - 20) / 2
  doc.fillColor(TEAL).fontSize(7.2).font('Helvetica-Bold').text('Start Date & Time', leftX + 10, cardY + 56)
  doc.fillColor(DARK).fontSize(8.5).font('Helvetica-Bold').text(startStr, leftX + 10, cardY + 67, { width: halfW })
  doc.fillColor(TEAL).fontSize(7.2).font('Helvetica-Bold').text('Completed Date & Time', leftX + 10 + halfW, cardY + 56)
  doc.fillColor(DARK).fontSize(8.5).font('Helvetica-Bold').text(endStr, leftX + 10 + halfW, cardY + 67, { width: halfW })

  // Separator line
  doc.moveTo(leftX + 10, cardY + 85).lineTo(leftX + colW - 10, cardY + 85).lineWidth(0.4).stroke(BORDER)

  // Bar chart area (section scores)
  const chartAreaX = leftX + 10
  const chartAreaY = cardY + 92
  const chartAreaW = colW - 100   // leave ~90px for right-side stats
  const chartAreaH = 82

  const barItems = rounds.map((r: any) => ({
    label: `Sec ${r.roundOrder || '?'}`,
    value: +(r.percentScore ?? r.percent ?? 0).toFixed(1),
    max:   100,
  }))

  if (barItems.length > 0) {
    drawBarChart(doc, chartAreaX, chartAreaY, chartAreaW, chartAreaH, barItems)
  } else {
    // fallback single bar for overall fit
    drawBarChart(doc, chartAreaX, chartAreaY, chartAreaW, chartAreaH, [{ label: 'Overall', value: fitPct, max: 100 }])
  }

  // Right-side stats inside left card
  const statX = leftX + colW - 84
  const statItems = [
    { label: 'Total Sections', value: String(rounds.length || 1),              color: DARK   },
    { label: 'Total Questions', value: String(data.interviewPreviews.length),   color: DARK   },
    { label: 'Cut-Off Score',  value: `${firstRound.passMarkPercent ?? 60}`,   color: ORANGE },
    { label: 'Candidate Score(%)', value: fitPct.toFixed(2),                   color: GREEN  },
  ]
  statItems.forEach((s, i) => {
    const sy = cardY + 96 + i * 22
    doc.fillColor(TEAL).fontSize(7).font('Helvetica').text(s.label, statX, sy)
    doc.fillColor(s.color).fontSize(9.5).font('Helvetica-Bold').text(s.value, statX, sy + 10)
  })

  // --- Right card: Trust Insights ---
  doc.rect(rightX, cardY, colW, cardH).fill(LIGHT).stroke(BORDER)
  doc.fillColor(DARK).fontSize(9.5).font('Helvetica-Bold').text('Trust Insights', rightX + 10, cardY + 10)
  hRule(doc, BORDER, rightX)

  const trustItem = (label: string, value: number, y: number) => {
    doc.fillColor(DARK).fontSize(9).font('Helvetica').text(label, rightX + 10, y)
    const color = value === 0 ? GREEN : RED
    doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text(String(value), rightX + colW - 30, y)
    doc.moveTo(rightX + 10, y + 16).lineTo(rightX + colW - 10, y + 16).lineWidth(0.3).stroke(BORDER)
  }

  trustItem('Tab switch count', tabSwitch, cardY + 28)
  trustItem('Full screen exit count', fsExit, cardY + 50)

  // Candidate screenshots header
  const screenshotY = cardY + 76
  doc.fillColor(DARK).fontSize(9.5).font('Helvetica-Bold').text('Candidate Screenshots', rightX + 10, screenshotY)

  // Render up to 2 photos if available
  const photoSlots = [
    { x: rightX + 10,              y: screenshotY + 15, w: (colW - 30) / 2, h: 80 },
    { x: rightX + 16 + (colW - 30) / 2, y: screenshotY + 15, w: (colW - 30) / 2, h: 80 },
  ]

  if (data.candidatePhoto) {
    try {
      doc.image(data.candidatePhoto, photoSlots[0].x, photoSlots[0].y, { width: photoSlots[0].w, height: photoSlots[0].h, cover: [photoSlots[0].w, photoSlots[0].h] })
    } catch { /* skip */ }
    // second slot placeholder
    doc.rect(photoSlots[1].x, photoSlots[1].y, photoSlots[1].w, photoSlots[1].h).fill(LIGHT).stroke(BORDER)
  } else {
    photoSlots.forEach(s => {
      doc.rect(s.x, s.y, s.w, s.h).fill(LIGHT).stroke(BORDER)
      doc.fillColor(DARK).fontSize(7).font('Helvetica').text('No photo', s.x, s.y + s.h / 2 - 4, { width: s.w, align: 'center' })
    })
  }

  doc.y = cardY + cardH + 16

  // ── DETAILED SUMMARY ─────────────────────────────────────────
  sectionTitle(doc, 'Detailed Summary')

  // total Q count + type filter label
  const totalQ = data.interviewPreviews.length
  doc.fillColor(DARK).fontSize(9.5).font('Helvetica-Bold').text(`Questions(${totalQ})`, MARGIN, doc.y)
  doc.fillColor(DARK).fontSize(8).font('Helvetica')
     .text('Type :  All Questions', 0, doc.y, { align: 'right', width: pw(doc) - MARGIN })
  doc.moveDown(0.6)

  // ── TABLE HEADER ─────────────────────────────────────────────
  const cols = {
    question: 190,
    difficulty: 42,
    category: 110,
    section: 42,
    status: 52,
    testCases: 40,
    score: cw(doc) - (190 + 42 + 110 + 42 + 52 + 40),
  }

  const drawTableHeader = (y: number) => {
    const totalColW = Object.values(cols).reduce((a, b) => a + b, 0)
    let cx = MARGIN

    const headers = ['Question', 'Difficulty', 'Category', 'Section', 'Status', 'TC(s)', 'Score']
    const widths  = Object.values(cols)

    doc.rect(MARGIN, y, totalColW, 22).fill('#EFF6FF').stroke(BORDER)
    headers.forEach((h, i) => {
      doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold')
         .text(h, cx + 5, y + 7, { width: widths[i] - 8 })
      cx += widths[i]
    })
    return y + 22
  }

  let tableY = doc.y
  tableY = drawTableHeader(tableY)

  // ── TABLE ROWS ───────────────────────────────────────────────
  const codingAnswerQueue: Array<{ idx: number; ia: InterviewPreview; rowColor: string }> = []
  // How many questions per section
  const qPerSection = Math.max(1, Math.ceil(data.interviewPreviews.length / Math.max(1, rounds.length)))

  data.interviewPreviews.forEach((ia, idx) => {
    const ROW_H = 30
    if (tableY + ROW_H > ph(doc) - 50) {
      doc.addPage()
      tableY = doc.y
      tableY = drawTableHeader(tableY)
    }

    const bgFill  = idx % 2 === 0 ? WHITE : '#FAFBFC'
    const isCoding = !!(ia.codeSubmission || ia.mode?.toUpperCase().includes('CODE') || ia.mode?.toUpperCase().includes('CODING') || ia.liveCodingProblem)

    // Status & score differ between MCQ and coding
    let statusLabel: string
    let statusColor: string
    let scoreText: string
    let scoreColor: string

    if (isCoding) {
      // Coding: judge by test cases if available, else aiScore
      const tcPassed = ia.testCasesPassed ?? 0
      const tcTotal  = ia.testCasesTotal  ?? 0
      const codingPassed = tcTotal > 0 ? tcPassed === tcTotal : (ia.aiScore ?? 0) >= 5
      statusLabel = codingPassed ? 'Passed' : 'Failed'
      statusColor = codingPassed ? GREEN : RED
      scoreColor  = codingPassed ? GREEN : (tcPassed > 0 ? AMBER : RED)
      scoreText   = tcTotal > 0 ? `${tcPassed} / ${tcTotal}` : (ia.aiScore != null ? `${ia.aiScore.toFixed(1)}/10` : 'N/A')
      codingAnswerQueue.push({ idx, ia, rowColor: scoreColor })
    } else {
      // MCQ: correct if aiScore >= 5; show 1/1 or 0/1
      const mcqPassed = (ia.aiScore ?? 0) >= 5
      statusLabel = mcqPassed ? 'Correct' : 'Incorrect'
      statusColor = mcqPassed ? GREEN : RED
      scoreColor  = mcqPassed ? GREEN : RED
      scoreText   = mcqPassed ? '1 / 1' : '0 / 1'
    }

    // Section label
    const sectionNum   = Math.min(rounds.length || 1, Math.ceil((idx + 1) / qPerSection))
    const sectionLabel = `Section ${sectionNum}`

    // Difficulty heuristic from aiScore
    const difficulty = ia.aiScore == null ? 'Hard' : ia.aiScore >= 7 ? 'Easy' : ia.aiScore >= 5 ? 'Medium' : 'Hard'

    const widths = Object.values(cols)
    let cx = MARGIN

    // Row background
    doc.rect(MARGIN, tableY, Object.values(cols).reduce((a, b) => a + b, 0), ROW_H).fill(bgFill).stroke(BORDER)

    // Question text
     const qText = (ia.prompt || ia.liveCodingProblem || 'Question').slice(0, 160)
    doc.fillColor(DARK).fontSize(7.5).font('Helvetica')
       .text(qText + (qText.length >= 160 ? '…' : ''), cx + 5, tableY + 6, {
        width: widths[0] - 8,
        height: ROW_H - 8,
        ellipsis: true,
       })
    cx += widths[0]

    // Difficulty
    const diffColor = difficulty === 'Easy' ? GREEN : difficulty === 'Medium' ? AMBER : RED
    doc.fillColor(diffColor).fontSize(7.5).font('Helvetica-Bold')
       .text(difficulty, cx + 5, tableY + 10, { width: widths[1] - 8, align: 'center' })
    cx += widths[1]

    // Category
    doc.fillColor(DARK).fontSize(7.5).font('Helvetica')
       .text((ia.category || 'General').slice(0, 34), cx + 5, tableY + 6, {
         width: widths[2] - 8,
         height: ROW_H - 8,
         ellipsis: true,
       })
    cx += widths[2]

    // Section
    doc.fillColor(DARK).fontSize(7.5).font('Helvetica')
       .text(sectionLabel, cx + 5, tableY + 10, { width: widths[3] - 8, align: 'center' })
    cx += widths[3]

    // Status (Correct / Incorrect / Passed / Failed)
    doc.fillColor(statusColor).fontSize(7.5).font('Helvetica-Bold')
       .text(statusLabel, cx + 5, tableY + 10, { width: widths[4] - 8, align: 'center' })
    cx += widths[4]

    // Test Cases — show for coding, dash for MCQ
    const tcDisplay = isCoding && ia.testCasesTotal != null
      ? `${ia.testCasesPassed ?? 0}/${ia.testCasesTotal}`
      : '–'
    doc.fillColor(DARK).fontSize(7.5).font('Helvetica')
       .text(tcDisplay, cx + 5, tableY + 10, { width: widths[5] - 8, align: 'center' })
    cx += widths[5]

    // Score
    doc.fillColor(scoreColor).fontSize(7.5).font('Helvetica-Bold')
       .text(scoreText, cx + 5, tableY + 10, { width: widths[6] - 8, align: 'center' })

    tableY += ROW_H
  })

  doc.y = tableY + 12

  // ── CODING ANSWERS (if any) ───────────────────────────────────
  if (codingAnswerQueue.length > 0) {
    pageCheck(doc, 80)
    sectionTitle(doc, 'Coding Answers')

    for (const { idx, ia, rowColor } of codingAnswerQueue) {
      pageCheck(doc, 100)

      const blockY = doc.y
      const questionText = ia.prompt || ia.liveCodingProblem || 'Coding Question'

      // Question header
      doc.rect(MARGIN, blockY, cw(doc), 28).fill(LIGHT).stroke(BORDER)
      doc.rect(MARGIN, blockY, 4, 28).fill(rowColor)
      pill(doc, MARGIN + 10, blockY + 7, 30, 14, `Q${idx + 1}`, rowColor)
      doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold')
         .text(questionText, MARGIN + 48, blockY + 9, { width: cw(doc) - 120, lineGap: 1 })

      // Test cases badge
      if (ia.testCasesTotal != null) {
        const tcPassed = ia.testCasesPassed ?? 0
        const tcTotal  = ia.testCasesTotal
        const tcColor  = tcPassed === tcTotal ? GREEN : tcPassed > 0 ? AMBER : RED
        pill(doc, pw(doc) - MARGIN - 80, blockY + 7, 76, 14, `TC: ${tcPassed}/${tcTotal} passed`, tcColor)
      }

      doc.y = blockY + 36

      // Candidate's code
      if (ia.codeSubmission) {
        const code     = ia.codeSubmission
        const codeLines = code.split('\n').slice(0, 30).join('\n')   // cap at 30 lines
        const hasMore   = code.split('\n').length > 30

        doc.fillColor(TEAL).fontSize(7.5).font('Helvetica-Bold').text('CANDIDATE SOLUTION', MARGIN, doc.y)
        doc.moveDown(0.3)

        const codeY = doc.y
        const codeH = Math.min(200, doc.heightOfString(codeLines, { width: cw(doc) - 20, lineGap: 2 }) + 20)

        doc.rect(MARGIN, codeY, cw(doc), codeH).fill(BG_CODE).stroke('#334155')
        doc.fillColor(CODE_FG).fontSize(7.5).font('Courier')
           .text(codeLines + (hasMore ? '\n… (truncated)' : ''), MARGIN + 10, codeY + 10, { width: cw(doc) - 24, lineGap: 2 })

        doc.y = codeY + codeH + 8
      }

      // Text/explain answer
      const answerText = ia.explainTranscript || ia.answerText || ia.answerPreview
      if (answerText && answerText.trim()) {
        doc.fillColor(TEAL).fontSize(7.5).font('Helvetica-Bold').text('EXPLANATION / TRANSCRIPT', MARGIN, doc.y)
        doc.moveDown(0.3)
        const expY = doc.y
        const expH = Math.min(80, doc.heightOfString(answerText, { width: cw(doc) - 24, lineGap: 1 }) + 16)
        doc.rect(MARGIN, expY, cw(doc), expH).fill(LIGHT).stroke(BORDER)
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Oblique')
           .text(`"${answerText}"`, MARGIN + 10, expY + 8, { width: cw(doc) - 24, lineGap: 1, height: expH - 16, ellipsis: true })
        doc.y = expY + expH + 6
      }

      // AI evaluation
      if (ia.aiReasoning) {
        doc.fillColor(TEAL).fontSize(7.5).font('Helvetica-Bold').text('AI EVALUATION', MARGIN, doc.y)
        doc.moveDown(0.25)
        doc.fillColor(DARK).fontSize(8).font('Helvetica')
           .text(ia.aiReasoning, MARGIN, doc.y, { width: cw(doc), lineGap: 1.2 })
        doc.moveDown(0.4)
      }

      // Copy-paste signal
      if (ia.copiedCodeSignal) {
        const cpY = doc.y
        doc.rect(MARGIN, cpY, cw(doc), 18).fill('#FEF2F2').stroke(RED)
        doc.fillColor(RED).fontSize(7.5).font('Helvetica-Bold')
           .text('[!] COPY-PASTE SIGNAL DETECTED — Explanation does not match submitted code', MARGIN + 8, cpY + 5, { width: cw(doc) - 16 })
        doc.y = cpY + 24
      }

      hRule(doc)
      doc.moveDown(0.8)
    }
  }

  // ── PROCTORING VIOLATIONS ──────────────────────────────────
  pageCheck(doc, 60)
  sectionTitle(doc, 'Proctoring Violations')

  if (data.strikeLog.length === 0) {
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text('No proctoring violations recorded.', MARGIN, doc.y, { width: cw(doc) })
    doc.moveDown(0.5)
  } else {
    for (const strike of data.strikeLog) {
      pageCheck(doc, 36)
      const color = strike.isStrike ? RED : AMBER
      const label = strike.isStrike ? `Strike ${strike.strikeNumber}` : 'Flag'
      const vY = doc.y

      pill(doc, MARGIN, vY, 60, 16, label, color)

      doc.fillColor(DARK).fontSize(9).font('Helvetica')
         .text(String(strike.violationType).replace(/_/g, ' '), MARGIN + 68, vY + 4, { continued: true })
      doc.fillColor(DARK).fontSize(8)
         .text(`   ${new Date(strike.occurredAt).toLocaleString('en-IN')}`)

      if (strike.screenshotUrl) {
        doc.fillColor(TEAL).fontSize(7.5).font('Helvetica-Bold')
           .text('VIEW EVIDENCE [-›]', MARGIN + 68, doc.y + 1, {
             link: strike.screenshotUrl,
             underline: true,
           })
      }

      doc.y = Math.max(doc.y, vY + 30)
    }
    doc.moveDown(0.5)
  }

  // ── RECRUITER NOTES ──────────────────────────────────────────
  if (data.scorecard.recruiterNotes) {
    pageCheck(doc, 60)
    sectionTitle(doc, 'Recruiter Notes')
    if (data.scorecard.recruiterRating) {
      const stars = '★'.repeat(data.scorecard.recruiterRating) + '☆'.repeat(Math.max(0, 5 - data.scorecard.recruiterRating))
      doc.fillColor(ORANGE).fontSize(13).font('Helvetica-Bold').text(stars, MARGIN, doc.y)
      doc.moveDown(0.4)
    }
    doc.fillColor(DARK).fontSize(9.5).font('Helvetica')
       .text(data.scorecard.recruiterNotes, MARGIN, doc.y, { width: cw(doc) })
    doc.moveDown(0.8)
  }

  // ── FOOTER — page numbers ────────────────────────────────────
  const range      = (doc as any).bufferedPageRange()
  const totalPages = range.count

  for (let i = 0; i < totalPages; i++) {
    (doc as any).switchToPage(range.start + i)
    const barY = ph(doc) - 26
    const txtY = barY + 9
    doc.rect(0, barY, pw(doc), 26).fill(WHITE).stroke(BORDER)
    doc.fontSize(7).font('Helvetica').fillColor(DARK)
    const footerText = `iHire  |  Confidential  |  ${candidateName}  |  Page ${i + 1} of ${totalPages}`
    const txtX = (pw(doc) - doc.widthOfString(footerText)) / 2
    doc.text(footerText, txtX, txtY, { lineBreak: false })
    doc.y = MARGIN
  }

  doc.end()
  return doc as unknown as Readable
}
