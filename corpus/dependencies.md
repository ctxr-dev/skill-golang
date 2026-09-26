---
id: dependencies
area: dependencies
subject: [tooling]
updated: '2026-10-01'
rules: 4
---

# Dependencies

What is allowed into `go.mod`, what the agent asks before a new project picks its stack, how the
module files are kept honest, and a dated reading of what the Go ecosystem actually uses.

## stdlib-first-tier-policy

- priority: P0
- atom_type: decision

**Rule.** Work through three tiers in order. Tier one is the standard library: use it. Tier two is
`golang.org/x/*`: use it without argument. Tier three is everything else: add it only with a stated
reason that names what the module does which the first two tiers cannot. Write that reason in the
commit or pull request, not in the source. Before you add anything, search the standard library for
the job first.

**Why.** Tier one and tier two are built by the Go team and move with the toolchain, so an upgrade
does not strand them. A tier-three module is a second supply chain you now own: its security
advisories, its breaking releases and its abandonment all become your problem, and the upgrade path
is yours to walk every time. The standard library has also absorbed most of the small helpers people
used to import. `slices`, `maps`, `cmp` and `errors.Join` cover a large share of what a utility
package was for, so the import is often paying a maintenance cost for code that already ships with
the compiler. The policy is about what you add, not a mandate to rip out what already works.

**Good**

```go
import (
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
)

type checkConfig struct {
	Hosts []string
	Flags map[string]string
}

func validateConfig(cfg checkConfig, allowedHosts []string) error {
	var problems []error
	for _, host := range cfg.Hosts {
		if !slices.Contains(allowedHosts, host) {
			problems = append(problems, fmt.Errorf("host %q is not on the allow list", host))
		}
	}
	for _, name := range slices.Sorted(maps.Keys(cfg.Flags)) {
		if strings.TrimSpace(cfg.Flags[name]) == "" {
			problems = append(problems, fmt.Errorf("flag %q is empty", name))
		}
	}
	return errors.Join(problems...)
}
```

**Bad**

```text
require (
	example.com/sliceutil v1.2.0
	example.com/multierror v0.4.1
	example.com/mapkeys v0.1.0
)
```

Those three buy `slices.Contains`, `errors.Join` and `maps.Keys`, which the standard library already
gives you. Three modules, three changelogs to read, three ways to be stranded.

**Caught by.** Review, which reads every added `require` entry and asks what the module does that the
standard library and `golang.org/x/*` cannot. `go mod tidy` catches the other half: a dependency that
nothing imports any more but which still sits in `go.mod`.

**Sources.** https://go.dev/doc/go1compat and https://pkg.go.dev/slices and
https://pkg.go.dev/errors and https://pkg.go.dev/golang.org/x/sync and
https://google.github.io/styleguide/go/best-practices

## greenfield-stack-offer

- priority: P1
- atom_type: decision

**Rule.** On a new module, or on a refactor that is already moving the structure, put the stack
choices to the person instead of deciding silently. Ask about six things at once: HTTP router,
internal transport, configuration strategy, dependency wiring, database access, CLI framework. Never
run this on a feature added to an existing codebase, unless the change would dramatically improve it
— and then say it in one sentence, not a question set. With no answer, match what the repository
already imports, fall back to the standard library in an empty repository, and say out loud that the
choice was not made. Offer only tier-three modules that are alive, per `rule:stdlib-first-tier-policy`
and `rule:transport-chosen-at-bootstrap`.

**Why.** A stack picked silently at the first commit is the hardest decision in the project to
reverse, and the person who has to live with it was never asked. Asking costs one message. Asking
later costs a rewrite. The reverse mistake is as bad: a question set fired at someone adding one
handler to a running service is noise, and it trains them to skip the next question. The two halves
of this rule are the same judgement, pointed in opposite directions.

**Good**

```text
New module, or a refactor already moving the structure. Ask once:

  HTTP router          net/http · go-chi/chi · gin-gonic/gin · labstack/echo
  internal transport   net/http with JSON · grpc-go · connectrpc/connect-go
  configuration        typed struct from flag and env · caarlos0/env · knadh/koanf
  dependency wiring    hand-wired in main · uber-go/fx · samber/do
  database access      database/sql with jackc/pgx · sqlc · uptrace/bun · ent · gorm
  CLI framework        flag · spf13/cobra · urfave/cli · alecthomas/kong

No answer: match what go.mod and the existing handlers already use.
Empty repository: the standard library, and say the choice was not made.
```

With no answer in an empty repository, this is what the fallback looks like.

```go
import (
	"net/http"
	"time"
)

func newServer(addr string, routes http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           routes,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
```

**Bad**

```text
"Scaffold me a Go service."
-> picks a router, an ORM, a config library and a DI container
-> says nothing about any of them
```

**Caught by.** Nothing automated. Review checks that a new module's opening commits either record
the six answers or state that the stack choice was not made, naming what the repository was matched
against.

**Sources.** https://go.dev/doc/modules/managing-dependencies and https://go.dev/doc/modules/layout

## go-mod-hygiene

- priority: P1
- atom_type: feedback-rule

**Rule.** The `go` directive states the lowest version the module needs, not the newest one you have
installed. Run `go mod tidy` before every commit that touches an import. Commit `go.sum` with
`go.mod`, always, in the same commit. Prefer a tagged release over a pseudo-version. Vendor only when
the build must work with no network, and then commit `vendor/` whole.

**Why.** The `go` directive is a floor, not a pin: it decides which language features the compiler
accepts and which minimum every consumer of your module inherits. Writing the newest installed patch
there forces that patch on everyone downstream for no reason. `go.sum` is the integrity record for
every module in the graph, so a commit that changes `go.mod` without it leaves a tree that cannot be
verified and often cannot be built. A pseudo-version pins an untagged commit that the author never
promised to keep working, which is a maintenance debt nobody wrote down. Vendoring freezes the whole
graph into your repository: real when the network is absent, and otherwise a large diff that hides
the dependency change inside it.

**Good**

```text
module github.com/acme/billing

go 1.24

require example.com/ledger v1.4.0
```

The floor says 1.24 because that is what the code needs. This function is why: `min` and `max`
became builtins in Go 1.21, so anything lower would not compile.

```go
func clampRetries(requested int) int {
	return min(max(requested, 0), 5)
}
```

**Bad**

```text
module github.com/acme/billing

go 1.25.11

require example.com/ledger v0.0.0-20260115093012-1f2a3b4c5d6e
```

**Caught by.** `go mod tidy -diff`, which exits non-zero when `go.mod` or `go.sum` is stale and so
belongs in CI, plus `go mod verify`, which checks the downloaded modules against `go.sum`. The
compiler catches a `go` directive set below what the code needs.

**Sources.** https://go.dev/ref/mod and https://go.dev/doc/modules/gomod-ref and
https://go.dev/blog/go1.21

## ecosystem-leaders-snapshot

- priority: P2
- atom_type: reference

**Rule.** Treat this table as a dated snapshot, read from the GitHub API on 2026-10-01, not as a
ranking. Star counts and push dates drift, and a star count is popularity, never a recommendation.
One column is worth acting on by itself: a project marked archived or dormant. Archived means nobody
will fix it, and an archive or a year of silence is reason enough to choose something else. For
anything else in the table, check the project yourself before you make an argument out of a number
here.

**Why.** A snapshot with a date on it is honest and useful. The same table without a date rots
silently and is then quoted for years as current. Naming the measurement day lets a reader see how
old the figure is and decide whether to re-read it. The archived and dormant marks are the exception
because they are the one signal that does not reverse quietly: `google/wire` was archived in 2025,
and recommending it today hands someone a wiring framework with no maintainer.

| project | stars | last push | note |
|---|---|---|---|
| `spf13/cobra` | 44676 | 2026-07-11 | CLI. The usual choice for a subcommand tree. |
| `urfave/cli` | 24275 | 2026-10-01 | CLI. Lighter, no code generation. |
| `alecthomas/kong` | 3184 | 2026-09-30 | CLI. Struct tags describe the grammar. |
| `spf13/viper` | 30477 | 2026-01-12 | Config. **Stalled**: no push for most of a year. |
| `caarlos0/env` | 6323 | 2026-10-01 | Config. Environment into a typed struct. |
| `knadh/koanf` | 4213 | 2026-09-24 | Config. Layered sources, actively pushed. |
| `kelseyhightower/envconfig` | 5469 | 2025-06-28 | Config. **Dormant**. |
| `google/wire` | 14396 | 2025-08-22 | Wiring. **ARCHIVED**. Never recommend it. |
| `uber-go/fx` | 7693 | 2025-12-27 | Wiring. Lifecycle ordering; the named default. |
| `uber-go/dig` | 4504 | 2025-05-13 | Wiring. The container underneath fx. |
| `samber/do` | 2815 | 2026-09-24 | Wiring. Lighter, generics-based. |
| `gin-gonic/gin` | 89271 | 2026-09-29 | HTTP. Largest community by a wide margin. |
| `gofiber/fiber` | 40188 | 2026-10-01 | HTTP. Not `net/http` underneath. |
| `labstack/echo` | 32745 | 2026-09-30 | HTTP. Middleware included. |
| `go-chi/chi` | 22907 | 2026-09-30 | HTTP. Plain `net/http` handlers, no new types. |
| `gorilla/mux` | 21839 | 2024-08-15 | HTTP. **Dormant**. `net/http` routing covers much of it. |
| `sirupsen/logrus` | 25757 | 2026-08-25 | Logging. Predates `log/slog`. |
| `uber-go/zap` | 24665 | 2026-09-16 | Logging. Structured, allocation-conscious. |
| `rs/zerolog` | 12512 | 2026-09-28 | Logging. JSON first. |
| `stretchr/testify` | 26218 | 2026-09-24 | Testing. Assertions and mocks. |
| `uber-go/goleak` | 5288 | 2026-09-15 | Testing. Goroutine leak detection. |
| `testcontainers/testcontainers-go` | 4992 | 2026-09-29 | Testing. Real dependencies in containers. |
| `google/go-cmp` | 4678 | 2026-06-18 | Testing. Structural comparison with readable diffs. |
| `uber-go/mock` | 3416 | 2026-08-25 | Testing. Generated mocks. |
| `go-gorm/gorm` | 39971 | 2026-09-14 | Data. Full ORM. |
| `sqlc-dev/sqlc` | 18338 | 2026-09-26 | Data. SQL in, typed Go out. |
| `jmoiron/sqlx` | 17744 | 2024-08-15 | Data. **Dormant**. |
| `ent/ent` | 17210 | 2026-09-30 | Data. Schema as code, graph queries. |
| `jackc/pgx` | 14284 | 2026-09-28 | Data. The PostgreSQL driver. |
| `uptrace/bun` | 4982 | 2026-09-30 | Data. Query builder over `database/sql`. |
| `grpc/grpc-go` | 23081 | 2026-10-01 | RPC. The reference gRPC implementation. |
| `connectrpc/connect-go` | 4097 | 2026-09-30 | RPC. gRPC-compatible over ordinary HTTP. |
| `bufbuild/buf` | 11467 | 2026-09-30 | Protobuf. Build, lint and breaking-change checks. |
| `go-playground/validator` | 20185 | 2026-09-28 | Validation. Struct-tag rules. |
| `golangci/golangci-lint` | 19402 | 2026-09-30 | Lint. The runner this corpus configures. |
| `golang-migrate/migrate` | 18948 | 2026-09-09 | Migrations. SQL files, CLI driven. |
| `pressly/goose` | 11517 | 2026-09-28 | Migrations. SQL or Go, embeddable. |
| `open-telemetry/opentelemetry-go` | 6570 | 2026-10-01 | Observability. Traces and metrics. |
| `prometheus/client_golang` | 6037 | 2026-09-29 | Observability. Metrics export and scraping. |
| `samber/lo` | 21435 | 2026-10-01 | Utility. `slices`, `maps` and `cmp` cover much of it. |
| `cenkalti/backoff` | 4085 | 2026-09-30 | Resilience. Retry with backoff. |
| `sony/gobreaker` | 3700 | 2026-02-07 | Resilience. Circuit breaker. |
| `cockroachdb/errors` | 2475 | 2026-09-26 | Errors. Stack traces and wire encoding. |
| `samber/oops` | 992 | 2026-09-14 | Errors. Context fields attached to an error. |

**Good**

Read what a build actually depends on from the binary rather than from a table someone wrote down.

```go
import (
	"fmt"
	"runtime/debug"
)

func printModuleVersions() {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		fmt.Println("no build information is embedded in this binary")
		return
	}
	fmt.Println(info.Main.Path, info.GoVersion)
	for _, dep := range info.Deps {
		fmt.Println(dep.Path, dep.Version)
	}
}
```

**Bad**

```text
"cobra has 44k stars, so use cobra"
"the table says gorilla/mux, so use gorilla/mux"
```

**Caught by.** Review, which checks the snapshot date before any figure here is used as an argument,
and re-reads the project page when the figure is load-bearing. `go mod tidy` and
`debug.ReadBuildInfo` report what the build really uses, which is the only number that binds.

**Sources.** https://github.com/google/wire and https://pkg.go.dev/runtime/debug and
https://go.dev/ref/mod
