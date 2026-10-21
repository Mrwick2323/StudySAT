/**
 * Live integration check: fetches the real question lists and a sample of
 * question details through the same repository the app uses, and reports how
 * many normalize into gradable questions.
 *
 *   npm run check:api
 *   LIVE_SAMPLE_PER_SKILL=10 LIVE_LEGACY_SAMPLE=all npm run check:api
 *
 * Nothing fetched here is written to disk.
 */
import { describe, expect, it } from 'vitest';
import { createQbankClient } from '../../src/api/qbankClient';
import { createQuestionRepository, isQuestionUnavailableError } from '../../src/data/repository';
import { SUBJECTS } from '../../src/data/taxonomy';
import type { Question, QuestionMeta, SubjectCatalog, SubjectId } from '../../src/data/types';

const perSkill = Number(process.env.LIVE_SAMPLE_PER_SKILL ?? 3);
const legacySample = process.env.LIVE_LEGACY_SAMPLE === 'all' ? Infinity : Number(process.env.LIVE_LEGACY_SAMPLE ?? 20);

const repository = createQuestionRepository({
  client: createQbankClient({ maxConcurrent: 4 }),
  store: null,
});

function pickSample(catalog: SubjectCatalog): QuestionMeta[] {
  const sample: QuestionMeta[] = [];
  for (const domain of catalog.domains) {
    for (const skill of domain.skills) {
      sample.push(
        ...catalog.questions.filter((q) => q.skillCode === skill.code && q.format === 'standard').slice(0, perSkill),
      );
    }
  }
  sample.push(...catalog.questions.filter((q) => q.format === 'legacy').slice(0, legacySample));
  return sample;
}

describe('College Board question bank (live)', () => {
  const catalogs = new Map<SubjectId, SubjectCatalog>();

  it.each(['rw', 'math'] as const)('loads the %s question list with every documented domain', async (subject) => {
    const catalog = await repository.loadCatalog(subject);
    catalogs.set(subject, catalog);
    const legacy = catalog.questions.filter((q) => q.format === 'legacy').length;
    console.log(
      `${SUBJECTS[subject].name}: ${catalog.questions.length} questions (${legacy} legacy), ` +
        `${catalog.malformedCount} malformed list records`,
    );
    for (const domain of catalog.domains) {
      console.log(`  ${domain.code} ${domain.name} (${domain.count})`);
      for (const skill of domain.skills) console.log(`    ${skill.code} ${skill.name}: ${skill.count}`);
    }
    expect(catalog.questions.length).toBeGreaterThan(100);
    expect(catalog.domains.map((d) => d.code).sort()).toEqual(SUBJECTS[subject].domains.map((d) => d.code).sort());
  });

  it('normalizes sampled question details into gradable questions', async () => {
    const sample = [...catalogs.values()].flatMap(pickSample);
    const tallies = new Map<string, number>();
    const failures: string[] = [];
    const bump = (key: string) => tallies.set(key, (tallies.get(key) ?? 0) + 1);

    await Promise.all(
      sample.map(async (meta) => {
        try {
          const q: Question = await repository.loadQuestion(meta);
          bump(`${meta.format} ${q.kind} key:${q.answerKeyOrigin}${q.rationaleHtml ? '' : ' no-rationale'}`);
          if (q.kind === 'mcq') bump(`${meta.format} mcq choices:${q.choices.length}`);
        } catch (error) {
          if (!isQuestionUnavailableError(error)) throw error;
          bump(`${meta.format} unavailable`);
          failures.push(`${meta.questionId} (${meta.format}, ${meta.skillCode}): ${(error as Error).message}`);
        }
      }),
    );

    console.log(`Sampled ${sample.length} questions:`);
    for (const [key, n] of [...tallies].sort()) console.log(`  ${key}: ${n}`);
    if (failures.length) console.log(`Unavailable:\n  ${failures.join('\n  ')}`);

    const usable = sample.length - failures.length;
    expect(usable / sample.length).toBeGreaterThan(0.95);
  });
});
