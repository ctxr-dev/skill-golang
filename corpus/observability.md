---
id: observability
area: observability
subject: [observability]
updated: '2026-10-01'
rules: 4
---

# Observability

How a running Go service explains itself: which logger it holds, what it writes and at what level,
how one record reaches more than one sink, and how a log line and a trace span find each other.

## slog-is-the-default-logger

- priority: P1
- atom_type: decision

**Rule.** Use `log/slog`. Build one `*slog.Logger` at start-up from a handler and a fixed attribute
set, and pass it to whatever needs it. Call the logger you were handed, never the `slog` package
functions.

**Why.** `log/slog` ships with the toolchain, writes structured records, and defines a `Handler`
interface that the third-party sinks already implement, so a service can change where logs go without
touching one call site. The package-level functions hide a global instead: two packages that both
call `slog.Info` cannot be configured apart, and a test cannot capture one of them without affecting
the other. An explicit `*slog.Logger` makes the dependency visible in the constructor, lets a test
point it at a buffer, and lets the service attach the attributes every record should carry — service
name, version, instance — once, instead of at every call.

**Good**

```go
package example

import (
	"log/slog"
	"os"
)

type settlementService struct {
	logger *slog.Logger
}

func newSettlementService(version string) *settlementService {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	logger := slog.New(handler).With(
		slog.String("service", "billing"),
		slog.String("version", version),
	)
	return &settlementService{logger: logger}
}

func (s *settlementService) settled(paymentID string, amountCents int64) {
	s.logger.Info("payment settled",
		slog.String("payment_id", paymentID),
		slog.Int64("amount_cents", amountCents),
	)
}
```

**Bad**

```go
package example

import (
	"log"
	"log/slog"
)

type settlementService struct{}

func (s *settlementService) settled(paymentID string, amountCents int64) {
	log.Printf("payment %s settled for %d cents", paymentID, amountCents)
	slog.Info("payment settled: " + paymentID)
}
```

Neither bad line is searchable by payment id, because the id is inside the message instead of beside
it as an attribute.

**Caught by.** Review. The reviewer looks for an import of `log`, for a call on the `slog` package
rather than on a logger value, and for a message assembled with `+` where an attribute belongs. A
`depguard` rule can ban the `log` package outright; `depguard` is not one of the eleven linters in
the shipped baseline, so that is an addition a repository makes for itself.

**Sources.** https://pkg.go.dev/log/slog and https://go.dev/blog/slog

## what-to-log-and-at-what-level

- priority: P1
- atom_type: feedback-rule

**Rule.** Log the decision, not the narration. Error means a failure a human must act on. Warn means
a degraded path that recovered. Info means a state change worth seeing in production. Debug means
detail that stays off there. Never log a secret, and never log the same failure twice —
`rule:wrap-or-log-never-both`.

**Why.** Entry and exit lines bury the three lines that matter and cost money per gigabyte to keep.
The level is a promise to whoever carries the pager: error means someone acts, so an error that needs
no action teaches the team to skip all of them. A failure logged where it was found and again where
it was handled doubles the volume, splits the search, and makes one incident look like two. Put the
searchable parts in attributes — identifiers, counts, outcomes — and keep the message a short
constant string, so a query can group every occurrence instead of matching a formatted sentence.

**Good**

```go
package example

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
)

var errRateLimited = errors.New("payment provider rate limited the request")

type charger interface {
	charge(ctx context.Context, paymentID string) error
}

type settlementService struct {
	provider charger
	logger   *slog.Logger
}

func (s *settlementService) settle(ctx context.Context, paymentID string, attempt int) error {
	err := s.provider.charge(ctx, paymentID)
	switch {
	case err == nil:
		s.logger.InfoContext(ctx, "payment settled", slog.String("payment_id", paymentID))
		return nil
	case errors.Is(err, errRateLimited):
		s.logger.WarnContext(ctx, "payment deferred after a rate limit",
			slog.String("payment_id", paymentID),
			slog.Int("attempt", attempt),
		)
		return nil
	default:
		return fmt.Errorf("charge payment %s: %w", paymentID, err)
	}
}

func (s *settlementService) runBatch(ctx context.Context, paymentIDs []string) {
	for _, paymentID := range paymentIDs {
		if err := s.settle(ctx, paymentID, 1); err != nil {
			s.logger.ErrorContext(ctx, "settlement batch stopped", slog.Any("error", err))
			return
		}
	}
}
```

The failing branch wraps and returns without logging. The caller that stops because of it logs once,
at error, where the decision to stop was made.

**Bad**

```go
package example

import (
	"context"
	"fmt"
	"log/slog"
)

type settlementService struct {
	logger        *slog.Logger
	providerToken string
}

func (s *settlementService) settle(ctx context.Context, paymentID string) error {
	s.logger.Info("entering settle")
	s.logger.Info("calling the provider", slog.String("token", s.providerToken))

	if err := s.charge(ctx, paymentID); err != nil {
		s.logger.Error("charge failed", slog.Any("error", err))
		return fmt.Errorf("charge payment %s: %w", paymentID, err)
	}
	s.logger.Info("leaving settle")
	return nil
}

func (s *settlementService) charge(ctx context.Context, paymentID string) error {
	return ctx.Err()
}
```

Three defects in one function: two lines that narrate control flow, a credential written to the log
store, and a failure that is both logged and returned, so the caller logs it a second time.

**Caught by.** Review. The reviewer looks for a log call in the same branch as a `return err`, for an
attribute named like a credential — `token`, `password`, `key`, `secret` — for a message built by
concatenation, and for a line whose only content is that a function started or finished. `errcheck`
catches the neighbouring case, an error that is neither logged nor returned.

**Sources.** https://pkg.go.dev/log/slog and https://google.github.io/styleguide/go/best-practices

## slog-multihandler

- priority: P2
- atom_type: reference
- since: 1.26

**Rule.** On Go 1.26, send one record to several handlers with `slog.NewMultiHandler`, with no
wrapper type of your own. This needs Go 1.26, and the baseline toolchain here is Go 1.25, so the
first block below is not compiled by this repository's checks. On 1.25, write the four-method handler
by hand, as the second block does.

**Why.** Two sinks is an ordinary need: readable text on the console for a human, JSON to an audit
file or a collector for everything else. Before 1.26 every project wrote the same small wrapper, and
the copies disagreed on the details that matter — whether a handler that reported itself disabled
still received the record, and whether the record was cloned before being handed to a second handler.
A `slog.Record` passed to two handlers shares state until it is cloned, and `Record.Clone` returns a
copy with none. The release notes describe `NewMultiHandler` precisely: its `Enabled` reports whether
any handler's `Enabled` returns true, and its `Handle`, `WithAttrs` and `WithGroup` call the matching
method on each of the enabled handlers.

**Good**

```go
package example

import (
	"io"
	"log/slog"
	"os"
)

func newLogger(auditSink io.Writer) *slog.Logger {
	console := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	audit := slog.NewJSONHandler(auditSink, &slog.HandlerOptions{Level: slog.LevelDebug})
	return slog.New(slog.NewMultiHandler(console, audit))
}
```

**Good (1.25)**

```go
package example

import (
	"context"
	"io"
	"log/slog"
	"os"
)

type multiHandler struct {
	handlers []slog.Handler
}

func (m multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, handler := range m.handlers {
		if handler.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m multiHandler) Handle(ctx context.Context, record slog.Record) error {
	for _, handler := range m.handlers {
		if !handler.Enabled(ctx, record.Level) {
			continue
		}
		if err := handler.Handle(ctx, record.Clone()); err != nil {
			return err
		}
	}
	return nil
}

func (m multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := make([]slog.Handler, len(m.handlers))
	for i, handler := range m.handlers {
		next[i] = handler.WithAttrs(attrs)
	}
	return multiHandler{handlers: next}
}

func (m multiHandler) WithGroup(name string) slog.Handler {
	next := make([]slog.Handler, len(m.handlers))
	for i, handler := range m.handlers {
		next[i] = handler.WithGroup(name)
	}
	return multiHandler{handlers: next}
}

func newLogger(auditSink io.Writer) *slog.Logger {
	console := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	audit := slog.NewJSONHandler(auditSink, &slog.HandlerOptions{Level: slog.LevelDebug})
	return slog.New(multiHandler{handlers: []slog.Handler{console, audit}})
}
```

**Caught by.** The compiler. On Go 1.25 the build stops with `undefined: slog.NewMultiHandler`, so
the mistake cannot ship as a service that quietly logs to one sink. Which toolchains a repository
targets is `rule:version-baseline-two-releases`.

**Sources.** https://go.dev/doc/go1.26 and https://pkg.go.dev/log/slog

## tracing-and-metrics

- priority: P2
- atom_type: reference

**Rule.** Use OpenTelemetry for traces and Prometheus for metrics, and make the trace span, the
metric labels and the log lines carry the same request id. Generate the id once at the edge, put it
in the context, and read it from there everywhere else.

**Why.** Three signals that cannot be joined are three dead ends. A trace shows where the time went,
a metric shows how often it happens, a log line shows what the code decided, and an incident needs
all three in the same order. The join key is the request id. Generating it once at the edge and
carrying it in the context means every later layer — handler, service, repository, tracer, logger —
reads the same value without a new parameter in every signature. Accept an incoming id from the
caller when there is one, so the id spans services rather than restarting at each hop.

OpenTelemetry and Prometheus both live outside the standard library, so the block below stays inside
it. It does the part that must be right before any exporter is wired in: take or make the id, store
it in the context, return it on the response, and read it back for every record. An OpenTelemetry
middleware sits in exactly this position and reads the same value for a span attribute; a Prometheus
collector reads the same request fields for its labels. What belongs in a context value at all is
`rule:context-values-are-request-scoped`.

**Good**

```go
package example

import (
	"context"
	"crypto/rand"
	"log/slog"
	"net/http"
)

type requestIDKey struct{}

func withRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, requestID)
}

func requestIDFrom(ctx context.Context) string {
	requestID, _ := ctx.Value(requestIDKey{}).(string)
	return requestID
}

func correlate(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-Id")
		if requestID == "" {
			requestID = rand.Text()
		}

		ctx := withRequestID(r.Context(), requestID)
		w.Header().Set("X-Request-Id", requestID)
		logger.InfoContext(ctx, "request received",
			slog.String("request_id", requestID),
			slog.String("path", r.URL.Path),
		)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func recordOutcome(ctx context.Context, logger *slog.Logger, outcome string) {
	logger.InfoContext(ctx, "request finished",
		slog.String("request_id", requestIDFrom(ctx)),
		slog.String("outcome", outcome),
	)
}
```

**Caught by.** `contextcheck`, which reports a function that starts a fresh context instead of
passing on the one it was given — the usual way the id disappears between the handler and the layer
that logs. Review covers the rest: the reviewer checks that the id is set once at the edge, that an
inbound id is honoured, and that nothing downstream invents a second one.

**Sources.** https://opentelemetry.io/docs/languages/go/ and
https://prometheus.io/docs/guides/go-application/ and https://pkg.go.dev/log/slog
