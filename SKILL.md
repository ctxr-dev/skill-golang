---
name: golang
description: "Use whenever you write, change, or review Go. Writing: a new function, a handler, a goroutine, a test, an error type, a package, a go.mod change, anything under *.go. Reviewing: a pull request, a diff, a file, or a question like is this concurrency safe, is this error handling right, should this be an interface. Also use when starting a Go project or restructuring one, to pick a layout and a stack rather than guessing. Carries a corpus of named rules with worked examples, each one traceable to go.dev, Effective Go, Go Code Review Comments, the Google Go Style Guide or the Uber Go Style Guide. Defers to a repository's own Go standards whenever it has them, one topic at a time. Covers naming, error wrapping, panics, nil and slices, goroutine lifetime, channels, context, interfaces, project layout, table-driven tests, SQL and template safety, profiling, structured logging, HTTP and RPC, database access, dependency choice, linters, and Go 1.25 and 1.26 language features."
license: MIT
compatibility: "Any agent or product that reads Markdown skills. Pure prose guidance, no runtime and no network on the common path. It reads ~/.agents/.skill-lock.json and rule directories to detect two companion skills, and writes under ~/.skill-golang/ only. Its own maintenance checks are zero-dependency node:test files and are not needed to use it. The companion always-on rule at rules/golang.md installs separately."
metadata:
  version: "1.0"
  homepage: "https://github.com/ctxr-dev/skill-golang"
  companion-rule: "rules/golang.md"
---

# Go

Guidance for writing Go and for reviewing it, as named rules you can cite.

Knowledge lives in `corpus/<area>.md`. Each rule is one `##` section carrying its priority, the rule,
the reason, a worked example, what catches a violation, and its sources. Open the area you need. Do
not read the corpus end to end.

**This skill never overrides a standard the organisation already has.** It fills the gaps.

## Precedence

First match wins, **for the topic it covers only**. A topic nothing above the corpus covers falls
through to the corpus.

| Rung | Signal |
|---|---|
| 0 | A rule already loaded in this session's context |
| 1 | A repository instruction file: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md` |
| 2 | A loaded skill that declares it supersedes Go guidance |
| 3 | A Go standards document in the repository, or its `.golangci.yml` |
| 4 | This corpus |

Rung 0 exists because an always-on rule injected into your context is invisible to a directory scan.

Say which rung applied and to what. "Field ordering follows `AGENTS.md`; everything else in this file
follows the corpus" is the shape. Never discard the corpus because the organisation wrote one rule.

## Before you start

Run the companion handshake once per repository: `references/companion-skills.md`. It detects
`no-comments` and `simple-language`, reports **active**, **skill-only**, **rule-only** or
**absent**, and tells the user what is missing when a human is there to read it. Neither companion
blocks any work.

The result is kept at `~/.skill-golang/onboarding/<repo-normalized-path>/onboarding.json`. Nothing is
ever written inside the repository you are working on.

## Two modes

**Write mode.** You are producing Go. Apply the corpus as you type. Open the area for what you are
doing, not the whole thing.

**Review mode.** You are producing a report. You do not edit the code under review. The finding
shape, the severity ladder, the rule links and the run directory are all fixed in
`references/review-contract.md`.

| The ask | Mode |
|---|---|
| "add a retry to the client" | write |
| "review this PR" | review |
| "is this concurrency safe?" | review — one finding, no edits |
| "fix what you just found" | write |

## Decision tree

Find what you are doing. Open that file. Jump to that anchor.

### Writing a function

| Question | Rule |
|---|---|
| How do I shape it? | `corpus/style.md#left-aligned-happy-path` |
| Is it too big? | `corpus/style.md#size-gate-and-smells` |
| `var` or `:=`? | `corpus/style.md#declarations-and-literals` |
| What goes in the signature? | `corpus/style.md#function-signatures` |
| What do I call it? | `corpus/naming.md#mixedcaps-and-initialisms` |
| Should it be `GetX`? | `corpus/naming.md#no-get-prefix` |
| What do I call the receiver? | `corpus/naming.md#receiver-and-variable-names` |
| Does it need a doc comment? | `corpus/docs.md#godoc-required-on-exported` |
| Can I explain it in a comment? | `corpus/docs.md#no-other-comments` |

### Handling an error

| Question | Rule |
|---|---|
| Wrap it or log it? | `corpus/errors.md#wrap-or-log-never-both` |
| Sentinel or typed? | `corpus/errors.md#sentinel-vs-typed` |
| What does the string look like? | `corpus/errors.md#error-string-form` |
| Go 1.26 type-safe matching | `corpus/errors.md#errors-as-type` |
| Can I panic? | `corpus/safety.md#panic-policy` |

### Nil, slices, maps, assertions

| Question | Rule |
|---|---|
| Empty slice: nil or `[]T{}`? | `corpus/safety.md#nil-slices-at-the-boundary` |
| Is this map safe? | `corpus/safety.md#map-write-and-concurrent-access` |
| Why did my other slice change? | `corpus/safety.md#append-aliasing` |
| Type assertion | `corpus/safety.md#type-assertion-comma-ok` |
| Can I use `init`? | `corpus/safety.md#avoid-init-and-mutable-globals` |

### Concurrency

| Question | Rule |
|---|---|
| Who stops this goroutine? | `corpus/concurrency.md#goroutine-lifetime-ownership` |
| How big a channel buffer? | `corpus/concurrency.md#channel-buffer-one-or-none` |
| How do I bound fan-out? | `corpus/concurrency.md#bounded-fan-out-errgroup` |
| How do I prove no leak? | `corpus/concurrency.md#goroutine-leak-detection` |
| `WaitGroup` boilerplate | `corpus/concurrency.md#waitgroup-go` |

### Context

| Question | Rule |
|---|---|
| Where does `ctx` go? | `corpus/context.md#context-first-parameter` |
| Cancellation and timeouts | `corpus/context.md#cancellation-propagation` |
| Can I store it in a struct? | `corpus/context.md#no-context-in-structs` |
| Passing values through it | `corpus/context.md#context-values-are-request-scoped` |

### Interfaces and wiring

| Question | Rule |
|---|---|
| Where do I declare the interface? | `corpus/interfaces.md#interfaces-at-the-consumer` |
| What does the constructor return? | `corpus/interfaces.md#accept-interfaces-return-structs` |
| Pointer or value receiver? | `corpus/interfaces.md#pointer-vs-value-receivers` |
| Does it need a constructor at all? | `corpus/interfaces.md#zero-value-usability` |
| Do I need a DI framework? | `corpus/interfaces.md#wiring-hand-first-then-fx` |
| Does this type satisfy that interface? | `corpus/interfaces.md#verify-interface-compliance` |

### Project shape

| Question | Rule |
|---|---|
| Where do files go? | `corpus/layout.md#progressive-module-layout` |
| What do I call the package? | `corpus/layout.md#domain-not-layer-package-names` |
| Should this be exported? | `corpus/layout.md#unexport-aggressively` |
| Which libraries? | `corpus/dependencies.md#stdlib-first-tier-policy` |
| New project | `corpus/dependencies.md#greenfield-stack-offer` |
| `go.mod` and `go.sum` | `corpus/dependencies.md#go-mod-hygiene` |

### Tests

| Question | Rule |
|---|---|
| Test or code first? | `corpus/testing.md#tdd-red-before-green` |
| How do I structure the test? | `corpus/testing.md#table-driven-subtests` |
| Can it run in parallel? | `corpus/testing.md#parallel-when-safe` |
| Fake or generated mock? | `corpus/testing.md#test-doubles-fake-or-mock` |
| Timers and goroutines in a test | `corpus/testing.md#synctest-for-time-and-goroutines` |
| Comparing structs | `corpus/testing.md#go-cmp-for-comparison` |
| What runs in CI? | `corpus/testing.md#race-detector-in-ci` |

### Security

| Question | Rule |
|---|---|
| Building a query | `corpus/security.md#parameterized-sql` |
| Credentials | `corpus/security.md#secrets-never-in-source` |
| Rendering HTML | `corpus/security.md#contextual-escaping-html-template` |
| Reading config | `corpus/security.md#typed-config-validated-at-startup` |
| Known vulnerabilities | `corpus/security.md#vulnerability-scanning` |

### Performance

| Question | Rule |
|---|---|
| Is this worth optimising? | `corpus/performance.md#measure-before-optimising` |
| Preallocating a slice | `corpus/performance.md#slice-capacity-hints` |
| Ordering struct fields | `corpus/performance.md#struct-field-order-readability-first` |
| Writing a benchmark | `corpus/performance.md#benchmarks-with-b-loop` |
| Go 1.26 garbage collector | `corpus/performance.md#green-tea-gc` |

### Running in production

| Question | Rule |
|---|---|
| Which logger? | `corpus/observability.md#slog-is-the-default-logger` |
| What do I log? | `corpus/observability.md#what-to-log-and-at-what-level` |
| Several log destinations | `corpus/observability.md#slog-multihandler` |
| Traces and metrics | `corpus/observability.md#tracing-and-metrics` |
| Which HTTP or RPC stack? | `corpus/api.md#transport-chosen-at-bootstrap` |
| Calling another service | `corpus/api.md#http-client-is-stateless` |
| Serving HTTP | `corpus/api.md#handler-and-server-hygiene` |
| RPC practice | `corpus/api.md#rpc-practices-per-transport` |
| Querying a database | `corpus/data.md#context-aware-queries-and-pooling` |
| Transactions | `corpus/data.md#transaction-and-rollback-discipline` |
| Schema changes | `corpus/data.md#migrations-are-versioned` |

### Tooling and language level

| Question | Rule |
|---|---|
| Linter configuration | `corpus/tooling.md#golangci-lint-baseline` |
| `go fix` | `corpus/tooling.md#go-fix-is-a-reviewed-local-step` |
| Renaming across files | `corpus/tooling.md#gopls-for-renames-and-references` |
| What CI runs | `corpus/tooling.md#ci-gates` |
| Which Go versions | `corpus/modernization.md#version-baseline-two-releases` |
| `slices`, `maps`, `cmp` | `corpus/modernization.md#slices-maps-cmp-packages` |
| `new(expr)` | `corpus/modernization.md#new-expr` |
| Range over int and iterators | `corpus/modernization.md#range-over-int-and-iterators` |

### Reviewing

| Question | Rule |
|---|---|
| What does a finding look like? | `corpus/review.md#review-finding-contract` |
| What do I look at first? | `corpus/review.md#review-scope-and-order` |
| How do I justify a finding? | `corpus/review.md#review-cites-the-rule` |

## The rules that always apply

Seventeen rules are P0. A P0 governs on contradiction.

| Rule | In one line |
|---|---|
| `corpus/onboarding.md#companion-skills-handshake` | Detect the companions once per repository, then carry on either way |
| `corpus/onboarding.md#corporate-standards-precedence` | A standard the organisation has beats this corpus, one topic at a time |
| `corpus/onboarding.md#write-and-review-modes` | Decide which mode you are in before reading anything else |
| `corpus/docs.md#godoc-required-on-exported` | Every exported name and every package gets a doc comment |
| `corpus/docs.md#no-other-comments` | No other comment, in any Go file you touch |
| `corpus/errors.md#wrap-or-log-never-both` | Handle an error once |
| `corpus/safety.md#panic-policy` | Panic only for programmer error, before the process serves traffic |
| `corpus/concurrency.md#goroutine-lifetime-ownership` | Whoever starts a goroutine owns its exit |
| `corpus/interfaces.md#interfaces-at-the-consumer` | The interface belongs to the package that calls it |
| `corpus/layout.md#progressive-module-layout` | Flat, then `internal/`, then `cmd/`. Never `pkg/` |
| `corpus/testing.md#tdd-red-before-green` | The test fails before the code makes it pass |
| `corpus/security.md#parameterized-sql` | Never concatenate input into SQL |
| `corpus/security.md#secrets-never-in-source` | No credential in the repository, the image, or a log line |
| `corpus/performance.md#measure-before-optimising` | No optimisation without a before and after number |
| `corpus/dependencies.md#stdlib-first-tier-policy` | Standard library, then `golang.org/x`, then a stated reason |
| `corpus/modernization.md#version-baseline-two-releases` | Go 1.25 and 1.26; a newer feature carries `since:` and shows the older form |
| `corpus/review.md#review-finding-contract` | Severity, location, rule link, what is wrong, the fix |

## Version baseline

The corpus targets **Go 1.25 and Go 1.26**.

A rule needing the newer release carries `- since: 1.26` under its heading and shows the 1.25 form in
a second `**Good (1.25)**` block. Read the `go` directive in the repository's `go.mod` to know which
form compiles there.

The examples in this corpus were checked against **go1.25.11**. Blocks on a `since: 1.26` rule were
not compiled; they were checked against the Go 1.26 release notes by hand, and each such rule says so.

## What this does not cover

Any language other than Go. CI platform configuration beyond naming the commands to run. Deployment,
container images and orchestration. Product decisions. Where a repository has its own Go standard,
that standard wins on its own topics — see the precedence table.
