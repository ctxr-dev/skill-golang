---
id: data
area: data
subject: [data]
updated: '2026-10-01'
rules: 3
---

# Data

How Go code talks to a relational database: context on every call, a pool that is configured rather
than defaulted, transactions that cannot leak, and schema changes that arrive as reviewed files.

## context-aware-queries-and-pooling

- priority: P1
- atom_type: feedback-rule

**Rule.** Call the `Context` variants — `QueryContext`, `ExecContext`, `QueryRowContext` — and pass
the caller's context down (`rule:context-first-parameter`), so a cancelled request stops work at the
database too. Set `SetMaxOpenConns`, `SetMaxIdleConns` and `SetConnMaxLifetime` explicitly where the
pool is opened. Always `defer rows.Close()`, and always check `rows.Err()` after the loop. Query
arguments stay placeholders (`rule:parameterized-sql`).

**Why.** Without a context the database keeps grinding on a query whose caller hung up, holding the
connection while it does. The pool defaults are worse than they look: open connections are
unlimited, so a traffic spike opens more than the server will accept, and a connection is never
recycled, so it outlives a failover or a credential rotation. `rows.Err()` is the only place an
iteration failure surfaces, because `rows.Next()` returns false both when the result set ended and
when it broke, and the two are indistinguishable.

**Good**

```go
import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type user struct {
	ID   int64
	Name string
}

func openPool(driver, dsn string) (*sql.DB, error) {
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s pool: %w", driver, err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(time.Minute)
	return db, nil
}

func activeUsers(ctx context.Context, db *sql.DB) ([]user, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, name FROM users WHERE active = $1", true)
	if err != nil {
		return nil, fmt.Errorf("query active users: %w", err)
	}
	defer rows.Close()

	var found []user
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.ID, &u.Name); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		found = append(found, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate active users: %w", err)
	}
	return found, nil
}
```

**Bad**

```go
import (
	"database/sql"
	"fmt"
)

type user struct {
	ID   int64
	Name string
}

func activeUsers(db *sql.DB) ([]user, error) {
	rows, err := db.Query("SELECT id, name FROM users WHERE active = true")
	if err != nil {
		return nil, fmt.Errorf("query active users: %w", err)
	}

	var found []user
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.ID, &u.Name); err != nil {
			return nil, err
		}
		found = append(found, u)
	}
	return found, nil
}
```

**Caught by.** `contextcheck` reports a query that drops the caller's context, and `errcheck` reports
an unchecked `Scan`. The rest is review: the reviewer checks every `*sql.Rows` loop for a deferred
`Close` and a `rows.Err()` after it, and checks that the three pool settings sit next to the
`sql.Open` call.

**Sources.** https://go.dev/doc/database/manage-connections and
https://go.dev/doc/database/cancel-operations and https://pkg.go.dev/database/sql#Rows.Err

## transaction-and-rollback-discipline

- priority: P1
- atom_type: pattern-gotcha

**Rule.** Open with `BeginTx` and the caller's context, defer the rollback on the very next
statement, then commit at the end. A rollback after a successful commit is a no-op, so the defer is
always safe, and it is the only thing that covers an early return. Never hold a transaction open
across a network call to another service.

**Why.** Every error path between `BeginTx` and `Commit` can leak the transaction, and a function
with four early returns needs four rollbacks — one of which the next edit will forget. A deferred
rollback is written once and covers every path that exists now and every path added later. Because
`errcheck` reports a bare `defer tx.Rollback()`, discard the result inside the deferred closure
rather than dropping the defer. Holding a transaction across a call to another service is a
different failure: the remote service now decides how long your locks are held, so one slow
dependency becomes database-wide contention.

**Good**

```go
import (
	"context"
	"database/sql"
	"fmt"
)

func transfer(ctx context.Context, db *sql.DB, from, to, amount int64) error {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return fmt.Errorf("begin transfer: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	const move = "UPDATE accounts SET balance = balance + $1 WHERE id = $2"
	if _, err := tx.ExecContext(ctx, move, -amount, from); err != nil {
		return fmt.Errorf("debit account %d: %w", from, err)
	}
	if _, err := tx.ExecContext(ctx, move, amount, to); err != nil {
		return fmt.Errorf("credit account %d: %w", to, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transfer: %w", err)
	}
	return nil
}
```

**Bad**

```go
import (
	"context"
	"database/sql"
)

func transfer(ctx context.Context, db *sql.DB, from, to, amount int64) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	const move = "UPDATE accounts SET balance = balance + $1 WHERE id = $2"
	if _, err := tx.ExecContext(ctx, move, -amount, from); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, move, amount, to); err != nil {
		return err
	}
	return tx.Commit()
}
```

**Caught by.** `errcheck` reports an unchecked `Rollback` or `Commit`. The rest is review: the
reviewer checks that a rollback is deferred on the statement right after a successful `BeginTx`, and
that nothing between begin and commit calls another service.

**Sources.** https://go.dev/doc/database/execute-transactions and
https://pkg.go.dev/database/sql#DB.BeginTx

## migrations-are-versioned

- priority: P1
- atom_type: feedback-rule

**Rule.** Migrations live in the repository, numbered, reviewed like code. They run forward only in
production, applied by a migration tool in a deploy step — never by application start-up code.
`golang-migrate/migrate` and `pressly/goose` are both widely used and this corpus picks neither; pick
one and keep it. At start-up the process verifies the schema version and refuses to serve if it is
not the version the binary expects.

**Why.** Migrating at start-up looks convenient until the service runs more than one instance. Two
processes starting at the same moment apply the same change concurrently, and the loser either
crash-loops or half-applies it. A deploy step runs once, in a known order, with a human able to read
the plan first. Forward-only matters for a different reason: a down migration that drops a column
sits next to the rollback button, and a rollback is exactly the moment somebody presses the wrong
thing.

**Good**

```text
migrations/
  0001_create_users.up.sql
  0001_create_users.down.sql
  0002_add_users_email_index.up.sql
  0002_add_users_email_index.down.sql

deploy step   migrate -path ./migrations -database "$DATABASE_URL" up
process start verify the recorded version, never apply a change
```

```go
import (
	"context"
	"database/sql"
	"fmt"
)

func requireSchemaVersion(ctx context.Context, db *sql.DB, want int64) error {
	var have int64
	row := db.QueryRowContext(ctx, "SELECT max(version) FROM schema_migrations")
	if err := row.Scan(&have); err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	if have != want {
		return fmt.Errorf("schema is at version %d, binary needs %d: run the migration tool first", have, want)
	}
	return nil
}
```

**Bad**

```go
import (
	"context"
	"database/sql"
)

func start(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS users (id bigserial primary key, email text)")
	return err
}
```

**Caught by.** Nothing in the Go toolchain. The reviewer checks that a schema change arrives as a new
numbered file rather than an edit to one already applied, and that no `CREATE TABLE` or `ALTER TABLE`
appears on the start-up path. A CI job that applies every migration to an empty database catches a
broken sequence before a deploy does.

**Sources.** https://github.com/golang-migrate/migrate and https://github.com/pressly/goose and
https://go.dev/doc/database/open-handle
