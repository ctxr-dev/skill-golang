# Go — routing rule

Loads in every session. It routes; it holds no Go knowledge of its own.

**Applies to** `**/*.go`, `**/go.mod`, `**/go.sum`, `**/go.work`.

## Precedence, first match wins, per topic

0. A rule already loaded in this session's context.
1. A repository instruction file: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`.
2. A loaded skill that declares it supersedes Go guidance.
3. A Go standards document in the repository, or its `.golangci.yml`.

A topic nothing above covers falls through to the corpus. Say which rung applied, and to what.

## Two modes

Writing or changing Go → write mode. Reviewing Go → review mode, which produces a report and never
edits the code under review.

## Where the rules are

Open `SKILL.md` for the decision tree. Rules live in `corpus/<area>.md`, one `##` section per rule.

| You are doing this | Open this |
|---|---|
| Naming anything | `corpus/naming.md` |
| Writing or shaping a function | `corpus/style.md` |
| Returning or wrapping an error | `corpus/errors.md` |
| Nil, panics, maps, slices, assertions | `corpus/safety.md` |
| Goroutines, channels, fan-out | `corpus/concurrency.md` |
| Anything taking a context | `corpus/context.md` |
| Declaring an interface or wiring dependencies | `corpus/interfaces.md` |
| Adding a package or directory | `corpus/layout.md` |
| Writing a test or a benchmark | `corpus/testing.md` |
| SQL, templates, secrets, config | `corpus/security.md` |
| Profiling, allocation, struct shape | `corpus/performance.md` |
| Logging, tracing, metrics | `corpus/observability.md` |
| HTTP or RPC, client or server | `corpus/api.md` |
| Database access or migrations | `corpus/data.md` |
| Adding a dependency | `corpus/dependencies.md` |
| Linters, CI, `gopls`, `go fix` | `corpus/tooling.md` |
| Using a recent language feature | `corpus/modernization.md` |
| Doc comments, and every other comment | `corpus/docs.md` |
| Reviewing | `corpus/review.md` |

## The three that apply before anything else

- Doc comments are required on every exported identifier and every package. Every other comment is
  banned. `corpus/docs.md`
- Handle an error once: wrap and return, or log and stop. Never both. `corpus/errors.md`
- Whoever starts a goroutine owns its exit. `corpus/concurrency.md`
