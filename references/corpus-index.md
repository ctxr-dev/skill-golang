# Corpus index

Every rule, in one table. This is a convenience, not a required hop: a rule's file is always
`corpus/<area>.md` and its anchor is always its id.

The **Caught by** column names the golangci-lint linter the shipped `.golangci.yml` enables for that
rule, where one exists. Eleven linters are enabled and every one of them appears here.

## onboarding

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [companion-skills-handshake](../corpus/onboarding.md#companion-skills-handshake) | P0 | decision | Detect the two companion skills once per repository | by hand |
| [corporate-standards-precedence](../corpus/onboarding.md#corporate-standards-precedence) | P0 | decision | A standard the organisation has wins, one topic at a time | by hand |
| [write-and-review-modes](../corpus/onboarding.md#write-and-review-modes) | P0 | decision | Decide the mode before reading any other rule | by hand |

## docs

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [godoc-required-on-exported](../corpus/docs.md#godoc-required-on-exported) | P0 | decision | A doc comment on every exported name and package | revive |
| [no-other-comments](../corpus/docs.md#no-other-comments) | P0 | decision | No comment anywhere else; directives are not comments | by hand |
| [godoc-sentence-form](../corpus/docs.md#godoc-sentence-form) | P1 | feedback-rule | Open with the symbol's own name, in a full sentence | by hand |
| [godoc-at-simple-language-level-2](../corpus/docs.md#godoc-at-simple-language-level-2) | P1 | decision | Plain words in doc comments and messages alike | by hand |

## style

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [left-aligned-happy-path](../corpus/style.md#left-aligned-happy-path) | P1 | feedback-rule | Return early; keep the success path at the left margin | by hand |
| [size-gate-and-smells](../corpus/style.md#size-gate-and-smells) | P1 | decision | Numbers gate, three named smells guide | funlen, cyclop, gocognit |
| [declarations-and-literals](../corpus/style.md#declarations-and-literals) | P1 | feedback-rule | `var` for zero, `:=` for initialised, keyed literals | ineffassign |
| [function-signatures](../corpus/style.md#function-signatures) | P1 | feedback-rule | Error last, no naked returns, no behaviour-selecting bool | by hand |

## naming

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [mixedcaps-and-initialisms](../corpus/naming.md#mixedcaps-and-initialisms) | P1 | feedback-rule | MixedCaps, and one case throughout an initialism | revive |
| [no-get-prefix](../corpus/naming.md#no-get-prefix) | P1 | feedback-rule | `Owner()`, not `GetOwner()` | revive |
| [package-names](../corpus/naming.md#package-names) | P1 | feedback-rule | Short, lower case, no `util` or `common` | revive |
| [receiver-and-variable-names](../corpus/naming.md#receiver-and-variable-names) | P1 | feedback-rule | One or two letters, the same on every method | revive |

## errors

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [wrap-or-log-never-both](../corpus/errors.md#wrap-or-log-never-both) | P0 | decision | Handle an error once, not twice | errcheck |
| [sentinel-vs-typed](../corpus/errors.md#sentinel-vs-typed) | P1 | decision | Sentinel for a condition, typed struct for a field | by hand |
| [error-string-form](../corpus/errors.md#error-string-form) | P1 | feedback-rule | Lower case, no trailing punctuation, composes when wrapped | staticcheck |
| [errors-as-type](../corpus/errors.md#errors-as-type) | P2 | reference | Go 1.26 type-safe error matching | the compiler |

## safety

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [panic-policy](../corpus/safety.md#panic-policy) | P0 | decision | Programmer error only, before traffic, never across a boundary | by hand |
| [nil-slices-at-the-boundary](../corpus/safety.md#nil-slices-at-the-boundary) | P1 | decision | A nil slice is a valid empty slice; a nil map is not | by hand |
| [map-write-and-concurrent-access](../corpus/safety.md#map-write-and-concurrent-access) | P1 | pattern-gotcha | Concurrent map writes are fatal, not recoverable | `go test -race` |
| [append-aliasing](../corpus/safety.md#append-aliasing) | P1 | pattern-gotcha | `append` can share the backing array | by hand |
| [type-assertion-comma-ok](../corpus/safety.md#type-assertion-comma-ok) | P1 | feedback-rule | Always the two-value form | staticcheck |
| [avoid-init-and-mutable-globals](../corpus/safety.md#avoid-init-and-mutable-globals) | P1 | feedback-rule | Build state in a constructor and pass it | by hand |

## concurrency

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [goroutine-lifetime-ownership](../corpus/concurrency.md#goroutine-lifetime-ownership) | P0 | decision | Whoever starts it owns its exit; the writer closes the channel | `go test -race` |
| [channel-buffer-one-or-none](../corpus/concurrency.md#channel-buffer-one-or-none) | P1 | decision | Unbuffered, or one, unless the buffer is the limit | by hand |
| [bounded-fan-out-errgroup](../corpus/concurrency.md#bounded-fan-out-errgroup) | P1 | pattern-gotcha | Cap parallelism, capture the first error, cancel siblings | by hand |
| [goroutine-leak-detection](../corpus/concurrency.md#goroutine-leak-detection) | P2 | reference | Fail the test when a goroutine outlives it | by hand |
| [waitgroup-go](../corpus/concurrency.md#waitgroup-go) | P2 | reference | Go 1.25 `wg.Go` replaces Add and Done | by hand |

## context

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [context-first-parameter](../corpus/context.md#context-first-parameter) | P1 | feedback-rule | `ctx` first, taken from the caller | contextcheck |
| [cancellation-propagation](../corpus/context.md#cancellation-propagation) | P1 | pattern-gotcha | Select on `Done`, and always defer the cancel | contextcheck |
| [no-context-in-structs](../corpus/context.md#no-context-in-structs) | P1 | feedback-rule | A context belongs to one call | by hand |
| [context-values-are-request-scoped](../corpus/context.md#context-values-are-request-scoped) | P1 | feedback-rule | Request-scoped data only, under an unexported key type | by hand |

## interfaces

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [interfaces-at-the-consumer](../corpus/interfaces.md#interfaces-at-the-consumer) | P0 | decision | Declared where it is called, one to three methods | by hand |
| [accept-interfaces-return-structs](../corpus/interfaces.md#accept-interfaces-return-structs) | P1 | feedback-rule | Constructors return the concrete type | by hand |
| [pointer-vs-value-receivers](../corpus/interfaces.md#pointer-vs-value-receivers) | P1 | feedback-rule | One kind per type; a copied mutex is a bug | govet |
| [zero-value-usability](../corpus/interfaces.md#zero-value-usability) | P1 | feedback-rule | Make the zero value work | by hand |
| [wiring-hand-first-then-fx](../corpus/interfaces.md#wiring-hand-first-then-fx) | P1 | decision | Hand wiring first; a framework only when it earns itself | by hand |
| [verify-interface-compliance](../corpus/interfaces.md#verify-interface-compliance) | P1 | pattern-gotcha | Assert satisfaction at compile time | the compiler |

## layout

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [progressive-module-layout](../corpus/layout.md#progressive-module-layout) | P0 | decision | Flat, then `internal/`, then `cmd/`. No `pkg/` | by hand |
| [domain-not-layer-package-names](../corpus/layout.md#domain-not-layer-package-names) | P1 | decision | Name packages for the domain, not the layer | by hand |
| [unexport-aggressively](../corpus/layout.md#unexport-aggressively) | P1 | feedback-rule | Export only what another package calls today | unused |

## testing

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [tdd-red-before-green](../corpus/testing.md#tdd-red-before-green) | P0 | decision | The test fails first, and you read the failure | by hand |
| [table-driven-subtests](../corpus/testing.md#table-driven-subtests) | P1 | feedback-rule | Named cases, one assertion shape, no loop-variable copy | by hand |
| [parallel-when-safe](../corpus/testing.md#parallel-when-safe) | P1 | decision | No shared state, and never with `t.Setenv` | `go test -race` |
| [test-doubles-fake-or-mock](../corpus/testing.md#test-doubles-fake-or-mock) | P1 | decision | Hand-written fake first; generate only when it earns itself | by hand |
| [synctest-for-time-and-goroutines](../corpus/testing.md#synctest-for-time-and-goroutines) | P2 | reference | A fake clock, so a timeout test is fast and never flakes | by hand |
| [go-cmp-for-comparison](../corpus/testing.md#go-cmp-for-comparison) | P1 | feedback-rule | A real diff, instead of a bare false | by hand |
| [race-detector-in-ci](../corpus/testing.md#race-detector-in-ci) | P1 | decision | `-race -count=1` on every pull request | `go test -race` |

## security

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [parameterized-sql](../corpus/security.md#parameterized-sql) | P0 | decision | Never concatenate input into a query | govet |
| [secrets-never-in-source](../corpus/security.md#secrets-never-in-source) | P0 | decision | Not in the repository, the image, or a log line | by hand |
| [contextual-escaping-html-template](../corpus/security.md#contextual-escaping-html-template) | P1 | decision | `html/template` escapes per context; `text/template` does not | by hand |
| [typed-config-validated-at-startup](../corpus/security.md#typed-config-validated-at-startup) | P1 | decision | A missing variable is a start-up failure | by hand |
| [vulnerability-scanning](../corpus/security.md#vulnerability-scanning) | P2 | reference | `govulncheck` reports only what your code reaches | `govulncheck` |

## performance

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [measure-before-optimising](../corpus/performance.md#measure-before-optimising) | P0 | decision | No change without a before and after number | by hand |
| [slice-capacity-hints](../corpus/performance.md#slice-capacity-hints) | P1 | feedback-rule | Give `make` the capacity when you know it | by hand |
| [struct-field-order-readability-first](../corpus/performance.md#struct-field-order-readability-first) | P1 | decision | Group for the reader; pack only with a profile | by hand |
| [benchmarks-with-b-loop](../corpus/performance.md#benchmarks-with-b-loop) | P1 | feedback-rule | Keep the work inside the loop and use the result | by hand |
| [green-tea-gc](../corpus/performance.md#green-tea-gc) | P2 | reference | Go 1.26 garbage collector, on by default | by hand |

## observability

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [slog-is-the-default-logger](../corpus/observability.md#slog-is-the-default-logger) | P1 | decision | Standard library, structured, passed explicitly | by hand |
| [what-to-log-and-at-what-level](../corpus/observability.md#what-to-log-and-at-what-level) | P1 | feedback-rule | Log the decision, not the narration | by hand |
| [slog-multihandler](../corpus/observability.md#slog-multihandler) | P2 | reference | Go 1.26 fan-out with no wrapper struct | by hand |
| [tracing-and-metrics](../corpus/observability.md#tracing-and-metrics) | P2 | reference | One request id across logs, traces and metrics | by hand |

## api

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [transport-chosen-at-bootstrap](../corpus/api.md#transport-chosen-at-bootstrap) | P1 | decision | No default router, no default RPC; ask, or match the repo | by hand |
| [http-client-is-stateless](../corpus/api.md#http-client-is-stateless) | P1 | pattern-gotcha | Config only in the struct; a body can be read once | bodyclose |
| [handler-and-server-hygiene](../corpus/api.md#handler-and-server-hygiene) | P1 | feedback-rule | Explicit timeouts; the zero value is none | by hand |
| [rpc-practices-per-transport](../corpus/api.md#rpc-practices-per-transport) | P2 | reference | Versioned schema, generated code, deadlines, edge mapping | by hand |

## data

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [context-aware-queries-and-pooling](../corpus/data.md#context-aware-queries-and-pooling) | P1 | feedback-rule | Context variants, explicit pool limits, check `rows.Err` | errcheck |
| [transaction-and-rollback-discipline](../corpus/data.md#transaction-and-rollback-discipline) | P1 | pattern-gotcha | Defer the rollback straight after begin | by hand |
| [migrations-are-versioned](../corpus/data.md#migrations-are-versioned) | P1 | feedback-rule | Numbered, forward-only, applied by a tool | by hand |

## dependencies

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [stdlib-first-tier-policy](../corpus/dependencies.md#stdlib-first-tier-policy) | P0 | decision | Standard library, then `golang.org/x`, then a stated reason | by hand |
| [greenfield-stack-offer](../corpus/dependencies.md#greenfield-stack-offer) | P1 | decision | Offer the stack choices instead of deciding silently | by hand |
| [go-mod-hygiene](../corpus/dependencies.md#go-mod-hygiene) | P1 | feedback-rule | Minimum version, tidy before commit, commit `go.sum` | by hand |
| [ecosystem-leaders-snapshot](../corpus/dependencies.md#ecosystem-leaders-snapshot) | P2 | reference | A dated measurement, not a recommendation | by hand |

## tooling

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [golangci-lint-baseline](../corpus/tooling.md#golangci-lint-baseline) | P1 | decision | Eleven linters, each mapped to a rule here | by hand |
| [go-fix-is-a-reviewed-local-step](../corpus/tooling.md#go-fix-is-a-reviewed-local-step) | P1 | decision | Local, reviewed, never an automatic CI rewrite | by hand |
| [gopls-for-renames-and-references](../corpus/tooling.md#gopls-for-renames-and-references) | P1 | feedback-rule | Rename through the language server, not text search | by hand |
| [ci-gates](../corpus/tooling.md#ci-gates) | P1 | decision | Build, vet, race tests, lint, vulnerability scan | by hand |

## modernization

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [version-baseline-two-releases](../corpus/modernization.md#version-baseline-two-releases) | P0 | decision | Go 1.25 and 1.26, with the older form shown | the compiler |
| [slices-maps-cmp-packages](../corpus/modernization.md#slices-maps-cmp-packages) | P1 | feedback-rule | Standard library replaces the hand-rolled loop | by hand |
| [new-expr](../corpus/modernization.md#new-expr) | P2 | reference | Go 1.26 pointer to any expression | the compiler |
| [range-over-int-and-iterators](../corpus/modernization.md#range-over-int-and-iterators) | P2 | reference | Range over an int, and over a function | the compiler |

## review

| Rule | Priority | Kind | Focus | Caught by |
|---|---|---|---|---|
| [review-finding-contract](../corpus/review.md#review-finding-contract) | P0 | decision | Severity, location, rule link, what is wrong, the fix | by hand |
| [review-scope-and-order](../corpus/review.md#review-scope-and-order) | P1 | decision | Safety first; finish the pass; report what you skipped | by hand |
| [review-cites-the-rule](../corpus/review.md#review-cites-the-rule) | P1 | decision | Link the rule at this skill's own version tag | by hand |
