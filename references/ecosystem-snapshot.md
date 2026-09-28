# Go ecosystem snapshot

Read from the GitHub API on 2026-10-01. It is a dated reading, not a ranking, and it is already
going stale as you read it. Star counts and push dates drift, so a figure here is evidence about
that one day. A star count is popularity, never a recommendation. Check the project yourself before
you make an argument out of a number here, and re-read the project page whenever the figure is
load-bearing.

One column is worth acting on by itself: a project marked archived or dormant. Archived means nobody
will fix it, and an archive or a year of silence is reason enough to choose something else.

The rule that governs how to read this is `rule:ecosystem-leaders-snapshot`, in
`corpus/dependencies.md`.

| project | stars | last push | note |
|---|---|---|---|
| `spf13/cobra` | 44676 | 2026-07-11 | CLI. The usual choice for a subcommand tree. |
| `urfave/cli` | 24275 | 2026-10-01 | CLI. Lighter, no code generation. |
| `alecthomas/kong` | 3184 | 2026-09-30 | CLI. Struct tags describe the grammar. |
| `spf13/viper` | 30477 | 2026-01-12 | Config. **Stalled**: no push for most of a year. |
| `caarlos0/env` | 6323 | 2026-10-01 | Config. Environment into a typed struct. |
| `knadh/koanf` | 4213 | 2026-09-24 | Config. Layered sources, actively pushed. |
| `kelseyhightower/envconfig` | 5469 | 2025-06-28 | Config. **Dormant**. |
| `google/wire` | 14396 | 2025-08-22 | Wiring. **ARCHIVED**. Never recommend it. |
| `uber-go/fx` | 7693 | 2025-12-27 | Wiring. Lifecycle ordering; the named default. |
| `uber-go/dig` | 4504 | 2025-05-13 | Wiring. The container underneath fx. |
| `samber/do` | 2815 | 2026-09-24 | Wiring. Lighter, generics-based. |
| `gin-gonic/gin` | 89271 | 2026-09-29 | HTTP. Largest community by a wide margin. |
| `gofiber/fiber` | 40188 | 2026-10-01 | HTTP. Not `net/http` underneath. |
| `labstack/echo` | 32745 | 2026-09-30 | HTTP. Middleware included. |
| `go-chi/chi` | 22907 | 2026-09-30 | HTTP. Plain `net/http` handlers, no new types. |
| `gorilla/mux` | 21839 | 2024-08-15 | HTTP. **Dormant**. `net/http` routing covers much of it. |
| `sirupsen/logrus` | 25757 | 2026-08-25 | Logging. Predates `log/slog`. |
| `uber-go/zap` | 24665 | 2026-09-16 | Logging. Structured, allocation-conscious. |
| `rs/zerolog` | 12512 | 2026-09-28 | Logging. JSON first. |
| `stretchr/testify` | 26218 | 2026-09-24 | Testing. Assertions and mocks. |
| `uber-go/goleak` | 5288 | 2026-09-15 | Testing. Goroutine leak detection. |
| `testcontainers/testcontainers-go` | 4992 | 2026-09-29 | Testing. Real dependencies in containers. |
| `google/go-cmp` | 4678 | 2026-06-18 | Testing. Structural comparison with readable diffs. |
| `uber-go/mock` | 3416 | 2026-08-25 | Testing. Generated mocks. |
| `go-gorm/gorm` | 39971 | 2026-09-14 | Data. Full ORM. |
| `sqlc-dev/sqlc` | 18338 | 2026-09-26 | Data. SQL in, typed Go out. |
| `jmoiron/sqlx` | 17744 | 2024-08-15 | Data. **Dormant**. |
| `ent/ent` | 17210 | 2026-09-30 | Data. Schema as code, graph queries. |
| `jackc/pgx` | 14284 | 2026-09-28 | Data. The PostgreSQL driver. |
| `uptrace/bun` | 4982 | 2026-09-30 | Data. Query builder over `database/sql`. |
| `grpc/grpc-go` | 23081 | 2026-10-01 | RPC. The reference gRPC implementation. |
| `connectrpc/connect-go` | 4097 | 2026-09-30 | RPC. gRPC-compatible over ordinary HTTP. |
| `bufbuild/buf` | 11467 | 2026-09-30 | Protobuf. Build, lint and breaking-change checks. |
| `go-playground/validator` | 20185 | 2026-09-28 | Validation. Struct-tag rules. |
| `golangci/golangci-lint` | 19402 | 2026-09-30 | Lint. The runner this corpus configures. |
| `golang-migrate/migrate` | 18948 | 2026-09-09 | Migrations. SQL files, CLI driven. |
| `pressly/goose` | 11517 | 2026-09-28 | Migrations. SQL or Go, embeddable. |
| `open-telemetry/opentelemetry-go` | 6570 | 2026-10-01 | Observability. Traces and metrics. |
| `prometheus/client_golang` | 6037 | 2026-09-29 | Observability. Metrics export and scraping. |
| `samber/lo` | 21435 | 2026-10-01 | Utility. `slices`, `maps` and `cmp` cover much of it. |
| `cenkalti/backoff` | 4085 | 2026-09-30 | Resilience. Retry with backoff. |
| `sony/gobreaker` | 3700 | 2026-02-07 | Resilience. Circuit breaker. |
| `cockroachdb/errors` | 2475 | 2026-09-26 | Errors. Stack traces and wire encoding. |
| `samber/oops` | 992 | 2026-09-14 | Errors. Context fields attached to an error. |

Re-measure with `gh api repos/<owner>/<name> --jq '[.stargazers_count, .pushed_at, .archived]'` and
replace the date at the top of this file when you do.
