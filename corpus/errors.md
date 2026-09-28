---
id: errors
area: errors
subject: [languages]
updated: '2026-10-01'
rules: 4
---

# Errors

How a Go program reports failure: where an error is handled, whether the caller matches a condition
or reads a field out of it, and what the message looks like after three layers have wrapped it.

## wrap-or-log-never-both

- priority: P0
- atom_type: decision

**Rule.** Handle an error once. Either wrap it with `fmt.Errorf("doing thing: %w", err)` and return
it, or log it and stop there. Never do both in one call frame. Never write `_ = fn()` to silence an
error you would rather not deal with. There is a third move, and only one: where a third party fixes
the signature so it cannot return an error, and the error provably cannot arise, assign the result to
blanks and prove the impossibility in the review or in a test. That ban is about an error you decided
not to handle; it was never about an error that cannot happen.

**Why.** Logging and returning means every layer above you logs the same failure again, so one
broken file read becomes five log lines that read as five incidents. Only the caller knows whether
the failure is worth reporting, so hand it the error and let it decide. Silencing with `_ =` is the
same bug with the volume at zero: the failure still happened, and now nobody will ever learn it did.

The first two moves both assume you have somewhere to put the error. A callback whose signature a
third-party interface fixes returns nothing, so wrapping is not available, and logging then costs a
logger field, a constructor argument and about seven lines to report a branch that cannot run.
`bytes.Buffer.Write` never returns a non-nil error — it panics if the buffer outgrows memory — so an
`if err != nil` on it is dead code that every later reader still has to work through. Assigning to
blanks says the return was read and dismissed on purpose. The proof then belongs where someone can
disagree with it: the review, or a test that fails the day the error becomes reachable.

**Good**

```go
import (
	"fmt"
	"os"
)

func readConfig(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	return data, nil
}
```

**Good (impossible error)**

`render` owns the buffer it passes in, so the only error `Format` could ever see is the one
`bytes.Buffer` never returns. The signature comes from `formatter` and has no error to return.

```go
import "bytes"

type formatter interface {
	Format(out *bytes.Buffer)
}

type header struct {
	title string
}

var _ formatter = header{}

func (h header) Format(out *bytes.Buffer) {
	_, _ = out.Write([]byte(h.title))
}

func render(f formatter) string {
	var out bytes.Buffer
	f.Format(&out)
	return out.String()
}
```

**Bad**

```go
import (
	"fmt"
	"log/slog"
	"os"
)

func readConfig(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		slog.Error("read config failed", "path", path, "error", err)
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	return data, nil
}

func removeConfig(path string) {
	_ = os.Remove(path)
}
```

**Caught by.** `errcheck`, and its exact reach matters here. It reports an error return dropped
outright, such as `w.Write(p)` on a writer type it does not exclude, or a bare `mayFail()`. Under
the baseline in `rule:golangci-lint-baseline` it reports neither `_, _ = w.Write(p)` nor
`_ = mayFail()`, because that config leaves errcheck's `check-blank` option off; turn `check-blank`
on and both blank forms are reported as well. Its shipped exclusions also cover
`(*bytes.Buffer).Write` and the `fmt` print family, so even a bare call to one of those passes. The
rest is a review check: the reviewer looks for a call frame that both writes a log line and returns
an error for the same failure, and for a blank assignment whose impossibility nobody proved.

**Sources.** https://go.dev/blog/go1.13-errors and https://github.com/uber-go/guide/blob/master/style.md

## sentinel-vs-typed

- priority: P1
- atom_type: decision

**Rule.** Use a sentinel — `var ErrNotFound = errors.New("not found")`, matched with `errors.Is` —
when the caller only needs to know which condition happened. Use a typed struct error, matched with
`errors.As`, when the caller needs a field out of it. Errors come from the standard library only:
`errors` and `fmt`, with no error package layered on top.

**Why.** What the caller does next decides the shape. A caller that maps "not found" to a 404 needs
a comparison and nothing more, and a sentinel gives it one without exporting a type. A caller that
must tell the user which field failed validation needs that field, and only a struct carries it.
`errors.Is` and `errors.As` both walk the `%w` chain, so a match survives any number of wrapping
layers. An error library buys little the wrapped chain does not already give, and it makes every
caller depend on that library to read your errors.

**Good**

```go
import (
	"errors"
	"fmt"
)

// ErrNotFound reports that no record exists for the requested id.
var ErrNotFound = errors.New("not found")

// InvalidFieldError reports which submitted field failed validation.
type InvalidFieldError struct {
	Field  string
	Reason string
}

func (e *InvalidFieldError) Error() string {
	return fmt.Sprintf("invalid field %s: %s", e.Field, e.Reason)
}

func statusFor(err error) (int, string) {
	if errors.Is(err, ErrNotFound) {
		return 404, ""
	}
	var invalid *InvalidFieldError
	if errors.As(err, &invalid) {
		return 400, invalid.Field
	}
	return 500, ""
}
```

**Bad**

```go
import "strings"

func statusFor(err error) int {
	if strings.Contains(err.Error(), "not found") {
		return 404
	}
	return 500
}
```

**Caught by.** `govet` runs the `errorsas` check, which rejects an `errors.As` target that is not a
pointer to a type implementing `error`. Picking the wrong shape is a review check: the reviewer asks
what the caller does with the error, and expects a sentinel when the answer is a branch and a typed
error when the answer reads a field.

**Sources.** https://go.dev/blog/go1.13-errors and https://google.github.io/styleguide/go/best-practices

## error-string-form

- priority: P1
- atom_type: feedback-rule

**Rule.** Write the error string in lower case with no trailing punctuation. Capitalise only a
proper noun or an initialism that is capitalised everywhere else, such as `HTTP`, `TLS` or an
environment variable name. The string must read as a fragment, because a caller will wrap it and
yours then sits in the middle of a longer sentence.

**Why.** `fmt.Errorf("load user %s: %w", id, err)` joins messages with a colon and a space. A
capital letter or a full stop in the middle of that chain produces
`load user u7: Connection refused.: timeout`, which reads as damage. Keeping every message a
lower-case fragment means any depth of wrapping still yields one readable sentence, with each layer
adding only what it knows and never repeating what the layer below already said.

**Good**

```go
import (
	"errors"
	"fmt"
)

var errNoRows = errors.New("no rows in result set")

func loadUser(id string) error {
	if id == "" {
		return errors.New("empty user id")
	}
	return fmt.Errorf("load user %s: %w", id, errNoRows)
}
```

**Bad**

```go
import (
	"errors"
	"fmt"
)

var errNoRows = errors.New("No rows in result set.")

func loadUser(id string) error {
	if id == "" {
		return errors.New("Error: empty user ID!")
	}
	return fmt.Errorf("Failed to load user %s: %w.", id, errNoRows)
}
```

**Caught by.** `staticcheck` reports a capitalised or punctuated error string under its ST1005
check. The redundant prefix — an error string that begins with "error" or "failed to" — is a review
check: the reviewer deletes the prefix, because the value's type already says it is an error.

**Sources.** https://go.dev/wiki/CodeReviewComments and https://google.github.io/styleguide/go/decisions

## errors-as-type

- priority: P2
- atom_type: reference
- since: 1.26

**Rule.** On Go 1.26, match a typed error with `errors.AsType[*MyError](err)`, which returns
`(*MyError, bool)`. This needs Go 1.26, so neither example below is compiled by this repository's
checks — they run on a Go 1.25 toolchain, which has no `errors.AsType`. On Go 1.25, use `errors.As`
with a declared target variable. Both walk the same `%w` chain, and nothing in
`rule:sentinel-vs-typed` changes either way.

**Why.** `errors.As` takes an `any` target and checks its shape at run time, so passing a value
instead of a pointer, or a type that does not implement `error`, compiles and then panics.
`errors.AsType` puts the type in a type parameter, so the compiler rejects the same mistake at the
call site. The Go 1.26 release notes describe it as type-safe, faster, and in most cases easier to
use.

**Good**

```go
import (
	"errors"
	"fmt"
)

// InvalidFieldError reports which submitted field failed validation.
type InvalidFieldError struct {
	Field string
}

func (e *InvalidFieldError) Error() string {
	return fmt.Sprintf("invalid field %s", e.Field)
}

func fieldOf(err error) string {
	if invalid, ok := errors.AsType[*InvalidFieldError](err); ok {
		return invalid.Field
	}
	return ""
}
```

**Good (1.25)**

```go
import (
	"errors"
	"fmt"
)

// InvalidFieldError reports which submitted field failed validation.
type InvalidFieldError struct {
	Field string
}

func (e *InvalidFieldError) Error() string {
	return fmt.Sprintf("invalid field %s", e.Field)
}

func fieldOf(err error) string {
	var invalid *InvalidFieldError
	if errors.As(err, &invalid) {
		return invalid.Field
	}
	return ""
}
```

**Caught by.** The compiler, on Go 1.26: a type argument that does not implement `error` fails to
instantiate. On Go 1.25 the equivalent is `govet`'s `errorsas` check, which reports the same mistake
after the fact rather than at the call site.

**Sources.** https://go.dev/doc/go1.26 and https://pkg.go.dev/errors@go1.26.0#AsType
