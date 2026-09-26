---
id: tooling
area: tooling
subject: [tooling]
updated: '2026-10-01'
rules: 4
---

# Tooling

The tools that check Go code outside the compiler, and the gates a change passes before it merges.
Which linters run, who is allowed to rewrite your source, and what the pipeline must fail on.

## golangci-lint-baseline

- priority: P1
- atom_type: decision

**Rule.** Ship a `.golangci.yml` at `version: "2"` that sets `linters.default: none` and enables
exactly eleven linters: `bodyclose`, `contextcheck`, `cyclop`, `errcheck`, `funlen`, `gocognit`,
`govet`, `ineffassign`, `revive`, `staticcheck`, `unused`. Every one of them enforces a named rule in
this corpus, and `references/corpus-index.md` records which. A repository that already has its own
config wins; this list is the starting point for a repository that has none. `fieldalignment` stays
off, because it reorders struct fields for packing and fights
`rule:struct-field-order-readability-first`.

**Why.** `default: none` turns the list into a decision somebody made, instead of whatever the tool
shipped with this month. The eleven are not a taste: each one reports a defect this corpus already
calls a defect, so a finding comes with a rule the author can read and argue with. The converse is
the real cost of a big list. A linter nobody can justify produces findings nobody acts on, the team
learns to add suppressions, and the suppressions then hide the findings that mattered. Enable a
twelfth only after you can name the rule it enforces.

**Good**

```yaml
version: "2"
linters:
  default: none
  enable:
    - bodyclose
    - contextcheck
    - cyclop
    - errcheck
    - funlen
    - gocognit
    - govet
    - ineffassign
    - revive
    - staticcheck
    - unused
```

**Bad**

```yaml
version: "2"
linters:
  default: all
  disable:
    - depguard
    - exhaustruct
    - wsl
```

**Caught by.** `golangci-lint config verify`, which checks the file against the published JSON
schema and rejects a config that is not valid version 2. A missing config is caught by review
instead, because `golangci-lint run` quietly falls back to its own defaults and reports nothing.
This skill's own check reconciles the enabled list against the corpus index, so a linter enabled
with no rule behind it is named and the check fails.

**Sources.** https://golangci-lint.run/docs/configuration/file/ and
https://golangci-lint.run/docs/linters/configuration/

## go-fix-is-a-reviewed-local-step

- priority: P1
- atom_type: decision

**Rule.** Run `go fix ./...` yourself, read the diff it produced, run the tests, and commit it as a
change of its own. CI may run `go fix -diff ./...` and fail the build when the output is not empty.
CI never commits what `go fix` produced. This needs Go 1.26, where `go fix` became the home of the
modernizers. On Go 1.25 `go fix` is a different, obsolete command that only applies pre-modules
rewrites, so running it there does nothing you want.

**Why.** `go fix` rewrites your source. The rewrites are mechanical and the Go team states they
should not change behaviour, but "should not" is a claim about the tool, not about your code, and the
only person who can check it against your code is you. A rewrite that lands straight from CI is a
change no human read, mixed into a commit that was about something else, which is also the hardest
kind of change to bisect later. Keeping it local and separate costs one commit and buys a diff
anybody can review. The rewritten command runs on the same analysis framework as `go vet` and applies
`//go:fix inline` directives, so its reach is the whole module, not a file you picked.

**Good**

You run it on your own checkout, read the diff it produced, and prove the tests still pass.

```bash
go fix ./...
go test -race -count=1 ./...
```

CI checks the same thing without writing to any source, and fails when the output is not empty.

```bash
go fix -diff ./...
```

**Bad**

CI applies the rewrite to its own checkout and publishes the result, so nobody read the change.

```bash
go fix ./...
```

**Caught by.** Review: the reviewer looks for a commit whose diff is a mechanical rewrite mixed in
with hand-written changes, and for a CI step that writes to the repository. The race-detector test
run in `rule:ci-gates` catches the rare rewrite that did change behaviour, which is why the tests
run before the commit and not after it.

**Sources.** https://go.dev/doc/go1.26 and https://pkg.go.dev/cmd/go

## gopls-for-renames-and-references

- priority: P1
- atom_type: feedback-rule

**Rule.** Rename symbols and find their uses through `gopls`, not through text search. Your editor's
rename command calls it; from a shell, `gopls rename -w` and `gopls references` do the same work.
Reach for a text search only to check what the rename left behind.

**Why.** A text rename edits every match of a string, which is both too much and too little. Too
much: it hits the same word inside string literals, doc comments, test fixtures and unrelated
packages that happen to use it. Too little: it misses the places where the name is implied rather
than written, such as a method set that satisfies an interface somewhere else. `gopls` resolves the
symbol through the type graph, so it renames one symbol and every reference to it, and it refuses the
rename when the result would not compile. One thing neither tool changes is a struct tag: the tag
holds the wire name as a string, so a renamed field keeps its old JSON name until you edit the tag
yourself.

**Good**

```bash
gopls rename -w <path>:<line>:<col> SettleInvoice
gopls references <path>:<line>:<col>
gopls implementation <path>:<line>:<col>
```

**Bad**

```bash
grep -rl Settle . | xargs sed -i '' 's/Settle/SettleInvoice/g'
```

**Caught by.** The compiler catches a rename that breaks a reference it can see, including a type
that stops satisfying an interface at the point it is assigned to one. It cannot catch the two that
bite: a struct tag still carrying the old wire name, and the old name left behind in a string, a doc
comment or a golden file. `go test -race -count=1 ./...` catches the tag whenever a round-trip test
exists. Otherwise review, and the reviewer searches for the old name after the rename and expects
nothing back.

**Sources.** https://pkg.go.dev/golang.org/x/tools/gopls and
https://github.com/golang/tools/blob/master/gopls/doc/features/transformation.md

## ci-gates

- priority: P1
- atom_type: decision

**Rule.** Five commands gate a merge, and a red one blocks it: `go build ./...`, `go vet ./...`,
`go test -race -count=1 ./...`, `golangci-lint run`, `govulncheck ./...`. Write them in that order,
cheapest first, so a broken build reports in seconds instead of after the slowest step. `-count=1` is
what defeats the test cache.

**Why.** Each command catches something no other one does. `go build` catches the code that does not
compile on the pipeline's toolchain rather than on a laptop. `go vet` catches the misuse the compiler
allows, such as a `printf` verb that does not match its argument. The race detector catches
concurrent access that passes every run until production. `golangci-lint run` applies the eleven
linters from `rule:golangci-lint-baseline`. `govulncheck` is the only one that looks outward, at
known vulnerabilities in your dependencies, and it reports only the ones your code actually reaches.
`-count=1` matters because the go command caches a test result and replays it whenever the package's
inputs are unchanged; without the flag, a test that depends on the clock, the network or the
environment can be "passing" on a result from another day. Note also that `go test` already runs a
small subset of vet, which is why the full `go vet ./...` is still a separate step.

**Good**

```bash
go build ./...
go vet ./...
go test -race -count=1 ./...
golangci-lint run
govulncheck ./...
```

**Bad**

```bash
go test ./...
```

**Caught by.** The pipeline is the catcher: these commands are the gate, so a defect they find stops
the merge. A pipeline missing one of them is caught by review, and the reviewer reads the workflow
file for all five commands and for the `-count=1` flag on the test step.

**Sources.** https://go.dev/doc/articles/race_detector , https://go.dev/blog/govulncheck and
https://pkg.go.dev/cmd/go
