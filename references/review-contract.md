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
text the reviewer actually read. If no tag has been pushed for that version, fall back to
`blob/main` and say in the report that the reference is unpinned.

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

Then, always, an explicit list of what was **not** reviewed: files skipped, generated code, vendored
code, test fixtures, anything the diff touched that you did not open.

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
| `findings.json` | when there is at least one finding | `severity`, `file`, `line`, `ruleId`, `url`, `problem`, `fix` |
| `reviewed-files.txt` | when more than one file was read | One path per line |
| `not-reviewed.md` | when anything was skipped | What was skipped and why |

The last line of the report prints the absolute run directory, so the reader can find it again.
