import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recruiterApi } from '../../services/api.services'
import { X, UserCheck, Filter, Zap, ShieldCheck, Search } from 'lucide-react'
import toast from 'react-hot-toast'

interface RoundReviewModalProps {
  campaignId: string
  round: any
  onClose: () => void
}

export default function RoundReviewModal({ campaignId, round, onClose }: RoundReviewModalProps) {
  const qc = useQueryClient()
  const [passMark, setPassMark] = useState<number>(round.passMarkPercent || 60)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const { data: reviewData, isLoading } = useQuery({
    queryKey: ['recruiter', 'round-review', round.id],
    queryFn: () => recruiterApi.getRoundReview(campaignId, round.id),
  })

  const attempts = reviewData?.attempts || []

  // Dynamic filtering based on passMark
  const processedCandidates = useMemo(() => {
    return attempts.map((att: any) => {
      const score = att.percentScore || 0
      const qualifies = score >= passMark
      const name = `${att.candidate.user.firstName} ${att.candidate.user.lastName}`
      const email = att.candidate.user.email
      return {
        ...att,
        qualifies,
        candidateName: name,
        candidateEmail: email,
        searchStr: `${name} ${email}`.toLowerCase()
      }
    })
  }, [attempts, passMark])

  const filteredCandidates = processedCandidates.filter((c: any) => 
    c.searchStr.includes(search.toLowerCase())
  )

  const qualifiedCount = processedCandidates.filter((c: any) => c.qualifies).length

  const updateCriteriaMutation = useMutation({
    mutationFn: (val: number) => recruiterApi.updateRoundCriteria(round.id, val),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruiter', 'campaigns'] })
      toast.success('Round criteria updated successfully')
    },
    onError: () => toast.error('Failed to update criteria')
  })

  const advanceMutation = useMutation({
    mutationFn: (ids: string[]) => recruiterApi.bulkAdvanceCandidates(round.id, ids),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['recruiter', 'round-review', round.id] })
      qc.invalidateQueries({ queryKey: ['recruiter', 'candidates', campaignId] })
      toast.success(`Successfully advanced ${res.advanced} candidates!`)
      setSelectedIds(new Set())
    },
    onError: () => toast.error('Failed to advance candidates')
  })

  const toggleSelect = (id: string, qualifies: boolean) => {
    if (!qualifies) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllQualified = () => {
    const qualified = filteredCandidates.filter((c: any) => c.qualifies && c.passed !== true)
    if (selectedIds.size === qualified.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(qualified.map((c: any) => c.candidateId)))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" style={{ maxWidth: '900px', height: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
              <Zap size={20} style={{ color: 'var(--orange)' }} />
            </div>
            <div>
              <div className="modal-title">Round Review: {round.roundType}</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{attempts.length} completions · Order {round.order}</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Controls Section */}
          <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: 'var(--cream)' }}>
                <Filter size={16} /> Passing Criteria
              </div>
              <button 
                className="btn btn-ghost btn-sm" 
                style={{ fontSize: '0.75rem' }}
                onClick={() => updateCriteriaMutation.mutate(passMark)}
                disabled={updateCriteriaMutation.isPending || passMark === round.passMarkPercent}
              >
                {updateCriteriaMutation.isPending ? 'Saving...' : 'Save Default Mark'}
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ flex: 1 }}>
                <input 
                  type="range" 
                  min="0" max="100" step="1" 
                  value={passMark} 
                  onChange={e => setPassMark(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--orange)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>Relaxed (0%)</span>
                  <span>Strict (100%)</span>
                </div>
              </div>
              <div style={{ 
                width: '80px', height: '50px', borderRadius: '8px', background: 'var(--bg-card)', 
                border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', fontWeight: 800, color: 'var(--orange)'
              }}>
                {passMark}%
              </div>
            </div>
            
            <div style={{ marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Candidates with score ≥ <strong>{passMark}%</strong> will be eligible for advancement. 
              Currently <strong>{qualifiedCount}</strong> out of {attempts.length} qualify.
            </div>
          </div>

          {/* Search and Selection */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div style={{ position: 'relative', width: '300px' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  className="form-input" 
                  placeholder="Filter by name..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
                />
             </div>
             <button className="btn btn-ghost btn-sm" onClick={selectAllQualified} style={{ fontSize: '0.8rem' }}>
                {selectedIds.size === filteredCandidates.filter((c: any) => c.qualifies && c.passed !== true).length ? 'Unselect All' : 'Select All Qualified'}
             </button>
          </div>

          {/* Table */}
          <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: '12px' }}>
            {isLoading ? (
               <div style={{ padding: '40px', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : filteredCandidates.length === 0 ? (
               <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No completed attempts match your search.</div>
            ) : (
              <table style={{ background: 'transparent' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Candidate</th>
                    <th>Score</th>
                    <th>Integrity</th>
                    <th>Match</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((c: any) => {
                    const isQualified = c.qualifies
                    const isPassed = c.passed === true
                    const isSelected = selectedIds.has(c.candidateId)
                    
                    return (
                      <tr key={c.id} style={{ opacity: isPassed ? 0.6 : 1 }}>
                        <td>
                          <input 
                            type="checkbox" 
                            className="form-checkbox"
                            checked={isSelected || isPassed}
                            disabled={!isQualified || isPassed}
                            onChange={() => toggleSelect(c.candidateId, isQualified)}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--cream)', fontSize: '0.88rem' }}>{c.candidateName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.candidateEmail}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '40px', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${c.percentScore}%`, background: isQualified ? 'var(--green)' : 'var(--red)' }} />
                            </div>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isQualified ? 'var(--green)' : 'var(--red)' }}>
                              {Math.round(c.percentScore)}%
                            </span>
                          </div>
                        </td>
                        <td>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                              <ShieldCheck size={14} style={{ color: (c.candidate.scorecard?.trustScore || 0) > 80 ? 'var(--green)' : 'var(--orange)' }} />
                              {c.candidate.scorecard?.trustScore || 'N/A'}
                           </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {c.candidate.scorecard?.technicalFitPercent || 0}%
                          </span>
                        </td>
                        <td>
                          {isPassed ? (
                            <span className="badge badge-success">Advanced</span>
                          ) : isQualified ? (
                            <span className="badge badge-muted">Qualified</span>
                          ) : (
                            <span className="badge badge-danger">Unqualified</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ flexShrink: 0, padding: '20px 24px', background: 'var(--bg-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>{selectedIds.size}</strong> candidate(s) selected for advancement
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button 
              className="btn btn-primary" 
              disabled={selectedIds.size === 0 || advanceMutation.isPending}
              onClick={() => advanceMutation.mutate(Array.from(selectedIds))}
            >
              {advanceMutation.isPending ? 'Advancing...' : (
                <><UserCheck size={16} /> Shortlist & Advance Selected Candidates</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
