import { describe, expect, it } from 'vitest';
import { meta } from '../test/fixtures';
import { buildSubjectCatalog, findSkill } from './catalog';

describe('buildSubjectCatalog', () => {
  const questions = [
    meta({ domainCode: 'CAS', domainName: 'Craft and Structure', skillCode: 'CTC', skillName: 'Cross-Text Connections', difficulty: 'E' }),
    meta({ domainCode: 'CAS', domainName: 'Craft and Structure', skillCode: 'CTC', skillName: 'Cross-Text Connections', difficulty: 'H' }),
    meta({ domainCode: 'CAS', domainName: 'Craft and Structure', skillCode: 'CTC', skillName: 'Cross-text Connections', difficulty: null }),
    meta({ domainCode: 'CAS', domainName: 'Craft and Structure', skillCode: 'WIC', skillName: 'Words in Context' }),
    meta({ domainCode: 'INI', domainName: 'Information and Ideas', skillCode: 'COE', skillName: 'Command of Evidence' }),
    meta({ domainCode: 'INI', domainName: 'Information and Ideas', skillCode: 'CID', skillName: 'Central Ideas and Details' }),
  ];
  const catalog = buildSubjectCatalog('rw', questions, 2, 1000);

  it('lists only domains and skills that have questions, in documented order', () => {
    expect(catalog.domains.map((d) => d.code)).toEqual(['INI', 'CAS']);
    expect(catalog.domains[0]!.skills.map((s) => s.code)).toEqual(['CID', 'COE']);
    expect(catalog.domains[1]!.skills.map((s) => s.code)).toEqual(['WIC', 'CTC']);
  });

  it('unifies inconsistent spellings of a skill name', () => {
    expect(findSkill(catalog, 'CTC')?.name).toBe('Cross-Text Connections');
    expect(catalog.questions.filter((q) => q.skillCode === 'CTC').every((q) => q.skillName === 'Cross-Text Connections')).toBe(true);
  });

  it('counts questions per skill, domain and difficulty', () => {
    const ctc = findSkill(catalog, 'CTC')!;
    expect(ctc.count).toBe(3);
    expect(ctc.byDifficulty).toEqual({ E: 1, M: 0, H: 1, unknown: 1 });
    expect(catalog.domains[1]!.count).toBe(4);
  });

  it('keeps metadata about the load', () => {
    expect(catalog.malformedCount).toBe(2);
    expect(catalog.fetchedAt).toBe(1000);
  });

  it('appends domains the documentation does not know about instead of dropping them', () => {
    const extra = buildSubjectCatalog('rw', [meta({ domainCode: 'NEW', domainName: 'New Domain', skillCode: 'NEW1', skillName: 'New skill' })], 0, 0);
    expect(extra.domains.map((d) => d.name)).toEqual(['New Domain']);
  });
});
