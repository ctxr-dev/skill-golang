---
id: docs
area: docs
subject: [process]
updated: '2026-10-01'
rules: 4
---

# Documentation

What a Go file is allowed to say in prose. One kind of comment is required, every other kind is
banned, and these rules say which is which and how the required one is written.

## godoc-required-on-exported

- priority: P0
- atom_type: decision

**Rule.** Write a doc comment on every exported name and on every package. go.dev/doc/comment puts
it plainly: "Every exported (capitalized) name should have a doc comment." Unexported names stay
bare. A capitalised method on an unexported type is not reachable by an importer, so it owes no doc
comment either, which is what `revive`'s `exported` rule implements. In `package main` no name is
importable at all, so only the package comment is required, and `revive`'s `package-comments` still
demands that one. This is a deliberate, written exception to the companion `no-comments` skill,
whose own text bans doc blocks in every language and names Go doc comments among them. The
exception covers doc comments on exported names and on packages, and nothing else —
`rule:no-other-comments` still bans the rest.

**Why.** A Go doc comment is not prose sitting next to the code. `go/doc` parses it, `gopls` shows
it on hover, and pkg.go.dev publishes it as the package's documentation. That makes it API surface:
deleting one changes what your users read, exactly as deleting a parameter changes what they call.
`no-comments` already carves out text a tool reads and acts on, which is why `//go:build` survives
it. A doc comment is the same kind of thing, so it gets the same carve-out. The package comment
matters most of all, because it is the first and often the only thing a reader sees before deciding
whether your package does what they need.

**Good**

```go
package billing

import "errors"

// ErrNotFound reports that no invoice carries the requested identifier.
var ErrNotFound = errors.New("invoice not found")

// Invoice is one charge raised against one customer.
type Invoice struct {
	ID    string
	Cents int64
}

// Total returns the invoice amount plus taxCents, rounded to the nearest ten cents.
func (i Invoice) Total(taxCents int64) int64 {
	return roundToTen(i.Cents + taxCents)
}

func roundToTen(cents int64) int64 {
	return (cents / 10) * 10
}
```

The package comment sits above the package clause, in one file of the package. A package with
several files puts it in `doc.go` so nobody has to guess which file holds it.

```text
billing/doc.go

// Package billing prices subscriptions and raises invoices.
// It owns no transport and talks to no database.
package billing
```

**Bad**

```go
package billing

type Ledger struct {
	entries []int64
}

func (l *Ledger) Add(cents int64) {
	l.entries = append(l.entries, cents)
}

func (l *Ledger) Balance() int64 {
	var total int64
	for _, cents := range l.entries {
		total += cents
	}
	return total
}
```

**Caught by.** `revive`, with its `exported` and `package-comments` rules enabled. `exported` flags
an exported name with no doc comment and stays silent on a capitalised method whose receiver type is
unexported. It does not special-case `package main`: a capitalised name on an exported type there is
still reported, so unexport it or write the comment. `package-comments` flags a package with none.

**Sources.** https://go.dev/doc/comment , https://google.github.io/styleguide/go/decisions and
https://github.com/ctxr-dev/no-comments

## no-other-comments

- priority: P0
- atom_type: decision

**Rule.** On a line you add or change in Go, the only comment is a doc comment allowed by
`rule:godoc-required-on-exported`. Delete the rest: explanation, rationale, test narration, section
banners, `TODO`, `FIXME`, `NOTE`, `HACK`, and commented-out code. Directives are not comments and
stay. Leave comments you did not write alone, unless your change made one wrong — then delete the
wrong line rather than rewriting it.

**Why.** A comment explaining what the code does means the name is wrong. A comment explaining a
block means the block is a function waiting for a name. A comment warning about an ordering trap
means the structure permits the trap, so fix the structure. Each of those is a repair you can make
in the code, where the compiler will keep it honest, instead of in prose that nothing checks and
nobody updates. Directives are the opposite case: a tool reads them, and deleting one changes the
build.

**Good**

These are the Go lines that start with slashes and are not comments. Every one survives.

```text
//go:build linux && amd64                        -> the go tool, build constraint
//go:generate stringer -type=State               -> go generate
//go:embed assets/*                              -> the embed package
//go:noinline                                    -> the compiler
//go:nosplit                                     -> the compiler
//go:linkname localName importpath.name          -> the compiler and linker
// #cgo CFLAGS: -I/usr/local/include             -> the cgo preamble
//nolint:errcheck                                -> golangci-lint
//lint:ignore SA1019 dropped after the migration -> staticcheck
// Code generated by protoc-gen-go. DO NOT EDIT. -> linters, coverage and review tooling
```

A Go directive takes no space after the slashes. `// go:generate` with a space is an ordinary
comment and runs nothing. The cgo preamble and the generated-file marker are the two that read like
sentences, and they are still directives.

The one place a reviewer normally asks for prose is an error you dropped on purpose. Say it in code,
not in a sentence. Either name a helper whose name is the explanation, or write the directive the
linter reads. If the error actually matters, handle it instead — see `rule:wrap-or-log-never-both`.

```go
package audit

import (
	"fmt"
	"os"
)

func closeQuietly(f *os.File) {
	_ = f.Close()
}

// Save writes body to path and reports any failure to write it.
func Save(path, body string) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create %s: %w", path, err)
	}
	defer closeQuietly(f)
	if _, err := f.WriteString(body); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return f.Sync()
}

// Touch creates path when it is missing and reports any failure to create it.
func Touch(path string) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create %s: %w", path, err)
	}
	defer f.Close() //nolint:errcheck
	return f.Sync()
}
```

**Bad**

```go
package audit

import (
	"fmt"
	"os"
)

// Save writes body to path and reports any failure to write it.
func Save(path, body string) error {
	// open the file, truncating whatever was there before
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create %s: %w", path, err)
	}
	// we drop the close error on purpose, because the write below already reports failure
	defer f.Close()
	_, err = f.WriteString(body)
	return err
}
```

**Caught by.** `errcheck` flags the dropped error that the prose was covering for, and it is the
`//nolint:errcheck` directive, not a sentence, that silences it. `govet` and `staticcheck` read
`//go:build` and `//lint:ignore`, so a directive written with a space stops working and the tool
says so. Everything else here is caught by review: the reviewer reads the diff and asks of each
comment on a changed line whether a tool reads it, and whether deleting it changes behaviour. Two
yeses mean it stays.

**Sources.** https://pkg.go.dev/cmd/go , https://golangci-lint.run/docs/linters/false-positives/ and
https://github.com/ctxr-dev/no-comments

## godoc-sentence-form

- priority: P1
- atom_type: feedback-rule

**Rule.** Start the doc comment with the symbol's own name. Write complete sentences. Say what the
thing is or does, never how it does it. Retire a symbol with a `Deprecated:` paragraph that names
the replacement, and keep the symbol working.

**Why.** `go/doc` takes the first sentence and shows it alone in the package index, stripped of its
surroundings. The name-first form is what makes that index readable, because each entry reads as a
sentence about the thing it names. A comment that describes the implementation goes stale the first
time someone changes the implementation, and a stale doc comment is worse than none because a reader
trusts it. `gopls` and pkg.go.dev both recognise the `Deprecated:` paragraph: editors grey the
symbol out and the published docs mark it, so the form does work that prose cannot.

**Good**

```go
package user

import (
	"context"
	"errors"
)

// ErrNotFound reports that no user carries the requested identifier.
var ErrNotFound = errors.New("user not found")

// Store reads users from the directory it was built with.
type Store struct {
	byID map[string]string
}

// Name returns the display name held for id.
// It returns ErrNotFound when the store holds no such user.
func (s *Store) Name(ctx context.Context, id string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	name, ok := s.byID[id]
	if !ok {
		return "", ErrNotFound
	}
	return name, nil
}

// Lookup returns the display name held for id, or the empty string.
//
// Deprecated: use [Store.Name], which reports a missing user as an error.
func (s *Store) Lookup(id string) string {
	return s.byID[id]
}
```

**Bad**

```go
package user

// Fetches a user by walking the map until the key matches, then copies the
// struct out so the caller cannot mutate our storage.
func Fetch(id string) string {
	return id
}
```

**Caught by.** `revive` with its `exported` rule, which reports a doc comment that does not begin
with the name of the symbol it documents. The sentence form and the staleness are caught by review:
the reviewer reads the first sentence on its own, as the package index will show it, and checks that
it still describes the code in the same diff.

**Sources.** https://go.dev/doc/comment , https://go.dev/wiki/Deprecated and
https://go.dev/blog/godoc

## godoc-at-simple-language-level-2

- priority: P1
- atom_type: decision

**Rule.** When the companion `simple-language` skill is active, write at its level 2 everywhere a
person reads: doc comments, error strings, log messages, and anything you say to the user. Commoner
words, one idea per sentence, a named actor. Keep every technical term, identifier, config key and
number. The symbol-name opening sentence from `rule:godoc-sentence-form` survives regardless.

**Why.** This overrides two of that skill's own rules, on purpose. Level 2 normally fires only when
a reader asks for it, and text a machine reads is normally outside its domain. Both exceptions apply
here. The reader of a doc comment did not write the package, often reads English as a second
language, and is reading between two meetings; asking for simpler wording is not an option they
have, because the comment is already published. And the published form is the only form, so there is
no plainer version to fall back on. Level 2 cuts vocabulary, never content: a sentence that loses a
caveat, a number or a term has failed this rule, not passed it.

**Good**

```go
package pricing

import "errors"

// ErrNoPlan reports that the account is on no plan, so there is nothing to price.
var ErrNoPlan = errors.New("no plan")

var centsPerMonth = map[string]int64{
	"basic": 900,
	"pro":   2900,
}

// Quote returns the price in cents for one month on the named plan.
// It returns ErrNoPlan when this package prices no such plan.
func Quote(plan string) (int64, error) {
	cents, ok := centsPerMonth[plan]
	if !ok {
		return 0, ErrNoPlan
	}
	return cents, nil
}
```

**Bad**

```go
package pricing

// Quote facilitates the computation of the monetary amount to be levied in
// respect of a subscription, subsequent to the determination of the plan
// applicable to the account in question.
func Quote(plan string) (int64, error) {
	return 0, nil
}
```

**Caught by.** Nothing automated: no linter measures reading level. Review catches it, and the
reviewer applies two tests to each doc comment. Can a reader act correctly on it? Would someone who
knows this package still call it true? A wordy comment that passes both is a style note; one that
fails either is a defect.

**Sources.** https://github.com/ctxr-dev/simple-language and https://go.dev/doc/comment
