import { describe, expect, it } from 'vitest';
import { metaFor } from '../test/fixtures';
import { countBySkill, countEligible, createFilter, filterQuestions } from './filter';
import { skillKey } from './taxonomy';

const pool = [
  metaFor('CID', 'E', 'cid-e'),
  metaFor('CID', 'H', 'cid-h'),
  metaFor('INF', 'M', 'inf-m'),
  metaFor('WIC', 'E', 'wic-e'),
  metaFor('H.A.', 'E', 'ha-e'),
  metaFor('H.B.', 'M', 'hb-m'),
  metaFor('P.A.', 'H', 'pa-h'),
  metaFor('S.D.', null, 'sd-null'),
];

const ids = (list: { questionId: string }[]) => list.map((q) => q.questionId).sort();

describe('filterQuestions', () => {
  it('filters by a single skill', () => {
    expect(ids(filterQuestions(pool, createFilter([skillKey('rw', 'CID')])))).toEqual(['cid-e', 'cid-h']);
  });

  it('combines skills from several domains and both subjects (union)', () => {
    const filter = createFilter([skillKey('rw', 'INF'), skillKey('rw', 'WIC'), skillKey('math', 'H.A.')]);
    expect(ids(filterQuestions(pool, filter))).toEqual(['ha-e', 'inf-m', 'wic-e']);
  });

  it('selecting every skill in a domain selects the domain', () => {
    const algebra = createFilter([skillKey('math', 'H.A.'), skillKey('math', 'H.B.')]);
    expect(filterQuestions(pool, algebra).every((q) => q.domainCode === 'H')).toBe(true);
    expect(countEligible(pool, algebra)).toBe(2);
  });

  it('does not match a skill code under the wrong subject', () => {
    expect(filterQuestions(pool, createFilter([skillKey('math', 'CID')]))).toEqual([]);
  });

  it('applies difficulty on top of skills', () => {
    const filter = createFilter([skillKey('rw', 'CID'), skillKey('rw', 'WIC')], ['E']);
    expect(ids(filterQuestions(pool, filter))).toEqual(['cid-e', 'wic-e']);
  });

  it('keeps questions without a difficulty only when no difficulty filter is active', () => {
    expect(ids(filterQuestions(pool, createFilter([skillKey('math', 'S.D.')])))).toEqual(['sd-null']);
    expect(filterQuestions(pool, createFilter([skillKey('math', 'S.D.')], ['E', 'M']))).toEqual([]);
  });

  it('returns nothing for an empty selection', () => {
    expect(filterQuestions(pool, createFilter([]))).toEqual([]);
    expect(filterQuestions(pool, createFilter([skillKey('rw', 'CID')], []))).toEqual([]);
  });
});

describe('countBySkill', () => {
  it('reports zero for selected skills with no matching questions', () => {
    const counts = countBySkill(pool, createFilter([skillKey('rw', 'CID'), skillKey('rw', 'BOU')], ['E']));
    expect(counts.get(skillKey('rw', 'CID'))).toBe(1);
    expect(counts.get(skillKey('rw', 'BOU'))).toBe(0);
  });
});
