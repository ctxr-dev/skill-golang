import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { areaFiles, rel, repoRoot } from './lib/corpus.mjs';

const REQUIRED_FILES = [
  'SKILL.md',
  'README.md',
  'LICENSE',
  '.golangci.yml',
  'rules/golang.md',
  'references/companion-skills.md',
  'references/review-contract.md',
  'references/bootstrap-questions.md',
  'references/corpus-index.md',
];

function tracked() {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0);
}

function shippedPaths() {
  return [...REQUIRED_FILES, ...areaFiles().map((file) => rel(file))];
}

test('every file the skill needs at runtime is in the repository', () => {
  const missing = REQUIRED_FILES.filter((file) => !existsSync(path.join(repoRoot, file)));
  assert.deepEqual(missing, [], 'required files');
  assert.equal(areaFiles().length, 20, 'corpus area files');
});

test('every shipped file is tracked by git, so a release carries it', () => {
  const known = new Set(tracked());
  const untracked = shippedPaths().filter((file) => !known.has(file));
  assert.deepEqual(untracked, [], 'untracked shipped files');
});

test('no ignore file would strip the corpus out of a published tree', () => {
  for (const name of ['.gitignore', '.npmignore']) {
    const file = path.join(repoRoot, name);
    if (!existsSync(file)) {
      continue;
    }
    const patterns = readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    for (const pattern of patterns) {
      const bare = pattern.replace(/^!?\/?/, '').replace(/\/$/, '');
      const hits = shippedPaths().filter((shipped) => shipped === bare || shipped.startsWith(`${bare}/`));
      assert.deepEqual(hits, [], `${name} pattern "${pattern}" would exclude shipped files`);
    }
  }
});

test('a tree copied the way the skills installer copies it still holds the corpus', () => {
  const target = mkdtempSync(path.join(os.tmpdir(), 'skill-golang-install-'));
  try {
    cpSync(repoRoot, target, {
      recursive: true,
      filter: (source) => path.basename(source) !== '.git',
    });
    const missing = shippedPaths().filter((file) => !existsSync(path.join(target, file)));
    assert.deepEqual(missing, [], 'files lost in the copy');
    const corpusCount = readdirSync(path.join(target, 'corpus')).filter((name) => name.endsWith('.md')).length;
    assert.equal(corpusCount, 20, 'corpus files in the installed tree');
    const referenceCount = readdirSync(path.join(target, 'references')).filter((name) => name.endsWith('.md')).length;
    assert.equal(referenceCount, 4, 'reference files in the installed tree');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('the installed layout matches a skill the installer has already shipped', () => {
  const reference = path.join(os.homedir(), '.agents', 'skills', 'simple-language');
  assert.ok(
    existsSync(path.join(reference, 'corpus')) && existsSync(path.join(reference, 'references')),
    `the installer evidence is missing at ${reference}; install ctxr-dev/simple-language to re-establish it`,
  );
});
