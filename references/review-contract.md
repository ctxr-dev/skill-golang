# Review contract

Review mode produces a report. It never edits the code under review.

## A finding

```
<severity> · <path and line in the reviewed repo> · <rule link>
What is wrong: <one or two sentences>
Fix: <the change, concretely>
```

The line number here points at the code being reviewed, which is the one place a line number is
correct. Never put one in a link to this corpus.

## Severity

| Severity | When |
|---|---|
| blocker | A defect ships, or a P0 rule is violated |
| major | A P1 rule is violated |
| minor | A P2 rule is violated |
| nit | A style preference with no rule behind it. It must be labelled a nit |

A finding with no rule behind it is a nit. Say so rather than dressing it up.

## The rule link

```
https://github.com/ctxr-dev/skill-golang/blob/v<metadata.version>/corpus/<area>.md#<rule-id>
```

`<metadata.version>` is read from this skill's own `SKILL.md` frontmatter, so the link points at the
text the reviewer actually read.

Confirm the tag exists before you write the report:

```bash
git ls-remote --tags https://github.com/ctxr-dev/skill-golang refs/tags/v<version>
```

Nothing printed means no such tag: link `blob/main` instead and say in the report that the reference
is unpinned. No network means the version link stands, and the report carries one line saying the
tag was not confirmed.

Never link to a line. The skills installer records a folder hash, not a commit, and the report
persists on disk where a line number would rot.

## Order

Safety and correctness, then concurrency, then errors, then tests, then style. A blocker found early
never stops the pass — finish the file.

## The verdict

One of:

- **pass**
- **pass with required fixes** — list them
- **do not merge** — list the blockers

Count waived findings separately from fixed ones, so the two never read the same:
*"do not merge: 2 blockers, 1 waived"*.

Then, always, an explicit list of what was **not** reviewed: files skipped, generated code, vendored
code, test fixtures, anything the diff touched that you did not open.

## Disposition

Each finding carries one:

| Disposition | Meaning |
|---|---|
| open | Nobody has answered it |
| fixed | The code changed |
| waived | A rung above the corpus made it impossible, and the reviewer cannot overturn that |

A waived finding keeps its real severity and adds two fields: **who waived it** and **the exact
instruction**, quoted. "Six files, no more" is a waiver. "We will do it later" is not, and that one
stays open.

Without this, a required fix that will never be made and a finding that was answered look identical
in the report, and a reader cannot tell which findings are still live.

## Where the report goes

```
~/.skill-golang/<yyyy-mm-dd>/<hh-mm-ss>/<title-or-task-id>/
```

Created with `mkdir -p`. Never inside the repository under review.

`<title-or-task-id>` is a kebab-case slug of whatever identifies the work: a branch name, a pull
request number, an issue key, or the request itself.

| File | Always? | Holds |
|---|---|---|
| `report.md` | yes | The findings, the verdict, the not-reviewed list |
| `findings.json` | when there is at least one finding | `severity`, `disposition`, `file`, `line`, `ruleId`, `url`, `problem`, `fix`, and `waivedBy` plus `waiver` when waived |
| `reviewed-files.txt` | when more than one file was read | One path per line |
| `not-reviewed.md` | when anything was skipped | What was skipped and why |

The last line of the report prints the absolute run directory, so the reader can find it again.
