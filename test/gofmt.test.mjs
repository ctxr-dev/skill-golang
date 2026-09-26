import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goBlocks } from './lib/corpus.mjs';

const GO_LINE = 'go 1.25';
const PACKAGE_CLAUSE = /^package\s+[a-z]/;
const IMPORT_PATH = /^\s*(?:[\w.]+\s+)?"([^"]+)"\s*$/gm;
const SINGLE_IMPORT = /^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm;

function toolVersion(tool) {
  return execFileSync(tool, ['version'], { encoding: 'utf8' }).trim();
}

function normalise(code) {
  return code.endsWith('\n') ? code : `${code}\n`;
}

function asFile(code) {
  const body = normalise(code);
  return PACKAGE_CLAUSE.test(body) ? body : `package example\n\n${body}`;
}

function formatted(source) {
  return execFileSync('gofmt', [], { input: source, encoding: 'utf8' });
}

function importPaths(source) {
  const block = /^import\s+\(([\s\S]*?)^\)/m.exec(source);
  const paths = [];
  if (block) {
    for (const match of block[1].matchAll(IMPORT_PATH)) {
      paths.push(match[1]);
    }
  }
  for (const match of source.matchAll(SINGLE_IMPORT)) {
    paths.push(match[1]);
  }
  return paths;
}

function isExternal(importPath) {
  return importPath.split('/')[0].includes('.');
}

test('the Go toolchain this suite measures against is the one the corpus targets', () => {
  const version = toolVersion('go');
  assert.match(version, /^go version go1\.25\./, `found ${version}`);
  assert.equal(formatted('package  example\n'), 'package example\n', 'gofmt must reformat stdin');
});

test('every Go example is gofmt-clean', () => {
  const blocks = goBlocks();
  assert.ok(blocks.length > 0, 'the corpus holds no Go examples');
  const dirty = [];
  for (const block of blocks) {
    const source = asFile(block.code);
    let output;
    try {
      output = formatted(source);
    } catch (error) {
      dirty.push(`${block.label}: gofmt rejected it — ${String(error.stderr ?? error.message).trim()}`);
      continue;
    }
    if (output !== source) {
      dirty.push(`${block.label}: not gofmt-canonical`);
    }
  }
  assert.deepEqual(dirty, [], `${blocks.length} Go examples checked`);
});

test('every standard-library Go example on the 1.25 baseline compiles and vets clean', () => {
  const blocks = goBlocks();
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'skill-golang-blocks-'));
  const gated = [];
  const external = [];
  const built = [];
  try {
    writeFileSync(path.join(scratch, 'go.mod'), `module example\n\n${GO_LINE}\n`);
    blocks.forEach((block) => {
      const source = asFile(block.code);
      if (block.since === '1.26') {
        gated.push(block.label);
        return;
      }
      const foreign = importPaths(source).filter(isExternal);
      if (foreign.length > 0) {
        external.push(`${block.label} (${foreign.join(', ')})`);
        return;
      }
      const dir = path.join(scratch, `${block.area}__${block.ruleId}__${block.index}`);
      mkdirSync(dir);
      writeFileSync(path.join(dir, 'example.go'), source);
      built.push(block.label);
    });
    assert.ok(built.length > 0, 'no example was compiled');
    let failure = '';
    try {
      execFileSync('go', ['build', './...'], { cwd: scratch, encoding: 'utf8', stdio: 'pipe' });
      execFileSync('go', ['vet', './...'], { cwd: scratch, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      failure = String(error.stderr ?? error.message);
    }
    assert.equal(
      failure,
      '',
      [
        `compiled ${built.length}, 1.26-gated and unexecuted: ${gated.join(', ') || 'none'}`,
        `external-import and unexecuted: ${external.join(', ') || 'none'}`,
        'each failing path is <area>__<rule-id>__<block-index>/example.go',
      ].join('\n'),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('every unexecuted Go example is named, never silently skipped', () => {
  const blocks = goBlocks();
  const gated = blocks.filter((block) => block.since === '1.26').map((block) => block.label);
  const external = blocks
    .filter((block) => block.since !== '1.26' && importPaths(asFile(block.code)).some(isExternal))
    .map((block) => block.label);
  const executed = blocks.length - gated.length - external.length;
  assert.ok(
    executed > 0,
    `nothing was executed: ${gated.length} gated, ${external.length} external, ${blocks.length} total`,
  );
  console.log(
    `go1.25 blocks: ${executed} compiled\n` +
      `1.26-gated and unexecuted: ${gated.join(', ') || 'none'}\n` +
      `external-import and unexecuted: ${external.join(', ') || 'none'}`,
  );
});
