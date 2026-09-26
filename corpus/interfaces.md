---
id: interfaces
area: interfaces
subject: [architecture]
updated: '2026-10-01'
rules: 6
---

# Interfaces and wiring

Where an interface is declared, which receiver form a type uses, whether its zero value works, and
how the pieces are joined together when the process starts.

## interfaces-at-the-consumer

- priority: P0
- atom_type: decision

**Rule.** Declare an interface in the package that calls it, with one to three methods naming what
that caller needs. Not in the package that implements it, and never as a `Repository` interface
parked in a shared domain package.

**Why.** An interface exists so one caller can name what it needs and be tested without the real
implementation. Declaring it beside the implementation inverts that: every consumer now imports the
implementing package to reach the type that package was meant to hide. A shared `Repository` is the
same mistake at a larger scale. It forces the widest method set on every caller, so a method added
for one consumer must be faked by all of them, and the dependency the interface was introduced to
remove is back and pointing the wrong way. An interface the caller owns stays narrow, because only
that caller's needs shape it.

**Good**

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

type InvoiceFinder interface {
	FindInvoice(ctx context.Context, id string) (Invoice, error)
}

type Charger struct {
	invoices InvoiceFinder
}

func NewCharger(invoices InvoiceFinder) *Charger {
	return &Charger{invoices: invoices}
}

func (c *Charger) Charge(ctx context.Context, id string) (int64, error) {
	invoice, err := c.invoices.FindInvoice(ctx, id)
	if err != nil {
		return 0, fmt.Errorf("find invoice %s: %w", id, err)
	}
	return invoice.Cents, nil
}
```

**Bad**

```go
package domain

import "context"

type Invoice struct {
	ID    string
	Cents int64
}

type Repository interface {
	FindInvoice(ctx context.Context, id string) (Invoice, error)
	SaveInvoice(ctx context.Context, invoice Invoice) error
	ListInvoices(ctx context.Context, customer string) ([]Invoice, error)
	DeleteInvoice(ctx context.Context, id string) error
}

type Charger struct {
	repo Repository
}

func (c *Charger) Charge(ctx context.Context, id string) (int64, error) {
	invoice, err := c.repo.FindInvoice(ctx, id)
	if err != nil {
		return 0, err
	}
	return invoice.Cents, nil
}
```

**Caught by.** Review. The reviewer checks that each interface sits in the package whose code calls
its methods, and that no interface declares a method its caller never calls.

**Sources.** https://go.dev/wiki/CodeReviewComments#interfaces and
https://google.github.io/styleguide/go/best-practices#interface-ownership-and-visibility

## accept-interfaces-return-structs

- priority: P1
- atom_type: feedback-rule

**Rule.** Take the narrowest interface a function actually uses as its parameter, and return the
concrete type from a constructor.

**Why.** A caller handed a concrete type keeps every method on it and can still declare its own
narrow interface over it, per `rule:interfaces-at-the-consumer`. A caller handed an interface gets
only the methods the author chose and cannot get the rest back without a type assertion. Returning
an interface also hides the real type from the generated documentation and from the reader of the
constructor. The one deliberate reversal is `error`: return the `error` interface, because a nil
pointer stored in an `error` value is not nil, and a concrete error return type makes that trap easy
to hit.

**Good**

```go
package ingest

import (
	"bufio"
	"fmt"
	"io"
)

type Counter struct {
	lines int
}

func NewCounter() *Counter {
	return &Counter{}
}

func (c *Counter) Count(src io.Reader) (int, error) {
	scanner := bufio.NewScanner(src)
	for scanner.Scan() {
		c.lines++
	}
	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("count lines: %w", err)
	}
	return c.lines, nil
}
```

**Bad**

```go
package ingest

import (
	"bufio"
	"io"
)

type Counter interface {
	Count(src io.Reader) (int, error)
}

type counter struct {
	lines int
}

func NewCounter() Counter {
	return &counter{}
}

func (c *counter) Count(src io.Reader) (int, error) {
	scanner := bufio.NewScanner(src)
	for scanner.Scan() {
		c.lines++
	}
	return c.lines, scanner.Err()
}
```

**Caught by.** `revive` reports the neighbouring fault, an exported function returning an unexported
type. The rule itself is caught by review, which checks that a constructor's return type is concrete
and that every parameter interface carries only the methods the body calls.

**Sources.** https://go.dev/doc/effective_go#interfaces and
https://google.github.io/styleguide/go/decisions#interfaces

## pointer-vs-value-receivers

- priority: P1
- atom_type: feedback-rule

**Rule.** Pick one receiver form for a type and use it for every method on that type. Take a pointer
when the method mutates the receiver, when the struct is large enough that copying costs, or when it
holds a `sync.Mutex`.

**Why.** Only `*T` carries the methods declared on `*T`, so a mixed method set means a `T` value
quietly fails to satisfy an interface that a `*T` satisfies. A value receiver also copies the struct
on every call. Copying a struct that holds a `sync.Mutex` copies the lock, so two goroutines lock two
different mutexes, the data race is real, and the code reads as if it were guarded. The compiler
accepts that copy without a word. `govet`'s copylocks pass is what reports it.

**Good**

```go
package tally

import "sync"

type Counter struct {
	mu     sync.Mutex
	counts map[string]int
}

func NewCounter() *Counter {
	return &Counter{counts: make(map[string]int)}
}

func (c *Counter) Add(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts[key]++
}

func (c *Counter) Total(key string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.counts[key]
}
```

**Bad**

```go
package tally

type Counter struct {
	counts map[string]int
}

func (c *Counter) Add(key string) {
	c.counts[key]++
}

func (c Counter) Reset() {
	c.counts = make(map[string]int)
}
```

`Reset` takes a value receiver, so it replaces the map on a copy and the caller's map is untouched.
The call compiles, runs, and does nothing.

**Caught by.** `govet`, whose copylocks pass reports a `sync.Mutex` copied into a value receiver. The
mixed method set is caught by review, which checks that every method on one type uses the same
receiver form.

**Sources.** https://go.dev/wiki/CodeReviewComments#receiver-type and
https://github.com/uber-go/guide/blob/master/style.md#receivers-and-interfaces and
https://go.dev/ref/spec#Method_sets

## zero-value-usability

- priority: P1
- atom_type: feedback-rule

**Rule.** Design the type so that `var x T` already works. A constructor is then an optimisation, not
a prerequisite.

**Why.** `sync.Mutex`, `bytes.Buffer` and `time.Time` are all useful at their zero value, which is
why any struct can embed them with no setup. A type that needs a constructor spreads that
requirement outward: every struct holding it now needs its own constructor, and each one somebody
forgets is a nil map panic or a silently wrong default at run time rather than a compile error.
Appending to a nil slice works, so a slice field needs no initialisation. A map does, and that is the
field genuinely worth building in a constructor.

**Good**

```go
package collect

import (
	"strings"
	"sync"
)

type Collector struct {
	mu    sync.Mutex
	lines []string
}

func (c *Collector) Add(line string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lines = append(c.lines, line)
}

func (c *Collector) String() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return strings.Join(c.lines, "\n")
}

func Report(lines ...string) string {
	var collector Collector
	for _, line := range lines {
		collector.Add(line)
	}
	return collector.String()
}
```

**Bad**

```go
package collect

import "strings"

type Collector struct {
	lines []string
	sep   string
}

func NewCollector(sep string) *Collector {
	return &Collector{lines: []string{}, sep: sep}
}

func (c *Collector) Add(line string) {
	c.lines = append(c.lines, line)
}

func (c *Collector) String() string {
	return strings.Join(c.lines, c.sep)
}

func Report(lines ...string) string {
	var collector Collector
	for _, line := range lines {
		collector.Add(line)
	}
	return collector.String()
}
```

The zero `Collector` has an empty separator, so `Report` joins everything into one run-together
string. Nothing fails; the output is just wrong.

**Caught by.** Review, which looks for a plain `var x T` or a bare struct literal of the type and
asks whether that value behaves. A nil map write surfaces as a panic under `go test`.

**Sources.** https://go.dev/ref/spec#The_zero_value and
https://github.com/uber-go/guide/blob/master/style.md#zero-value-mutexes-are-valid

## wiring-hand-first-then-fx

- priority: P1
- atom_type: decision

**Rule.** Wire dependencies by hand in `main`, or in one `internal/app` package once `main` grows.
Reach for a framework only when lifecycle ordering genuinely matters or the wiring passes about a
hundred lines. Then `uber-go/fx` is the default and `samber/do` the lighter option. `google/wire` was
archived on 2025-08-22 and must not be recommended.

**Why.** Hand wiring is a list of constructor calls. It reads top to bottom, the compiler checks it,
and a missing or mistyped dependency is a build error at the exact call. A framework replaces that
with a graph resolved while the process starts, so the same mistake becomes a startup failure and
the construction order leaves the page. That trade pays only when something real demands it: ordered
start and stop across many components, or a wiring function too long to hold in your head.
`google/wire` generated its wiring at build time and would have kept the compile-time check, but its
repository was archived on 2025-08-22, so it receives no further fixes.

**Good**

```go
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"
)

type InvoiceStore struct {
	timeout time.Duration
}

func NewInvoiceStore(timeout time.Duration) *InvoiceStore {
	return &InvoiceStore{timeout: timeout}
}

type Billing struct {
	store  *InvoiceStore
	logger *slog.Logger
}

func NewBilling(store *InvoiceStore, logger *slog.Logger) *Billing {
	return &Billing{store: store, logger: logger}
}

func (b *Billing) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b.logger.InfoContext(r.Context(), "charge", "timeout", b.store.timeout)
		w.WriteHeader(http.StatusNoContent)
	})
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	billing := NewBilling(NewInvoiceStore(2*time.Second), logger)
	server := &http.Server{
		Addr:              ":8080",
		Handler:           billing.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		logger.Error("serve", "error", err)
		os.Exit(1)
	}
}
```

**Bad**

```go
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"
)

type InvoiceStore struct {
	timeout time.Duration
}

type Billing struct {
	store *InvoiceStore
}

func NewBilling() *Billing {
	return &Billing{store: &InvoiceStore{timeout: 2 * time.Second}}
}

func (b *Billing) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slog.Info("charge", "timeout", b.store.timeout)
		w.WriteHeader(http.StatusNoContent)
	})
}

func main() {
	server := &http.Server{
		Addr:              ":8080",
		Handler:           NewBilling().Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		slog.Error("serve", "error", err)
		os.Exit(1)
	}
}
```

`NewBilling` builds its own store, so no test can give it a different one, and the timeout is buried
two levels from the place that owns configuration. That is the wiring problem a framework is usually
brought in to solve, and a parameter solves it instead.

**Caught by.** The compiler, which rejects a constructor call with a missing or wrongly typed
argument. Review checks that no constructor builds its own dependencies and that construction
happens in one place.

**Sources.** https://github.com/uber-go/fx and https://github.com/samber/do and
https://github.com/google/wire

## verify-interface-compliance

- priority: P1
- atom_type: pattern-gotcha

**Rule.** Where a type must satisfy an interface it does not name, assert it at compile time with
`var _ Reader = (*File)(nil)`, written next to the type.

**Why.** Go interfaces are implicit, so nothing connects a type to an interface until some code
assigns one to the other. Rename a method or change a signature and the type stops satisfying the
interface silently; the error then appears at a call site in another package, far from the edit that
caused it. The blank assignment moves that error back onto the type where the reader is already
looking. Write the typed nil, `(*File)(nil)`, rather than `&File{}`: it allocates nothing and works
even for a type whose zero value is not valid.

**Good**

```go
package tempfile

import (
	"io"
	"os"
)

type Writer struct {
	file *os.File
}

var _ io.WriteCloser = (*Writer)(nil)

func (w *Writer) Write(p []byte) (int, error) {
	return w.file.Write(p)
}

func (w *Writer) Close() error {
	return w.file.Close()
}
```

**Bad**

```go
package tempfile

import (
	"io"
	"os"
)

type Writer struct {
	file *os.File
}

func (w *Writer) Write(p []byte) (int, error) {
	return w.file.Write(p)
}

func (w *Writer) Close() error {
	return w.file.Close()
}

func init() {
	var candidate any = &Writer{}
	if _, ok := candidate.(io.WriteCloser); !ok {
		panic("Writer does not implement io.WriteCloser")
	}
}
```

The check is real but it runs when the process starts, so a build that cannot work still ships.

**Caught by.** The compiler, once the assertion exists. Without it, review is the catcher, looking
for a type whose methods exist only to satisfy an interface declared in another package.

**Sources.** https://github.com/uber-go/guide/blob/master/style.md#verify-interface-compliance and
https://go.dev/doc/effective_go#interfaces_and_types
