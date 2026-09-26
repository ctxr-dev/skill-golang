# skill-golang — implementation plan

**Spec:** `../specs/2026-10-01-skill-golang-design.md`

## Goal

Ship `ctxr-dev/skill-golang`: an Agent Skill that guides an agent writing Go and an agent reviewing
Go, backed by a static corpus of 86 rules in 20 area files, deferring to a repository's own standards
whenever it has them.

## Architecture

```
SKILL.md          router + decision tree + the 16 always-on rules
rules/golang.md   always-on routing rule, loads every turn in a Go repo
references/       companion detection, review contract, bootstrap questions, rule index
corpus/<area>.md  20 files; each rule is one `## <rule-id>` section
test/             four node:test suites, zero dependencies
.golangci.yml     every enabled linter maps to a named rule
```

Reading path: the always-on rule names the area file; the area file holds the rule; the rule names
its sources and the linter that catches it. `references/corpus-index.md` is a convenience, never a
required hop — a rule's file is derivable from its area.

## Tech Stack

Markdown. `node:test` for the maintenance checks, run with `node --test` from the repository root.
No `package.json`, no dependencies, no runtime code in the shipped skill. Go 1.25.11 locally for the
example checks.

## Global Constraints

- Corpus content is distilled from go.dev, Effective Go, Go Code Review Comments, the Google Go Style
  Guide and the Uber Go Style Guide. Nothing is copied from any third-party skill collection.
- 20 area files, 86 rules, 16 of them P0. Rule ids are unique corpus-wide.
- File frontmatter keys, exactly: `id`, `area`, `subject`, `updated`, `rules`. `id` equals the
  filename stem and equals `area`. `rules` equals the number of `##` sections.
- Rule section keys: `- priority:` in {P0, P1, P2}, `- atom_type:` in {decision, feedback-rule,
  bug-root-cause, pattern-gotcha, reference}, optional `- since:`.
- Every rule section carries `**Rule.**`, `**Why.**`, `**Good**`, `**Caught by.**`, `**Sources.**`
  with non-empty bodies. `**Bad**` where a counter-example helps.
- Every Go block is gofmt-clean and tab-indented. Every block not gated by `since: 1.26` compiles
  under go1.25.11.
- Go version baseline is 1.25 and 1.26. A 1.26 rule carries `since: 1.26` and shows the 1.25 form.
- Priority rubric: decision / feedback-rule / bug-root-cause / pattern-gotcha default to P1,
  reference to P2. P0 only where the spec marks it.
- `funlen` 60 lines / 40 statements. `cyclop` and `gocognit` 20. Files 400 soft, 600 hard.
  `fieldalignment` off.
- No line numbers anywhere in the corpus, references or review output.
- No comment on any changed line, in any language, except a Go doc comment on an exported identifier
  or package.
- Review links are `https://github.com/ctxr-dev/skill-golang/blob/v<metadata.version>/corpus/<area>.md#<rule-id>`.
- Review output goes to `~/.skill-golang/<yyyy-mm-dd>/<hh-mm-ss>/<title-or-task-id>/`.
- Onboarding state goes to `~/.skill-golang/onboarding/<repo-normalized-path>/onboarding.json`,
  where `<repo-normalized-path>` is the repository root absolute path with the leading `/` dropped
  and every other `/` replaced by `-`. Nothing is ever written inside a working repository.
- `google/wire` is archived (2025-08-22) and is never recommended. `spf13/viper` (last push
  2026-01-12), `gorilla/mux` and `jmoiron/sqlx` (both 2024-08-15) are flagged as stalled whenever
  they come up.
- Every commit: `git -c user.name="Dmitri Meshin" -c user.email="dmitri.meshin@gmail.com" commit`.
  Never run `git config`. Never `git add -A`.
- Every automated check is mutation-proven: break the artefact, see the specific failure, revert.

## Task 1 — the four checks

**Files:** `test/corpus.test.mjs`, `test/gofmt.test.mjs`, `test/config.test.mjs`,
`test/install.test.mjs`, `test/lib/corpus.mjs`.

**Interfaces:** `test/lib/corpus.mjs` exports `repoRoot`, `areaFiles()`, `parseArea(path)` returning
`{ id, area, subject, updated, rules, sections: [{ id, priority, atomType, since, body }] }`, and
`goBlocks()` returning `[{ file, ruleId, since, code }]`.

- [ ] Write `test/lib/corpus.mjs`. A missing `corpus/` directory is an error, not an empty list.
- [ ] Write `test/corpus.test.mjs`: frontmatter shape, per-rule required sections, unique ids,
      cross-reference resolution, index reconciliation, provenance strings.
- [ ] Run it against the empty repo and record the failure text.
- [ ] Write `test/gofmt.test.mjs`: `gofmt -l` on every block; compile 1.25 blocks in a scratch
      module; list 1.26-gated blocks by rule id.
- [ ] Write `test/config.test.mjs`: parse `.golangci.yml` without a YAML dependency, assert
      `fieldalignment` is off, reconcile enabled linters against the index.
- [ ] Write `test/install.test.mjs`: copy the tree the way the skills CLI does and assert the corpus,
      references and rule arrived.
- [ ] Mutation-prove each assertion once a real area file exists (Task 2).

## Task 2 — the first area file and the mutation proof

**Files:** `corpus/onboarding.md`.

- [ ] Write `corpus/onboarding.md` with its three rules.
- [ ] Run `node --test test/corpus.test.mjs` and watch it pass for that file.
- [ ] Mutate and confirm the named failure, one at a time: remove `**Why.**` from a rule; change
      `area` so it stops matching the filename; set `rules` to the wrong number; break a
      cross-reference; duplicate a rule id; de-tab a Go block.
- [ ] Revert every mutation and confirm green.

## Task 3 — the remaining nineteen area files

**Files:** `corpus/docs.md`, `style.md`, `naming.md`, `errors.md`, `safety.md`, `concurrency.md`,
`context.md`, `interfaces.md`, `layout.md`, `testing.md`, `security.md`, `performance.md`,
`observability.md`, `api.md`, `data.md`, `dependencies.md`, `tooling.md`, `modernization.md`,
`review.md`.

**Interfaces:** the rule section shape from Task 2 is the contract. Rule ids are fixed by the spec
and must match exactly, because `references/corpus-index.md` and `SKILL.md` link to them.

- [ ] Write each file against the fixed rule-id list.
- [ ] Run the corpus and gofmt suites after each file.
- [ ] Confirm the final counts: 20 files, 86 rules, 16 at P0.

## Task 4 — the skill surface

**Files:** `SKILL.md`, `rules/golang.md`, `references/companion-skills.md`,
`references/review-contract.md`, `references/bootstrap-questions.md`, `references/corpus-index.md`,
`.golangci.yml`, `README.md`.

**Interfaces:** `SKILL.md` frontmatter has exactly `name`, `description`, `license`, `compatibility`,
`metadata`. `metadata` holds `version`, `homepage`, `companion-rule`. `metadata.version` must equal
the release tag, because review links are built from it.

- [ ] `SKILL.md`, under 400 lines, eight sections in the spec's order.
- [ ] `rules/golang.md`, under 80 lines, routing only, no frontmatter in the file.
- [ ] The three reference documents.
- [ ] `.golangci.yml`, then `references/corpus-index.md` reconciling it against the corpus.
- [ ] `README.md` following the `simple-language` structure section for section.

## Task 5 — behavioural verification

- [ ] Run all four suites green.
- [ ] Provenance greps with positive controls.
- [ ] Write mode: a fresh agent given the skill, the corpus, the rule and the `no-comments` body
      produces a doc comment on the exported function and no other comment.
- [ ] Review mode: four named defects in a fixture produce four matched findings, the SQL one a
      blocker, every finding carrying a tagged link, and a run directory on disk.
- [ ] Companion detection: active, skill-only and absent; onboarding directories for two repositories
      at different paths; both repositories left untouched.
- [ ] Precedence at both ends: a repository standard overriding one topic, and the in-context rung 0.
- [ ] `git log --format='%an %ae' | sort -u` returns one line.

## Task 6 — the follow-up note

**Files:** `../../../omp-perfect-coder/REQUIREMENT-cyclop-threshold.md` (a different repository).

- [ ] Record that this skill sets `cyclop` and `gocognit` to 20 while perfect-coder documents
      cyclop's default as 10, and ask whether perfect-coder should move. Do not edit its guidance.
