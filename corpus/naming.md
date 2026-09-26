---
id: naming
area: naming
subject: [languages]
updated: '2026-10-01'
rules: 4
---

# Naming

What things are called in Go: the case convention, what a getter is called, what a package is called,
and how long a name should be for the scope it lives in.

## mixedcaps-and-initialisms

- priority: P1
- atom_type: feedback-rule

**Rule.** Write multi-word names as MixedCaps or mixedCaps, never with underscores. Keep an
initialism in one case throughout: `URL`, `userID`, `ServeHTTP`, `apiKey`. Never `Url`, `userId` or
`Serve_Http`.

**Why.** One convention across a codebase means a reader never stops to decide how a name was spelled
before typing it. The initialism part is the half people get wrong: `Id` and `Url` read as ordinary
words, so a search for `userID` misses `userId`, and two spellings of the same concept drift apart in
the same file. Case also carries meaning in Go, because the first letter decides whether a name is
exported, so an underscore-separated name hides that signal in the middle of a word.

**Good**

```go
import "net/http"

// APIClient calls one upstream HTTP service.
type APIClient struct {
	baseURL   string
	userID    string
	transport *http.Client
}

// ServeHTTP reports the caller identity this client was built for.
func (c *APIClient) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-User-Id", c.userID)
	w.WriteHeader(http.StatusOK)
}

func maxIdleConns() int {
	return 10
}
```

**Bad**

```go
import "net/http"

// ApiClient calls one upstream HTTP service.
type ApiClient struct {
	BaseUrl    string
	user_id    string
	Http_Agent *http.Client
}

// Serve_Http reports the caller identity this client was built for.
func (c *ApiClient) Serve_Http(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-User-Id", c.user_id)
	w.WriteHeader(http.StatusOK)
}

func max_idle_conns() int {
	return 10
}
```

**Caught by.** `revive`, through its `var-naming` rule, and `staticcheck` check ST1003, both of which
report an underscore in a name and an initialism written in mixed case.

**Sources.** https://go.dev/wiki/CodeReviewComments#initialisms,
https://go.dev/doc/effective_go#mixed-caps and
https://google.github.io/styleguide/go/decisions#initialisms

## no-get-prefix

- priority: P1
- atom_type: feedback-rule

**Rule.** A getter is named after the thing it returns: `Owner()`, not `GetOwner()`. A setter keeps
the verb: `SetOwner()`.

**Why.** `Get` adds a syllable and no information, because a method that returns a value and takes
none is already a getter. Dropping it also leaves the field name free for the field, so a type can
hold `owner` and expose `Owner()` without renaming either. `Set` stays because without it the call
reads as a question rather than a command, and a setter and a getter with the same name cannot both
exist on one type.

**Good**

```go
import "sync"

// Account holds one customer balance.
type Account struct {
	mu    sync.Mutex
	owner string
}

// Owner returns the name the account is held in.
func (a *Account) Owner() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.owner
}

// SetOwner records a new account holder.
func (a *Account) SetOwner(owner string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.owner = owner
}
```

**Bad**

```go
import "sync"

// Account holds one customer balance.
type Account struct {
	mu    sync.Mutex
	owner string
}

// GetOwner returns the name the account is held in.
func (a *Account) GetOwner() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.owner
}

// PutOwner records a new account holder.
func (a *Account) PutOwner(owner string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.owner = owner
}
```

**Caught by.** Review. The reviewer looks for a method whose name starts with `Get` and takes no
arguments, and for a setter that uses any verb other than `Set`.

**Sources.** https://go.dev/doc/effective_go#Getters and
https://google.github.io/styleguide/go/decisions#getters

## package-names

- priority: P1
- atom_type: feedback-rule

**Rule.** Give a package a short, lower case, single-word name with no underscores and no plural.
Never `util`, `common` or `helpers`. The package name is part of every call site, so name the
contents from the caller's side: `chubby.New` beats `chubby.NewChubbyFile`.

**Why.** A caller always reads the package name and the symbol together, so any word repeated in both
is noise on every line that uses it. A name like `util` tells a caller nothing about what is inside,
which is why such packages collect anything nobody could place and then get imported everywhere. A
plural reads wrongly at the call site too, since `chubbies.New` describes a collection the package
does not have.

**Good**

```go
package chubby

import "errors"

// File is one stored file.
type File struct {
	name string
}

// New opens the named file.
func New(name string) (*File, error) {
	if name == "" {
		return nil, errors.New("chubby: name is empty")
	}
	return &File{name: name}, nil
}
```

**Bad**

```go
package chubby_utils

import "errors"

// ChubbyFile is one stored file.
type ChubbyFile struct {
	name string
}

// NewChubbyFile opens the named chubby file.
func NewChubbyFile(name string) (*ChubbyFile, error) {
	if name == "" {
		return nil, errors.New("chubby_utils: name is empty")
	}
	return &ChubbyFile{name: name}, nil
}
```

**Caught by.** `revive`, through its `var-naming` rule, and `staticcheck` check ST1003, both of which
report an underscore or a capital in a package name. A package called `util` or `helpers`, and a
constructor that repeats its own package name, are caught by review.

**Sources.** https://go.dev/blog/package-names,
https://go.dev/wiki/CodeReviewComments#package-names and
https://google.github.io/styleguide/go/decisions#package-vs-exported-symbol-name

## receiver-and-variable-names

- priority: P1
- atom_type: feedback-rule

**Rule.** Give a receiver one or two letters drawn from its type, and use the same letters on every
method of that type. Never `this` or `self`. Let a variable's name grow with its scope: one letter
inside a short loop, a word at function scope, a phrase for a package-level name.

**Why.** A receiver is the most repeated name in a type's methods, so it earns the shortest form that
still points at the type; `this` and `self` point at nothing and come from languages where the
receiver has no declaration to read. Varying the letters between methods makes a reader check the
signature each time. Scope sets the right length for everything else: a reader can see the whole life
of a loop variable at once, so `e` is clear there, while a package-level name is read far from where
it was declared and has to carry its meaning with it.

**Good**

```go
import "strings"

// Ledger records amounts against one account.
type Ledger struct {
	entries []int
	owner   string
}

// Add appends an amount to the ledger.
func (l *Ledger) Add(amount int) {
	l.entries = append(l.entries, amount)
}

// Owner returns the name the ledger is held in.
func (l *Ledger) Owner() string {
	return strings.TrimSpace(l.owner)
}

func totalOf(entries []int) int {
	sum := 0
	for _, e := range entries {
		sum += e
	}
	return sum
}
```

**Bad**

```go
import "strings"

// Ledger records amounts against one account.
type Ledger struct {
	entries []int
	owner   string
}

// Add appends an amount to the ledger.
func (this *Ledger) Add(amount int) {
	this.entries = append(this.entries, amount)
}

// Owner returns the name the ledger is held in.
func (ledgerReceiver *Ledger) Owner() string {
	return strings.TrimSpace(ledgerReceiver.owner)
}

func totalOf(entriesToBeSummedForTheCaller []int) int {
	accumulatedRunningTotal := 0
	for _, individualEntryValueFromTheSlice := range entriesToBeSummedForTheCaller {
		accumulatedRunningTotal += individualEntryValueFromTheSlice
	}
	return accumulatedRunningTotal
}
```

**Caught by.** `revive`, through its `receiver-naming` rule, and `staticcheck` checks ST1006 and
ST1016, which report `this` or `self` and a receiver name that changes between methods of one type.
Name length against scope is caught by review.

**Sources.** https://go.dev/wiki/CodeReviewComments#receiver-names,
https://go.dev/wiki/CodeReviewComments#variable-names and
https://google.github.io/styleguide/go/decisions#receiver-names
