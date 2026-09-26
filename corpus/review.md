---
id: review
area: review
subject: [process]
updated: '2026-10-01'
rules: 3
---

# Review

What a review of Go code produces. The shape of a single finding, the order the reviewer reads in,
and the link that lets the author check the rule for themselves.

## review-finding-contract

- priority: P0
- atom_type: decision

**Rule.** Every finding carries five fields, in this order: severity, the file and the line inside
it, a link to the rule, what is wrong, and the fix. The severity ladder has four rungs. **blocker** —
a defect ships, or a P0 rule is broken. **major** — a P1 rule is broken. **minor** — a P2 rule is
broken. **nit** — a style preference with no rule behind it, and the word nit is written on it. Close
the report with one verdict — pass, pass with required fixes, or do not merge — and then an explicit
list of what you did not review.

**Why.** An author acts on a finding or ignores it, and the five fields are what make acting
possible: where to look, why it matters, and what to type instead. Drop the fix and the author has to
rediscover it. Drop the severity and every finding looks equally urgent, so the author argues about
the nit and ships the blocker. Labelling a nit as a nit is what keeps the other three rungs
believable. The not-reviewed list is the one part authors never ask for and always need, because a
silent review reads as approval of everything, including the files you never opened.

The file and the line are the one place in this skill where a line number is correct. It points at
the code under review, which the author has open in front of them, not at this corpus, which moves
under a reader every time a rule is edited.

**Good**

```text
<severity> · <path>:<line> · <rule link> · <what is wrong> · <the fix>

blocker · internal/billing/store.go:<line> ·
  https://github.com/ctxr-dev/skill-golang/blob/v1.0/corpus/security.md#parameterized-sql ·
  the customer filter is concatenated into the SQL string, so a quote in a customer name changes the query ·
  pass the filter as a bind parameter to QueryContext and leave the statement a constant

minor · internal/billing/store.go:<line> ·
  https://github.com/ctxr-dev/skill-golang/blob/v1.0/corpus/style.md#left-aligned-happy-path ·
  the success path is nested three deep inside error checks ·
  return early on each error and leave the success path at the left margin

verdict: do not merge

not reviewed:
  the generated protobuf package, because it is machine-written
  everything under testdata
  the migration SQL, because nobody on this review reads that dialect
```

`<path>` and `<line>` are the file in the repository under review and the line inside it. The author
reads them in their editor, so they stay exact.

**Bad**

```text
There are some issues with error handling and the SQL looks risky.
Also the naming could be better in places. Overall looks fine to me.
```

**Caught by.** Review of the review, plus this skill's own verification: it runs a review against a
fixture holding four named defects and checks that every finding matches a named defect, that the
SQL one is a blocker, that the verdict is do not merge, and that a not-reviewed list is present. A
report of four unrelated nits fails that check.

**Sources.** https://go.dev/wiki/CodeReviewComments and
https://google.github.io/styleguide/go/decisions

## review-scope-and-order

- priority: P1
- atom_type: decision

**Rule.** Read in this order: safety and correctness, then concurrency, then errors, then tests, then
style. A blocker found early never stops the pass — finish the whole diff and report everything you
found. Write the report into a run directory under `~/.skill-golang/`, dated and timed, and never
into the repository under review. The reviewer edits nothing, as `rule:write-and-review-modes`
requires.

**Why.** The order puts the findings that change the merge decision in front of the ones that change
taste, so an author who reads only the first half still reads the part that matters. Stopping at the
first blocker is the expensive habit: the author fixes one thing, pushes, waits, and learns about the
second blocker on the next round, which turns one review into four. Writing the report into the
repository under review is worse than untidy — it lands in the author's working tree, shows up in
their next commit, and makes the reviewer a co-author of the change they were meant to judge.

**Good**

```text
order: safety and correctness -> concurrency -> errors -> tests -> style
first blocker found in the first file: keep reading, report all of it
report:  ~/.skill-golang/2026-10-01/14-22-07/pr-481-billing-retries/report.md
also:    findings.json, reviewed-files.txt, not-reviewed.md
repository under review: unchanged, nothing added and nothing edited
```

**Bad**

```text
first blocker found -> stop, report one finding, ask for a new review
report written to REVIEW.md in the repository root
style findings reported first because they were easiest to spot
```

**Caught by.** Nothing automated reads the order. This skill's own verification checks the two
observable parts: the run directory exists under the home directory and holds the report, and the
repository under review has no new or modified file after the review ran.

**Sources.** https://google.github.io/styleguide/go/ and https://go.dev/wiki/CodeReviewComments

## review-cites-the-rule

- priority: P1
- atom_type: decision

**Rule.** Every finding links to the rule that justifies it, at this skill's own version tag:
`<homepage>/blob/v<version>/corpus/<area>.md#<rule-id>`, where `<version>` is the `metadata.version`
in `SKILL.md`. With no tag pushed, link `blob/main` and say in the report that the ref is unpinned. A
finding with no rule behind it is a nit, and it says so in the same line.

**Why.** The version tag is the only ref that provably matches the text the reviewer read. The skills
installer records a folder hash, not a commit, so nothing else in the install pins what was loaded.
A link to `main` rots quietly: the rule gets edited, the report stays on disk, and an author who
follows the link months later reads advice that was never given. The nit label does the other half of
the job. A finding with a rule behind it is a standard; a finding with none is one reviewer's taste,
and saying which is which is what buys the author's trust in the rest of the report.

**Good**

```text
major · internal/api/client.go:<line> ·
  https://github.com/ctxr-dev/skill-golang/blob/v1.0/corpus/api.md#http-client-is-stateless ·
  a new http.Client is built inside each request, so no connection is ever reused ·
  build one client at startup and pass it to the handler

nit · internal/api/client.go:<line> ·
  no rule behind this, it is a preference ·
  parseAddr reads better next to dialTimeout, which is its only caller ·
  move parseAddr directly above dialTimeout
```

**Bad**

```text
major · internal/api/client.go:<line> · see the Go corpus · reuse the client
minor · internal/api/client.go:<line> · this is just how we do it here · rename the field
```

**Caught by.** Review of the review: the reviewer opens one link from the report and checks it lands
on the rule the finding claims. This skill's own check proves every rule id in the corpus resolves to
a heading, so a link built from a real rule id cannot dangle, and a link built from an invented one
is the failure this check is looking for.

**Sources.** https://github.com/ctxr-dev/skill-golang and
https://google.github.io/styleguide/go/best-practices
