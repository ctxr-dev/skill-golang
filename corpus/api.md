---
id: api
area: api
subject: [architecture]
updated: '2026-10-01'
rules: 4
---

# API

How a Go service talks over the network: who picks the transport, what a client wrapper is allowed to
hold, what a handler and a server owe the caller, and the four things every RPC transport demands.

## transport-chosen-at-bootstrap

- priority: P1
- atom_type: decision

**Rule.** This corpus names no default HTTP router and no default RPC framework. Ask the team at
project start and wire the answer in one bootstrap function. With nobody to ask, match what the
repository already uses — read `go.mod` and the handlers that exist — and fall back to the standard
library `net/http` only in an empty repository, saying out loud that the choice was not made. The
question set is `rule:greenfield-stack-offer`.

**Why.** A router is a team decision with a long tail: middleware, test habits, hiring, and the shape
of every handler signature. A corpus that picks one either overrules a repository that already chose,
or it starts an argument the corpus cannot win. Keeping the choice at a bootstrap seam costs one
function, and handlers that depend on an interface their own package declares
(`rule:interfaces-at-the-consumer`) stay portable across the choice.

**Good**

```go
import (
	"net/http"
)

type userService struct{}

func (s *userService) displayName(id string) string {
	return "user-" + id
}

type router interface {
	Handle(pattern string, handler http.Handler)
}

func routes(r router, svc *userService) {
	r.Handle("GET /users/{id}", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		_, _ = w.Write([]byte(svc.displayName(req.PathValue("id"))))
	}))
}

func bootstrap(svc *userService) http.Handler {
	mux := http.NewServeMux()
	routes(mux, svc)
	return mux
}
```

**Bad**

```text
guidance says: always use router X
repository already uses router Y, with 40 handlers written against it
outcome: a rewrite nobody asked for, or guidance everyone ignores
```

**Caught by.** Nothing automated. The reviewer checks that the transport is named in one bootstrap
function rather than imported by every handler, and that an agent which picked a transport without
being asked said so in the change it produced.

**Sources.** https://go.dev/blog/routing-enhancements and https://go.dev/doc/modules/layout

## http-client-is-stateless

- priority: P1
- atom_type: pattern-gotcha

**Rule.** A client wrapper stores configuration and nothing else: a base URL, credentials, an
`*http.Client`. Never a `*http.Request`, never a `*http.Response`, never per-call state. Build the
request inside the call with `http.NewRequestWithContext`, check the status code, and
`defer resp.Body.Close()`. A retry loop keeps the payload as a `[]byte` and sets `req.GetBody`.

**Why.** One client value is shared by every goroutine in the process, so a request stored on it is
read and written by all of them at once. That is a data race, and the request is spent after the
first `Do` anyway. Behind it sits a second trap: a request body is an `io.Reader`, readable once. A
retry that re-sends the same request sends an empty body on the second attempt unless the payload is
still in memory and `req.GetBody` can hand back a fresh reader.

**Good**

```go
import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
)

type apiClient struct {
	baseURL string
	token   string
	http    *http.Client
}

func (c *apiClient) post(ctx context.Context, path string, payload []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build request for %s: %w", path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(payload)), nil
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("post %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("post %s: unexpected status %s", path, resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}
```

**Bad**

```go
import (
	"net/http"
)

type apiClient struct {
	req  *http.Request
	http *http.Client
}

func (c *apiClient) get(path string) (*http.Response, error) {
	c.req.URL.Path = path
	return c.http.Do(c.req)
}
```

**Caught by.** `bodyclose` reports a response body that is never closed, and `go test -race` reports
the shared request as soon as two goroutines call the client. The rest is review: the reviewer looks
for a `*http.Request` or `*http.Response` field on a client struct, for a request built without a
context, and for a retry loop that re-sends a reader it has already drained.

**Sources.** https://pkg.go.dev/net/http#Client and https://pkg.go.dev/net/http#NewRequestWithContext

## handler-and-server-hygiene

- priority: P1
- atom_type: feedback-rule

**Rule.** Set the `http.Server` timeouts yourself — `ReadHeaderTimeout` always, and normally
`ReadTimeout`, `WriteTimeout` and `IdleTimeout` too. Route with `http.ServeMux` method-and-path
patterns, bound the request body with `http.MaxBytesReader` before decoding it, and write the status
code before the body.

**Why.** Every timeout field on `http.Server` defaults to zero, and zero means no timeout at all. A
client that opens a connection and then sends one header byte per minute holds a goroutine and a file
descriptor for as long as it likes; that is the slow-loris hole, and the default server has it. An
unbounded decode has the same shape, letting one caller allocate until the process dies. And
`WriteHeader` takes effect once: the first `Write` sends `200 OK`, so a status chosen after it is
dropped.

**Good**

```go
import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

type createUser struct {
	Email string `json:"email"`
}

func writeJSON(w http.ResponseWriter, status int, body any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(body)
}

func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var in createUser
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if in.Email == "" {
		http.Error(w, "email is required", http.StatusUnprocessableEntity)
		return
	}

	if err := writeJSON(w, http.StatusCreated, in); err != nil {
		slog.Error("write response", "error", err)
	}
}

func newServer() *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /users", handleCreateUser)

	return &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}
```

**Bad**

```go
import (
	"encoding/json"
	"net/http"
)

type createUser struct {
	Email string `json:"email"`
}

func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var in createUser
	json.NewDecoder(r.Body).Decode(&in)

	w.Write([]byte(in.Email))
	w.WriteHeader(http.StatusCreated)
}

func serve(mux *http.ServeMux) error {
	return http.ListenAndServe(":8080", mux)
}
```

**Caught by.** `errcheck` reports the discarded decode error and the discarded `Write`. The standard
library logs `superfluous response.WriteHeader call` at runtime when the status follows the body. The
timeouts are review: the reviewer checks every `http.Server` literal for the four fields, flags a
bare `http.ListenAndServe`, and checks that every decode has a `MaxBytesReader` above it.

**Sources.** https://pkg.go.dev/net/http#Server and https://pkg.go.dev/net/http#MaxBytesReader and
https://go.dev/blog/routing-enhancements

## rpc-practices-per-transport

- priority: P2
- atom_type: reference

**Rule.** Whichever RPC transport the team picked, four things hold. Keep the schema versioned and
under source control. Generate the client and the server from it, commit the output or regenerate it
in CI, and never hand-edit the result. Propagate the caller's deadline instead of starting a fresh
context. Map errors to transport codes at the edge, so internal types stay inside.

**Why.** These four are what let an RPC boundary survive a second team. A schema in source control
makes a breaking change visible in review. Generated code somebody edited is lost at the next
generation, silently. A fresh `context.Background()` inside a handler throws away the caller's
deadline, so a client that gave up long ago is still being served. And an internal error type that
reaches the wire turns a private field name into a public contract nobody agreed to.

**Good**

```text
proto/billing/v1/invoice.proto     versioned schema, reviewed like code
gen/billing/v1/invoice.pb.go       generated, never hand-edited
ci: regenerate, then fail if the working tree differs
```

```go
import (
	"context"
	"errors"
	"net/http"
	"time"
)

var errInvoiceNotFound = errors.New("invoice not found")

type invoice struct {
	ID string
}

type invoiceStore interface {
	find(ctx context.Context, id string) (invoice, error)
}

func transportStatus(err error) int {
	switch {
	case err == nil:
		return http.StatusOK
	case errors.Is(err, errInvoiceNotFound):
		return http.StatusNotFound
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout
	case errors.Is(err, context.Canceled):
		return http.StatusRequestTimeout
	default:
		return http.StatusInternalServerError
	}
}

func fetchInvoice(ctx context.Context, store invoiceStore, id string) (invoice, int) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	found, err := store.find(ctx, id)
	return found, transportStatus(err)
}
```

**Caught by.** `contextcheck` reports a function that starts a new context instead of taking the
caller's. A CI step that regenerates and then fails on a non-empty diff catches a hand-edited
generated file. The rest is review: the reviewer checks the schema is in the repository and that no
handler hands an internal error type straight to the transport.

**Sources.** https://pkg.go.dev/net/rpc and https://grpc.io/docs/guides/deadlines/ and
https://protobuf.dev/programming-guides/dos-donts/
