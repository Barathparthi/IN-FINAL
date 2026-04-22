import { useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CampaignFormData, Round } from '../../pages/admin/CreateCampaignPage'
import { Plus, GripVertical, Trash2, Layers } from 'lucide-react'
import { createId } from '../../utils/id.util'

interface Props {
  form: CampaignFormData
  update: (patch: Partial<CampaignFormData>) => void
  hiringType?: 'CAMPUS' | 'LATERAL'
}

const ALL_ROUND_TYPES: Round['roundType'][] = ['MCQ', 'CODING', 'INTERVIEW']
const CAMPUS_ROUND_TYPES: Round['roundType'][] = ['MCQ', 'CODING']
const LATERAL_ROUND_TYPES: Round['roundType'][] = ['CODING', 'INTERVIEW']

const TYPE_LABELS: Record<string, string> = {
  MCQ: 'Multiple Choice', CODING: 'Coding Challenge', INTERVIEW: 'AI Interview',
}
const TYPE_DESC: Record<string, string> = {
  MCQ: 'Volume screening for freshers',
  CODING: 'Algorithmic / data structure problems',
  INTERVIEW: 'AI-powered conversational interview',
}

function SortableRound({
  round, index, onRemove,
}: { round: Round; index: number; onRemove: (id: string) => void }) {
  const id = round.id || `round-${index}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="round-card">
      <button {...attributes} {...listeners} className="round-drag-handle btn btn-ghost btn-icon btn-sm"
        style={{ cursor: 'grab', touchAction: 'none' }}>
        <GripVertical size={18} />
      </button>
      <span className={`round-badge ${round.roundType}`}>{round.roundType}</span>
      <div className="round-info">
        <div className="round-title">{TYPE_LABELS[round.roundType]}</div>
        <div className="round-meta">Round {round.order}</div>
      </div>
      <div className="round-actions">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onRemove(round.id)}
          title="Remove round">
          <Trash2 size={15} style={{ color: 'var(--danger)' }} />
        </button>
      </div>
    </div>
  )
}

export default function Step2Pipeline({ form, update, hiringType = 'LATERAL' }: Props) {
  const ROUND_TYPES = hiringType === 'CAMPUS' ? CAMPUS_ROUND_TYPES
    : hiringType === 'LATERAL' ? LATERAL_ROUND_TYPES
    : ALL_ROUND_TYPES

  const [addType, setAddType] = useState<Round['roundType']>(ROUND_TYPES[0])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const addRound = () => {
    const newRound: Round = {
      id: createId(),
      order: form.rounds.length + 1,
      roundType: addType,
      timeLimitMinutes: 30,
      passMarkPercent: 60,
      difficultyEasy: 30,
      difficultyMedium: 50,
      difficultyHard: 20,
      failAction: 'MANUAL_REVIEW',
    }
    update({ rounds: [...form.rounds, newRound] })
  }

  const removeRound = (id: string) => {
    const rounds = form.rounds.filter(r => r.id !== id).map((r, i) => ({ ...r, order: i + 1 }))
    update({ rounds })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = form.rounds.findIndex(r => r.id === active.id)
    const newIdx = form.rounds.findIndex(r => r.id === over.id)
    const reordered = arrayMove(form.rounds, oldIdx, newIdx).map((r, i) => ({ ...r, order: i + 1 }))
    update({ rounds: reordered })
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: 'var(--primary)' }} />
          Pipeline Builder
          <span className={`badge ${hiringType === 'CAMPUS' ? 'badge-primary' : 'badge-teal'}`} style={{ fontSize: '0.65rem', marginLeft: 4 }}>
            {hiringType === 'CAMPUS' ? '🎓 Campus' : '💼 Lateral'}
          </span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {hiringType === 'CAMPUS'
            ? 'Campus hiring: MCQ and Coding rounds only'
            : 'Lateral hiring: Coding and Interview rounds (no MCQ)'}
        </p>
      </div>

      {/* Add Round */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
          {ROUND_TYPES.map(type => (
            <button key={type} onClick={() => setAddType(type)}
              className={`btn btn-sm ${addType === type ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '6px 12px', height: 'auto' }}
            >
              <span style={{ fontWeight: 700 }}>{type}</span>
              <span style={{ fontSize: '0.68rem', color: addType === type ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', fontWeight: 400 }}>{TYPE_DESC[type]}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={addRound}>
          <Plus size={15} /> Add {addType} Round
        </button>
      </div>

      {/* Rounds DnD List */}
      {form.rounds.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px' }}>
          <div className="empty-icon">🧩</div>
          <div className="empty-title">No rounds yet</div>
          <div className="empty-desc">Select a round type above and click "Add Round"</div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={form.rounds.map((r, i) => r.id || `round-${i}`)} strategy={verticalListSortingStrategy}>
            {form.rounds.map((round, index) => (
              <SortableRound key={round.id || `round-${index}`} round={round} index={index} onRemove={removeRound} />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {form.rounds.length > 0 && (
        <div style={{
          marginTop: '16px', padding: '12px 16px',
          background: 'rgba(99,120,255,0.05)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.82rem', color: 'var(--text-secondary)',
        }}>
          💡 <strong style={{ color: 'var(--text-primary)' }}>{form.rounds.length}</strong> round{form.rounds.length !== 1 ? 's' : ''} configured. Drag to reorder.
        </div>
      )}
    </div>
  )
}
