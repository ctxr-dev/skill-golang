# skill-golang — design spec

**Date:** 2026-10-01
**Status:** authoritative for the implementation plan at `../plans/2026-10-01-skill-golang.md`

## What this is

An Agent Skill that a coding agent loads in two situations: when it **writes or changes Go code**,
and when it **reviews Go code**. It is cumulative — knowledge is added to it over time — so it is
built as a router plus a static corpus, not as one long document.

It defers to a company's own Go standards wherever those exist. It never names a company.

## Why a corpus and not one file

Knowledge that grows needs somewhere to grow that does not force a re-read of everything else. The
corpus borrows the leaf-and-facet idea from a wiki memory: each rule is addressable, carries its own
priority, and is reachable from a router without reading its neighbours. It borrows none of the
runtime — there is no index to rebuild, no embedding, no server.

One file per **area**, each rule a `##` section inside it. The earlier design gave every rule its own
file. An adversarial review measured that at roughly 19 000 tokens of fixed overhead before the first
rule opened, against 4 500–6 000 for the grouped form, because an agent pays a directory listing and
a frontmatter block per file. Grouping also makes a rule's location derivable from its area, which
removes the index as a single point of failure, and gives every rule a heading anchor that a review
link can point at.

## Scope

**In.** Go language practice, project layout, concurrency, errors, testing, security, performance,
observability, API and data access, dependency choice, tooling, and the two modes.

**Out.** Any other language. CI platform configuration. Deployment. The skill's own git workflow —
that belongs to the people who maintain the repo, not to the Go rules it ships.

## Decisions

### Structure

**S1. Every rule is distilled from a primary source.** go.dev, Effective Go, Go Code Review Comments,
the Google Go Style Guide, the Uber Go Style Guide. Nothing is copied from any third-party skill
collection. `test/corpus.test.mjs` enforces this with a provenance check, because the seed document
that triggered the rule has been deleted and can no longer be diffed against.

**S2. One file per area.** `corpus/<area>.md`, 20 files, 86 rules. Each rule is a `## <rule-id>`
section. Rule ids are unique across the whole corpus, so an id alone identifies a rule.

**S3. Frontmatter is hand-writable.** Per file: `id`, `area`, `subject`, `updated`, `rules`. Per
rule: `priority`, `atom_type`, and `since` when the rule needs a Go version. No machine-generated
keys — nothing here regenerates an index, so a key nothing maintains is a key that rots.

**S4. Corporate standards win, per topic, on a four-rung ladder.**

0. A rule already loaded in this session's context. It outranks anything on disk, because the agent
   cannot discover from disk what was injected into its context.
1. A repository instruction file: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`.
2. Any loaded skill that declares it supersedes Go guidance.
3. A Go standards document in the repo, or `.golangci.yml`.

First match wins **for that topic only**. A topic the company is silent on falls through to the
corpus. The agent says which rung it took and on what topic.

**S5. Three ways in.** The skill description (loaded on demand), an always-on rule at
`rules/golang.md` scoped to Go files, and a named review entry point.

**S6. Two Go versions.** 1.25 and 1.26. A rule needing 1.26 carries `since: 1.26` and shows the 1.25
form beside it. The build toolchain here is go1.25.11, so 1.26 examples are checked against release
notes by hand and are marked unexecuted.

**S7. No `package.json`, no npm package, no shared kit.** Install is `npx skills add
ctxr-dev/skill-golang`. That CLI copies the whole repository tree, so `corpus/`, `references/` and
`rules/` all arrive. The maintenance checks are plain `node:test` with zero dependencies.

### Go practice

**G1. Doc comments on exported API; no other comments.** go.dev/doc/comment requires a doc comment on
every exported name. The companion `no-comments` rule bans Go doc comments outright. This skill
overrides that one clause and keeps the rest: godoc on exported identifiers and packages, nothing
else anywhere. The reasoning matches the carve-out `no-comments` already makes for pragmas — a doc
comment is read by `go/doc` and rendered by `pkg.go.dev`, so it is API surface, not prose.

**G2. Numbers gate, smells guide.** `funlen` 60 lines / 40 statements; `cyclop` and `gocognit` 20;
files 400 soft, 600 hard. A repo's own `.golangci.yml` replaces these. Separately, named smells catch
functions that pass the numbers and are still wrong: nesting past three levels, a function doing two
things you would name separately, five or more parameters.

**G3. Layout grows.** Flat package → add `internal/` at the first supporting package → add `cmd/` at
the second binary or when a repo mixes a binary with a library. Inside `internal/`, packages are
named for domain concepts, never for technical layers. No `pkg/` — go.dev/doc/modules/layout does not
describe it.

**G4. Dependencies in tiers.** Standard library first. `golang.org/x/*` without argument. Anything
else needs a stated reason naming what it does that the first two tiers cannot.

**G5. `nil` is a valid empty slice.** Inside the program, leave it nil. Initialise explicitly only
where the value is marshalled or crosses a contract where `null` and `[]` differ to the reader. Maps
are always initialised before a write.

**G6. Interfaces belong to the consumer.** Declared in the package that calls them, one to three
methods. Constructors return concrete types. Wiring is by hand in `main` or one `internal/app`
package until lifecycle ordering is genuinely needed or the wiring passes about a hundred lines, at
which point `uber-go/fx` is the default and `samber/do` the lighter choice. `google/wire` is archived
and is never recommended.

**G7. Panic is for programmer error found before serving traffic.** Never across an exported
boundary. Never in a goroutine that has no recovery. Handle an error once: wrap and return, or log
and stop, never both in one call frame.

**G8. Standard-library testing.** Table-driven with subtests. `t.Parallel()` only where it is safe —
no shared mutable state, no `t.Setenv`, which panics under it. `testing/synctest` for code involving
timers or goroutines. `goleak` in `TestMain` for packages that spawn goroutines. Never `tt := tt`;
Go 1.22 gave loop variables per-iteration scope.

**G9. Channels unbuffered or size one.** A larger buffer is justified only when the buffer *is* the
concurrency limit. Prefer `errgroup.SetLimit` or `golang.org/x/sync/semaphore` over a hand-rolled
`chan struct{}` token pool.

**G10. Struct fields are grouped for the reader.** Reorder for packing only when the type is
allocated in large numbers and a profile shows it matters. `fieldalignment` stays off.

**G11. Transport is chosen at bootstrap.** The corpus has no default HTTP router and no default RPC
framework. With nobody to ask, match what the repository already uses; in an empty repository fall
back to the standard library and say the choice was not made.

**G12. `log/slog` is the default logger.** Configuration is parsed into a typed struct and validated
at startup. A configuration library is for genuine layering of flags over environment over file over
key-value store; `koanf` is preferred over `viper`, whose last release activity was January 2026.

**G13. Errors are standard library.** `errors.New`, `fmt.Errorf` with `%w`, matched by `errors.Is`
for sentinels and `errors.As` — or `errors.AsType[T]` on 1.26 — for typed errors. A sentinel when the
caller needs only the condition; a typed struct when the caller needs a field out of it.

**G14. Hand-written fakes first.** A one-to-three-method consumer-side interface becomes a struct of
function fields. `uber-go/mock` only when the interface is wide and cannot be narrowed, or when call
count and argument order are themselves under test. `go-cmp` for comparison. `testcontainers-go`
when a real dependency is the honest test.

**G15. `go fix` is a reviewed local step.** It rewrites source. CI may run it in check mode and fail;
CI never commits its output. It needs Go 1.26 — on 1.25 `go fix` is a different, obsolete command.

**G16. The shipped `.golangci.yml` enables nothing the corpus cannot justify.** Every enabled linter
maps to a named rule, and `test/config.test.mjs` fails if one does not.

### Modes and companions

**M1. Companion detection reads the lockfile, then looks for a body.** `~/.agents/.skill-lock.json`
first; then the named `SKILL.md` must exist and be non-empty; then the rule locations are probed and
the file must have a non-empty body below its frontmatter. Reported as **active**, **skill-only** or
**absent**. A directory existing is never evidence — two companion directories on the development
machine are empty.

**M2. The README is fetched only when a human will see the result.** When a companion is missing and
the prompt gate is open, fetch its README for current install instructions. Never on the common path,
and never as a detection signal: a public README returns 200 for everyone and says nothing about this
machine.

**M3. The prompt gate opens** only when a question tool is available and the agent is not a
sub-agent, a CI job, or a headless run. No companion is a blocker; work continues on any answer,
including none.

**M4. Output adapts to the client.** ANSI on a TTY, coloured markdown in a markdown-rendering client,
plain markdown otherwise. Install commands are fenced bash in all three.

**M5. `no-comments`, when active, applies to Go**, subject to G1.

**M6. `simple-language`, when active, runs at level 2 everywhere** — user-facing messages and godoc
alike. This deliberately overrides two of that skill's own rules, and says so. Godoc keeps its
symbol-name opening sentence regardless.

**M7. A review finding links to a heading anchor on a version tag.**
`https://github.com/ctxr-dev/skill-golang/blob/v<metadata.version>/corpus/<area>.md#<rule-id>`. The
skills installer records a folder hash, not a commit, so the skill's own `metadata.version` is the
only reference that provably matches what the agent read. No line numbers.

**M8. Review output lands outside the repository under review**, at
`~/.skill-golang/<yyyy-mm-dd>/<hh-mm-ss>/<title-or-task-id>/`.

**M9. Onboarding state lands outside the repository too**, at
`~/.skill-golang/onboarding/<repo-normalized-path>/onboarding.json`, one directory per repository.
`<repo-normalized-path>` is the repository root's absolute path with the leading `/` dropped and
every other `/` replaced by `-`. Two different paths can produce one name, so the file records the
exact path in `repoPath` and a mismatch is treated as a miss.

## Evidence this spec rests on

### The seed document was wrong in six places

Checked 2026-10-01 against the named source.

| Seed claim | Verdict |
|---|---|
| `runtime/secret` used as an ordinary import with a guarantee of zeroing | Experimental, needs `GOEXPERIMENT=runtimesecret`, Linux amd64/arm64 only. The release notes say "securely erases temporaries", not "guaranteed zeroed" |
| Green Tea GC reduces cache misses by 50%, scans 8 KiB page spans, uses AVX-512 | The notes claim only: on by default, 10–40% less GC overhead, a further ~10% on Intel Ice Lake / AMD Zen 4+ |
| Parse environment variables "using Zod or envconfig" | Zod is a TypeScript library |
| `tt := tt` and `url := url` before a parallel subtest | Obsolete since Go 1.22 gave loop variables per-iteration scope |
| `pkg/` is part of the standard layout | go.dev/doc/modules/layout never mentions it |
| `go fix ./...` in CI "to automatically apply" rewrites | A source rewrite with no review. Check mode only |

It also contradicted itself four times: interfaces at the consumer, then repository interfaces in
`internal/domain`; never add dependencies, then uses `errgroup` and `bluemonday`; a 40-line function
cap against the linter numbers it also recommends; field ordering by descending size against
readability. Decisions G6, G4, G2 and G10 resolve those.

Its appendix reproduced a third-party skill catalogue with literal install commands. That catalogue
is stale — the project publishes 47 skills, not the 24 listed — and reproducing it is a copying
vector. The corpus references the project by URL once and copies nothing.

### These claims checked out

`new(expr)`, `errors.AsType[T]` and `slog.NewMultiHandler` are Go 1.26. `sync.WaitGroup.Go` is
Go 1.25. All four are version-gated in the corpus.

### Ecosystem measurements

Stars, archive state and last push for 44 Go repositories were read from the GitHub API on
2026-10-01 and are recorded, dated, in `corpus/dependencies.md`. The three findings that change
advice: `google/wire` is archived (2025-08-22), `spf13/viper` has not been pushed since 2026-01-12,
and `gorilla/mux` and `jmoiron/sqlx` have not been pushed since 2024-08-15.

## How this is verified

Twelve checks, listed in full in the implementation plan. Four are automated `node:test` suites;
eight are behavioural and are run by hand against a fresh agent.

Every automated check must be **mutation-proven** before it is believed: break the artefact it
guards, confirm it names that specific break, revert. The review of the previous design found that
every check then proposed would pass against an empty corpus. A check that survives its own mutation
is reported as broken, not as passing.
