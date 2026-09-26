---
id: testing
area: testing
subject: [testing]
updated: '2026-10-01'
rules: 7
---

# Testing

How this corpus tests Go: the failing test comes first, cases live in a named table, parallelism is
opt-in, doubles are hand-written, and CI runs the race detector. The tools that enforce it are the
Go toolchain's own — the compiler, `go test`, and `-race`.

## tdd-red-before-green

- priority: P0
- atom_type: decision

**Rule.** Write the test first, run it, read the failure message, then write the code that makes it
pass. After fixing a bug, put the broken production code back for one run and confirm the test turns
red again. That round trip is the only proof the test covers the fix.

**Why.** A test that has never failed has not been shown to test anything. It can assert on the
wrong value, call the wrong function, or compare a result against itself, and it stays green through
all three mistakes. Reading the failure first also grades the message: a failure that names the
call, the result and the expectation tells the next reader what broke without a debugger.

**Good**

```go
import (
	"errors"
	"testing"
)

var errUnknownInvoice = errors.New("unknown invoice")

type ledger map[string]int

func (l ledger) total(invoice string) (int, error) {
	amount, ok := l[invoice]
	if !ok {
		return 0, errUnknownInvoice
	}
	return amount, nil
}

func TestTotalReportsUnknownInvoice(t *testing.T) {
	_, err := ledger{}.total("INV-1")
	if !errors.Is(err, errUnknownInvoice) {
		t.Fatalf("total() error = %v, want %v", err, errUnknownInvoice)
	}
}
```

The test above was written before the missing-invoice branch existed. The two runs looked like this:

```text
go test ./billing   -> FAIL  total() error = <nil>, want unknown invoice
<write the missing-invoice branch>
go test ./billing   -> ok    example/billing
```

**Bad**

```go
import "testing"

func discount(total int) int {
	if total > 100 {
		return total / 10
	}
	return 0
}

func TestDiscount(t *testing.T) {
	got := discount(120)
	if got != discount(120) {
		t.Errorf("discount(120) = %d", got)
	}
}
```

**Caught by.** Nothing automated catches a test written after the code. Review catches it: the
reviewer reverts the production change, reruns the named test, and requires `go test` to fail. A test
still green against the reverted code does not cover the fix and should be rejected.

**Sources.** https://go.dev/doc/tutorial/add-a-test and
https://google.github.io/styleguide/go/decisions#useful-test-failures

## table-driven-subtests

- priority: P1
- atom_type: feedback-rule

**Rule.** Put the cases in a slice of structs with named fields, run each case inside
`t.Run(tt.name, ...)`, and share one assertion shape across every case. Go 1.22 gave `for` loops a
fresh variable per iteration, so the old `tt := tt` copy at the top of the loop is obsolete and must
never appear in new code.

**Why.** `t.Run` gives each case its own name, so a failure says which case broke and `go test -run`
reruns that one case alone. Named struct fields say what each column means, so adding a case is one
line and nobody counts positional values. One assertion shape means a reader checks the comparison
once instead of once per case, and a new case cannot quietly assert something weaker.

**Good**

```go
import "testing"

func clamp(value, low, high int) int {
	switch {
	case value < low:
		return low
	case value > high:
		return high
	default:
		return value
	}
}

func TestClamp(t *testing.T) {
	tests := []struct {
		name  string
		value int
		want  int
	}{
		{name: "below the floor", value: -3, want: 0},
		{name: "inside the range", value: 5, want: 5},
		{name: "above the ceiling", value: 42, want: 10},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clamp(tt.value, 0, 10); got != tt.want {
				t.Errorf("clamp(%d, 0, 10) = %d, want %d", tt.value, got, tt.want)
			}
		})
	}
}
```

**Bad**

```go
import "testing"

func clamp(value, low, high int) int {
	switch {
	case value < low:
		return low
	case value > high:
		return high
	default:
		return value
	}
}

func TestClamp(t *testing.T) {
	for _, tt := range [][2]int{{-3, 0}, {5, 5}, {42, 10}} {
		if got := clamp(tt[0], 0, 10); got != tt[1] {
			t.Fatalf("clamp(%d, 0, 10) = %d, want %d", tt[0], got, tt[1])
		}
	}
}
```

**Caught by.** Review, and the symptoms are concrete. The failure reports values with no case name.
`go test -run TestClamp/above_the_ceiling` matches nothing, because no subtest exists to address.
`t.Fatalf` inside the loop stops the whole table, so three broken cases report as one failure.

**Sources.** https://go.dev/blog/subtests , https://go.dev/wiki/TableDrivenTests ,
https://google.github.io/styleguide/go/decisions#table-driven-tests and https://go.dev/doc/go1.22

## parallel-when-safe

- priority: P1
- atom_type: decision

**Rule.** Call `t.Parallel()` only when the test shares no mutable state with any other test and
calls neither `t.Setenv` nor `t.Chdir`. Both change the whole process, and the testing package
panics when a parallel test or a child of one calls either. A parallel subtest that closes over the
loop variable is safe since Go 1.22, because each iteration gets its own variable.

**Why.** Parallel tests cut wall-clock time, and they turn every piece of shared state into a race:
a package-level variable, a fixed TCP port, a temp path two tests both compute, an environment
variable. The `t.Setenv` ban is not a style preference. The testing package aborts the run with
`testing: test using t.Setenv or t.Chdir can not use t.Parallel`, so the combination is a crash, not
a slow leak.

**Good**

```go
import (
	"strings"
	"testing"
)

func slug(title string) string {
	return strings.ToLower(strings.ReplaceAll(title, " ", "-"))
}

func TestSlug(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		title string
		want  string
	}{
		{name: "two words", title: "Go Style", want: "go-style"},
		{name: "already lower", title: "errors", want: "errors"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := slug(tt.title); got != tt.want {
				t.Errorf("slug(%q) = %q, want %q", tt.title, got, tt.want)
			}
		})
	}
}
```

**Bad**

```go
import (
	"os"
	"testing"
)

func region() string {
	return os.Getenv("BILLING_REGION")
}

func TestRegion(t *testing.T) {
	t.Parallel()
	t.Setenv("BILLING_REGION", "eu-west-1")
	if got := region(); got != "eu-west-1" {
		t.Errorf("region() = %q, want %q", got, "eu-west-1")
	}
}
```

**Caught by.** `go test` catches the `t.Setenv` case the first time it runs, panicking with
`testing: test using t.Setenv or t.Chdir can not use t.Parallel`. `go test -race` catches shared
memory between parallel tests. Neither finds a fixed port or a shared temp path that only collides
on a busy machine, so review also checks what each parallel test writes to.

**Sources.** https://pkg.go.dev/testing#T.Parallel , https://pkg.go.dev/testing#T.Setenv and
https://github.com/uber-go/guide/blob/master/style.md#parallel-tests

## test-doubles-fake-or-mock

- priority: P1
- atom_type: decision

**Rule.** For a consumer-side interface of one to three methods, write the double by hand as a
struct of function fields. Reach for `uber-go/mock` only when the interface is wide and cannot be
narrowed, or when the call count and the argument order are themselves what the test asserts. Use
`testcontainers-go` when the honest test needs the real dependency. The interface is small in the
first place because of `rule:interfaces-at-the-consumer`.

**Why.** The hand-written fake is shorter than the generated mock, it is ordinary Go that a reader
follows without learning a matcher language, and the compiler breaks the build the moment the fake
and the interface disagree. Each test then sets one function field and states its own behaviour next
to its own assertion. A generated mock adds a tool, a generate step and a file nobody reads, and it
buys nothing until the test needs to assert how a method was called rather than what it returned.

**Good**

```go
import (
	"context"
	"errors"
	"testing"
)

type account struct {
	ID   string
	Plan string
}

type accountFinder interface {
	Find(ctx context.Context, id string) (account, error)
}

type fakeFinder struct {
	find func(ctx context.Context, id string) (account, error)
}

func (f fakeFinder) Find(ctx context.Context, id string) (account, error) {
	return f.find(ctx, id)
}

func planOf(ctx context.Context, finder accountFinder, id string) (string, error) {
	found, err := finder.Find(ctx, id)
	if err != nil {
		return "", err
	}
	return found.Plan, nil
}

func TestPlanOfPropagatesLookupFailure(t *testing.T) {
	wantErr := errors.New("account store unavailable")
	finder := fakeFinder{
		find: func(context.Context, string) (account, error) {
			return account{}, wantErr
		},
	}
	if _, err := planOf(context.Background(), finder, "C-1"); !errors.Is(err, wantErr) {
		t.Fatalf("planOf() error = %v, want %v", err, wantErr)
	}
}
```

**Bad**

```go
import (
	"context"
	"net/http"
	"testing"
)

func accountPlan(ctx context.Context, id string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://accounts.internal/"+id, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	return resp.Header.Get("X-Plan"), nil
}

func TestAccountPlan(t *testing.T) {
	plan, err := accountPlan(context.Background(), "C-1")
	if err != nil {
		t.Fatalf("accountPlan() error = %v", err)
	}
	if plan != "pro" {
		t.Errorf("plan = %q, want %q", plan, "pro")
	}
}
```

**Caught by.** The compiler catches a fake that has drifted from its interface. `unused` catches a
generated mock nobody calls. Review catches the two remaining shapes: a double that reimplements the
logic under test, and a unit test that reaches a live dependency because the code took no interface.

**Sources.** https://google.github.io/styleguide/go/best-practices#test-double-and-helper-packages ,
https://pkg.go.dev/go.uber.org/mock/gomock and https://golang.testcontainers.org/

## synctest-for-time-and-goroutines

- priority: P2
- atom_type: reference
- since: 1.25

**Rule.** Test timeouts, retries, tickers and goroutine handoffs inside `synctest.Test`. The bubble
runs on a fake clock that advances only when every goroutine in it is durably blocked, so a one-hour
timeout resolves immediately. `testing/synctest` needs Go 1.25 or later, which the baseline this
corpus targets already meets.

**Why.** A test that sleeps to wait for a timer pays that time on every run and still flakes when
the machine is loaded, so engineers shorten the timeout until the test tests nothing. The bubble
removes both problems: the test asserting the one-hour timeout below reports its own duration as
0.00s. `synctest.Wait` blocks until every other goroutine in the bubble is durably blocked, which
replaces "sleep and hope" with a real ordering guarantee. The limit is real I/O — a goroutine
blocked on a socket or a mutex is never durably blocked, so a bubble wrapped around live network
calls deadlocks and panics. Use an in-process pipe inside the bubble instead.

**Good**

```go
import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"
)

func awaitSignal(ctx context.Context, signal <-chan struct{}, within time.Duration) error {
	timer := time.NewTimer(within)
	defer timer.Stop()
	select {
	case <-signal:
		return nil
	case <-timer.C:
		return context.DeadlineExceeded
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestAwaitSignalGivesUpAfterTheDeadline(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		err := awaitSignal(t.Context(), make(chan struct{}), time.Hour)
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("awaitSignal() error = %v, want %v", err, context.DeadlineExceeded)
		}
	})
}
```

**Caught by.** Review, against two signals a reviewer can check without running anything: a
`time.Sleep` call inside a test, and a test whose own duration in `go test -v` is close to the
timeout it claims to exercise. A flaky timing test also shows up in CI as a rerun that passes.

**Sources.** https://pkg.go.dev/testing/synctest , https://go.dev/blog/synctest and
https://go.dev/doc/go1.25

## go-cmp-for-comparison

- priority: P1
- atom_type: feedback-rule

**Rule.** Compare structs, slices and maps with `cmp.Diff` from `github.com/google/go-cmp/cmp`, and
print the returned diff in the failure message. Keep `==` for scalars. Do not use
`reflect.DeepEqual` on composite values.

**Why.** `reflect.DeepEqual` returns one bool, so the test prints both whole values and leaves the
reader to find the difference. It also treats a nil slice and an empty slice as different, which
produces the worst failure there is: `merge() = {INV-1 []}, want {INV-1 []}` — two values that print
identically and still fail. `cmp.Diff` names the field that differs. go-cmp separates nil from empty
too, but `cmpopts.EquateEmpty` makes that choice explicit rather than silent. One trap to know:
`cmp.Diff` panics on unexported fields unless you pass `cmp.AllowUnexported` or
`cmpopts.IgnoreUnexported`.

**Good**

```go
import (
	"testing"

	"github.com/google/go-cmp/cmp"
)

type invoice struct {
	ID    string
	Lines []string
}

func merge(base invoice, extra []string) invoice {
	base.Lines = append(base.Lines, extra...)
	return base
}

func TestMergeKeepsOrder(t *testing.T) {
	want := invoice{ID: "INV-1", Lines: []string{"setup", "support"}}
	got := merge(invoice{ID: "INV-1", Lines: []string{"setup"}}, []string{"support"})
	if diff := cmp.Diff(want, got); diff != "" {
		t.Errorf("merge() mismatch (-want +got):\n%s", diff)
	}
}
```

**Bad**

```go
import (
	"reflect"
	"testing"
)

type invoice struct {
	ID    string
	Lines []string
}

func merge(base invoice, extra []string) invoice {
	base.Lines = append(base.Lines, extra...)
	return base
}

func TestMergeKeepsOrder(t *testing.T) {
	want := invoice{ID: "INV-1", Lines: []string{}}
	got := merge(invoice{ID: "INV-1"}, nil)
	if !reflect.DeepEqual(want, got) {
		t.Errorf("merge() = %v, want %v", got, want)
	}
}
```

**Caught by.** Review. The reviewer looks for `reflect.DeepEqual` in a test, and for a failure
message that prints two whole values instead of a diff. The symptom reaches CI as a red test whose
output shows two values a human reads as identical.

**Sources.** https://pkg.go.dev/github.com/google/go-cmp/cmp ,
https://pkg.go.dev/github.com/google/go-cmp/cmp/cmpopts and
https://google.github.io/styleguide/go/decisions#equality-comparison-and-diffs

## race-detector-in-ci

- priority: P1
- atom_type: decision

**Rule.** Run `go test -race -count=1 ./...` on every pull request. `-count=1` defeats the test
cache, so the binary actually runs instead of CI replaying a stored pass. Budget for the cost: the
race detector raises memory use by 5-10x and execution time by 2-20x, so a large suite may keep a
plain run for speed and a race run as the gate.

**Why.** The race detector is dynamic. It reports a race only on a memory access some test actually
executed, so a clean run says the covered paths are clean and says nothing about the rest. Treat it
as a floor, not as proof of safety, and treat a concurrent path with no test as unmeasured. Without
`-count=1` a restored build cache replays an earlier result and the detector never starts, which
looks exactly like a pass.

**Good**

```bash
go test -race -count=1 ./...
```

The gate is only worth as much as the concurrent code the suite exercises, so the test drives the
real path from several goroutines:

```go
import (
	"sync"
	"testing"
)

type hitCounter struct {
	mu     sync.Mutex
	counts map[string]int
}

func (c *hitCounter) add(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts[key]++
}

func TestHitCounterAddFromManyGoroutines(t *testing.T) {
	counter := &hitCounter{counts: make(map[string]int)}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			counter.add("checkout")
		})
	}
	wg.Wait()
	if got := counter.counts["checkout"]; got != 8 {
		t.Fatalf("counts[checkout] = %d, want 8", got)
	}
}
```

**Bad**

```bash
go test ./...
```

**Caught by.** `go test -race` reports the race itself, with the stack of both conflicting accesses.
Review catches the workflow that drops `-race` or `-count=1`. The detector does not report a
goroutine that simply never exits, which needs `rule:goroutine-leak-detection`.

**Sources.** https://go.dev/doc/articles/race_detector and https://go.dev/blog/race-detector
