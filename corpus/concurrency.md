---
id: concurrency
area: concurrency
subject: [architecture]
updated: '2026-10-01'
rules: 5
---

# Concurrency

How goroutines start, stop and are counted. Every goroutine in this area has a named owner, a
guaranteed way to exit, and a cap on how many of it can run at once.

## goroutine-lifetime-ownership

- priority: P0
- atom_type: decision

**Rule.** Whoever starts a goroutine owns its exit. Before writing `go`, name the thing that makes it
return: a closed input channel, a `select` on `ctx.Done()`, or a loop over a finite slice. The
goroutine that creates a channel and sends on it is the one that closes it, with `defer close(ch)`
as its first statement. Never close from the receiving side, never from two senders. Take the
context in and select on it — see `rule:cancellation-propagation`.

**Why.** A goroutine blocked on a send nobody will ever receive does not return. Its stack, its
captured variables and everything they point at stay reachable for the life of the process, and the
caller that walked away from the channel sees no error at all. Closing from the receiver or from a
second sender converts the same missing decision into a panic on a live send. Both failures come
from the same gap: nobody wrote down who owns the channel.

**Good**

```go
import (
	"context"
)

func produce(ctx context.Context, values []int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, value := range values {
			select {
			case out <- value:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}
```

**Bad**

```go
import (
	"context"
)

func produce(ctx context.Context, values []int) <-chan int {
	out := make(chan int)
	go func() {
		for _, value := range values {
			out <- value
		}
		close(out)
	}()
	return out
}

func first(ctx context.Context, values []int) int {
	for value := range produce(ctx, values) {
		return value
	}
	return 0
}
```

**Caught by.** `goleak` in `TestMain` reports the goroutine still blocked when a package's tests
finish and prints the stack that started it — see `rule:goroutine-leak-detection`. Neither the
compiler nor `go vet` sees it. Review looks for a `go` statement whose body has no `select` on a done
channel and no input that is guaranteed to close.

**Sources.** https://go.dev/blog/pipelines and https://go.dev/wiki/CodeReviewComments#goroutine-lifetimes
and https://github.com/uber-go/guide/blob/master/style.md#dont-fire-and-forget-goroutines

## channel-buffer-one-or-none

- priority: P1
- atom_type: decision

**Rule.** Make a channel unbuffered, or give it a buffer of one when it carries a single value the
sender must be able to drop off and walk away from. A larger buffer needs a sentence saying what the
number means, and the only good answer is that the buffer **is** the concurrency limit. Prefer
`errgroup.SetLimit` or `golang.org/x/sync/semaphore` to a hand-rolled `chan struct{}` token pool —
see `rule:bounded-fan-out-errgroup`.

**Why.** An unbuffered channel makes the handoff visible: the sender waits until a receiver takes the
value, so a missing receiver shows up as a block you can read in a stack dump. A buffer of one has
exactly one job — let a goroutine deliver its single result and exit even when the caller has already
given up on `ctx.Done()`, which is what keeps the abandoned goroutine from leaking. A larger number
is usually a guess at a queue depth: it hides back-pressure until the buffer fills, then blocks
anyway, at a worse moment. A hand-rolled token pool is worse still, because every early return that
skips the matching receive removes a token for good, and the pool shrinks until nothing starts.

**Good**

```go
import (
	"context"
)

type result struct {
	body string
	err  error
}

func fetch(ctx context.Context, call func() (string, error)) (string, error) {
	done := make(chan result, 1)
	go func() {
		body, err := call()
		done <- result{body: body, err: err}
	}()
	select {
	case r := <-done:
		return r.body, r.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}
```

**Bad**

```go
import (
	"sync"
)

func process(items []string, work func(string) error) error {
	tokens := make(chan struct{}, 8)
	var wg sync.WaitGroup
	var once sync.Once
	var first error
	for _, item := range items {
		tokens <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := work(item); err != nil {
				once.Do(func() { first = err })
				return
			}
			<-tokens
		}()
	}
	wg.Wait()
	return first
}
```

**Caught by.** No linter sizes a channel for you. `go test -race` with a test that cancels the
context catches the abandoned sender, and `goleak` names the goroutine left blocked on the empty
token pool. Review asks two questions: what does this buffer's number mean, and does every path that
takes a token give it back.

**Sources.** https://github.com/uber-go/guide/blob/master/style.md#channel-size-is-one-or-none and
https://go.dev/doc/effective_go#channels

## bounded-fan-out-errgroup

- priority: P1
- atom_type: pattern-gotcha

**Rule.** Fan out with `errgroup.WithContext` plus `SetLimit(n)`. The group caps how many goroutines
run at once, `Wait` returns the first error, and the derived context cancels the siblings the moment
one of them fails. Write the loop body straight into the closure: Go 1.22 gave `for` loops a fresh
variable per iteration, so `url := url` at the top of a closure is obsolete and must never appear in
new code.

**Why.** An unbounded `for … go` opens one goroutine, one connection and one buffer per item, so an
input that is ten items in a test and a hundred thousand in production exhausts file descriptors or
memory. Collecting the first error by hand needs a mutex, a `sync.Once` or a buffered channel, and
still leaves every sibling running after the failure that already decided the outcome. `errgroup`
does the cap, the first-error capture and the cancellation in three calls, and `SetLimit` makes the
number an argument a reader can see rather than a channel's capacity they have to infer.

**Good**

```go
import (
	"context"

	"golang.org/x/sync/errgroup"
)

type fetcher func(ctx context.Context, url string) ([]byte, error)

func fetchAll(ctx context.Context, urls []string, fetch fetcher) ([][]byte, error) {
	bodies := make([][]byte, len(urls))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(8)
	for i, url := range urls {
		group.Go(func() error {
			body, err := fetch(groupCtx, url)
			if err != nil {
				return err
			}
			bodies[i] = body
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}
	return bodies, nil
}
```

**Bad**

```go
import (
	"context"
	"sync"
)

type fetcher func(ctx context.Context, url string) ([]byte, error)

func fetchAll(ctx context.Context, urls []string, fetch fetcher) [][]byte {
	bodies := make([][]byte, len(urls))
	var wg sync.WaitGroup
	for i, url := range urls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body, _ := fetch(ctx, url)
			bodies[i] = body
		}()
	}
	wg.Wait()
	return bodies
}
```

**Caught by.** `errcheck` reports the dropped error in the unbounded form. The missing cap is caught
by review: the reviewer asks what limits the number of goroutines one call can start when the input
slice is sized by a request rather than by the author.

**Sources.** https://pkg.go.dev/golang.org/x/sync/errgroup and https://go.dev/doc/go1.22#language

## goroutine-leak-detection

- priority: P2
- atom_type: reference

**Rule.** Every package that starts a goroutine gets a `TestMain` calling `goleak.VerifyTestMain(m)`.
It runs after the package's tests and fails them when a goroutine those tests started is still
running, printing the stack that created it.

**Why.** A leaked goroutine passes every test, because the assertions are about returned values and a
blocked goroutine returns nothing. The symptom reaches production as memory that climbs and never
falls, far from the code that caused it. `goleak` turns the leak into a failure in the package that
produced it, which is the only place the creating stack is still readable. Counting goroutines after
a sleep is not a substitute: it is flaky under load and names no goroutine.

**Good**

```go
import (
	"testing"

	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m)
}
```

**Bad**

```go
import (
	"runtime"
	"testing"
	"time"
)

func start() {}

func TestWorkerStops(t *testing.T) {
	before := runtime.NumGoroutine()
	start()
	time.Sleep(100 * time.Millisecond)
	if runtime.NumGoroutine() > before {
		t.Fatal("worker still running")
	}
}
```

**Caught by.** `goleak` itself, at the end of the package's test binary. Whether a package that
starts goroutines actually has the check is caught by review, or by a repository check that lists
every package holding a `go` statement and no `TestMain`.

**Sources.** https://pkg.go.dev/go.uber.org/goleak and https://github.com/uber-go/goleak

## waitgroup-go

- priority: P2
- atom_type: reference
- since: 1.25

**Rule.** On Go 1.25 and later, start a tracked goroutine with `wg.Go(fn)`. One call does the
`Add(1)`, the `go` and the `defer Done()`, so the counter cannot drift.

**Why.** `Add` and `Done` are two statements that must agree, written far apart, and nothing checks
them. A missed `Done` leaves `Wait` blocked forever. An `Add` placed inside the goroutine instead of
before it lets `Wait` return before any work has started, so the caller reads a half-filled result
and the test passes on a fast machine. `wg.Go` removes both failures because there is no counter left
to get wrong.

**Good**

```go
import (
	"sync"
)

func sumAll(parts [][]int) []int {
	totals := make([]int, len(parts))
	var wg sync.WaitGroup
	for i, part := range parts {
		wg.Go(func() {
			for _, value := range part {
				totals[i] += value
			}
		})
	}
	wg.Wait()
	return totals
}
```

**Bad**

```go
import (
	"sync"
)

func sumAll(parts [][]int) []int {
	totals := make([]int, len(parts))
	var wg sync.WaitGroup
	for i, part := range parts {
		wg.Add(1)
		go func() {
			for _, value := range part {
				totals[i] += value
			}
		}()
	}
	wg.Wait()
	return totals
}
```

**Caught by.** The compiler rejects `wg.Go` as undefined on a toolchain older than Go 1.25, which is
how a repository learns its baseline is too low. A missed `Done` is caught by no linter: the
package's tests hang until `go test` reaches its timeout and panics with the stack of every blocked
goroutine.

**Sources.** https://go.dev/doc/go1.25#syncpkgsync and https://pkg.go.dev/sync#WaitGroup.Go
