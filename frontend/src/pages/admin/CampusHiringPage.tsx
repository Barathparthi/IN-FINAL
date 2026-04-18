import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { campaignApi } from '../../services/api.services'
import { Plus, Search, Eye, Trash2, Pause, Play, Filter, Pencil, Archive, GraduationCap } from 'lucide-react'
import { useState } from 'react'
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

export default function CampusHiringPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const { data: allCampaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignApi.getAll,
  })

  // Filter to campus campaigns only
  const campaigns = allCampaigns.filter((c: any) => c.hiringType === 'CAMPUS')

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => campaignApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Status updated') },
    onError: () => toast.error('Failed to update status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const filtered = campaigns.filter((c: any) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.role.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GraduationCap size={18} color="white" />
            </div>
            <h1><span style={{ color: 'var(--orange)' }}>Campus</span> Hiring</h1>
          </div>
          <p className="section-subtitle">
            {campaigns.length} total · {campaigns.filter((c: any) => c.status === 'ACTIVE').length} active · MCQ &amp; Coding rounds only
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/admin/campus-hiring/new')}>
          <Plus size={16} /> New Campaign
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: '1', minWidth: '200px', maxWidth: '320px' }}>
          <Search className="search-bar-icon" size={16} />
          <input className="form-input" placeholder="Search campaigns or roles..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '38px' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          {FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`btn btn-sm ${statusFilter === f ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '5px 12px', fontSize: '0.76rem' }}>{f}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="page-loader"><div className="spinner" /><span>Loading...</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎓</div>
          <div className="empty-title">{search || statusFilter !== 'All' ? 'No matching campaigns' : 'No campus campaigns yet'}</div>
          <div className="empty-desc">Campus hiring is for MCQ + Coding screening of fresh graduates</div>
          {!search && statusFilter === 'All' && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: '14px' }}
              onClick={() => navigate('/admin/campus-hiring/new')}>
              <Plus size={14} /> Create Campus Campaign
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th><th>Role</th><th>Department</th>
                <th>Candidates</th><th>Rounds</th><th>Status</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((camp: any) => {
                const cnt  = camp._count?.candidates ?? 0
                const rnds = camp.rounds?.length ?? 0
                const date = new Date(camp.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                return (
                  <tr key={camp.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={`status-dot ${STATUS_DOT[camp.status] || 'inactive'}`} />
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{camp.name}</div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{camp.role}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{camp.department || '—'}</td>
                    <td><span style={{ fontWeight: 700, color: 'var(--cream)' }}>{cnt}</span></td>
                    <td><span className="badge badge-teal">{rnds} round{rnds !== 1 ? 's' : ''}</span></td>
                    <td><span className={`badge ${STATUS_COLORS[camp.status] || 'badge-muted'}`}>{camp.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{date}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="View" onClick={() => navigate(`/admin/campaigns/${camp.id}`)}><Eye size={14} /></button>
                        {camp.status !== 'ACTIVE' && camp.status !== 'ARCHIVED' && (
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--green-dark)' }}
                            onClick={() => statusMutation.mutate({ id: camp.id, status: 'ACTIVE' })}><Play size={14} /></button>
                        )}
                        {camp.status === 'ACTIVE' && (
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--yellow-dark)' }}
                            onClick={() => statusMutation.mutate({ id: camp.id, status: 'PAUSED' })}><Pause size={14} /></button>
                        )}
                        {camp.status !== 'ARCHIVED' && (
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--yellow-dark)' }}
                            onClick={() => { if (confirm(`Archive "${camp.name}"?`)) statusMutation.mutate({ id: camp.id, status: 'ARCHIVED' }) }}>
                            <Archive size={14} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/admin/campaigns/${camp.id}/edit`)}><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                          onClick={() => { if (confirm(`Delete "${camp.name}"?`)) deleteMutation.mutate(camp.id) }}>
                          <Trash2 size={14} />
                        </button>
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
          Showing {filtered.length} of {campaigns.length} campus campaign{campaigns.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
