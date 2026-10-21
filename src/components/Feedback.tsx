import { useEffect, useRef, type ReactNode } from 'react';
import { AlertIcon, RefreshIcon } from './Icons';

export function ProgressBar({ value, max, label, tone = 'brand' }: { value: number; max: number; label: string; tone?: 'brand' | 'accent' }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={`progress progress--${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Circular meter for a 0–1 ratio. The number is always shown as text too. */
export function ScoreRing({ ratio, label, size = 120 }: { ratio: number | null; label: string; size?: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const value = ratio ?? 0;
  return (
    <figure className="score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className="score-ring__track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="score-ring__value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
        />
      </svg>
      <figcaption className="score-ring__label">
        <strong>{ratio === null ? '—' : `${Math.round(value * 100)}%`}</strong>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__circle" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface StatusPanelProps {
  tone?: 'error' | 'empty' | 'info';
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  actions?: ReactNode;
}

/** Card used for errors, empty states and other "can't continue" situations. */
export function StatusPanel({ tone = 'info', title, children, onRetry, actions }: StatusPanelProps) {
  return (
    <section className={`status-panel status-panel--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {tone === 'error' && <AlertIcon size={28} className="status-panel__icon" />}
      <h2 className="status-panel__title">{title}</h2>
      {children && <div className="status-panel__body">{children}</div>}
      {(onRetry || actions) && (
        <div className="status-panel__actions">
          {onRetry && (
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              <RefreshIcon size={18} /> Try again
            </button>
          )}
          {actions}
        </div>
      )}
    </section>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  extraActions?: ReactNode;
}

/** Accessible modal confirmation built on <dialog> (focus trapping and Escape handled by the browser). */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, extraActions }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {open && (
        <div className="dialog__inner">
          <h2 id="dialog-title" className="dialog__title">
            {title}
          </h2>
          <div className="dialog__body">{children}</div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
            {extraActions}
            <button type="button" className="btn btn--primary" onClick={onConfirm} autoFocus>
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
