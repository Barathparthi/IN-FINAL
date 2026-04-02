import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'warning' | 'danger' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, title, message, onConfirm, onCancel, 
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  type = 'warning' 
}) => {
  if (!isOpen) return null;

  const colors = {
    warning: { bg: 'var(--orange-soft)', icon: 'var(--orange)', btn: 'var(--orange-dark)' },
    danger: { bg: 'var(--red-soft)', icon: 'var(--red)', btn: 'var(--red-dark)' },
    info: { bg: 'var(--blue-soft)', icon: 'var(--blue)', btn: 'var(--blue-dark)' },
  }[type];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      padding: '20px'
    }}>
      <div className="card slide-up" style={{
        maxWidth: '430px', width: '100%', padding: '28px',
        position: 'relative', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)', textAlign: 'center'
      }}>
        <button onClick={onCancel} style={{
          position: 'absolute', top: 16, right: 16, background: 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          padding: 4
        }}>
          <X size={18} />
        </button>

        <div style={{
          width: 56, height: 56, borderRadius: 14, background: colors.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', color: colors.icon
        }}>
          <AlertTriangle size={28} />
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cream)', marginBottom: 12 }}>
          {title}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: 32, lineHeight: 1.6, padding: '0 10px' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-outline" style={{ flex: 1, padding: '10px' }} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn" style={{ flex: 1, background: colors.btn, color: '#fff', padding: '10px', fontWeight: 700 }} 
            onClick={() => { onConfirm(); onCancel(); }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
