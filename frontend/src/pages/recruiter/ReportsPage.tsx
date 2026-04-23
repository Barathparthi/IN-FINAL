import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { recruiterApi } from '../../services/api.services'
import {
  Download, FileText, FileSpreadsheet,
  ChevronDown, BarChart2, Loader2, Zap
} from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import toast from 'react-hot-toast'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts'

const STATUS_LABELS: Record<string, string> = {
  LOCKED: 'Locked', INVITED: 'Invited', ONBOARDING: 'Onboarding',
  READY: 'Ready', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
  TERMINATED: 'Terminated', SHORTLISTED: 'Shortlisted', REJECTED: 'Rejected',
}
const STATUS_COLORS: Record<string, string> = {
  LOCKED: '#6b7280', INVITED: '#0ea5e9', ONBOARDING: '#f97316',
  READY: '#22c55e', IN_PROGRESS: '#f59e0b', COMPLETED: '#14b8a6',
  TERMINATED: '#ef4444', SHORTLISTED: '#8b5cf6', REJECTED: '#374151',
}

export default function ReportsPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [hiringTypeFilter, setHiringTypeFilter] = useState<'CAMPUS' | 'LATERAL' | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['recruiter', 'campaigns'],
    queryFn: recruiterApi.getMyCampaigns,
  })

  // Filter campaigns by selected type
  const filteredCampaigns = (campaigns as any[]).filter((c: any) => {
    if (!hiringTypeFilter) return true
    const type = c.campaign?.hiringType || 'LATERAL'
    return hiringTypeFilter === 'CAMPUS' ? type === 'CAMPUS' : type !== 'CAMPUS'
  })

  // Auto-select first campaign of the filtered type
  useEffect(() => {
    if (filteredCampaigns.length > 0) {
      setSelectedCampaignId(filteredCampaigns[0].campaignId)
    } else {
      setSelectedCampaignId('')
    }
  }, [hiringTypeFilter])

  const { data: candidates = [], isLoading: isLoadingCandidates } = useQuery({
    queryKey: ['recruiter', 'candidates', selectedCampaignId],
    queryFn: () => recruiterApi.getCandidates(selectedCampaignId),
    enabled: !!selectedCampaignId,
  })

  const activeCampaign = (campaigns as any[]).find((c: any) => c.campaignId === selectedCampaignId)
  const candidateList = candidates as any[]

  useEffect(() => {
    setSelectedCandidateIds([])
  }, [selectedCampaignId])

  // Chart data
  const statusCounts = candidateList.reduce((acc: Record<string, number>, c: any) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status,
    value: count as number,
    fill: STATUS_COLORS[status] || '#6b7280',
  }))

  const barData = pieData.map(d => ({ name: d.name, Candidates: d.value, fill: d.fill }))

  const buildExportRows = () =>
    candidateList.map((c: any) => {
      const score = Math.round(c.scorecard?.technicalFitPercent || 0)
      const trust = Math.round(c.scorecard?.trustScore || 0)
      const strikes = c.strikeLog?.length || 0
      return {
        'First Name': c.user.firstName,
        'Last Name': c.user.lastName,
        Email: c.user.email,
        Status: STATUS_LABELS[c.status] || c.status,
        'Fit Score (%)': ['COMPLETED', 'TERMINATED', 'SHORTLISTED', 'REJECTED'].includes(c.status) ? score : '',
        'Trust Score': ['COMPLETED', 'TERMINATED', 'SHORTLISTED', 'REJECTED'].includes(c.status) ? trust : '',
        Strikes: strikes,
        'Last Active': c.user.lastLoginAt ? new Date(c.user.lastLoginAt).toLocaleDateString('en-IN') : 'Never',
      }
    })

  const fileName = () =>
    `Report_${activeCampaign?.campaign?.name?.replace(/\s+/g, '_') || 'Campaign'}_${new Date().toISOString().split('T')[0]}`

  const selectedCandidates = candidateList.filter(c => selectedCandidateIds.includes(c.id))
  const allSelected = candidateList.length > 0 && selectedCandidateIds.length === candidateList.length

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds(prev => prev.includes(candidateId)
      ? prev.filter(id => id !== candidateId)
      : [...prev, candidateId]
    )
  }

  const toggleAllCandidates = () => {
    setSelectedCandidateIds(prev => prev.length === candidateList.length ? [] : candidateList.map(c => c.id))
  }

    if (selectedCandidates.length === 0) {
      toast.error('Select at least one candidate')
      return
    }

    if (!confirm(`Are you sure you want to regenerate scorecards for ${selectedCandidates.length} candidate(s)?`)) {
      return
    }

    setBulkGenerating(true)
    try {
      const results = await Promise.allSettled(
        selectedCandidates.map(c => recruiterApi.generateScorecard(c.id))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      qc.invalidateQueries({ queryKey: ['recruiter', 'candidates', selectedCampaignId] })
      toast.success(failed > 0
        ? `Queued ${selectedCandidates.length - failed} scorecards, ${failed} failed`
        : `Queued ${selectedCandidates.length} scorecards`
      )
    } catch {
      toast.error('Failed to queue scorecards')
    } finally {
      setBulkGenerating(false)
    }
  }

  const bulkDownloadZip = async () => {
    if (selectedCandidates.length === 0) {
      toast.error('Select at least one candidate')
      return
    }

    setBulkDownloading(true)
    try {
      const zip = new JSZip()
      let downloaded = 0

      await Promise.all(selectedCandidates.map(async (c) => {
        try {
          const blob = await recruiterApi.downloadReport(c.id)
          const safeName = `${c.user.firstName}_${c.user.lastName}`.replace(/\s+/g, '_')
          zip.file(`indium_report_${safeName}.pdf`, blob)
          downloaded += 1
        } catch {
          // skip individual failures and continue
        }
      }))

      if (downloaded === 0) {
        toast.error('No reports were available to download')
        return
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName()}_reports.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`Downloaded ${downloaded} report${downloaded !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Bulk download failed')
    } finally {
      setBulkDownloading(false)
    }
  }

  const exportCSV = () => {
    setExporting('csv')
    try {
      const csv = Papa.unparse(buildExportRows())
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${fileName()}.csv`
      link.click()
      toast.success('CSV downloaded!')
    } catch {
      toast.error('CSV export failed')
    } finally { setExporting(null) }
  }

  const exportExcel = () => {
    setExporting('xlsx')
    try {
      const ws = XLSX.utils.json_to_sheet(buildExportRows())
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
      XLSX.writeFile(wb, `${fileName()}.xlsx`)
      toast.success('Excel file downloaded!')
    } catch {
      toast.error('Excel export failed')
    } finally { setExporting(null) }
  }

  const exportPDF = () => {
    setExporting('pdf')
    try {
      const doc = new jsPDF('landscape')
      doc.setFontSize(16)
      doc.setTextColor(30, 30, 30)
      doc.text(`Campaign Report: ${activeCampaign?.campaign?.name || ''}`, 14, 16)
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.text(`Role: ${activeCampaign?.campaign?.role || ''} | Exported: ${new Date().toLocaleString('en-IN')}`, 14, 24)

      // Summary boxes
      const summary = [
        { label: 'Total', value: candidateList.length },
        { label: 'Completed', value: statusCounts['COMPLETED'] || 0 },
        { label: 'In Progress', value: statusCounts['IN_PROGRESS'] || 0 },
        { label: 'Shortlisted', value: statusCounts['SHORTLISTED'] || 0 },
        { label: 'Terminated', value: statusCounts['TERMINATED'] || 0 },
      ]
      summary.forEach((s, i) => {
        const x = 14 + i * 56
        doc.setFillColor(240, 240, 240)
        doc.roundedRect(x, 30, 52, 16, 3, 3, 'F')
        doc.setFontSize(8)
        doc.setTextColor(90, 90, 90)
        doc.text(s.label, x + 4, 37)
        doc.setFontSize(14)
        doc.setTextColor(20, 20, 20)
        doc.text(String(s.value), x + 4, 44)
      })

      const rows = buildExportRows()
      autoTable(doc, {
        startY: 52,
        head: [Object.keys(rows[0] || {})],
        body: rows.map(r => Object.values(r)),
        theme: 'grid',
        headStyles: { fillColor: [35, 151, 156], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      })

      doc.save(`${fileName()}.pdf`)
      toast.success('PDF downloaded!')
    } catch {
      toast.error('PDF export failed')
    } finally { setExporting(null) }
  }

  const downloadDetailedReport = async (c: any) => {
    setDownloadingId(c.id)
    try {
      const blob = await recruiterApi.downloadReport(c.id)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `indium_report_${c.user.firstName}_${c.user.lastName}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Report downloaded!')
    } catch {
      toast.error('Failed to download detailed report')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 style={{ marginBottom: '4px' }}>
            <span style={{ color: 'var(--orange)' }}>Report</span> Download
          </h1>
          <p className="section-subtitle">
            Generate and download detailed assessment reports for candidates or campaign summaries.
          </p>
        </div>
      </div>

      {/* Step 1 — Choose campaign type */}
      {hiringTypeFilter === null && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Which type of campaign report do you want to generate?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '520px' }}>
            <button
              className="card"
              onClick={() => setHiringTypeFilter('CAMPUS')}
              style={{ padding: '28px 20px', textAlign: 'center', cursor: 'pointer', border: '2px solid var(--border)', transition: 'all 0.2s', background: 'var(--bg-elevated)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>🎓</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--cream)', marginBottom: '6px' }}>Campus Campaign</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Fresher drives, college recruiting reports</div>
            </button>
            <button
              className="card"
              onClick={() => setHiringTypeFilter('LATERAL')}
              style={{ padding: '28px 20px', textAlign: 'center', cursor: 'pointer', border: '2px solid var(--border)', transition: 'all 0.2s', background: 'var(--bg-elevated)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>💼</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--cream)', marginBottom: '6px' }}>Lateral Campaign</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Experienced hires, coding & interview reports</div>
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Select campaign + download */}
      {hiringTypeFilter !== null && (
        <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setHiringTypeFilter(null); setSelectedCampaignId('') }}
              style={{ gap: 6, fontSize: '0.8rem' }}
            >
              ← Back
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--cream)' }}>
              {hiringTypeFilter === 'CAMPUS' ? '🎓 Campus' : '💼 Lateral'} Campaign Reports
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '280px', position: 'relative' }}>
              <label className="form-label">Select Campaign</label>
              <select
                className="form-select"
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                disabled={isLoadingCampaigns}
                style={{ fontWeight: 600, marginTop: '4px' }}
              >
                {filteredCampaigns.length === 0
                  ? <option value="">No {hiringTypeFilter.toLowerCase()} campaigns assigned</option>
                  : filteredCampaigns.map((c: any) => (
                    <option key={c.campaignId} value={c.campaignId}>
                      {c.campaign.name} — {c.campaign.role}
                    </option>
                  ))}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: '12px', bottom: '13px', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: '20px' }}>
              <button className="btn btn-outline" onClick={exportCSV} disabled={!selectedCampaignId || isLoadingCandidates || exporting !== null}>
                {exporting === 'csv' ? <Loader2 size={15} className="spin-once" /> : <FileText size={15} />} CSV
              </button>
              <button className="btn btn-outline" onClick={exportExcel} disabled={!selectedCampaignId || isLoadingCandidates || exporting !== null}>
                {exporting === 'xlsx' ? <Loader2 size={15} className="spin-once" /> : <FileSpreadsheet size={15} />} Excel
              </button>
              <button className="btn btn-primary" onClick={exportPDF} disabled={!selectedCampaignId || isLoadingCandidates || exporting !== null}>
                {exporting === 'pdf' ? <Loader2 size={15} className="spin-once" /> : <Download size={15} />} Campaign Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {hiringTypeFilter !== null && (isLoadingCandidates ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--text-secondary)', gap: '10px', alignItems: 'center' }}>
          <div className="spinner" /> Loading report data...
        </div>
      ) : candidateList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><BarChart2 size={40} style={{ opacity: 0.3 }} /></div>
          <div className="empty-title">No data available</div>
          <div className="empty-desc">This campaign has no candidates yet. Add candidates to generate a report.</div>
        </div>
      ) : (
        <>
          {/* Summary chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {[
              { label: 'Total', value: candidateList.length, color: 'var(--teal)' },
              { label: 'Completed', value: statusCounts['COMPLETED'] || 0, color: 'var(--green-dark)' },
              { label: 'In Progress', value: statusCounts['IN_PROGRESS'] || 0, color: 'var(--orange)' },
              { label: 'Shortlisted', value: statusCounts['SHORTLISTED'] || 0, color: 'var(--primary)' },
              { label: 'Terminated', value: statusCounts['TERMINATED'] || 0, color: 'var(--red)' },
              { label: 'Pending', value: (statusCounts['LOCKED'] || 0) + (statusCounts['INVITED'] || 0) + (statusCounts['READY'] || 0), color: 'var(--text-muted)' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--cream)' }}>Status Breakdown (Bar)</h3>
              <div style={{ height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 0, right: 10, left: -20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-30} textAnchor="end" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="Candidates" radius={[4,4,0,0]}>
                      {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--cream)' }}>Status Distribution (Pie)</h3>
              <div style={{ height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                {pieData.map((d, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: d.fill, flexShrink: 0 }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Data Table Preview */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--cream)', margin: 0 }}>Individual Candidate Reports</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className="badge badge-muted">{candidateList.length} candidates</span>
                <span className="badge badge-teal">{selectedCandidateIds.length} selected</span>
                  <button className="btn btn-outline btn-sm" onClick={bulkRegenerate} disabled={bulkGenerating || selectedCandidateIds.length === 0}>
                  {bulkGenerating ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                  Regenerate Selected
                </button>
                <button className="btn btn-primary btn-sm" onClick={bulkDownloadZip} disabled={bulkDownloading || selectedCandidateIds.length === 0}>
                  {bulkDownloading ? <Loader2 size={14} className="spin-once" /> : <Download size={14} />}
                  Download Selected ZIP
                </button>
              </div>
            </div>
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0, maxHeight: '420px', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
                  <tr>
                    <th style={{ width: 42 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAllCandidates} />
                    </th>
                    <th>Candidate</th>
                    <th>Status</th>
                    <th>Fit Score</th>
                    <th>Trust</th>
                    <th>Strikes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateList.map((c: any) => {
                    const score = Math.round(c.scorecard?.technicalFitPercent || 0)
                    const trust = Math.round(c.scorecard?.trustScore || 0)
                    const strikes = c.strikeLog?.length || 0
                    const hasScore = ['COMPLETED', 'TERMINATED', 'SHORTLISTED', 'REJECTED'].includes(c.status)
                    const canGenerate = ['COMPLETED', 'TERMINATED', 'REJECTED'].includes(c.status) && !c.scorecard
                    
                    return (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedCandidateIds.includes(c.id)}
                            onChange={() => toggleCandidate(c.id)}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>
                           <div style={{ color: 'var(--cream)' }}>{c.user.firstName} {c.user.lastName}</div>
                           <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{c.user.email}</div>
                        </td>
                        <td>
                          <span className="badge" style={{ background: STATUS_COLORS[c.status] + '22', color: STATUS_COLORS[c.status], border: `1px solid ${STATUS_COLORS[c.status]}44` }}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: hasScore ? (score >= 70 ? 'var(--green-dark)' : 'var(--orange)') : 'var(--text-muted)' }}>
                          {hasScore ? `${score}%` : '—'}
                        </td>
                        <td style={{ color: hasScore ? 'var(--cream)' : 'var(--text-muted)' }}>
                          {hasScore ? `${trust}%` : '—'}
                        </td>
                        <td>
                          {strikes > 0
                            ? <span className={`badge ${strikes >= 3 ? 'badge-danger' : strikes === 2 ? 'badge-warning' : 'badge-success'}`}>{strikes}</span>
                            : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                           <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                             {c.scorecard ? (
                               <button 
                                 className="btn btn-sm btn-teal"
                                 disabled={downloadingId === c.id}
                                 onClick={() => downloadDetailedReport(c)}
                                 title="Download Detailed PDF Report"
                               >
                                 {downloadingId === c.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                                 PDF
                               </button>
                             ) : canGenerate ? (
                               <button 
                                 className="btn btn-sm btn-orange"
                                 disabled={generatingId === c.id}
                                 onClick={async () => {
                                   setGeneratingId(c.id)
                                   try {
                                     await recruiterApi.generateScorecard(c.id)
                                     toast.success('AI scorecard generation queued')
                                   } catch {
                                     toast.error('Failed to start generation')
                                   } finally {
                                     setGeneratingId(null)
                                   }
                                 }}
                               >
                                 {generatingId === c.id ? <Loader2 size={14} className="spin" /> : 'Generate'}
                               </button>
                             ) : (
                               <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                             )}
                           </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ))}
    </div>
  )
}
