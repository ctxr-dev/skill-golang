---
id: onboarding
area: onboarding
subject: [process]
updated: '2026-10-01'
rules: 3
---

# Onboarding

What the agent settles before it touches Go: which companion skills are live, whose standards win,
and which of the two modes it is in.

## companion-skills-handshake

- priority: P0
- atom_type: decision

**Rule.** Once per repository, detect the two companion skills, then carry on whatever the result.
Read the installer's lockfile — `<repo>/skills-lock.json` and `~/.agents/.skill-lock.json`, either
of which can be the only one present — resolve the `skillPath` it names and confirm that `SKILL.md`
is non-empty, then probe every rule location and require a non-empty body below the frontmatter.
Report **active**, **skill-only**, **rule-only** or **absent**. The full procedure, with the
path-resolution shapes and the per-location file names, is in `references/companion-skills.md`.
Neither companion blocks any work.

**Why.** A directory existing proves nothing. The documented rule install is a shell redirect that
truncates the destination before `curl` writes to it, and `curl -f` prints nothing on an HTTP error,
so a soft failure leaves a file holding frontmatter and no rule. Two companion directories on a
machine checked for this were empty. Detection that stops at "the path exists" reports a rule as
live in a session that never loaded it. The fourth state exists because the rule and the skill
install separately: someone can `curl` the rule and never run the installer, and that rule still
binds the session.

**Good**

```text
lockfile names no-comments -> skillPath holds a 13 KB SKILL.md
~/.claude/rules/no-comments.md -> 3110 bytes below the frontmatter
state: active

lockfile names simple-language -> skillPath holds a 38 KB SKILL.md
~/.claude/rules/simple-language.md -> frontmatter only, 0 bytes of body
state: skill-only

lockfile has no entry -> no SKILL.md anywhere
~/.claude/skills/no-comments/ -> directory exists, 0 files
state: absent
```

**Bad**

```text
~/.claude/skills/no-comments/ exists -> state: active
~/.claude/rules/no-comments.md exists -> state: active
```

**Caught by.** Nothing automated. The review of this skill runs the handshake by hand against a temp
root holding an empty skill directory and a rule file with frontmatter and no body, which are the
two false positives seen in the wild, and confirms neither comes back active.

**Sources.** https://github.com/ctxr-dev/no-comments and https://github.com/ctxr-dev/simple-language

## corporate-standards-precedence

- priority: P0
- atom_type: decision

**Rule.** A standard the organisation already has beats this corpus, one topic at a time. Take the
first match on this ladder, and only for the topic it covers: a rule already loaded in this session's
context; a repository instruction file such as `AGENTS.md` or `CLAUDE.md`; a loaded skill that
declares it supersedes Go guidance; a Go standards document in the repository, or its
`.golangci.yml`. Every topic the organisation is silent on falls through to the corpus. Say which
rung applied and to what.

**Why.** Per-topic resolution is what keeps the corpus useful next to a company style guide. A
whole-corpus override discards eighty rules because the organisation wrote one. Rung 0 exists
because an always-on rule injected into the session is invisible to a directory scan, so a ladder
that reads only disk silently loses to text already in front of the agent.

**Good**

```text
AGENTS.md: "Go: every struct field is ordered by decreasing size"
-> field ordering follows AGENTS.md
-> everything else in the same file still follows the corpus
-> the agent says: a repository standard took precedence on field ordering
```

**Bad**

```text
AGENTS.md mentions Go -> skip the corpus entirely
```

**Caught by.** Nothing automated. Verified by hand against one repository whose `AGENTS.md`
contradicts `rule:struct-field-order-readability-first` and one that loads a companion rule with no
`AGENTS.md` at all.

**Sources.** https://agents.md/ and https://github.com/ctxr-dev/skill-golang

## write-and-review-modes

- priority: P0
- atom_type: decision

**Rule.** Decide which of two modes you are in before reading any other rule. **Write mode** produces
Go source and applies the corpus as you type. **Review mode** produces a report and never edits the
code under review. Review output is written to `~/.skill-golang/<yyyy-mm-dd>/<hh-mm-ss>/<slug>/`,
never inside the repository being reviewed.

**Why.** The two modes read the same rules and owe the reader different things. A writer owes working
code. A reviewer owes a finding that names a file, a rule and a fix, and owes an honest list of what
was not looked at. Mixing them produces a review that quietly edits the code, which destroys the
reviewer's only value: an independent second opinion.

**Good**

```text
"add a retry to the HTTP client"            -> write mode
"review this PR"                            -> review mode
"is this concurrency safe?"                 -> review mode, one finding, no edits
"fix the findings you just reported"        -> write mode, new turn
```

**Caught by.** Nothing automated. The review contract in `references/review-contract.md` fixes the
finding shape, and the verification of this skill checks that a review run leaves a report on disk
and the repository under review untouched.

**Sources.** https://github.com/ctxr-dev/skill-golang and https://go.dev/doc/effective_go
