# StudySAT

A free, open-source study app for the digital SAT. Choose the subjects, domains and skills you want to work on, then either
**drill them endlessly** with instant feedback or **take a custom test** and review every question afterwards.

Every question, answer key and explanation is loaded live, in the browser, from the College Board's
[SAT Suite Educator Question Bank](https://satsuiteeducatorquestionbank.collegeboard.org/). StudySAT never writes its own
questions, answer keys or explanations, and the repository contains no question content.

> SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this project.
> Question content is © College Board and is **not** covered by this project's MIT License. See [NOTICE.md](NOTICE.md).

## Features

- **Study configuration shared by both modes**
  - Reading and Writing, Math, or both, with selections kept separately per subject
  - Domains and skills taken from the live question data, with per-skill question counts
  - Select a whole subject, a whole domain (tri-state checkbox) or individual skills; expand/collapse domains; clear or reset
  - Difficulty filter (the question bank's Easy / Medium / Hard rating)
  - Question mix: *balanced* across selected skills, or *random* from all matches
  - Optional answer-choice shuffling that never breaks the answer key
  - Live count of matching questions, with clear messages when nothing (or too little) matches
- **Endless Practice**
  - Click an answer (or press <kbd>A</kbd>–<kbd>D</kbd> / <kbd>1</kbd>–<kbd>4</kbd>) and get immediate, locked-in feedback
  - Score, accuracy, streak and progress through the pool; no repeats until every match has been seen, then reshuffle
  - Explanations split into "why the right answer is right" and "why your answer is wrong", quoted from the source
  - Free-response (grid-in) questions with SAT entry rules; skip a question without it counting
  - End any time for a summary with a breakdown by subject, domain and skill
- **Custom Test**
  - 1–100 distinct questions, generated and fully loaded before the test starts
  - One question at a time, Previous/Next, a question navigator that marks unanswered items, change answers freely
  - No correctness or explanations until submission; confirmation if anything is unanswered
  - Results: score, correct/incorrect/unanswered, breakdowns, and a filterable review of every question with expandable explanations
  - Retake the same test, generate a new one with the same settings, or change settings
- **Resilient sessions**: settings, an in-progress test and an unfinished practice session survive a page reload
- **Accessible and responsive**: semantic HTML, keyboard support, visible focus, screen-reader status messages, icons + text
  (never color alone), reduced-motion support, light and dark themes, phone to desktop layouts

## Quick start

Prerequisites: **Node.js 22.13+ or 24+** (see `.nvmrc`) and npm.

```bash
npm install          # install dependencies
npm run dev          # start the dev server at http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Unit and UI tests (Vitest + Testing Library, offline, synthetic fixtures) |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint (TypeScript, React Hooks and React Compiler rules) |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serve the production build locally at http://localhost:4173 |
| `npm run check:api` | **Live** check against the real question bank API (needs network) |

`npm run check:api` loads both question lists and a sample of question details through the same code the app uses, and
reports how many normalize into gradable questions. Increase the sample with environment variables, e.g.
`LIVE_SAMPLE_PER_SKILL=25 LIVE_LEGACY_SAMPLE=all npm run check:api`.

## Configuration

No API keys or secrets are needed. The only (optional) setting is:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_QBANK_API_BASE` | `https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital` | Base URL of the question bank API. Only change it to route requests through your own proxy. |

Copy `.env.example` to `.env` to override it. Vite inlines `VITE_*` variables at build time, so never put secrets in them.

## Deployment

The build is a static site (`dist/`) with hash-based routing and relative asset paths, so it can be served from any static
host or sub-path (GitHub Pages, Netlify, Cloudflare Pages, S3, …) without server rewrites.

```bash
npm ci
npm run build
# upload the contents of dist/
```

For GitHub Pages, publish `dist/` (for example with the official `actions/upload-pages-artifact` and `actions/deploy-pages`
actions). The production build adds a Content-Security-Policy that only allows connections to the configured API origin;
if you change `VITE_QBANK_API_BASE`, rebuild so the policy matches.

`.github/workflows/ci.yml` runs lint, type check, tests and build on every push and pull request.

## Where the questions come from

The app uses exactly the two endpoints described in `documentation.txt`:

1. **Question list** – `POST {base}/get-questions` with `{"asmtEventId": 99, "test": <1|2>, "domain": "<codes>"}`.
   `test` is `1` for Reading and Writing and `2` for Math. The app requests all documented domains for a subject in one
   call (`INI,CAS,EOI,SEC` or `H,P,Q,S`) and filters locally, so changing filters never costs extra requests. Each record
   carries the question id, domain (`primary_class_cd`), skill (`skill_cd`/`skill_desc`), difficulty (`E`/`M`/`H`), score
   band and the id used to fetch details.
2. **Question detail** – `POST {base}/get-question` with `{"external_id": "<id>"}`, fetched lazily when a question is needed.

The API is public, needs no credentials and answers with `Access-Control-Allow-Origin: *`, so there is no backend: the
browser calls it directly. (The browser-specific headers in the documentation's curl examples are set by the browser.)

### Two detail formats

Investigating the live API showed two formats, both handled by `src/data/normalize.ts`:

| | Standard (most items) | Legacy (459 older Math items) |
| --- | --- | --- |
| Fetched by | `external_id` | `ibn` (their `external_id` is `null`); the same documented endpoint serves them |
| Content | `stimulus`, `stem`, `answerOptions[{id, content}]`, `rationale`, `type: "mcq" \| "spr"` | `body`, `prompt`, `answer.choices.{a..d}.body`, `answer.rationale`, `answer.style` |
| Math | MathML | PNG images with alt text |
| Answer key | `keys` (choice ids or accepted entries) and `correct_answer` (letters or entries) | `answer.correct_choice` (sometimes missing; never present for free response) |

### Answer keys are never guessed

- Standard multiple choice: the key (`keys`) must match a choice id; if `correct_answer`'s letter disagrees, the item is rejected.
- If the rationale explicitly names a different correct letter than the key, the item is rejected rather than shown with a
  contradictory explanation (the live audit found one such item).
- Legacy items without a structured key use the answer their **own rationale explicitly states** ("Choice D is correct.",
  "The correct answer is 24.", "Note that 3/2 and 1.5 are examples of ways to enter a correct answer."). Numbers are never
  read from image alt text, and anything ambiguous makes the item unsupported. These items are labeled in the explanation.
- Unusable items are skipped (practice) or replaced by another question from the **same filtered pool**, preferring the same
  skill (tests). The app never substitutes questions from outside your selection; if the pool runs short it says so.

A live audit of 1,152 items (25 per skill plus all 459 legacy items) normalized 1,151 into gradable questions; the
exception was the contradictory item above.

### Free-response grading

Entries follow the digital SAT rules: integers, decimals and fractions; equivalent forms count (`1/4` = `.25` = `2/8`); a
non-terminating answer may be entered as a truncated or rounded decimal that fills the 5-character field (6 with a minus
sign), e.g. `3/17` → `.1764`, `.1765` or `0.176`. Mixed numbers, commas and symbols are rejected with an explanation.
Comparison uses exact rational arithmetic (BigInt), not floating point.

### Caching, limits and errors

- Question lists are cached in `localStorage` (compact form, 12-hour lifetime); details are cached in memory.
- At most 4 requests run at once. Network errors, timeouts, HTTP 5xx and HTTP 429 are retried with exponential backoff
  (honoring `Retry-After`), then surfaced with a retry button.
- Unknown ids come back as HTTP 200 with an S3-style `{"$fault": …, "name": "NoSuchKey"}` body; these are treated as "not found".

### Rendering question content

Question HTML (text, tables, inline SVG graphs, MathML) is sanitized with DOMPurify, then:

- element ids and all references to them are scoped per question, and figure `<style>` blocks are confined to their own
  figure, so several questions can share a page (results review);
- MathML is adapted for browsers that implement MathML Core: deprecated `<mfenced>` becomes explicit fences,
  `mathvariant` letters (e.g. script ℓ) become Unicode math letters, segment bars stretch over the whole name, and function
  names get their customary thin space;
- tables scroll horizontally on narrow screens; figures get a light backing in dark mode.

Math is rendered natively by the browser (no math library is shipped).

## Architecture

React 19 + TypeScript, built with Vite. No backend, database or accounts.

```
src/
  api/qbankClient.ts        Transport for the two documented endpoints: retries, timeouts, concurrency, error kinds
  data/                     Framework-free domain logic (unit tested)
    types.ts                Normalized question model
    taxonomy.ts             Documented subject/domain codes used to query the API
    normalize.ts            Raw list/detail payloads → normalized model (both formats), validation
    rationaleKeys.ts        Conservative reading of explicitly stated keys from rationales
    catalog.ts              Domain → skill tree and counts derived from live data
    repository.ts           Loads catalogs (localStorage cache) and question details (memory cache)
    filter.ts               Subject/domain/skill/difficulty filtering and counting
    sampling.ts             Shuffling, decks (sampling without replacement), balanced mixing, choice order
    validation.ts           Multiple-choice and free-response grading
    scoring.ts              Scores, accuracy, breakdowns
    testGenerator.ts        Builds a complete test from a pool, replacing unusable items
  content/                  Turning question HTML into safe, well-rendered DOM
    sanitize.ts, mathml.ts, rationaleSegments.ts
  state/                    Session state as pure reducers + persistence
    config.ts, practiceSession.ts, testSession.ts, storage.ts
  app/                      React context providers, hash router, error messages
  components/               Reusable UI (question view, choices, explanations, dialogs, …)
  screens/                  Home, Setup, Practice, Practice summary, Test, Test results, About
  styles/                   Design tokens (light/dark), components, screens
scripts/live/               Live API integration check (npm run check:api)
```

Scores are always computed from recorded responses (practice history, test answers keyed by question id), never from
counters, and reducers ignore duplicate submissions.

## Known limitations

- The question bank API is public but not officially documented by College Board; it may change or disappear without notice.
- Test scores are the percentage answered correctly, not scaled SAT scores. Tests are untimed.
- Explanations come only from the source. "Why your answer is wrong" is shown when the rationale discusses that choice;
  otherwise the full rationale is available. Free-response rationales don't explain specific wrong entries.
- When choices are shuffled, explanations still refer to the original letters (each choice shows its original letter).
- Native MathML rendering depends on the browser and installed math fonts; very old browsers render math poorly. Legacy
  items show math as images.
- A few items may be excluded because their data is unusable or self-contradictory (see above).
- Question details are cached in memory only, so practicing offline is not supported. An in-progress test is saved with its
  questions and can be resumed after a reload, as long as it fits in the browser's storage (very long tests of image-heavy
  legacy items may not; the app then simply doesn't offer to resume).

## Troubleshooting

- **"Couldn't reach the College Board question bank"** – check your connection, ad/privacy blockers, or corporate
  firewalls blocking `qbank-api.collegeboard.org`. Use *Try again*.
- **"The question bank is limiting requests"** – wait a minute and retry; the app already backs off automatically.
- **Stale skills or counts** – question lists are cached for 12 hours. Clear the site's local storage to refresh sooner.
- **Odd behavior after an update** – stored settings are validated on load, but clearing local storage resets everything.
- **`npm run check:api` fails** – the API may have changed shape; the failure output lists which items could not be read.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint`, `npm run typecheck` and `npm test` before submitting.
Never commit real question content (for example in fixtures or screenshots); use invented placeholder text like the
fixtures in `src/test/fixtures.ts`.

## License

The source code is released under the [MIT License](LICENSE). Question content is © College Board and is not covered by
this license; see [NOTICE.md](NOTICE.md).
