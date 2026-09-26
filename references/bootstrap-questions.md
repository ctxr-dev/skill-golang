# Bootstrap questions

## When to ask

Ask on a new Go project, or on a refactor that is already changing the structure.

Do **not** ask when adding a feature to an existing codebase. The one exception: a change that would
dramatically improve the project. Then say it in one sentence, not a question set.

## When nobody answers

Scan `go.mod` and the handlers that already exist, and match them. In an empty repository, fall back
to the standard library. Either way, say out loud that the choice was not made, so the next person
knows it is still open.

## The questions

Each one offers the measured leaders and the standard-library option. Numbers are stars and last push
from `corpus/dependencies.md`, read on 2026-10-01, and they drift.

### HTTP router

| Option | Why |
|---|---|
| `net/http` with `http.ServeMux` | Standard library. Method and wildcard patterns since Go 1.22 cover most routing |
| `go-chi/chi` | Thin layer over `net/http`, standard handler signature, middleware chain |
| `labstack/echo`, `gin-gonic/gin` | Larger frameworks with their own context type |

`gorilla/mux` has not been pushed since 2024-08-15. Do not start a new project on it.

### Internal transport

| Option | Why |
|---|---|
| HTTP with JSON | No code generation, readable on the wire, every tool speaks it |
| gRPC (`grpc/grpc-go`) | Binary, streaming, a schema the compiler checks |
| Connect (`connectrpc/connect-go`) | gRPC semantics over plain HTTP, browser-reachable |

Pick one for the whole estate. Two transports double the middleware.

### Configuration

| Option | Why |
|---|---|
| `os.Getenv` into a typed struct | Standard library. Enough for most services |
| `caarlos0/env` | Struct tags, still just environment variables |
| `knadh/koanf` | Real layering: flags over environment over file over key-value store |

`spf13/viper` has not been pushed since 2026-01-12. `kelseyhightower/envconfig` has not been pushed
since 2025-06-28. Prefer `koanf` where layering is genuinely needed.

### Dependency wiring

| Option | Why |
|---|---|
| By hand in `main` or one `internal/app` package | The default. Readable, debuggable, no reflection |
| `uber-go/fx` | Lifecycle ordering, start and stop hooks |
| `samber/do` | Lighter, a container without the lifecycle framework |

`google/wire` was archived on 2025-08-22. Never recommend it.

### Database access

| Option | Why |
|---|---|
| `database/sql` plus a driver such as `jackc/pgx` | Standard library interface, no magic |
| `sqlc-dev/sqlc` | Generates typed Go from the SQL you wrote |
| `ent/ent`, `go-gorm/gorm`, `uptrace/bun` | Full ORMs, with the usual trade-off |

`jmoiron/sqlx` has not been pushed since 2024-08-15.

### CLI

| Option | Why |
|---|---|
| `flag` | Standard library. Fine for one command |
| `spf13/cobra` | Sub-commands, completion, the one most people know |
| `urfave/cli`, `alecthomas/kong` | Smaller, and `kong` derives the parser from a struct |

## After the answers

Record them where the project's own documentation lives, not in this skill. The next agent reads the
repository, not a cache.
