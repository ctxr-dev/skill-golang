---
id: safety
area: safety
subject: [languages]
updated: '2026-10-01'
rules: 6
---

# Safety

The Go constructs that compile cleanly and then take the process down: a panic on the request path,
a nil map, a shared backing array, an unchecked type assertion, and state built before anything can
observe it.

## panic-policy

- priority: P0
- atom_type: decision

**Rule.** Panic only for programmer error the process finds before it serves traffic: a template
that does not parse, a `switch` default that the code says cannot happen. Never let a panic cross an
exported boundary — a library returns an error so the caller decides. Never panic in a goroutine
with no recovery, because an unrecovered panic in any goroutine kills the whole process. The error
you return instead is handled once, as `rule:wrap-or-log-never-both` requires.

**Why.** A panic is the program saying it has no idea what to do, and stopping is the only safe
answer to that. Stopping is right at start-up, where it costs one failed deploy and the stack trace
points straight at the mistake. It is wrong once requests are arriving, where it turns one bad input
into an outage for every other request in flight. A library cannot tell which of the two situations
it is in, so it never makes the choice: it returns the error, and the main package decides.

**Good**

```go
import (
	"errors"
	"html/template"
	"io"
)

var page = template.Must(template.New("page").Parse("<h1>{{.}}</h1>"))

// Render writes the page for title, or reports why it could not.
func Render(w io.Writer, title string) error {
	if title == "" {
		return errors.New("empty title")
	}
	return page.Execute(w, title)
}
```

**Bad**

```go
import (
	"html/template"
	"io"
)

var page = template.Must(template.New("page").Parse("<h1>{{.}}</h1>"))

// Render writes the page for title.
func Render(w io.Writer, title string) {
	if title == "" {
		panic("empty title")
	}
	if err := page.Execute(w, title); err != nil {
		panic(err)
	}
}

func watchJobs(jobs <-chan string) {
	go func() {
		for job := range jobs {
			if job == "" {
				panic("empty job")
			}
		}
	}()
}
```

**Caught by.** Review. The reviewer looks for `panic` anywhere other than package-level
initialisation or the start-up path of `main`, before the process serves traffic, and for a
`go func()` whose body can panic with no `recover`. No linter in the baseline set reports either, so
this is one of the rules a human has to hold.

**Sources.** https://go.dev/doc/effective_go and https://google.github.io/styleguide/go/best-practices

## nil-slices-at-the-boundary

- priority: P1
- atom_type: decision

**Rule.** A nil slice is a valid empty slice: `len`, `range` and `append` all work on it. Inside the
program, declare `var out []T` and let `append` allocate. Write `[]T{}` only where the value is
marshalled, or crosses a contract where JSON `null` and `[]` mean different things to the reader. A
map is the opposite case: always allocate it before the first write, because writing to a nil map
panics.

**Why.** `var out []T` is correct whether the loop appends anything or not, so no code needs a
guard before the loop. The exception exists because the difference leaks in exactly one place:
`encoding/json` writes `null` for a nil slice and `[]` for an empty one, and a client that reads the
length of the field breaks on `null`. Maps have no such symmetry — reading a nil map returns the
zero value, writing to one is a fatal panic — so allocating is the safe default there.

**Good**

```go
import "encoding/json"

type report struct {
	Tags []string `json:"tags"`
}

func matching(in []string, keep func(string) bool) []string {
	var out []string
	for _, item := range in {
		if keep(item) {
			out = append(out, item)
		}
	}
	return out
}

func encodeReport(tags []string) ([]byte, error) {
	if tags == nil {
		tags = []string{}
	}
	return json.Marshal(report{Tags: tags})
}

func index(pairs [][2]string) map[string]string {
	out := make(map[string]string, len(pairs))
	for _, pair := range pairs {
		out[pair[0]] = pair[1]
	}
	return out
}
```

**Bad**

```go
func matching(in []string, keep func(string) bool) []string {
	out := []string{}
	if in != nil {
		for _, item := range in {
			if keep(item) {
				out = append(out, item)
			}
		}
	}
	return out
}

func index(pairs [][2]string) map[string]string {
	var out map[string]string
	for _, pair := range pairs {
		out[pair[0]] = pair[1]
	}
	return out
}
```

**Caught by.** `staticcheck` reports the redundant nil check around a `range` under its S1031 check.
The nil map write is a run-time panic reading `assignment to entry in nil map`, so the first test
that drives the path finds it. The marshalling exception is a review check: the reviewer asks for
the contract reason whenever a slice is initialised explicitly.

**Sources.** https://go.dev/doc/effective_go and https://google.github.io/styleguide/go/decisions

## map-write-and-concurrent-access

- priority: P1
- atom_type: pattern-gotcha

**Rule.** Guard every map more than one goroutine can touch. Put a mutex next to it and lock on
every read and every write, or use `sync.Map` for the append-mostly case where a key is written once
and read many times. Two goroutines writing the same map is a fatal run-time error, not an error
value and not a panic you can recover from.

**Why.** The runtime detects concurrent map writes and stops the process with `fatal error:
concurrent map writes`. `recover` does not catch it, so there is no graceful degradation: the whole
process dies and takes every unrelated request with it. The bug is also load dependent, so it passes
on a laptop and appears under production traffic. `go test -race` is what makes it reproducible,
because the race detector prints both conflicting accesses with both stacks.

**Good**

```go
import "sync"

type counter struct {
	mu     sync.Mutex
	totals map[string]int
}

func newCounter() *counter {
	return &counter{totals: make(map[string]int)}
}

func (c *counter) add(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.totals[key]++
}

func (c *counter) total(key string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.totals[key]
}
```

**Bad**

```go
import "sync"

type counter struct {
	totals map[string]int
}

func (c *counter) addAll(keys []string) {
	var wg sync.WaitGroup
	for _, key := range keys {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.totals[key]++
		}()
	}
	wg.Wait()
}
```

**Caught by.** `go test -race`, which names both goroutines and both stacks. The race detector only
sees paths a test actually drives, so a package with shared state needs a test that runs the
concurrent path, not only the single-goroutine one.

**Sources.** https://go.dev/doc/articles/race_detector and https://go.dev/blog/maps

## append-aliasing

- priority: P1
- atom_type: pattern-gotcha

**Rule.** Treat the slice `append` returns as possibly sharing a backing array with the slice you
passed in. When you append to a slice you did not allocate, cap it first with the three-index form
`s[:len(s):len(s)]`, which forces `append` to copy. When you want an independent copy outright, say
so with `slices.Clone`.

**Why.** `append` reuses the backing array whenever spare capacity allows, and returns a header
pointing into that same memory. Two callers appending to one base slice therefore write to the same
array slot, and the second write silently overwrites the element the first caller still holds and
still believes in. The three-index form sets capacity equal to length, so there is no spare room and
`append` must allocate. Nothing in the type system marks the difference, which is why this survives
a review that is not looking for it.

**Good**

```go
import "slices"

func withTag(base []string, tag string) []string {
	return append(base[:len(base):len(base)], tag)
}

func snapshot(base []string) []string {
	return slices.Clone(base)
}
```

**Bad**

```go
func withTag(base []string, tag string) []string {
	return append(base, tag)
}

func bothTags(base []string) ([]string, []string) {
	return withTag(base, "a"), withTag(base, "b")
}
```

**Caught by.** A test and review together. No linter in the baseline set reports it. The reviewer
looks for `append` to a slice the function received as a parameter, with neither a three-index cap
nor a clone. The test calls the function twice against one base slice that has spare capacity and
asserts on both results, which fails as soon as the second call overwrites the first.

**Sources.** https://go.dev/blog/slices and https://go.dev/ref/spec#Slice_expressions

## type-assertion-comma-ok

- priority: P1
- atom_type: feedback-rule

**Rule.** Use the two-value form `v, ok := x.(T)` every time, unless a failed assertion genuinely
must stop the process — and then make that intent visible where you write it. The one-value form
`x.(T)` panics on a mismatch. When several types need handling, a type switch reads better than a
chain of assertions.

**Why.** The one-value form puts a panic in the hot path of anything accepting `any`: a decoded JSON
value, a `context` value, a value crossing a plugin boundary. That data comes from outside the
program, so its type is a hope rather than a fact, and the first caller who sends a number where you
expected a string takes the process down. The two-value form costs one identifier and turns the same
mismatch into a branch you control.

**Good**

```go
import "strconv"

func label(v any) string {
	switch value := v.(type) {
	case string:
		return value
	case int:
		return strconv.Itoa(value)
	default:
		return "unknown"
	}
}

func userID(v any) (string, bool) {
	id, ok := v.(string)
	return id, ok
}
```

**Bad**

```go
import "strconv"

func label(v any) string {
	if _, isNumber := v.(int); isNumber {
		return strconv.Itoa(v.(int))
	}
	return v.(string)
}
```

**Caught by.** `staticcheck` reports an assertion that can never succeed, which is the subset a tool
can prove. The rest is review: the reviewer looks for a one-value `x.(T)` and asks what is supposed
to happen when the value is not a `T`, and whether stopping the process is really that answer.

**Sources.** https://go.dev/ref/spec#Type_assertions and https://go.dev/doc/effective_go

## avoid-init-and-mutable-globals

- priority: P1
- atom_type: feedback-rule

**Rule.** Do not use `init`. Build state in a constructor the caller invokes, and pass the result
down to whatever needs it. Do not write to a package-level `var` after start-up. A `const`, or a
table that is never written after its declaration, is fine.

**Why.** `init` runs before `main`, in an order the language fixes across files that nobody reading
one file can see. It takes no parameter, returns no error and cannot be skipped by a test, so a
package that reads its environment there has no testable configuration and no clean way to fail. A
mutable package-level `var` fails differently: every goroutine in the process can write it, so the
first concurrent handler turns it into a data race, and a test that sets it leaks into the next test
in the same binary.

**Good**

```go
import (
	"errors"
	"os"
	"time"
)

const defaultTimeout = 5 * time.Second

type config struct {
	Endpoint string
	Timeout  time.Duration
}

func loadConfig() (config, error) {
	endpoint := os.Getenv("ENDPOINT")
	if endpoint == "" {
		return config{}, errors.New("ENDPOINT is not set")
	}
	return config{Endpoint: endpoint, Timeout: defaultTimeout}, nil
}

type server struct {
	cfg config
}

func newServer(cfg config) *server {
	return &server{cfg: cfg}
}
```

**Bad**

```go
import (
	"os"
	"time"
)

var (
	endpoint string
	timeout  = 5 * time.Second
)

func init() {
	endpoint = os.Getenv("ENDPOINT")
	if endpoint == "" {
		endpoint = "http://localhost:8080"
	}
}

func setTimeout(d time.Duration) {
	timeout = d
}
```

**Caught by.** `go test -race` reports the shared write as soon as a test drives two goroutines
through it. The rest is review: the reviewer looks for `func init()`, and for any package-level
`var` assigned anywhere other than its own declaration. The baseline linter set has no dedicated
check for either.

**Sources.** https://go.dev/ref/spec#Package_initialization and https://google.github.io/styleguide/go/best-practices
