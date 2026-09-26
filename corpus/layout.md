---
id: layout
area: layout
subject: [architecture]
updated: '2026-10-01'
rules: 3
---

# Package layout

How a module's directories grow, what each package is named for, and how little of it the rest of
the world gets to see.

## progressive-module-layout

- priority: P0
- atom_type: decision

**Rule.** Start flat: `.go` files in the module root, one package, no subdirectories. Add `internal/`
at the first supporting package. Add `cmd/` at the second binary, or when one repository holds both
a binary and a library. go.dev's module layout guide describes no `pkg/` directory at any stage, and
this corpus does not prescribe one.

**Why.** Each directory level is a cost paid on every read and every import, so earn it. A flat
module is complete and publishable, and a small tool often never outgrows it. `internal/` is the one
boundary the toolchain enforces for you: the compiler refuses any import of a package under
`internal/` from outside the module rooted at its parent, so the promise is real rather than a
convention a reviewer has to police. `cmd/` is worth its level once there is a second entry point
that needs its own name, because the binary name comes from its directory. A `pkg/` directory adds a
level the compiler attaches no meaning to and says nothing the module path did not already say.

**Good**

```text
one package, one binary
  go.mod
  main.go
  invoice.go

a supporting package appears
  go.mod
  main.go
  internal/billing/invoice.go

a second binary, or a binary beside a library
  go.mod
  cmd/billingd/main.go
  cmd/billingctl/main.go
  internal/billing/invoice.go

module example.com/billing
  cmd/billingd/main.go imports "example.com/billing/internal/billing"
  any module other than example.com/billing is refused that import by the compiler
```

```go
package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()
	fmt.Fprintf(os.Stdout, "billingd listening on %s\n", *addr)
}
```

**Bad**

```text
one file of real code, eight directories
  go.mod
  cmd/app/main.go
  pkg/models/invoice.go
  pkg/utils/utils.go
  internal/service/service.go
  internal/repository/repository.go
  api/
  configs/
```

**Caught by.** The compiler, which refuses an import of an `internal/` package from outside the
module. The rest is caught by review, which counts directories against the packages and binaries
that actually exist today.

**Sources.** https://go.dev/doc/modules/layout and
https://pkg.go.dev/cmd/go#hdr-Internal_packages and https://go.dev/blog/organizing-go-code

## domain-not-layer-package-names

- priority: P1
- atom_type: decision

**Rule.** Inside `internal/`, name each package for the domain concept it owns — `internal/billing`,
`internal/inventory` — not for the technical layer it sits in. No `service`, `repository`, `handler`
or `utils` package.

**Why.** A layer split spreads one change across three packages: adding a field to an invoice edits
the handler, the service and the repository, and the diff tells the reader nothing about what
changed. It also invites import cycles, because the service needs the repository's types while the
repository needs the service's, and Go refuses that outright. A domain package keeps the change in
one place and gives the package a name that carries meaning at every call site: `billing.Invoice`
reads, `service.Invoice` does not. The name itself follows `rule:package-names`, and the interfaces
the package needs from elsewhere stay with their callers under
`rule:interfaces-at-the-consumer`.

**Good**

```text
internal/billing/invoice.go
internal/billing/charge.go
internal/inventory/stock.go
```

```go
package billing

import (
	"context"
	"fmt"
)

type Invoice struct {
	ID    string
	Cents int64
}

type Store interface {
	Find(ctx context.Context, id string) (Invoice, error)
}

type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
}

func (s *Service) Total(ctx context.Context, id string) (int64, error) {
	invoice, err := s.store.Find(ctx, id)
	if err != nil {
		return 0, fmt.Errorf("find invoice %s: %w", id, err)
	}
	return invoice.Cents, nil
}
```

**Bad**

```text
internal/handler/invoice.go      needs internal/service
internal/service/invoice.go      needs internal/repository and internal/handler's request type
internal/repository/invoice.go   needs internal/service's Invoice
internal/utils/utils.go          needed by everything, owned by nobody

internal/service imports internal/repository
internal/repository imports internal/service
the compiler refuses the cycle, so a types package is invented to break it
```

**Caught by.** The compiler, which refuses an import cycle outright. `revive` reports a package name
that is not a short lower-case word. The layer split itself is caught by review, which checks that a
one-sentence change lands in one package.

**Sources.** https://go.dev/blog/package-names and
https://google.github.io/styleguide/go/decisions#package-names and
https://google.github.io/styleguide/go/best-practices#util-packages

## unexport-aggressively

- priority: P1
- atom_type: feedback-rule

**Rule.** Export only what another package calls today. Everything else — types, functions, methods,
struct fields and constants alike — stays lower-case until a real caller outside the package needs
it.

**Why.** An exported identifier is a promise. Once another package can reach it, renaming it,
changing its type or deleting it stops being a local decision and becomes a negotiation. An
unexported one is renamed with a single `gopls` rename and no conversation. Exporting also widens
what must be documented, since `rule:godoc-required-on-exported` applies to every exported name, and
it blinds the linter: `unused` reports an unexported identifier nothing calls, and assumes an
exported one has callers it cannot see. Keeping the surface small is what keeps that report
meaningful.

**Good**

```go
package rate

import (
	"sync"
	"time"
)

type Limiter struct {
	mu       sync.Mutex
	interval time.Duration
	last     time.Time
}

func NewLimiter(interval time.Duration) *Limiter {
	return &Limiter{interval: interval}
}

func (l *Limiter) Allow(now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.ready(now) {
		return false
	}
	l.last = now
	return true
}

func (l *Limiter) ready(now time.Time) bool {
	return now.Sub(l.last) >= l.interval
}
```

**Bad**

```go
package rate

import (
	"sync"
	"time"
)

type Limiter struct {
	Mu       sync.Mutex
	Interval time.Duration
	Last     time.Time
}

func NewLimiter(interval time.Duration) *Limiter {
	return &Limiter{Interval: interval}
}

func (l *Limiter) Allow(now time.Time) bool {
	l.Mu.Lock()
	defer l.Mu.Unlock()
	if !l.Ready(now) {
		return false
	}
	l.Last = now
	return true
}

func (l *Limiter) Ready(now time.Time) bool {
	return now.Sub(l.Last) >= l.Interval
}
```

Every field is now part of the contract, so any package can take the lock, move `Last` backwards, or
call `Ready` and act on the answer without holding the lock.

**Caught by.** `unused`, which reports an unexported identifier nothing calls, and `revive`, which
reports an exported identifier with no doc comment. Review checks that each exported name has a
caller in another package today.

**Sources.** https://go.dev/doc/effective_go#names and
https://google.github.io/styleguide/go/best-practices#package-size and
https://go.dev/wiki/CodeReviewComments#doc-comments
