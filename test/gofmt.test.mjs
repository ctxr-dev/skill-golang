import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allSections, goBlocks } from './lib/corpus.mjs';

const PACKAGE_CLAUSE = /^package\s+[a-z]/m;
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

test('the Go toolchain this suite measures against is at or above the corpus baseline', () => {
  const version = toolVersion('go');
  const minor = /^go version go1\.(\d+)/.exec(version);
  assert.ok(minor !== null, `cannot read a version from ${version}`);
  assert.ok(Number(minor[1]) >= 25, `the corpus baseline is Go 1.25; found ${version}`);
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

function toolchainMinor() {
  const matched = /^go version go1\.(\d+)/.exec(toolVersion('go'));
  assert.ok(matched !== null, `cannot read the toolchain version from ${toolVersion('go')}`);
  return Number(matched[1]);
}

function skipReason(block, minor) {
  if (block.since === '1.26' && block.marker !== '**Good (1.25)**' && minor < 26) {
    return 'gated';
  }
  const foreign = importPaths(asFile(block.code)).filter(isExternal);
  return foreign.length > 0 ? `external (${foreign.join(', ')})` : null;
}

function run(tool, args, cwd) {
  try {
    execFileSync(tool, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return '';
  } catch (error) {
    return String(error.stderr ?? error.message);
  }
}

test('every standard-library Go example compiles, and every good one vets clean', () => {
  const minor = toolchainMinor();
  const blocks = goBlocks();
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'skill-golang-blocks-'));
  const gated = [];
  const external = [];
  const built = [];
  const vetted = [];
  try {
    writeFileSync(path.join(scratch, 'go.mod'), `module example\n\ngo 1.${minor}\n`);
    for (const block of blocks) {
      const skip = skipReason(block, minor);
      if (skip === 'gated') {
        gated.push(block.label);
        continue;
      }
      if (skip !== null) {
        external.push(`${block.label} ${skip}`);
        continue;
      }
      const dir = path.join(scratch, `${block.area}__${block.ruleId}__${block.index}`);
      mkdirSync(dir);
      writeFileSync(path.join(dir, 'example.go'), asFile(block.code));
      built.push(block.label);
      if (block.marker.startsWith('**Good')) {
        vetted.push(`./${path.basename(dir)}`);
      }
    }
    assert.ok(built.length > 0, 'no example was compiled');
    const context = [
      `toolchain go1.${minor}: compiled ${built.length}, vetted ${vetted.length}`,
      `gated and unexecuted: ${gated.join(', ') || 'none'}`,
      `external-import and unexecuted: ${external.join(', ') || 'none'}`,
      'each failing path is <area>__<rule-id>__<block-index>/example.go',
    ].join('\n');
    assert.equal(run('go', ['build', './...'], scratch), '', context);
    assert.equal(run('go', ['vet', ...vetted], scratch), '', context);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('every unexecuted Go example is named, never silently skipped', () => {
  const minor = toolchainMinor();
  const blocks = goBlocks();
  const gated = [];
  const external = [];
  for (const block of blocks) {
    const skip = skipReason(block, minor);
    if (skip === 'gated') {
      gated.push(block.label);
    } else if (skip !== null) {
      external.push(`${block.label} ${skip}`);
    }
  }
  const executed = blocks.length - gated.length - external.length;
  assert.ok(
    executed > 0,
    `nothing was executed: ${gated.length} gated, ${external.length} external, ${blocks.length} total`,
  );
  console.log(
    `toolchain go1.${minor}: ${executed} of ${blocks.length} Go examples compiled\n` +
      `gated on a newer release and unexecuted: ${gated.join(', ') || 'none'}\n` +
      `external-import and unexecuted: ${external.join(', ') || 'none'}`,
  );
});

test('every rule gated on Go 1.26 tells the reader what to do on 1.25', () => {
  const silent = allSections()
    .filter((section) => section.since === '1.26')
    .filter((section) => !section.text.includes('1.25'))
    .map((section) => `${section.area}.md#${section.id}`);
  const gatedCount = allSections().filter((section) => section.since === '1.26').length;
  assert.ok(gatedCount > 0, 'no rule is gated on 1.26, so this check proves nothing');
  assert.deepEqual(silent, [], `${gatedCount} rules are gated on Go 1.26`);
});
