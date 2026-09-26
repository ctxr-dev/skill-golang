---
id: security
area: security
subject: [security]
updated: '2026-10-01'
rules: 5
---

# Security

Rules for Go code that touches anything from outside the process: query arguments, credentials,
user-submitted text and third-party code. Each one closes a hole that is cheap to open and expensive
to find later.

## parameterized-sql

- priority: P0
- atom_type: decision

**Rule.** Never join user input into a SQL statement. Keep the statement a constant and pass every
value as an argument — `db.QueryContext(ctx, query, args...)` — so the driver binds it. The
placeholder is the driver's: `$1` for PostgreSQL, `?` for MySQL and SQLite.

**Why.** A string-built query hands the database parser whatever the user typed. One quote in the
right place turns a filter into a second statement, which the database then runs with the
application's own privileges. Binding removes the attack rather than filtering it: a bound value
never reaches the parser, so no escaping has to be clever enough. The database can also reuse the
plan for a statement it has already seen, because the statement text stops changing per request.

**Good**

```go
package example

import (
	"context"
	"database/sql"
)

type order struct {
	id     int64
	total  int64
	status string
}

func ordersForCustomer(ctx context.Context, db *sql.DB, customerID int64, status string) ([]order, error) {
	const query = `SELECT id, total, status FROM orders WHERE customer_id = $1 AND status = $2`

	rows, err := db.QueryContext(ctx, query, customerID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var found []order
	for rows.Next() {
		var each order
		if err := rows.Scan(&each.id, &each.total, &each.status); err != nil {
			return nil, err
		}
		found = append(found, each)
	}
	return found, rows.Err()
}
```

**Bad**

```go
package example

import (
	"context"
	"database/sql"
	"fmt"
)

type order struct {
	id     int64
	total  int64
	status string
}

func ordersForCustomer(ctx context.Context, db *sql.DB, customerID int64, status string) ([]order, error) {
	query := fmt.Sprintf("SELECT id, total, status FROM orders WHERE customer_id = %d AND status = '%s'", customerID, status)

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var found []order
	for rows.Next() {
		var each order
		if err := rows.Scan(&each.id, &each.total, &each.status); err != nil {
			return nil, err
		}
		found = append(found, each)
	}
	return found, rows.Err()
}
```

Driver and pool behaviour sits in `rule:context-aware-queries-and-pooling`.

**Caught by.** `govet` flags the format mistakes that come with a hand-built query — a verb with no
argument, an argument with no verb — but it does not know the string is SQL. The dedicated check is
`gosec`'s G201 rule, which reports a query built by string formatting. `gosec` is not one of the
eleven linters in the shipped baseline, so enable it on top or rely on review, where the reviewer
looks for any query string that is not a constant and for a `+` or a `%s` near a `SELECT`.

**Sources.** https://go.dev/doc/database/sql-injection and https://pkg.go.dev/database/sql

## secrets-never-in-source

- priority: P0
- atom_type: decision

**Rule.** Keep every credential, token and private key out of the repository, out of the container
image and out of every log line. Read them from the environment or a secret manager when the process
starts, and refuse to start when one is missing.

**Why.** A secret committed once is committed forever: removing it in a later commit leaves it in the
history and in every clone that already pulled it. A secret baked into an image reaches everyone who
can pull the image, including anyone who gets the registry credentials. A secret printed in a log
reaches the log store, where it is indexed, retained for the retention window, and readable by people
who were never granted it. Reading secrets at start-up keeps all three surfaces clean and turns
rotation into an operational change rather than a release. A `String` method on the config type that
redacts the secret field stops the whole struct leaking the moment someone formats it with `%v`.
Which variables are required, and what happens when one is absent, is
`rule:typed-config-validated-at-startup`.

**Good**

```go
package example

import (
	"errors"
	"fmt"
	"os"
)

type credentials struct {
	databaseURL string
	signingKey  string
}

var errSecretMissing = errors.New("secret is not set in the environment")

func loadCredentials() (credentials, error) {
	loaded := credentials{
		databaseURL: os.Getenv("DATABASE_URL"),
		signingKey:  os.Getenv("SIGNING_KEY"),
	}
	if loaded.databaseURL == "" {
		return credentials{}, fmt.Errorf("DATABASE_URL: %w", errSecretMissing)
	}
	if loaded.signingKey == "" {
		return credentials{}, fmt.Errorf("SIGNING_KEY: %w", errSecretMissing)
	}
	return loaded, nil
}

func (c credentials) String() string {
	return fmt.Sprintf("credentials{databaseURL: %q, signingKey: redacted}", c.databaseURL)
}
```

**Bad**

```go
package example

import (
	"log/slog"
)

const signingKey = "sk_live_not_a_real_key"

type credentials struct {
	databaseURL string
	signingKey  string
}

func loadCredentials(logger *slog.Logger) credentials {
	loaded := credentials{
		databaseURL: "postgres://billing:not-a-real-password@db.internal:5432/billing",
		signingKey:  signingKey,
	}
	logger.Info("credentials loaded", slog.String("signing_key", loaded.signingKey))
	return loaded
}
```

Go 1.26 adds an experimental `runtime/secret` package. It is available only as an experiment, built
with `GOEXPERIMENT=runtimesecret`, and it supports amd64 and arm64 on Linux only. The release notes
describe it as a facility for securely erasing temporaries used in code that manipulates secret
information; they do not state that anything is guaranteed to be zeroed. It is not ordinary practice
and this corpus does not use it.

**Caught by.** Nothing in the shipped eleven-linter baseline. `gosec`'s G101 rule flags a hard-coded
credential and a repository secret scanner catches what survives a commit; both sit outside the
baseline and are worth adding to CI. Review covers the rest: the reviewer looks for a string literal
shaped like a key or a connection string, and for a log or format call that prints a field holding
one.

**Sources.** https://go.dev/doc/security/best-practices and https://go.dev/doc/go1.26

## contextual-escaping-html-template

- priority: P1
- atom_type: decision

**Rule.** Render HTML with `html/template`, never `text/template`, and never build HTML by joining
strings. `html/template` chooses the escaping from where the value lands — HTML body, tag attribute,
JavaScript literal, URL — so one value is escaped four different ways in four different places.

**Why.** `text/template` writes what you hand it. `html/template` parses the template, works out the
context of each action, and applies the escaping that context needs. The two packages share an API,
so swapping one import for the other compiles cleanly and silently removes every escape. Joining
strings skips the template engine altogether, which is how an attribute or a URL ends up unescaped
while the rest of the page is safe. Escaping is not sanitising: if the product lets a user submit
real HTML that must render as HTML, escaping it defeats the feature, and you need a dedicated
sanitiser library that parses the markup against an allow-list of tags and attributes. Choose that
library deliberately when the need appears; this corpus names no default, because the right
allow-list depends on what the product promises.

**Good**

```go
package example

import (
	"html/template"
	"io"
)

type profile struct {
	DisplayName string
	Homepage    string
	Bio         string
}

var profileView = template.Must(template.New("profile").Parse(
	`<a href="{{.Homepage}}" title="{{.DisplayName}}">{{.DisplayName}}</a><p>{{.Bio}}</p>`,
))

func renderProfile(w io.Writer, viewed profile) error {
	return profileView.Execute(w, viewed)
}
```

**Bad**

```go
package example

import (
	"io"
	"text/template"
)

type profile struct {
	DisplayName string
	Homepage    string
	Bio         string
}

var profileView = template.Must(template.New("profile").Parse(
	`<a href="{{.Homepage}}" title="{{.DisplayName}}">{{.DisplayName}}</a>`,
))

func renderProfile(w io.Writer, viewed profile) error {
	if err := profileView.Execute(w, viewed); err != nil {
		return err
	}
	_, err := io.WriteString(w, "<p>"+viewed.Bio+"</p>")
	return err
}
```

**Caught by.** Review. No linter in the shipped baseline distinguishes the two template packages,
because both calls type-check identically. The reviewer checks the import path of every template that
produces HTML, looks for markup assembled with `+` or `fmt.Sprintf`, and treats every conversion to
`template.HTML`, `template.JS` or `template.URL` as a deliberate escape hatch that needs a reason.

**Sources.** https://pkg.go.dev/html/template and https://pkg.go.dev/text/template

## typed-config-validated-at-startup

- priority: P1
- atom_type: decision

**Rule.** Parse configuration into a typed struct once, at start-up, and check every required field
before the process serves traffic. A missing or unparseable value stops the process with a message
naming the variable. Never call `os.Getenv` inside request handling.

**Why.** Configuration read at request time fails at request time. A missing variable becomes an
empty string, a zero timeout that means no timeout, or a nil dereference under load at 3am, far from
the deploy that caused it. Validating at start-up turns all of that into one loud failure on deploy,
where the fix is a rollback. The typed struct also gives every reader one place to see what the
service needs, and gives the compiler a say: a duration is a `time.Duration`, not a string someone
remembers to parse. Environment variables cover most services; add a configuration library only when
you need a real precedence chain between flags, files and a key-value store. Pass the loaded struct
to whatever needs it, alongside the logger from `rule:slog-is-the-default-logger`.

**Good**

```go
package example

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"
)

type config struct {
	ListenAddr     string
	DatabaseURL    string
	RequestTimeout time.Duration
}

var errConfigMissing = errors.New("required environment variable is empty")

func loadConfig() (config, error) {
	loaded := config{
		ListenAddr:     os.Getenv("LISTEN_ADDR"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		RequestTimeout: 5 * time.Second,
	}
	if loaded.ListenAddr == "" {
		return config{}, fmt.Errorf("LISTEN_ADDR: %w", errConfigMissing)
	}
	if loaded.DatabaseURL == "" {
		return config{}, fmt.Errorf("DATABASE_URL: %w", errConfigMissing)
	}
	if raw := os.Getenv("REQUEST_TIMEOUT_SECONDS"); raw != "" {
		seconds, err := strconv.Atoi(raw)
		if err != nil || seconds <= 0 {
			return config{}, fmt.Errorf("REQUEST_TIMEOUT_SECONDS %q: %w", raw, errConfigMissing)
		}
		loaded.RequestTimeout = time.Duration(seconds) * time.Second
	}
	return loaded, nil
}

func mustLoadConfig(logger *slog.Logger) config {
	loaded, err := loadConfig()
	if err != nil {
		logger.Error("configuration is invalid", slog.Any("error", err))
		os.Exit(1)
	}
	return loaded
}
```

**Bad**

```go
package example

import (
	"net/http"
	"os"
	"time"
)

func proxyHandler(w http.ResponseWriter, r *http.Request) {
	timeout, _ := time.ParseDuration(os.Getenv("REQUEST_TIMEOUT"))
	client := &http.Client{Timeout: timeout}

	upstream, err := client.Get(os.Getenv("UPSTREAM_URL") + r.URL.Path)
	if err != nil {
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	defer upstream.Body.Close()
	w.WriteHeader(upstream.StatusCode)
}
```

An unset `REQUEST_TIMEOUT` in that handler parses to a zero duration, which `http.Client` reads as no
timeout at all. The service does not fail; it hangs.

**Caught by.** `errcheck` flags the dropped parse error, which is how a bad value becomes a zero
value. Review covers the rest: the reviewer looks for `os.Getenv` anywhere below the start-up path,
and for a required field that nothing checks before the server starts listening.

**Sources.** https://pkg.go.dev/os and https://12factor.net/config

## vulnerability-scanning

- priority: P2
- atom_type: reference

**Rule.** Run `govulncheck ./...` in CI and read what it prints. It reports only vulnerabilities your
code can actually reach along a call path, which is why the output is short enough to act on.

**Why.** A scanner that only compares version numbers reports every advisory against every module in
the graph, including the ones your code never calls. The list is long, mostly irrelevant, and a team
learns to skip it. `govulncheck` loads the call graph from the build and keeps the advisories that
have a path from your code into the vulnerable function, so a short list arrives and gets read. The
Go vulnerability database carries the symbol-level data that makes the reachability check possible.
Wire it into the same gate as the rest of the checks — `rule:ci-gates`.

**Good**

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

Build information travels inside the binary, so a running process can report the module versions that
`govulncheck` scanned, which is what a responder wants when an advisory lands:

```go
package example

import (
	"errors"
	"io"
	"runtime/debug"
	"text/tabwriter"
)

func writeDependencyVersions(w io.Writer) error {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return errors.New("build information is unavailable")
	}

	table := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	for _, dependency := range info.Deps {
		if _, err := io.WriteString(table, dependency.Path+"\t"+dependency.Version+"\n"); err != nil {
			return err
		}
	}
	return table.Flush()
}
```

**Caught by.** `govulncheck ./...`, which exits non-zero when it finds a reachable vulnerability.
Nothing in the shipped eleven-linter baseline reports a vulnerable dependency; the linters read your
code, not the advisory database.

**Sources.** https://go.dev/doc/tutorial/govulncheck and https://go.dev/blog/vuln and
https://pkg.go.dev/runtime/debug
