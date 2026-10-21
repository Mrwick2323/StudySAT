import { describe, expect, it } from 'vitest';
import { buildSubjectCatalog } from '../data/catalog';
import { metaFor } from '../test/fixtures';
import { configToFilter, DEFAULT_CONFIG, loadConfig, parseConfig, resolveSkillCodes, saveConfig } from './config';

const rwCatalog = buildSubjectCatalog('rw', [metaFor('CID'), metaFor('INF'), metaFor('WIC')], 0, 0);
const mathCatalog = buildSubjectCatalog('math', [metaFor('H.A.'), metaFor('P.A.')], 0, 0);

describe('study config', () => {
  it('selects every skill of a subject until the user narrows it down', () => {
    expect(resolveSkillCodes(DEFAULT_CONFIG, 'rw', rwCatalog)).toEqual(['CID', 'INF', 'WIC']);
  });

  it('drops skill codes the source no longer has', () => {
    const config = { ...DEFAULT_CONFIG, skills: { rw: ['CID', 'GONE'], math: null } };
    expect(resolveSkillCodes(config, 'rw', rwCatalog)).toEqual(['CID']);
  });

  it('builds a filter only from enabled subjects, keeping their selections separate', () => {
    const config = { ...DEFAULT_CONFIG, subjects: { rw: true, math: false }, skills: { rw: ['WIC'], math: ['H.A.'] } };
    const filter = configToFilter(config, { rw: rwCatalog, math: mathCatalog });
    expect([...filter.skills]).toEqual(['rw:WIC']);
    const both = configToFilter({ ...config, subjects: { rw: true, math: true } }, { rw: rwCatalog, math: mathCatalog });
    expect([...both.skills]).toEqual(['rw:WIC', 'math:H.A.']);
  });

  it('repairs invalid stored values', () => {
    const parsed = parseConfig({ subjects: { rw: 'yes' }, skills: { rw: [1, 2] }, difficulties: ['E', 'Z'], testLength: 5000, mix: 'weird' });
    expect(parsed.subjects.rw).toBe(true);
    expect(parsed.skills.rw).toBeNull();
    expect(parsed.difficulties).toEqual(['E']);
    expect(parsed.testLength).toBe(100);
    expect(parsed.mix).toBe('balanced');
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
  });

  it('round-trips through storage', () => {
    const config = { ...DEFAULT_CONFIG, skills: { rw: ['CID'], math: [] }, shuffleChoices: true, testLength: 20 };
    saveConfig(config);
    expect(loadConfig()).toEqual(config);
  });
});
