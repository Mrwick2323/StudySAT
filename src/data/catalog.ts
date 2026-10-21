import { SUBJECTS } from './taxonomy';
import type { DifficultyCounts, DomainInfo, QuestionMeta, SkillInfo, SubjectCatalog, SubjectId } from './types';

function emptyDifficultyCounts(): DifficultyCounts {
  return { E: 0, M: 0, H: 0, unknown: 0 };
}

/** Picks the most common spelling, e.g. "Cross-Text Connections" over a rare "Cross-text Connections". */
function mostCommon(names: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [name, count] of [...names].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function orderIndex(order: readonly string[], code: string): number {
  const index = order.indexOf(code);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Builds the domain → skill tree for a subject from its question metadata.
 * Only skills that actually have questions appear. Domains and skills are
 * sorted in the order the documentation lists them; anything the source adds
 * later is appended rather than dropped.
 */
export function buildSubjectCatalog(
  subject: SubjectId,
  questions: readonly QuestionMeta[],
  malformedCount: number,
  fetchedAt: number,
): SubjectCatalog {
  const definition = SUBJECTS[subject];
  const domainNames = new Map<string, Map<string, number>>();
  const skillNames = new Map<string, Map<string, number>>();
  const skillDomain = new Map<string, string>();

  for (const q of questions) {
    const dn = domainNames.get(q.domainCode) ?? new Map<string, number>();
    dn.set(q.domainName, (dn.get(q.domainName) ?? 0) + 1);
    domainNames.set(q.domainCode, dn);
    const sn = skillNames.get(q.skillCode) ?? new Map<string, number>();
    sn.set(q.skillName, (sn.get(q.skillName) ?? 0) + 1);
    skillNames.set(q.skillCode, sn);
    if (!skillDomain.has(q.skillCode)) skillDomain.set(q.skillCode, q.domainCode);
  }

  const canonicalDomain = new Map([...domainNames].map(([code, names]) => [code, mostCommon(names)]));
  const canonicalSkill = new Map([...skillNames].map(([code, names]) => [code, mostCommon(names)]));

  const normalized = questions.map((q) => ({
    ...q,
    // A skill belongs to exactly one domain; trust its first-seen domain if a record disagrees.
    domainCode: skillDomain.get(q.skillCode) ?? q.domainCode,
    domainName: canonicalDomain.get(skillDomain.get(q.skillCode) ?? q.domainCode) ?? q.domainName,
    skillName: canonicalSkill.get(q.skillCode) ?? q.skillName,
  }));

  const skills = new Map<string, SkillInfo>();
  for (const q of normalized) {
    let info = skills.get(q.skillCode);
    if (!info) {
      info = {
        subject,
        domainCode: q.domainCode,
        code: q.skillCode,
        name: q.skillName,
        count: 0,
        byDifficulty: emptyDifficultyCounts(),
      };
      skills.set(q.skillCode, info);
    }
    info.count++;
    info.byDifficulty[q.difficulty ?? 'unknown']++;
  }

  const domainOrder = definition.domains.map((d) => d.code);
  const domains: DomainInfo[] = [...canonicalDomain.keys()]
    .sort((a, b) => orderIndex(domainOrder, a) - orderIndex(domainOrder, b) || a.localeCompare(b))
    .map((code) => {
      const skillOrder = definition.domains.find((d) => d.code === code)?.skillOrder ?? [];
      const domainSkills = [...skills.values()]
        .filter((s) => s.domainCode === code)
        .sort((a, b) => orderIndex(skillOrder, a.code) - orderIndex(skillOrder, b.code) || a.code.localeCompare(b.code));
      return {
        subject,
        code,
        name: canonicalDomain.get(code) ?? code,
        skills: domainSkills,
        count: domainSkills.reduce((sum, s) => sum + s.count, 0),
      };
    });

  return { subject, domains, questions: normalized, malformedCount, fetchedAt };
}

export function findSkill(catalog: SubjectCatalog, skillCode: string): SkillInfo | undefined {
  for (const domain of catalog.domains) {
    const skill = domain.skills.find((s) => s.code === skillCode);
    if (skill) return skill;
  }
  return undefined;
}
