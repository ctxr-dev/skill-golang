import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ATOM_TYPES,
  BLOCK_MARKERS,
  INLINE_MARKERS,
  PRIORITIES,
  SUBJECTS,
  allSections,
  corpus,
  indexRows,
  indexText,
  prosePaths,
  rel,
  repoRoot,
} from './lib/corpus.mjs';

const EXPECTED_AREAS = 20;
const EXPECTED_RULES = 86;
const EXPECTED_P0 = 17;
const FRONTMATTER_KEYS = ['id', 'area', 'subject', 'updated', 'rules'];
const RULE_ID = /^[a-z0-9]+(-[a-z0-9]+)+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GO_VERSION = /^1\.(25|26)$/;
const LINE_REFERENCE = /#L\d+|\b(?:at |on )?lines? \d+\b|\.(?:go|md|yml|yaml|mjs|json):\d+/g;
const AREAS_WITHOUT_GO = ['onboarding', 'review', 'tooling'];

const COPY_VECTORS = [
  'npx skills add samber',
  'cc-skills-golang --skill',
  'cc-skills-golang@',
  'plugin install cc-skills-golang',
  'codex plugin add github:samber',
  'gemini extensions install https://github.com/samber',
  'cursor/skills/cc-skills-golang',
  'cc-skills-golang --all',
];

const SEED_SKILL_IDS = [
  'golang-code-style',
  'golang-data-structures',
  'golang-database',
  'golang-design-patterns',
  'golang-documentation',
  'golang-error-handling',
  'golang-modernize',
  'golang-naming',
  'golang-refactoring',
  'golang-safety',
  'golang-security',
  'golang-testing',
  'golang-concurrency',
  'golang-performance',
  'golang-observability',
  'golang-project-layout',
  'golang-grpc',
  'golang-google-wire',
  'golang-uber-fx',
  'golang-spf13-cobra',
  'golang-spf13-viper',
  'golang-samber-lo',
  'golang-samber-slog',
  'golang-stretchr-testify',
];

const EMPLOYER_STRINGS = ['riskified', 'corporate skill', 'company skill'];

const SAMBER_URL = 'https://github.com/samber/cc-skills-golang';

function proseCorpus() {
  return prosePaths().map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

test('every area file carries exactly the five frontmatter keys, consistent with its name', () => {
  for (const area of corpus()) {
    assert.deepEqual(
      [...area.frontmatterKeys].sort(),
      [...FRONTMATTER_KEYS].sort(),
      `${rel(area.file)}: frontmatter keys`,
    );
    assert.equal(area.id, area.stem, `${rel(area.file)}: id must equal the filename stem`);
    assert.equal(area.area, area.id, `${rel(area.file)}: area must equal id`);
    assert.ok(area.subject.length > 0, `${rel(area.file)}: subject must not be empty`);
    for (const subject of area.subject) {
      assert.ok(SUBJECTS.includes(subject), `${rel(area.file)}: unknown subject ${subject}`);
    }
    assert.match(area.updated, ISO_DATE, `${rel(area.file)}: updated must be an ISO date`);
    assert.equal(
      area.rules,
      area.sections.length,
      `${rel(area.file)}: frontmatter says ${area.rules} rules, the file holds ${area.sections.length}`,
    );
  }
});

test('every rule declares a priority and an atom type, and a version gate when it needs one', () => {
  for (const section of allSections()) {
    const where = `${section.area}.md#${section.id}`;
    assert.match(section.id, RULE_ID, `${where}: rule id must be kebab-case`);
    assert.ok(PRIORITIES.includes(section.priority), `${where}: priority is ${section.priority}`);
    assert.ok(ATOM_TYPES.includes(section.atomType), `${where}: atom_type is ${section.atomType}`);
    if (section.since !== undefined) {
      assert.match(section.since, GO_VERSION, `${where}: since must be 1.25 or 1.26`);
    }
  }
});

test('every rule states the rule, the reason, the catcher and its sources', () => {
  for (const section of allSections()) {
    const where = `${section.area}.md#${section.id}`;
    for (const marker of INLINE_MARKERS) {
      const body = section.markers[marker];
      assert.ok(body !== null, `${where}: missing ${marker}`);
      assert.ok(body.length >= 20, `${where}: ${marker} body is ${body.length} characters, want 20 or more`);
    }
    assert.ok(
      section.markers['**Sources.**'].includes('https://'),
      `${where}: Sources must carry at least one https:// link`,
    );
  }
});

test('every rule shows a worked example, in Go unless its area is exempt by name', () => {
  for (const area of corpus()) {
    const needsGo = !AREAS_WITHOUT_GO.includes(area.id);
    for (const section of area.sections) {
      const where = `${section.area}.md#${section.id}`;
      for (const marker of BLOCK_MARKERS) {
        assert.ok(section.markers[marker] !== null, `${where}: missing ${marker}`);
      }
      assert.ok(section.fences.length >= 1, `${where}: no fenced example`);
      for (const fence of section.fences) {
        assert.ok(fence.lang.length > 0, `${where}: a fenced block declares no language`);
      }
      if (needsGo) {
        assert.ok(section.goBlocks.length >= 1, `${where}: no go block, and ${area.id} is not exempt`);
      }
    }
  }
  for (const exempt of AREAS_WITHOUT_GO) {
    assert.ok(
      corpus().some((area) => area.id === exempt),
      `the exemption list names ${exempt}, which is not an area`,
    );
  }
});

test('rule ids are unique across the whole corpus', () => {
  const seen = new Map();
  for (const section of allSections()) {
    const previous = seen.get(section.id);
    assert.equal(
      previous,
      undefined,
      `rule id ${section.id} appears in both ${previous} and ${section.area}.md`,
    );
    seen.set(section.id, `${section.area}.md`);
  }
});

test('every cross-reference resolves to a rule that exists', () => {
  const sections = allSections();
  const known = new Set(sections.map((section) => section.id));
  for (const section of sections) {
    for (const reference of section.references) {
      assert.ok(
        known.has(reference),
        `${section.area}.md#${section.id}: cross-reference rule:${reference} resolves to nothing`,
      );
    }
  }
});

test('the index and the corpus hold the same rules', () => {
  const sections = allSections();
  const rows = indexRows();
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const row of rows) {
    assert.ok(existsSync(row.path), `index row ${row.label} points at missing file ${rel(row.path)}`);
    const section = byId.get(row.anchor);
    assert.ok(section !== undefined, `index row ${row.label} points at unknown rule ${row.anchor}`);
    assert.equal(
      path.basename(row.path, '.md'),
      section.area,
      `index row ${row.label} points at the wrong area file`,
    );
  }
  const linked = new Set(rows.map((row) => row.anchor));
  for (const section of sections) {
    assert.ok(linked.has(section.id), `rule ${section.id} has no index row`);
  }
  assert.equal(linked.size, sections.length, 'index rows and corpus rules must be one to one');
});

test('the index records the priority of every rule it lists', () => {
  const text = indexText();
  for (const section of allSections()) {
    const row = text.split('\n').find((line) => line.includes(`#${section.id})`));
    assert.ok(row !== undefined, `index has no row for ${section.id}`);
    assert.ok(
      row.includes(section.priority),
      `index row for ${section.id} does not carry its priority ${section.priority}`,
    );
  }
});

test('no third-party skill collection is copied or installed from', () => {
  for (const { file, text } of proseCorpus()) {
    const lower = text.toLowerCase();
    for (const vector of COPY_VECTORS) {
      assert.ok(!lower.includes(vector.toLowerCase()), `${rel(file)}: holds the copy vector "${vector}"`);
    }
    for (const identifier of SEED_SKILL_IDS) {
      assert.ok(!lower.includes(identifier), `${rel(file)}: holds the third-party skill identifier "${identifier}"`);
    }
  }
});

test('the third-party collection is never named except as a bare URL', () => {
  const mentions = proseCorpus().flatMap(({ file, text }) =>
    [...text.matchAll(/samber\/cc-skills-golang/g)].map((match) => ({
      file,
      context: text.slice(Math.max(0, match.index - 'https://github.com/'.length), match.index + match[0].length),
    })),
  );
  const wrong = mentions.filter((mention) => mention.context !== SAMBER_URL);
  assert.deepEqual(
    wrong.map((mention) => `${rel(mention.file)}: ${mention.context}`),
    [],
    `${mentions.length} mentions found; each must be exactly ${SAMBER_URL}`,
  );
  const control = proseCorpus().filter(({ text }) => text.includes('https://go.dev'));
  assert.ok(control.length > 0, 'positive control: no file cites go.dev, so the matcher proves nothing');
});

test('no employer or unnamed-company wording appears anywhere', () => {
  for (const { file, text } of proseCorpus()) {
    const lower = text.toLowerCase();
    for (const forbidden of EMPLOYER_STRINGS) {
      assert.ok(!lower.includes(forbidden), `${rel(file)}: holds "${forbidden}"`);
    }
  }
});

test('no rule pins guidance to a line number', () => {
  for (const { file, text } of proseCorpus()) {
    const hits = [...text.matchAll(LINE_REFERENCE)].map((hit) => hit[0]);
    assert.deepEqual(hits, [], `${rel(file)}: holds a line reference`);
  }
});

test('the corpus is complete', () => {
  const areas = corpus();
  const sections = allSections();
  assert.equal(areas.length, EXPECTED_AREAS, 'area file count');
  assert.equal(sections.length, EXPECTED_RULES, 'rule count');
  assert.equal(
    sections.filter((section) => section.priority === 'P0').length,
    EXPECTED_P0,
    'P0 rule count',
  );
});

test('the repository ships no package manifest', () => {
  assert.equal(existsSync(path.join(repoRoot, 'package.json')), false, 'package.json must not exist');
});

test('every pinned link matches the version this skill declares', () => {
  const skill = readFileSync(path.join(repoRoot, 'SKILL.md'), 'utf8');
  const declared = /^\s+version:\s*"([^"]+)"$/m.exec(skill);
  assert.ok(declared !== null, 'SKILL.md declares no metadata.version');
  const expected = `v${declared[1]}`;
  const wrong = [];
  let pinned = 0;
  for (const { file, text } of proseCorpus()) {
    for (const match of text.matchAll(/\/blob\/(v[\d.]+)\//g)) {
      pinned += 1;
      if (match[1] !== expected) {
        wrong.push(`${rel(file)}: ${match[1]}, expected ${expected}`);
      }
    }
  }
  assert.ok(pinned > 0, 'no pinned link anywhere, so this check proves nothing');
  assert.deepEqual(wrong, [], `${pinned} pinned links checked against ${expected}`);
});
