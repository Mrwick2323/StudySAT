import { forwardRef, type ReactNode } from 'react';

interface FreeResponseInputProps {
  id: string;
  value: string;
  onChange(value: string): void;
  onEnter?(): void;
  disabled?: boolean;
  /** Shown under the field when the entry can't be graded. */
  error?: string | null;
  /** Extra controls rendered next to the field (e.g. a submit button). */
  children?: ReactNode;
}

/** Answer entry for student-produced response (grid-in) questions. */
export const FreeResponseInput = forwardRef<HTMLInputElement, FreeResponseInputProps>(function FreeResponseInput(
  { id, value, onChange, onEnter, disabled = false, error, children },
  ref,
) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="spr">
      <label htmlFor={id} className="spr__label">
        Your answer
      </label>
      <div className="spr__row">
        <input
          ref={ref}
          id={id}
          className={`spr__input${error ? ' spr__input--invalid' : ''}`}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={12}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onEnter) {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        {children}
      </div>
      {error && (
        <p id={errorId} className="spr__error" role="alert">
          {error}
        </p>
      )}
      <p id={hintId} className="spr__hint">
        Enter a whole number, decimal or fraction, like <code>12</code>, <code>-2.5</code>, <code>.75</code> or{' '}
        <code>7/3</code>. A long decimal may be cut off or rounded once it fills 5 characters (6 if negative), e.g.{' '}
        <code>.6666</code>, <code>.6667</code> or <code>0.667</code>.
      </p>
    </div>
  );
});
