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
installed. The floor and the baseline are different numbers: the floor is the oldest release whose
features the code uses, and the baseline is what you build and test against, which
`rule:version-baseline-two-releases` sets. Features means semantics as well as syntax. Run
`go mod tidy` before every commit that touches an import. Commit `go.sum` with `go.mod`, always, in
the same commit. Prefer a tagged release over a pseudo-version. Vendor only when the build must work
with no network, and then commit `vendor/` whole.

**Why.** The `go` directive is a floor, not a pin. It decides which language features the compiler
accepts and which minimum every consumer of your module inherits, so the newest installed patch
written there forces that patch on everyone downstream for no reason. `go.sum` is the integrity
record for every module in the graph: a commit that changes `go.mod` without it leaves a tree that
cannot be verified and often cannot be built. A pseudo-version pins an untagged commit the author
never promised to keep working, which is a maintenance debt nobody wrote down. Vendoring freezes the
whole graph into your repository, which is real when the network is absent and otherwise a large
diff that hides the dependency change inside it.

**Good**

```text
module github.com/acme/billing

go 1.22

require example.com/ledger v1.4.0
```

The floor says 1.22 because that is what the code needs, and no identifier in the source says so. A
`for` loop gives each iteration its own variable only when the directive is 1.22 or higher. Below
it, every closure the loop starts shares one variable and reads whatever the loop left behind. This
function compiles at `go 1.21` and fetches the last URL twice, and the same mechanism makes a
parallel table test assert its last row, per `rule:parallel-when-safe`:

```go
import "sync"

func fetchAll(urls []string, fetch func(string)) {
	var wg sync.WaitGroup
	for _, url := range urls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fetch(url)
		}()
	}
	wg.Wait()
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
compiler catches a directive set below a syntax requirement, such as `min` and `max`, which need
1.21. It cannot catch one set below a semantic requirement: that build succeeds and the behaviour
changes. `go vet` catches the loop-variable case, reporting
`loop variable url captured by func literal`.

**Sources.** https://go.dev/ref/mod and https://go.dev/doc/modules/gomod-ref and
https://go.dev/doc/go1.22 and https://go.dev/wiki/LoopvarExperiment

## ecosystem-leaders-snapshot

- priority: P2
- atom_type: reference

**Rule.** The full table lives in `references/ecosystem-snapshot.md`, read from the GitHub API on
2026-10-01. Treat it as a dated snapshot, not a ranking: star counts and push dates drift, and a
star count is popularity, never a recommendation. Three rows change a decision on their own.
`google/wire` was archived on 2025-08-22, so never recommend it. `spf13/viper` was last pushed on
2026-01-12. `gorilla/mux` and `jmoiron/sqlx` were both last pushed on 2024-08-15. For anything else
in the table, check the project yourself before you make an argument out of a number there.

**Why.** A snapshot with a date on it is honest and useful. The same table without a date rots
silently and is then quoted for years as current. Naming the measurement day lets a reader see how
old the figure is and decide whether to re-read it. The archived and dormant marks are the exception
because they are the one signal that does not reverse quietly: `google/wire` was archived in 2025,
and recommending it today hands someone a wiring framework with no maintainer.

**Good**

Read what a build actually depends on from the binary rather than from a table someone wrote down.

```go
import (
	"fmt"
	"runtime/debug"
)

func printDependencyVersions() {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return
	}
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
