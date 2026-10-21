import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CatalogEntry } from '../../app/contexts';
import { ChevronDownIcon } from '../../components/Icons';
import { Spinner, StatusPanel } from '../../components/Feedback';
import { SUBJECTS } from '../../data/taxonomy';
import type { Difficulty, DomainInfo, SubjectId } from '../../data/types';
import { eligibleInSkill } from './setupModel';

function TriStateCheckbox({ id, checked, indeterminate, onChange, label }: {
  id: string;
  checked: boolean;
  indeterminate: boolean;
  onChange(checked: boolean): void;
  label: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <span className="check">
      <input ref={ref} id={id} type="checkbox" className="check__input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="check__label">
        {label}
      </label>
    </span>
  );
}

const formatCount = (n: number) => `${n.toLocaleString()} question${n === 1 ? '' : 's'}`;

interface DomainRowProps {
  subject: SubjectId;
  domain: DomainInfo;
  selected: ReadonlySet<string>;
  difficulties: readonly Difficulty[];
  expanded: boolean;
  onToggleExpanded(): void;
  onChange(codes: string[], selected: boolean): void;
}

function DomainRow({ subject, domain, selected, difficulties, expanded, onToggleExpanded, onChange }: DomainRowProps) {
  const codes = domain.skills.map((s) => s.code);
  const selectedCount = codes.filter((c) => selected.has(c)).length;
  const eligible = domain.skills.filter((s) => selected.has(s.code)).reduce((sum, s) => sum + eligibleInSkill(s, difficulties), 0);
  const panelId = `skills-${subject}-${domain.code}`;
  return (
    <li className={`domain${selectedCount > 0 ? ' domain--active' : ''}`}>
      <div className="domain__row">
        <TriStateCheckbox
          id={`domain-${subject}-${domain.code}`}
          checked={selectedCount === codes.length}
          indeterminate={selectedCount > 0 && selectedCount < codes.length}
          onChange={(checked) => onChange(codes, checked)}
          label={
            <>
              <span className="domain__name">{domain.name}</span>
              <span className="domain__count">
                {selectedCount === 0
                  ? `${codes.length} skills · ${formatCount(domain.count)}`
                  : `${selectedCount} of ${codes.length} skills · ${formatCount(eligible)} selected`}
              </span>
            </>
          }
        />
        <button
          type="button"
          className="domain__expand"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggleExpanded}
        >
          <span className="visually-hidden">{expanded ? 'Hide' : 'Show'} skills in {domain.name}</span>
          <span aria-hidden="true">Skills</span>
          <ChevronDownIcon size={18} className={expanded ? 'rotate-180' : undefined} />
        </button>
      </div>
      <ul id={panelId} className="skills" hidden={!expanded}>
        {domain.skills.map((skill) => {
          const available = eligibleInSkill(skill, difficulties);
          const isSelected = selected.has(skill.code);
          return (
            <li key={skill.code} className={`skill${isSelected ? ' skill--selected' : ''}`}>
              <span className="check">
                <input
                  id={`skill-${subject}-${skill.code}`}
                  type="checkbox"
                  className="check__input"
                  checked={isSelected}
                  onChange={(e) => onChange([skill.code], e.target.checked)}
                />
                <label htmlFor={`skill-${subject}-${skill.code}`} className="check__label">
                  <span className="skill__name">{skill.name}</span>
                  <span className={`skill__count${available === 0 ? ' skill__count--empty' : ''}`}>
                    {available === 0 ? 'No questions at the selected difficulty' : formatCount(available)}
                  </span>
                </label>
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

interface SkillSelectorProps {
  subject: SubjectId;
  entry: CatalogEntry;
  selectedCodes: string[];
  difficulties: readonly Difficulty[];
  onChange(codes: string[]): void;
  onRetry(): void;
}

/** Domains and skills for one subject, with select-all and per-domain expand/collapse. */
export function SkillSelector({ subject, entry, selectedCodes, difficulties, onChange, onRetry }: SkillSelectorProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const name = SUBJECTS[subject].name;
  const headingId = `skills-heading-${subject}`;

  if (!entry.catalog) {
    return (
      <section className={`subject-panel subject-panel--${subject}`} aria-labelledby={headingId}>
        <h3 id={headingId} className="subject-panel__title">{name}</h3>
        {entry.status === 'error' ? (
          <StatusPanel tone="error" title={`Couldn’t load ${name} questions`} onRetry={onRetry}>
            <p>{entry.error}</p>
          </StatusPanel>
        ) : (
          <Spinner label={`Loading ${name} domains and skills from the question bank…`} />
        )}
      </section>
    );
  }

  const catalog = entry.catalog;
  const allCodes = catalog.domains.flatMap((d) => d.skills.map((s) => s.code));
  const selected = new Set(selectedCodes);
  const allExpanded = catalog.domains.every((d) => expanded.has(d.code));

  const update = (codes: string[], on: boolean) => {
    const next = new Set(selected);
    for (const code of codes) {
      if (on) next.add(code);
      else next.delete(code);
    }
    onChange(allCodes.filter((c) => next.has(c)));
  };

  return (
    <section className={`subject-panel subject-panel--${subject}`} aria-labelledby={headingId}>
      <div className="subject-panel__header">
        <div>
          <h3 id={headingId} className="subject-panel__title">{name}</h3>
          <p className="subject-panel__summary">
            {selected.size} of {allCodes.length} skills selected
          </p>
        </div>
        <div className="subject-panel__actions">
          <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange(allCodes)} disabled={selected.size === allCodes.length}>
            Select all {SUBJECTS[subject].shortName}
          </button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange([])} disabled={selected.size === 0}>
            Clear
          </button>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            aria-expanded={allExpanded}
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(catalog.domains.map((d) => d.code)))}
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>
      <ul className="domains">
        {catalog.domains.map((domain) => (
          <DomainRow
            key={domain.code}
            subject={subject}
            domain={domain}
            selected={selected}
            difficulties={difficulties}
            expanded={expanded.has(domain.code)}
            onToggleExpanded={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(domain.code)) next.delete(domain.code);
                else next.add(domain.code);
                return next;
              })
            }
            onChange={update}
          />
        ))}
      </ul>
      {catalog.malformedCount > 0 && (
        <p className="muted small">
          {catalog.malformedCount} record{catalog.malformedCount === 1 ? '' : 's'} in the question list couldn’t be read and{' '}
          {catalog.malformedCount === 1 ? 'is' : 'are'} not included.
        </p>
      )}
    </section>
  );
}
