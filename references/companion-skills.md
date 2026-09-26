# Companion skills

Two skills change how this one behaves. Detect them once per repository, tell the user what is
missing, and carry on either way. Neither is a blocker.

| Skill | What it does | Why it matters here |
|---|---|---|
| `no-comments` | Bans every comment on a line you add or change, in every language | This skill requires a doc comment on exported Go API and bans every other comment. `no-comments` enforces the second half everywhere, not just in Go |
| `simple-language` | Writes human-facing text in plain words | Findings, explanations and doc comments all get easier to read |

Homes: `https://github.com/ctxr-dev/no-comments` and `https://github.com/ctxr-dev/simple-language`.

## Detection

Three states per companion: **active**, **skill-only**, **absent**. Run these steps in order and stop
at the first that settles the answer.

1. **Read `~/.agents/.skill-lock.json`.** It is the installer's own record. Each entry holds
   `source`, `sourceType`, `sourceUrl`, `skillPath`, `skillFolderHash`, `installedAt` and
   `updatedAt`. No entry for the companion means it was not installed by the skills CLI.
2. **Open the `skillPath` the lockfile names.** The `SKILL.md` there must exist and be non-empty. If
   it is missing or empty, report **absent**, whatever the lockfile said.
3. **Look for the rule.** Check, in order, `~/.claude/rules/`, `~/.omp/agent/rules/`,
   `~/.agents/rules/`, `.cursor/rules/`, `.windsurf/rules/`, and the skill folder's own `rules/`.
   The file must have a **non-empty body below its frontmatter**. Frontmatter alone is not a rule.
4. **Decide.** Skill body and rule body → **active**. Skill body, no rule body → **skill-only**.
   Neither → **absent**.

### Why step 3 checks for a body

The documented rule install is a shell redirect:

```bash
{ printf '---\nalwaysApply: true\n---\n\n'; curl -fsSL "$url"; } > "$dest"
```

The redirect truncates `$dest` before `curl` runs, and `curl -f` writes nothing on an HTTP error. A
soft failure therefore leaves a file holding frontmatter and no rule. The path exists, the session
has no rule, and a check that stops at "the file is there" reports it as live.

### Why a directory is never evidence

On a machine checked for this, `~/.claude/skills/no-comments` and `~/.claude/skills/simple-language`
were both empty directories, while `~/.agents/skills/simple-language` held 34 files. Presence of a
directory says nothing.

### Why the README is never a detection signal

A public README returns 200 to everyone. It says nothing about this machine. Fetch it only on the
prompt path below, and only to get current install instructions.

## Telling the user

Prompt **only** when all of these hold:

- a question or ask tool is in the active tool list, and
- this agent is not a sub-agent, and
- the run is not a CI job and not headless.

Otherwise record the result and move on silently.

When the gate is open and a companion is absent or skill-only:

1. Fetch `https://raw.githubusercontent.com/ctxr-dev/<name>/main/README.md` for current install
   instructions. On failure, name the two repository URLs and say live instructions could not be
   fetched.
2. Render a block styled for the client: ANSI on a TTY; markdown with `\textcolor` and `\colorbox`
   in a client that renders markdown; plain markdown otherwise. Install commands are fenced bash in
   all three.
3. The block shows, for the detected client only: the `npx skills add` line per missing companion,
   the rule-install block for that client, and both repository URLs.
4. Ask one question: installed both / installed one / skipped. Work continues on any answer,
   including none.

## Where the answer is kept

```
~/.skill-golang/onboarding/<repo-normalized-path>/onboarding.json
```

One directory per repository, created with `mkdir -p`. **Nothing is ever written inside the
repository being worked on**, so no `.gitignore` entry is needed and this skill never edits a
`.gitignore` it does not own.

`<repo-normalized-path>` is the repository root's absolute path with the leading `/` dropped and
every remaining `/` replaced by `-`. `/Users/dev/projects/billing` becomes
`Users-dev-projects-billing`. The repository root is `git rev-parse --show-toplevel`; outside a git
repository, use the working directory and record it the same way.

Two different paths can normalise to one name — `/a/b-c` and `/a-b/c` both give `a-b-c` — so the file
records the exact path in `repoPath`. On read, a `repoPath` that does not equal the current
repository root is a miss, and the file is overwritten.

```json
{
  "version": 1,
  "repoPath": "/Users/dev/projects/billing",
  "checkedAt": "2026-10-01T12:00:00Z",
  "ttlDays": 7,
  "companions": {
    "no-comments": {
      "state": "active",
      "whatItIsFor": "Bans every comment on a line you add or change, except Go doc comments on exported API and machine-read directives.",
      "whyItMattersHere": "This skill requires doc comments on exported Go API and bans every other comment. no-comments enforces the second half in every language.",
      "whereToGetIt": "https://github.com/ctxr-dev/no-comments",
      "installCommand": "npx skills add ctxr-dev/no-comments",
      "ruleInstall": "the block for the detected client, verbatim",
      "observedAt": "2026-10-01T12:00:00Z",
      "evidence": {
        "lockfileEntry": "~/.agents/.skill-lock.json",
        "skillPath": "~/.agents/skills/no-comments/SKILL.md",
        "rulePath": "~/.claude/rules/no-comments.md",
        "ruleBodyBytes": 3110
      }
    },
    "simple-language": {
      "state": "absent",
      "whatItIsFor": "Writes every message a person reads in plain words, without dropping a number, a caveat or a technical term.",
      "whyItMattersHere": "Review findings and doc comments are read by people in a hurry.",
      "whereToGetIt": "https://github.com/ctxr-dev/simple-language",
      "installCommand": "npx skills add ctxr-dev/simple-language",
      "ruleInstall": "the block for the detected client, verbatim",
      "observedAt": "2026-10-01T12:00:00Z",
      "evidence": {
        "lockfileEntry": null,
        "skillPath": null,
        "rulePath": null,
        "ruleBodyBytes": 0
      }
    }
  }
}
```

Past `ttlDays`, detect again rather than trusting the cache. A companion uninstalled since the last
run must stop being reported as active.

## What changes when they are active

- **`no-comments` active** → apply it to Go, with the one exception this skill declares: doc comments
  on exported identifiers and packages stay. See `corpus/docs.md`.
- **`simple-language` active** → write at its level 2 everywhere, including doc comments. That
  deliberately overrides two of that skill's own rules, and `corpus/docs.md` says so. A doc comment
  still opens with the symbol's own name.
