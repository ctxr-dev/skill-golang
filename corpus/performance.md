---
id: performance
area: performance
subject: [architecture]
updated: '2026-10-01'
rules: 5
---

# Performance

When to spend effort on speed, and how to show the effort paid off. Four rules about measurement,
allocation and benchmark shape, plus one note on the Go 1.26 garbage collector.

## measure-before-optimising

- priority: P0
- atom_type: decision

**Rule.** Profile before you change anything. Take a measurement — `net/http/pprof` on a running
service, or `go test -bench` with `-benchmem`, `-cpuprofile` and `-memprofile` on a package — then
change one thing, then measure again the same way. Put the before number and the after number in the
change description.

**Why.** The Go compiler, allocator and collector already handle most of what looks slow in source,
so the thing a reader guesses is hot usually is not. An optimisation with no before-and-after number
is a guess, and the price of the guess is paid in readability by every engineer who reads the
function afterwards. Changing two things at once is worse again: the measurement cannot say which one
helped, and it hides the one that hurt.

**Good**

```bash
go test -run '^$' -bench BenchmarkRender -benchmem -cpuprofile cpu.out -memprofile mem.out ./render
go tool pprof -top cpu.out
go tool pprof -top -sample_index=alloc_space mem.out
```

```go
import (
	"net/http"
	_ "net/http/pprof"
	"time"
)

func debugServer(addr string) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           http.DefaultServeMux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
```

**Bad**

```go
func sumSquares(values []int) int {
	total := 0
	i := 0
	for ; i+4 <= len(values); i += 4 {
		total += values[i]*values[i] + values[i+1]*values[i+1] +
			values[i+2]*values[i+2] + values[i+3]*values[i+3]
	}
	for ; i < len(values); i++ {
		total += values[i] * values[i]
	}
	return total
}
```

**Caught by.** Review. The reviewer asks for the two numbers and the command that produced them, and
sends back a hand-optimised loop that arrives without either. `cyclop` and `gocognit` catch the
complexity such a rewrite usually adds, but neither can tell whether the complexity was earned.

**Sources.** https://go.dev/doc/diagnostics and https://go.dev/blog/pprof and
https://pkg.go.dev/net/http/pprof

## slice-capacity-hints

- priority: P1
- atom_type: feedback-rule

**Rule.** When the final size `n` is known before the loop starts, build the slice with
`make([]T, 0, n)` and append into it. Length zero, capacity `n` — never `make([]T, n)` followed by
`append`. Do this where the loop is hot or `n` is large. Everywhere else `var out []T` reads better
and the difference is noise.

**Why.** `append` grows a slice by allocating a larger backing array and copying the old one into it,
so a loop appending `n` items with no hint allocates and copies on the order of `log2(n)` times. One
hint makes it allocate once. Writing the length instead of the capacity is not merely slower, it is
wrong: the appends then land after `n` empty values and the function returns twice what it should.
The hint also changes the empty case, because `make` never returns a nil slice, so an empty result
marshals as `[]` rather than `null`, which is what `rule:nil-slices-at-the-boundary` governs.

**Good**

```go
type user struct {
	name string
}

func names(users []user) []string {
	out := make([]string, 0, len(users))
	for _, u := range users {
		out = append(out, u.name)
	}
	return out
}
```

**Bad**

```go
type user struct {
	name string
}

func names(users []user) []string {
	out := make([]string, len(users))
	for _, u := range users {
		out = append(out, u.name)
	}
	return out
}
```

**Caught by.** The test that reads the returned slice: the length-instead-of-capacity form fails any
assertion on the first element or on the length. The missing-hint case is a review call, and the
reviewer asks two things — is this loop hot, and was `n` known before it started.

**Sources.** https://github.com/uber-go/guide/blob/master/style.md#specifying-slice-capacity and
https://go.dev/blog/slices-intro and https://pkg.go.dev/builtin#make

## struct-field-order-readability-first

- priority: P1
- atom_type: decision

**Rule.** Order struct fields so a reader can follow the type: identity first, then each group of
fields that is only meaningful together, with a blank line between groups. Reorder for memory packing
only when the type is allocated in very large numbers and a profile shows the padding matters, and
say that in the change description.

**Why.** Field order decides two separate things: how the type reads, and how much padding the
compiler inserts between fields. The reading cost is paid on every later change to the type, by every
engineer who opens it. The padding cost is paid once per allocation, so it only shows up when there
are millions of allocations. Sorting the invoice below by field width puts the two timestamps first
and drops `currency` next to the customer name, three fields away from the amount it denominates,
and an amount and its currency are read and changed together. `fieldalignment` is switched off in
the shipped `.golangci.yml` for that reason — it is a real optimisation with a real price, and
`rule:measure-before-optimising` decides when the price is worth paying.

**Good**

```go
import "time"

type invoice struct {
	id       string
	customer string

	issued time.Time
	due    time.Time

	totalCents int64
	currency   string
	paid       bool
}
```

**Bad**

```go
import "time"

type invoice struct {
	issued     time.Time
	due        time.Time
	id         string
	customer   string
	currency   string
	totalCents int64
	paid       bool
}
```

**Caught by.** Review. Nothing in the shipped `.golangci.yml` reports field order, because
`fieldalignment` is off there on purpose. The reviewer looks for a size-ordered struct that arrives
with no profile behind it, and for a field that was moved away from the only field it means anything
beside.

**Sources.** https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/fieldalignment and
https://google.github.io/styleguide/go/decisions

## benchmarks-with-b-loop

- priority: P1
- atom_type: feedback-rule

**Rule.** Write the benchmark as `func BenchmarkX(b *testing.B)` with `for b.Loop()` around the work
and nothing else inside the loop. Put setup above the loop. Call `b.ReportAllocs()` so allocations
per operation are reported beside the time.

**Why.** `b.Loop` runs the benchmark function exactly once per `-count`, so setup written above the
loop is not timed, and it keeps the parameters and results of the call inside the loop alive, so the
compiler cannot delete the work and leave a benchmark that measures an empty loop. The older
`for i := 0; i < b.N; i++` form does neither: setup inside it is measured on every iteration, and a
discarded result can be optimised away entirely. When the measured work is not a function call,
assign its result to a package-level variable so something still observes it.

**Good**

```go
import (
	"strings"
	"testing"
)

func join(parts []string) string {
	var out strings.Builder
	for _, part := range parts {
		out.WriteString(part)
	}
	return out.String()
}

func BenchmarkJoin(b *testing.B) {
	parts := []string{"alpha", "beta", "gamma"}
	b.ReportAllocs()
	for b.Loop() {
		join(parts)
	}
}
```

**Bad**

```go
import (
	"strings"
	"testing"
)

func join(parts []string) string {
	var out strings.Builder
	for _, part := range parts {
		out.WriteString(part)
	}
	return out.String()
}

func BenchmarkJoin(b *testing.B) {
	for i := 0; i < b.N; i++ {
		parts := []string{"alpha", "beta", "gamma"}
		join(parts)
	}
}
```

**Caught by.** `govet`, whose `tests` analyzer reports a benchmark with a malformed name or the wrong
signature, and which `go test` runs for you. `gopls` offers the rewrite from the `b.N` form through
its `bloop` modernizer, which is off by default in the `go fix` suite because it can move
nanosecond-scale results. The rest is review: the reviewer checks that setup sits above the loop and
that the measured value is kept alive.

**Sources.** https://pkg.go.dev/testing#B.Loop and https://go.dev/doc/go1.24#new-benchmark-function
and https://go.dev/blog/testing-b-loop and
https://github.com/golang/tools/blob/master/gopls/doc/analyzers.md

## green-tea-gc

- priority: P2
- atom_type: reference
- since: 1.26

**Rule.** Treat Green Tea as a reason to re-measure after upgrading to Go 1.26, not as a change to
make in source. It is the garbage collector in Go 1.26 and it is on by default. Run your own service
under `GODEBUG=gctrace=1` before and after the upgrade and quote your own numbers.

**Why.** The release notes make three claims about Green Tea and no more. It is enabled by default in
Go 1.26. It is expected to reduce garbage-collection overhead by 10 to 40 percent in real-world
programs that lean on the collector. Hardware with the right vector support — Intel Ice Lake and
newer, AMD Zen 4 and newer — is expected to gain roughly a further 10 percent, because the collector
now uses vector instructions when scanning small objects. The last two are expectations published by
the Go team, not measurements; neither was measured on the machine this corpus was written on, whose
toolchain is go1.25.11. Any other number circulating as a Green Tea fact — a cache-miss percentage, a
page size, a named instruction set — is not in the notes, so do not repeat it.

This rule needs Go 1.26. On the Go 1.25 baseline the same collector exists only behind
`GOEXPERIMENT=greenteagc` and is off by default, and that is the whole of the 1.25 form: there is no
source-level difference to show, so this rule has no second Go block.

**Good**

```bash
GODEBUG=gctrace=1 ./billing-api 2> gctrace-greentea.log
GOEXPERIMENT=nogreenteagc go build -o billing-api-old ./cmd/billing-api
GODEBUG=gctrace=1 ./billing-api-old 2> gctrace-old.log
```

```go
import "strings"

func upperAll(rows []string) []string {
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, strings.ToUpper(row))
	}
	return out
}
```

**Caught by.** Nothing automated, and nothing on this toolchain: the Go block above is gofmt-checked
but not compiled by the corpus check, because the rule is gated on Go 1.26 and the baseline here is
go1.25.11. The reviewer checks that a Green Tea claim in a design note carries only the three
published figures, and that an upgrade decision cites a `gctrace` run on the service itself rather
than the release notes.

**Sources.** https://go.dev/doc/go1.26#new-garbage-collector and
https://pkg.go.dev/runtime#hdr-Environment_Variables
