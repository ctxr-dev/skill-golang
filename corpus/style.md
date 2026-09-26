---
id: style
area: style
subject: [languages]
updated: '2026-10-01'
rules: 4
---

# Style

How Go code is shaped on the page: where the success path sits, how far a function may grow before
the gate stops it, and how declarations, literals and signatures are written.

## left-aligned-happy-path

- priority: P1
- atom_type: feedback-rule

**Rule.** Handle each error and return straight away. Keep the success path at the leftmost
indentation, one statement under the next. Never write `else` after a block that ends in `return`.

**Why.** A reader scanning a function wants the work it does, not the cases it refuses. A success
path flush against the left margin reads as a single column, and every failure is a short detour that
ends in a `return`. Nest the success path inside the checks and the real work drifts right, so the
reader must hold every open condition in mind to know what is true by the time it runs.

**Good**

```go
import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	Name string
}

func loadConfig(path string) (Config, error) {
	var cfg Config
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse %s: %w", path, err)
	}
	if cfg.Name == "" {
		return cfg, fmt.Errorf("parse %s: name is empty", path)
	}
	return cfg, nil
}
```

**Bad**

```go
import (
	"encoding/json"
	"errors"
	"os"
)

type Config struct {
	Name string
}

func loadConfig(path string) (Config, error) {
	var cfg Config
	data, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(data, &cfg); err == nil {
			if cfg.Name != "" {
				return cfg, nil
			} else {
				return cfg, errors.New("name is empty")
			}
		} else {
			return cfg, err
		}
	} else {
		return cfg, err
	}
}
```

**Caught by.** `revive`, through its `indent-error-flow` and `early-return` rules, and `gocognit`
once the nesting pushes the score past the gate in `rule:size-gate-and-smells`.

**Sources.** https://go.dev/wiki/CodeReviewComments#indent-error-flow,
https://google.github.io/styleguide/go/decisions#indentation-confusion and
https://github.com/uber-go/guide/blob/master/style.md#reduce-nesting

## size-gate-and-smells

- priority: P1
- atom_type: decision

**Rule.** Let the linter hold the numbers and keep your own eyes on the smells. The gate is:

```yaml
linters:
  settings:
    funlen:
      lines: 60
      statements: 40
    cyclop:
      max-complexity: 20
    gocognit:
      min-complexity: 20
```

A file past 400 lines is a prompt to split it; past 600 lines it is over the ceiling. A repository
that ships its own `.golangci.yml` replaces every one of these numbers, and its settings win whole.

**Why.** The numbers are a gate, not the judgement. golangci-lint's own reference configuration puts
cyclomatic complexity between 10 and 20; 20 is the top of that range, chosen because a dispatch
`switch` over a dozen message kinds trips 10 routinely while staying easy to read. Three smells catch
the function that clears every number and is still wrong: nesting past three levels, a function doing
two things you would name separately, and five or more parameters. A reviewer finds those; no counter
does.

**Good**

```go
import (
	"errors"
	"strings"
)

type Order struct {
	ID    string
	Items []string
	Total int
}

func validateOrder(o Order) error {
	if strings.TrimSpace(o.ID) == "" {
		return errors.New("order has no id")
	}
	if len(o.Items) == 0 {
		return errors.New("order has no items")
	}
	if o.Total <= 0 {
		return errors.New("order total is not positive")
	}
	return nil
}

func priceOrder(o Order, unit int) int {
	return len(o.Items) * unit
}

func submitOrder(o Order, unit int) (int, error) {
	if err := validateOrder(o); err != nil {
		return 0, err
	}
	return priceOrder(o, unit), nil
}
```

**Bad**

```go
import (
	"errors"
	"strings"
)

type Order struct {
	ID    string
	Items []string
	Total int
}

func submitOrder(o Order, unit int, retries int, dryRun bool, region string, audit bool) (int, error) {
	if strings.TrimSpace(o.ID) != "" {
		if len(o.Items) > 0 {
			if o.Total > 0 {
				if region != "" {
					if dryRun {
						return 0, nil
					}
					return len(o.Items) * unit, nil
				}
			}
		}
	}
	return 0, errors.New("order is not submittable")
}
```

**Caught by.** `funlen`, `cyclop` and `gocognit`, with the settings above. The three smells are caught
by review: the reviewer counts indentation levels, tries to name the function in one phrase, and
counts the parameters.

**Sources.** https://github.com/golangci/golangci-lint/blob/master/.golangci.reference.yml,
https://google.github.io/styleguide/go/best-practices#function-argument-lists and
https://github.com/uber-go/guide/blob/master/style.md#reduce-nesting

## declarations-and-literals

- priority: P1
- atom_type: feedback-rule

**Rule.** Write `var` when you want the zero value and `:=` when you already have a value to put in.
Group related constants in one `const` block. Name every field in a struct literal, always.

**Why.** `var warnings []string` says the slice starts empty and may stay empty. Writing
`warnings := []string{}` says the same thing in more characters and commits to a non-nil value the
caller may not want, which is the choice `rule:nil-slices-at-the-boundary` governs. A grouped `const`
block gives related values one place to live and one place to change. A keyed struct literal keeps
compiling when somebody adds a field, and it tells the reader what each value means without counting
positions against the type declaration.

**Good**

```go
import (
	"strings"
	"time"
)

const (
	defaultTimeout = 5 * time.Second
	maxRetries     = 3
	userAgent      = "example/1.0"
)

type Client struct {
	Timeout   time.Duration
	Retries   int
	UserAgent string
}

func newClient(host string) (Client, []string) {
	var warnings []string
	if strings.TrimSpace(host) == "" {
		warnings = append(warnings, "host is empty")
	}
	client := Client{
		Timeout:   defaultTimeout,
		Retries:   maxRetries,
		UserAgent: userAgent,
	}
	return client, warnings
}
```

**Bad**

```go
import (
	"strings"
	"time"
)

const defaultTimeout = 5 * time.Second

const maxRetries = 3

const userAgent = "example/1.0"

type Client struct {
	Timeout   time.Duration
	Retries   int
	UserAgent string
}

func newClient(host string) (Client, []string) {
	warnings := []string{}
	if strings.TrimSpace(host) == "" {
		warnings = append(warnings, "host is empty")
	}
	client := Client{defaultTimeout, maxRetries, userAgent}
	return client, warnings
}
```

**Caught by.** `ineffassign` reports a value that is assigned and never read. `govet`, through its
composites check, reports an unkeyed literal of a struct from another package. An unkeyed literal of
a type declared in the same package is caught by review, where the reviewer matches each value
against the field it lands in.

**Sources.** https://google.github.io/styleguide/go/decisions#literal-field-names,
https://github.com/uber-go/guide/blob/master/style.md#use-field-names-to-initialize-structs and
https://go.dev/doc/effective_go#constants

## function-signatures

- priority: P1
- atom_type: feedback-rule

**Rule.** Return the error last, and declare it as `error` rather than a concrete error type. Keep
every `return` explicit once a function grows past a few statements. Name results only where the
names say something the types cannot, such as a pair that would otherwise be two bare `int`s. Do not
take a boolean parameter that selects which behaviour the function performs; write two functions.

**Why.** An error in the last position is the shape every caller already expects, so a reader sees at
a glance whether a call can fail. Declaring that result as `error` avoids the trap where a nil
pointer stored in a non-nil interface makes `err != nil` true after a call that succeeded. A naked
`return` sends the reader back up the function to find out what each result holds by then. A boolean
parameter hides two functions behind one name and makes every call site a puzzle: the reader has to
chase `true` through the body to learn which one runs.

**Good**

```go
import (
	"errors"
	"strings"
)

func bounds(values []int) (low, high int, err error) {
	if len(values) == 0 {
		return 0, 0, errors.New("bounds: no values")
	}
	low, high = values[0], values[0]
	for _, v := range values[1:] {
		if v < low {
			low = v
		}
		if v > high {
			high = v
		}
	}
	return low, high, nil
}

func splitAddr(addr string) (string, string, error) {
	host, port, found := strings.Cut(addr, ":")
	if !found {
		return "", "", errors.New("splitAddr: address has no port")
	}
	return host, port, nil
}
```

**Bad**

```go
type boundsError struct {
	reason string
}

func (e *boundsError) Error() string {
	return e.reason
}

func bounds(values []int, strict bool) (low int, high int, err *boundsError) {
	if len(values) == 0 {
		if strict {
			err = &boundsError{reason: "no values"}
		}
		return
	}
	low, high = values[0], values[0]
	for _, v := range values[1:] {
		if v < low {
			low = v
		}
		if v > high {
			high = v
		}
	}
	return
}

func report(values []int) error {
	_, _, err := bounds(values, false)
	var wrapped error = err
	return wrapped
}
```

**Caught by.** `revive`, through its `bare-return`, `flag-parameter` and `confusing-results` rules.
The error position and the concrete error type are caught by review: the reviewer checks that the
last result is declared `error` and that nothing narrower stands in its place.

**Sources.** https://go.dev/wiki/CodeReviewComments#naked-returns,
https://google.github.io/styleguide/go/decisions#named-result-parameters and
https://google.github.io/styleguide/go/best-practices#function-argument-lists
