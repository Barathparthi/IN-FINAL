import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { campaignApi } from '../../services/api.services'
import {
  Plus, Search, Eye, Trash2, Pause, Play, Filter,
  Pencil, Archive, Briefcase, X, AlertTriangle, RotateCcw, FileEdit,
} from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'badge-success', DRAFT: 'badge-warning', PAUSED: 'badge-danger',
  CLOSED: 'badge-muted', ARCHIVED: 'badge-muted',
}
const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'active', DRAFT: 'draft', PAUSED: 'paused',
  CLOSED: 'inactive', ARCHIVED: 'inactive',
}
const FILTERS = ['All', 'ACTIVE', 'DRAFT', 'PAUSED', 'CLOSED', 'ARCHIVED']

/** Returns true if an ACTIVE campaign has passed its expiresAt date */
function isExpired(camp: any): boolean {
  return !!(camp.expiresAt && new Date(camp.expiresAt) < new Date() && camp.status === 'ACTIVE')
}

export default function LateralHiringPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [draftDismissed, setDraftDismissed] = useState(false)

  // Read localStorage draft for Lateral hiring
  const localDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem('campaign_draft_LATERAL')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.form ?? null
    } catch { return null }
  }, [])

  const hasDraft = !draftDismissed && !!localDraft

  const discardLocalDraft = () => {
    localStorage.removeItem('campaign_draft_LATERAL')
    setDraftDismissed(true)
    toast('Draft discarded', { icon: '🗑️' })
  }

  const { data: allCampaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignApi.getAll,
  })

  const dbCampaigns = allCampaigns.filter((c: any) => c.hiringType === 'LATERAL' || !c.hiringType)

  const campaigns = useMemo(() => {
    const list = [...dbCampaigns]
    if (localDraft && !draftDismissed) {
      list.unshift({
        id: 'local-draft',
        name: localDraft.name || 'Untitled Campaign',
        role: localDraft.role || '—',
        department: localDraft.department,
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
        hiringType: 'LATERAL',
        _count: { candidates: 0 },
        rounds: localDraft.rounds || [],
        isLocalDraft: true
      })
    }
    return list
  }, [dbCampaigns, localDraft, draftDismissed])

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => campaignApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Status updated') },
    onError: () => toast.error('Failed to update status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign permanently deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  // Auto-close expired campaigns once per data load (ref prevents re-mutation loop)
  const autoClosedIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    campaigns.forEach((c: any) => {
      if (isExpired(c) && !autoClosedIds.current.has(c.id)) {
        autoClosedIds.current.add(c.id)
        statusMutation.mutate({ id: c.id, status: 'CLOSED' })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCampaigns])

  const filtered = campaigns.filter((c: any) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.role.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="fade-in">
      {/* Draft Resume Banner */}
      {hasDraft && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(251,133,30,0.10) 0%, rgba(239,68,68,0.07) 100%)',
          border: '1px solid rgba(251,133,30,0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <FileEdit size={18} style={{ color: 'var(--orange)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--cream)' }}>
              You have an unsaved Lateral campaign draft
            </div>
            <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {localDraft?.name
                ? `"${localDraft.name}" — ${localDraft.rounds?.length ?? 0} round(s) configured`
                : 'Campaign details partially filled in'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/admin/lateral-hiring/new')}
            >
              Resume Draft
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)' }}
              onClick={discardLocalDraft}
              title="Discard draft"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="section-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--orange),var(--red))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Briefcase size={18} color="white" />
            </div>
            <h1><span style={{ color: 'var(--orange)' }}>Lateral</span> Hiring</h1>
          </div>
          <p className="section-subtitle">
            {campaigns.length} total ·{' '}
            {campaigns.filter((c: any) => c.status === 'ACTIVE').length} active ·{' '}
            {campaigns.filter((c: any) => c.status === 'ARCHIVED').length} archived ·{' '}
            Coding, Interview
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/admin/lateral-hiring/new')}>
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: '1', minWidth: '200px', maxWidth: '320px', position: 'relative' }}>
          <Search className="search-bar-icon" size={16} />
          <input
            className="form-input"
            placeholder="Search campaigns or roles..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '38px', paddingRight: search ? '32px' : '12px' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              title="Clear search"
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`btn btn-sm ${statusFilter === f ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '5px 12px', fontSize: '0.76rem' }}
            >
              {f}
              {f !== 'All' && (
                <span style={{
                  marginLeft: 5, fontSize: '0.62rem',
                  background: statusFilter === f ? 'rgba(255,255,255,0.25)' : 'var(--bg-elevated)',
                  padding: '1px 5px', borderRadius: '10px',
                }}>
                  {campaigns.filter((c: any) => c.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="page-loader"><div className="spinner" /><span>Loading...</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{statusFilter === 'ARCHIVED' ? '📦' : '💼'}</div>
          <div className="empty-title">
            {statusFilter === 'ARCHIVED'
              ? 'No archived campaigns'
              : search || statusFilter !== 'All'
                ? 'No matching campaigns'
                : 'No lateral campaigns yet'}
          </div>
          <div className="empty-desc">
            {statusFilter === 'ARCHIVED'
              ? 'Archived campaigns are preserved but hidden from active views. Use the Archive button (📦) on any campaign to move it here.'
              : 'Lateral hiring is for experienced professionals — Coding, Interview'}
          </div>
          {!search && statusFilter === 'All' && (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: '14px' }}
              onClick={() => navigate('/admin/lateral-hiring/new')}
            >
              <Plus size={14} /> Create Lateral Campaign
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Role</th>
                <th>Department</th>
                <th>Candidates</th>
                <th>Rounds</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((camp: any) => {
                const cnt  = camp._count?.candidates ?? 0
                const rnds = camp.rounds?.length ?? 0
                const date = new Date(camp.createdAt).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })
                const expired = isExpired(camp)
                const isArchived = camp.status === 'ARCHIVED'

                return (
                  <tr key={camp.id} style={{ opacity: isArchived ? 0.75 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={`status-dot ${STATUS_DOT[camp.status] || 'inactive'}`} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{camp.name}</div>
                          {expired && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--red)', marginTop: 2 }}>
                              <AlertTriangle size={11} /> Expired — moving to Closed
                            </div>
                          )}
                          {isArchived && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              📦 Archived — data preserved
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                      {camp.role}
                      {camp.isLocalDraft && (
                        <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--orange)', background: 'rgba(251,133,30,0.1)', padding: '2px 6px', borderRadius: 10 }}>Unsaved</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{camp.department || '—'}</td>
                    <td><span style={{ fontWeight: 700, color: 'var(--cream)' }}>{cnt}</span></td>
                    <td><span className="badge badge-teal">{rnds} round{rnds !== 1 ? 's' : ''}</span></td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[camp.status] || 'badge-muted'}`}>
                        {camp.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {camp.isLocalDraft ? 'Just now' : date}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {camp.isLocalDraft ? (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                              onClick={() => navigate('/admin/lateral-hiring/new')}
                            >
                              Resume
                            </button>
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              style={{ color: 'var(--red)' }}
                              title="Discard unsaved draft"
                              onClick={() => {
                                if (confirm('Discard this unsaved draft?')) discardLocalDraft()
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* View */}
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              title="View campaign"
                              onClick={() => navigate(`/admin/campaigns/${camp.id}`)}
                            >
                              <Eye size={14} />
                            </button>

                            {/* Activate — not available when ACTIVE or ARCHIVED */}
                            {camp.status !== 'ACTIVE' && camp.status !== 'ARCHIVED' && (
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--green-dark)' }}
                                title="Set Active"
                                onClick={() => statusMutation.mutate({ id: camp.id, status: 'ACTIVE' })}
                              >
                                <Play size={14} />
                              </button>
                            )}

                            {/* Pause */}
                            {camp.status === 'ACTIVE' && (
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--yellow-dark)' }}
                                title="Pause campaign"
                                onClick={() => statusMutation.mutate({ id: camp.id, status: 'PAUSED' })}
                              >
                                <Pause size={14} />
                              </button>
                            )}

                            {/* Archive (soft — move to ARCHIVED, data preserved) */}
                            {!isArchived && (
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--yellow-dark)' }}
                                title="Archive campaign (data preserved, can be restored)"
                                onClick={() => {
                                  if (confirm(
                                    `Archive "${camp.name}"?\n\n` +
                                    `The campaign will be moved to Archived status.\n` +
                                    `All data is preserved and you can restore it at any time.`
                                  )) statusMutation.mutate({ id: camp.id, status: 'ARCHIVED' })
                                }}
                              >
                                <Archive size={14} />
                              </button>
                            )}

                            {/* Restore — only for ARCHIVED campaigns */}
                            {isArchived && (
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--teal)' }}
                                title="Restore campaign (move back to Draft)"
                                onClick={() => {
                                  if (confirm(
                                    `Restore "${camp.name}"?\n\n` +
                                    `The campaign will be moved back to Draft status so you can re-activate it.`
                                  )) statusMutation.mutate({ id: camp.id, status: 'DRAFT' })
                                }}
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}

                            {/* Edit */}
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              title="Edit campaign"
                              onClick={() => navigate(`/admin/campaigns/${camp.id}/edit`)}
                            >
                              <Pencil size={14} />
                            </button>

                            {/* Delete (permanent) — available for ALL campaigns with confirmation */}
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              style={{ color: 'var(--red)' }}
                              title="Permanently delete campaign"
                              onClick={() => {
                                if (confirm(
                                  `⚠️ Permanently delete "${camp.name}"?\n\n` +
                                  `This action CANNOT be undone.\n` +
                                  `All candidate data for this campaign will be permanently lost.\n\n` +
                                  `${camp.status !== 'ARCHIVED' ? 'Tip: Consider archiving instead to preserve data.' : ''}`
                                )) deleteMutation.mutate(camp.id)
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          Showing {filtered.length} of {campaigns.length} lateral campaign{campaigns.length !== 1 ? 's' : ''}
          {statusFilter !== 'All' && ` · filtered by ${statusFilter}`}
        </div>
      )}
    </div>
  )
}
