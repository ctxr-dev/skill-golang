---
id: context
area: context
subject: [architecture]
updated: '2026-10-01'
rules: 4
---

# Context

Where a `context.Context` comes from, how far it travels, and what it is allowed to carry. A context
belongs to one call; it is a parameter, never a field.

## context-first-parameter

- priority: P1
- atom_type: feedback-rule

**Rule.** Give every function that blocks, does I/O, or calls something that does a first parameter
named `ctx` of type `context.Context`. Take the caller's context and pass it on. Never build a fresh
`context.Background()` part-way down a call chain. `context.TODO()` marks a signature not yet
threaded through and is a temporary marker, not a resting place.

**Why.** Cancellation and deadlines only work if one context reaches every blocking call the request
makes. A function that creates its own root context severs the chain at that point: the caller's
timeout expires, the caller returns, and the database query underneath keeps a connection busy until
it finishes on its own. The position is fixed by convention so a reader can see at a glance whether a
call is cancellable, and so tooling can check it.

**Good**

```go
import (
	"context"
	"database/sql"
)

type store struct {
	db *sql.DB
}

func (s *store) userName(ctx context.Context, id int64) (string, error) {
	var name string
	row := s.db.QueryRowContext(ctx, "SELECT name FROM users WHERE id = $1", id)
	if err := row.Scan(&name); err != nil {
		return "", err
	}
	return name, nil
}
```

**Bad**

```go
import (
	"context"
	"database/sql"
)

type store struct {
	db *sql.DB
}

func (s *store) userName(id int64) (string, error) {
	ctx := context.Background()
	var name string
	row := s.db.QueryRowContext(ctx, "SELECT name FROM users WHERE id = $1", id)
	if err := row.Scan(&name); err != nil {
		return "", err
	}
	return name, nil
}
```

**Caught by.** `contextcheck` reports a function that uses a context it did not inherit from its
caller. `revive`'s `context-as-argument` rule reports a `context.Context` that is not the first
parameter.

**Sources.** https://go.dev/blog/context and https://go.dev/wiki/CodeReviewComments#contexts and
https://pkg.go.dev/context

## cancellation-propagation

- priority: P1
- atom_type: pattern-gotcha

**Rule.** Pass the context down to every call that can block, and select on `ctx.Done()` in any loop
that can wait. Write `defer cancel()` on the statement after `context.WithTimeout`, `WithDeadline` or
`WithCancel`, before anything else. A deadline nothing selects on changes nothing.

**Why.** `WithTimeout` registers a timer and attaches a child context to its parent. Not calling
`cancel` keeps both alive until the deadline fires, so a handler that returns in a millisecond still
holds a five-second timer and its child for five seconds, once per request. The second half is worse,
because it is silent: a blocking receive, a `Read` with no deadline or a `sleep` loop never looks at
`ctx.Done()`, so the context expires and the goroutine carries on working for a caller that left.
Selecting on `ctx.Done()` is what converts a deadline into a return.

**Good**

```go
import (
	"context"
	"time"
)

func drain(ctx context.Context, in <-chan int, handle func(int)) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	for {
		select {
		case value, ok := <-in:
			if !ok {
				return nil
			}
			handle(value)
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
```

**Bad**

```go
import (
	"context"
	"time"
)

func drain(ctx context.Context, in <-chan int, handle func(int)) error {
	timeout, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	for value := range in {
		handle(value)
	}
	return timeout.Err()
}
```

**Caught by.** `govet`'s lostcancel check reports a `cancel` function that is dropped or not called
on every path. `contextcheck` reports a callee that is handed a context the caller never received.
Neither sees the loop that ignores `ctx.Done()`; that one is caught by a test that cancels the
context and asserts the function returns, and by review of every unbounded loop.

**Sources.** https://go.dev/blog/context and https://pkg.go.dev/context#WithTimeout and
https://google.github.io/styleguide/go/best-practices#contexts

## no-context-in-structs

- priority: P1
- atom_type: feedback-rule

**Rule.** Keep the context in the parameter list. A long-lived object — a client, a service, a
repository — never stores a `context.Context` in a field. The one documented exception is a struct
that **is** one request, created and discarded with it, and that struct must say so where the field
is declared.

**Why.** A context carries one call's deadline, one call's cancellation and one call's values. Stored
in a field, it is captured from whichever call happened to construct the object, usually startup,
and every later call inherits it. Either the stored context never cancels, so nothing can be stopped,
or it cancels once and every subsequent call fails with `context.Canceled` for no reason a caller can
see. The field also hides the cancellation from the signature, so a reader cannot tell what a method
will respect.

**Good**

```go
import (
	"context"
	"net/http"
)

type client struct {
	http *http.Client
	base string
}

func (c *client) get(ctx context.Context, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return nil, err
	}
	return c.http.Do(req)
}
```

**Bad**

```go
import (
	"context"
	"net/http"
)

type client struct {
	ctx  context.Context
	http *http.Client
	base string
}

func (c *client) get(path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(c.ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return nil, err
	}
	return c.http.Do(req)
}
```

**Caught by.** Review, reading the struct definitions: a `context.Context` field is the signal, and
the question is whose call it belongs to. `contextcheck` reports the knock-on effect, a method that
reaches a blocking call with a context its caller never supplied.

**Sources.** https://pkg.go.dev/context and https://go.dev/blog/context and
https://google.github.io/styleguide/go/best-practices#contexts

## context-values-are-request-scoped

- priority: P1
- atom_type: feedback-rule

**Rule.** Use `context.WithValue` only for request-scoped data that crosses an API boundary: a
request id, a trace span, the authenticated caller. Never for a parameter the function needs to do
its work. Make the key an unexported named type so no other package can collide with it, and export
a typed accessor instead of the key.

**Why.** A value in a context is invisible in the signature and unchecked by the compiler, so a
function that depends on one compiles happily and fails at run time in the one caller that forgot it.
Keeping it to data that is attached once at the edge and read for logging or tracing keeps that risk
to things the function can do without. The key must be a named unexported type because the context
compares keys with `==` across the whole program: a key of type `string` set by one package silently
overwrites the same string set by another, and neither sees the other.

**Good**

```go
import (
	"context"
	"net/http"
)

type requestIDKey struct{}

// WithRequestID returns a copy of ctx carrying id for the lifetime of one request.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestID reports the request id carried by ctx, and whether one was set.
func RequestID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(requestIDKey{}).(string)
	return id, ok
}

func tag(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := WithRequestID(r.Context(), r.Header.Get("X-Request-Id"))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```

**Bad**

```go
import (
	"context"
)

func withLocale(ctx context.Context, locale string) context.Context {
	return context.WithValue(ctx, "locale", locale)
}

func greeting(ctx context.Context) string {
	locale, _ := ctx.Value("locale").(string)
	return "hello, " + locale
}
```

**Caught by.** `staticcheck` reports a `context.WithValue` key of a built-in type, and `revive`'s
`context-keys-type` rule reports the same. A value the function actually needs is caught by review:
the reviewer asks what the function does when the value is absent, and makes it a parameter when the
answer is "it is broken".

**Sources.** https://go.dev/blog/context and https://pkg.go.dev/context#WithValue and
https://go.dev/wiki/CodeReviewComments#contexts
