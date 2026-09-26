import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const corpusDir = path.join(repoRoot, 'corpus');
export const referencesDir = path.join(repoRoot, 'references');

export const SUBJECTS = [
  'architecture',
  'data',
  'languages',
  'observability',
  'process',
  'security',
  'testing',
  'tooling',
];

export const ATOM_TYPES = [
  'bug-root-cause',
  'decision',
  'feedback-rule',
  'pattern-gotcha',
  'reference',
];

export const PRIORITIES = ['P0', 'P1', 'P2'];

export const INLINE_MARKERS = ['**Rule.**', '**Why.**', '**Caught by.**', '**Sources.**'];
export const BLOCK_MARKERS = ['**Good**'];

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const FRONTMATTER_LINE = /^([a-z_]+):\s*(.*)$/;
const META_LINE = /^- (priority|atom_type|since):\s*(\S+)\s*$/;
const HEADING = /^## (\S+)\s*$/;
const FENCE = /^```/;
const OPEN_FENCE = /^```([a-z]*)\s*$/;
const RULE_REFERENCE = /`rule:([a-z0-9][a-z0-9-]*)`/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

export function rel(absolute) {
  return path.relative(repoRoot, absolute);
}

export function areaFiles() {
  if (!existsSync(corpusDir)) {
    throw new Error(`corpus directory is missing at ${rel(corpusDir)}`);
  }
  const names = readdirSync(corpusDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  if (names.length === 0) {
    throw new Error(`corpus directory holds no .md files at ${rel(corpusDir)}`);
  }
  return names.map((name) => path.join(corpusDir, name));
}

function unquote(value) {
  return value.replace(/^['"]/, '').replace(/['"]$/, '');
}

function parseList(value, file, key) {
  if (!value.startsWith('[') || !value.endsWith(']')) {
    throw new Error(`${rel(file)}: frontmatter ${key} must be a bracketed list, found ${value}`);
  }
  return value
    .slice(1, -1)
    .split(',')
    .map((entry) => unquote(entry.trim()))
    .filter((entry) => entry.length > 0);
}

function parseFrontmatter(text, file) {
  const matched = FRONTMATTER.exec(text);
  if (!matched) {
    throw new Error(`${rel(file)}: no frontmatter block at the top of the file`);
  }
  const data = {};
  for (const line of matched[1].split('\n')) {
    const pair = FRONTMATTER_LINE.exec(line);
    if (!pair) {
      throw new Error(`${rel(file)}: frontmatter line is not "key: value" — ${line}`);
    }
    data[pair[1]] = pair[2].trim();
  }
  return { data, body: text.slice(matched[0].length), bodyOffset: matched[0].split('\n').length - 1 };
}

function headingLines(lines) {
  const found = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && line.startsWith('## ')) {
      found.push(index);
    }
  });
  return found;
}

function markerBody(sectionText, marker) {
  const at = sectionText.indexOf(marker);
  if (at === -1) {
    return null;
  }
  const rest = sectionText.slice(at + marker.length);
  const next = [...INLINE_MARKERS, ...BLOCK_MARKERS, '**Bad**']
    .map((other) => rest.indexOf(other))
    .filter((index) => index !== -1)
    .sort((left, right) => left - right)[0];
  return (next === undefined ? rest : rest.slice(0, next)).trim();
}

function fencesIn(sectionText) {
  const lines = sectionText.split('\n');
  const blocks = [];
  let current = null;
  let marker = '';
  for (const line of lines) {
    const heading = /^\*\*(Good[^*]*|Bad[^*]*)\*\*$/.exec(line.trim());
    if (current === null && heading) {
      marker = `**${heading[1]}**`;
    }
    const opening = OPEN_FENCE.exec(line);
    if (current === null && opening) {
      current = { lang: opening[1] ?? '', marker, code: [] };
      continue;
    }
    if (current !== null && FENCE.test(line)) {
      blocks.push({ lang: current.lang, marker: current.marker, code: current.code.join('\n') });
      current = null;
      continue;
    }
    if (current !== null) {
      current.code.push(line);
    }
  }
  if (current !== null) {
    throw new Error('unclosed code fence');
  }
  return blocks;
}

function parseSection(file, areaId, lines, start, end) {
  const heading = HEADING.exec(lines[start]);
  if (!heading) {
    throw new Error(`${rel(file)}: heading is not "## <rule-id>" — ${lines[start]}`);
  }
  const id = heading[1];
  const text = lines.slice(start + 1, end).join('\n');
  const meta = {};
  for (const line of text.split('\n')) {
    const pair = META_LINE.exec(line);
    if (pair) {
      meta[pair[1]] = pair[2];
    }
  }
  let fences;
  try {
    fences = fencesIn(text);
  } catch {
    throw new Error(`${rel(file)}#${id}: unclosed code fence`);
  }
  const references = [...text.matchAll(RULE_REFERENCE)].map((match) => match[1]);
  return {
    id,
    file,
    area: areaId,
    priority: meta.priority,
    atomType: meta.atom_type,
    since: meta.since,
    text,
    fences,
    goBlocks: fences.filter((fence) => fence.lang === 'go').map((fence) => fence.code),
    references,
    markers: Object.fromEntries(
      [...INLINE_MARKERS, ...BLOCK_MARKERS, '**Bad**'].map((marker) => [marker, markerBody(text, marker)]),
    ),
  };
}

export function parseArea(file) {
  const raw = readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(raw, file);
  const lines = body.split('\n');
  const starts = headingLines(lines);
  if (starts.length === 0) {
    throw new Error(`${rel(file)}: no "## <rule-id>" sections`);
  }
  const sections = starts.map((start, index) =>
    parseSection(file, data.id, lines, start, index + 1 < starts.length ? starts[index + 1] : lines.length),
  );
  return {
    file,
    stem: path.basename(file, '.md'),
    id: data.id,
    area: data.area,
    subject: data.subject === undefined ? undefined : parseList(data.subject, file, 'subject'),
    updated: data.updated === undefined ? undefined : unquote(data.updated),
    rules: data.rules === undefined ? undefined : Number(data.rules),
    frontmatterKeys: Object.keys(data),
    sections,
    raw,
  };
}

export function corpus() {
  return areaFiles().map(parseArea);
}

export function allSections() {
  return corpus().flatMap((area) => area.sections);
}

export function goBlocks() {
  return allSections().flatMap((section) =>
    section.fences
      .filter((fence) => fence.lang === 'go')
      .map((fence, index) => ({
        area: section.area,
        ruleId: section.id,
        file: section.file,
        index,
        since: section.since,
        marker: fence.marker,
        code: fence.code,
        label: `${section.area}.md#${section.id}[${index}]`,
      })),
  );
}

export function indexRows() {
  const file = path.join(referencesDir, 'corpus-index.md');
  if (!existsSync(file)) {
    throw new Error(`index is missing at ${rel(file)}`);
  }
  const raw = readFileSync(file, 'utf8');
  return [...raw.matchAll(MARKDOWN_LINK)]
    .map((match) => ({ label: match[1], target: match[2] }))
    .filter((link) => link.target.includes('/corpus/') && link.target.includes('#'))
    .map((link) => {
      const [relativePath, anchor] = link.target.split('#');
      return {
        label: link.label,
        anchor,
        path: path.resolve(referencesDir, relativePath),
        raw,
      };
    });
}

export function indexText() {
  const file = path.join(referencesDir, 'corpus-index.md');
  if (!existsSync(file)) {
    throw new Error(`index is missing at ${rel(file)}`);
  }
  return readFileSync(file, 'utf8');
}

export function prosePaths() {
  const required = [corpusDir, referencesDir, path.join(repoRoot, 'rules')];
  const files = [];
  for (const root of required) {
    if (!existsSync(root)) {
      throw new Error(`shipped prose directory is missing at ${rel(root)}`);
    }
    const names = readdirSync(root).filter((name) => name.endsWith('.md'));
    if (names.length === 0) {
      throw new Error(`shipped prose directory holds no .md files at ${rel(root)}`);
    }
    files.push(...names.map((name) => path.join(root, name)));
  }
  const skill = path.join(repoRoot, 'SKILL.md');
  if (!existsSync(skill)) {
    throw new Error(`SKILL.md is missing at ${rel(skill)}`);
  }
  files.push(skill);
  return files;
}
