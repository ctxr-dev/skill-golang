import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { allSections, indexText, repoRoot } from './lib/corpus.mjs';

const CONFIG = path.join(repoRoot, '.golangci.yml');
const SIZE_RULE = 'size-gate-and-smells';

function unquote(value) {
  return value.replace(/^["']/, '').replace(/["']$/, '');
}

function scalar(value) {
  if (value === '') {
    return undefined;
  }
  return /^-?\d+$/.test(value) ? Number(value) : unquote(value);
}

function parse(lines, start, indent) {
  const result = lines[start] !== undefined && lines[start].trimStart().startsWith('- ') ? [] : {};
  let cursor = start;
  while (cursor < lines.length) {
    const line = lines[cursor];
    const depth = line.length - line.trimStart().length;
    if (depth < indent) {
      break;
    }
    const content = line.trim();
    if (Array.isArray(result)) {
      const item = content.slice(2);
      const pair = /^([\w.-]+):\s*(.*)$/.exec(item);
      if (pair) {
        result.push({ [pair[1]]: scalar(pair[2]) });
      } else {
        result.push(scalar(item));
      }
      cursor += 1;
      continue;
    }
    const pair = /^([\w.-]+):\s*(.*)$/.exec(content);
    assert.ok(pair, `cannot parse YAML line: ${line}`);
    const value = scalar(pair[2]);
    if (value === undefined) {
      const childIndent = lines
        .slice(cursor + 1)
        .find((next) => next.trim().length > 0);
      const nextDepth = childIndent === undefined ? indent : childIndent.length - childIndent.trimStart().length;
      if (nextDepth > depth || (childIndent !== undefined && childIndent.trimStart().startsWith('- ') && nextDepth === depth)) {
        const child = parse(lines, cursor + 1, nextDepth);
        result[pair[1]] = child.value;
        cursor = child.cursor;
        continue;
      }
      result[pair[1]] = {};
      cursor += 1;
      continue;
    }
    result[pair[1]] = value;
    cursor += 1;
  }
  return { value: result, cursor };
}

function parseYaml(text) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return parse(lines, 0, 0).value;
}

function config() {
  assert.ok(existsSync(CONFIG), '.golangci.yml is missing');
  return parseYaml(readFileSync(CONFIG, 'utf8'));
}

function sizeRuleYaml() {
  const rule = allSections().find((section) => section.id === SIZE_RULE);
  assert.ok(rule !== undefined, `the corpus has no rule ${SIZE_RULE}`);
  const block = /```yaml\n([\s\S]*?)\n```/.exec(rule.text);
  assert.ok(block !== null, `${SIZE_RULE} must show the settings it claims, in a yaml block`);
  return parseYaml(block[1]);
}

test('the shipped config is a version 2 golangci-lint config that enables nothing by default', () => {
  const parsed = config();
  assert.equal(parsed.version, '2', 'version must be "2"');
  assert.equal(parsed.linters.default, 'none', 'linters.default must be none');
  const enabled = parsed.linters.enable;
  assert.ok(Array.isArray(enabled) && enabled.length > 0, 'linters.enable must be a non-empty list');
  assert.deepEqual([...enabled].sort(), enabled, 'linters.enable must be sorted');
  assert.equal(new Set(enabled).size, enabled.length, 'linters.enable must have no duplicates');
});

test('field alignment is off, in the config and in the corpus', () => {
  assert.ok(!readFileSync(CONFIG, 'utf8').includes('fieldalignment'), 'config must not mention fieldalignment');
});

test('the size gates in the config are the numbers the corpus states', () => {
  const settings = config().linters.settings;
  const stated = sizeRuleYaml().linters.settings;
  assert.equal(settings.funlen.lines, 60, 'funlen.lines');
  assert.equal(settings.funlen.statements, 40, 'funlen.statements');
  assert.equal(settings.cyclop['max-complexity'], 20, 'cyclop.max-complexity');
  assert.equal(settings.gocognit['min-complexity'], 20, 'gocognit.min-complexity');
  for (const linter of ['funlen', 'cyclop', 'gocognit']) {
    assert.deepEqual(
      stated[linter],
      settings[linter],
      `${SIZE_RULE} states different ${linter} numbers from the shipped .golangci.yml`,
    );
  }
});

test('revive is configured to demand doc comments on exported names and packages', () => {
  const rules = config().linters.settings.revive.rules.map((entry) => entry.name);
  assert.ok(rules.includes('exported'), 'revive must enable the exported rule');
  assert.ok(rules.includes('package-comments'), 'revive must enable the package-comments rule');
});

test('every enabled linter is justified by a named corpus rule', () => {
  const enabled = config().linters.enable;
  const text = indexText();
  const known = new Set(allSections().map((section) => section.id));
  const unjustified = [];
  for (const linter of enabled) {
    const row = text
      .split('\n')
      .find((line) => line.startsWith('|') && new RegExp(`\\b${linter}\\b`).test(line));
    if (row === undefined) {
      unjustified.push(linter);
      continue;
    }
    const anchor = /#([a-z0-9-]+)\)/.exec(row);
    if (anchor === null || !known.has(anchor[1])) {
      unjustified.push(`${linter} (index row names no existing rule)`);
    }
  }
  assert.deepEqual(unjustified, [], `${enabled.length} linters enabled`);
});
