---
id: modernization
area: modernization
subject: [languages]
updated: '2026-10-01'
rules: 4
---

# Modernization

Which Go releases this corpus targets, and the standard-library and language features that replace
code people still write by hand.

## version-baseline-two-releases

- priority: P0
- atom_type: decision

**Rule.** Write for Go 1.25 and Go 1.26. A rule that needs the newer release carries a `since: 1.26`
marker and shows the form that compiles on 1.25 beside it, so every rule is usable on either. The
`go` directive in `go.mod` decides which form compiles. Never gate a language feature on a runtime
version check.

**Why.** Two releases is the window the Go team supports, so a corpus pinned to one of them is wrong
for half the people reading it. Putting the gate on the rule, as a `since` marker, keeps it visible
where the code is rather than in a preface nobody opens. A runtime check cannot help here: the
features under a `since: 1.26` marker are language and library changes, so a file using one fails to
build on an older toolchain long before any `if` could run.

**Good**

```text
rule frontmatter    since: 1.26
first good block    the 1.26 form
second good block   labelled 1.25, the form that compiles on the baseline
go.mod go 1.25      only the baseline form compiles
go.mod go 1.26      both compile, and the newer form is preferred
```

```go
import (
	"fmt"
	"runtime"
)

func reportToolchain() {
	fmt.Printf("running on %s\n", runtime.Version())
}
```

**Bad**

```go
import (
	"runtime"
	"strings"
)

func supportsNewExpr() bool {
	return strings.HasPrefix(runtime.Version(), "go1.26")
}
```

**Caught by.** The compiler, which is why the counter-example is pointless: a file using a Go 1.26
language feature in a module whose `go` directive says `go 1.25` never reaches the version check. On
a go1.25.11 toolchain `new(age)` is rejected with `age is not a type`, because that compiler can only
read `new` as taking a type.

**Sources.** https://go.dev/ref/mod#go-mod-file-go and https://go.dev/doc/toolchain and
https://go.dev/doc/devel/release

## slices-maps-cmp-packages

- priority: P1
- atom_type: feedback-rule

**Rule.** Reach for `slices`, `maps` and `cmp` before writing a loop. `slices.Contains`,
`slices.Sort`, `slices.SortFunc` and `slices.Compact` replace search and sort loops. `maps.Keys`
returns an iterator, not a slice, so feed it to `slices.Sorted` to get a stable key list.
`cmp.Compare` and `cmp.Or` express a multi-key comparison without nesting `if` statements.

**Why.** All three are standard library, so they add no dependency, and they are generic, so they add
no type assertion. They joined the standard library in Go 1.21, with `cmp.Or` arriving in 1.22 and
the iterator-returning `maps.Keys` in 1.23, which puts every one of them on the 1.25 baseline. The
loops they replace are where off-by-one errors live, and `sort.Slice` takes a `less` function that
cannot say "equal on this key, fall through to the next" without repeating the index expressions
twice per key.

**Good**

```go
import (
	"cmp"
	"maps"
	"slices"
)

type server struct {
	name   string
	region string
	weight int
}

func sortedNames(byName map[string]server) []string {
	return slices.Sorted(maps.Keys(byName))
}

func isAllowed(allowList []string, region string) bool {
	return slices.Contains(allowList, region)
}

func uniqueRegions(servers []server) []string {
	out := make([]string, 0, len(servers))
	for _, s := range servers {
		out = append(out, s.region)
	}
	slices.Sort(out)
	return slices.Compact(out)
}

func rankByWeight(servers []server) {
	slices.SortFunc(servers, func(a, b server) int {
		return cmp.Or(cmp.Compare(b.weight, a.weight), cmp.Compare(a.name, b.name))
	})
}
```

**Bad**

```go
import "sort"

type server struct {
	name   string
	region string
	weight int
}

func sortedNames(byName map[string]server) []string {
	out := make([]string, 0, len(byName))
	for name := range byName {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

func isAllowed(allowList []string, region string) bool {
	for _, candidate := range allowList {
		if candidate == region {
			return true
		}
	}
	return false
}

func rankByWeight(servers []server) {
	sort.Slice(servers, func(i, j int) bool {
		if servers[i].weight != servers[j].weight {
			return servers[i].weight > servers[j].weight
		}
		return servers[i].name < servers[j].name
	})
}
```

**Caught by.** `gopls`, whose `slicescontains`, `slicessort` and `mapsloop` modernizers offer these
rewrites as quick fixes, and `go fix` on Go 1.26, which is where the modernizers now live — run as
the reviewed local step that `rule:go-fix-is-a-reviewed-local-step` describes, never as an automatic
rewrite. Neither runs in the shipped lint baseline, so review is the backstop, and the reviewer looks
for a loop whose entire body is one comparison.

**Sources.** https://pkg.go.dev/slices and https://pkg.go.dev/maps and https://pkg.go.dev/cmp and
https://go.dev/doc/go1.21#slices and
https://github.com/golang/tools/blob/master/gopls/doc/analyzers.md

## new-expr

- priority: P2
- atom_type: reference
- since: 1.26

**Rule.** On Go 1.26, `new` accepts an expression as well as a type: `new(expr)` returns a pointer to
a new variable holding that value. Use it where a named temporary existed only so its address could
be taken. This needs Go 1.26; on the 1.25 baseline, declare the temporary and take its address.

**Why.** Before 1.26, `new` took a type, so `&x` was the only route to a pointer and `x` had to be a
variable with a name. Packages that use a pointer to mean "optional", such as `encoding/json`,
therefore forced one named temporary per optional field, and those temporaries accumulate above a
struct literal until the literal has to be taken apart to fill it. `new(expr)` deletes them and
leaves the literal in one piece. Neither Go block below is compiled by the corpus check, because the
rule is gated on Go 1.26 and the toolchain here is go1.25.11; the baseline block was built by hand on
that toolchain.

**Good**

```go
import (
	"encoding/json"
	"time"
)

type person struct {
	Name string     `json:"name"`
	Age  *int       `json:"age,omitempty"`
	Seen *time.Time `json:"seen,omitempty"`
}

func encode(name string, age int, seen time.Time) ([]byte, error) {
	return json.Marshal(person{
		Name: name,
		Age:  new(age),
		Seen: new(seen),
	})
}
```

**Good (1.25)**

```go
import (
	"encoding/json"
	"time"
)

type person struct {
	Name string     `json:"name"`
	Age  *int       `json:"age,omitempty"`
	Seen *time.Time `json:"seen,omitempty"`
}

func encode(name string, age int, seen time.Time) ([]byte, error) {
	ageCopy := age
	seenCopy := seen
	return json.Marshal(person{
		Name: name,
		Age:  &ageCopy,
		Seen: &seenCopy,
	})
}
```

**Caught by.** The compiler. A module whose `go` directive says `go 1.25` rejects the first form, and
on a go1.25.11 toolchain the message is `age is not a type`, which reads as a mistake rather than as
a version gate. That misleading message is the reason this rule says the version requirement out
loud.

**Sources.** https://go.dev/doc/go1.26#language and https://go.dev/ref/spec#Allocation

## range-over-int-and-iterators

- priority: P2
- atom_type: reference

**Rule.** `for i := range n` loops `n` times and needs no counter; it has been in the language since
Go 1.22. A function returning `iter.Seq[T]` or `iter.Seq2[K, V]` can be ranged over directly, since
Go 1.23. Return one of those instead of taking a `func(T)` callback. Both compile on the 1.25
baseline.

**Why.** Ranging over an integer removes the three-clause loop in the one case where it carried no
information: counting. The iterator form is the larger change. `for` over an `iter.Seq` lets the
caller `break`, `return` or `continue` out of the loop, and the producer finds out, because `yield`
returns `false` and the iterator function returns. A `func(T)` callback gives the caller none of
that: stopping early means inventing a sentinel error or a boolean return that every caller has to
thread back, and forgetting to check it is silent.

**Good**

```go
import (
	"fmt"
	"iter"
)

func firstN(values []int, n int) iter.Seq[int] {
	return func(yield func(int) bool) {
		for i := range n {
			if i >= len(values) {
				return
			}
			if !yield(values[i]) {
				return
			}
		}
	}
}

func printHead(values []int) {
	for v := range firstN(values, 3) {
		fmt.Println(v)
	}
}
```

**Bad**

```go
import "fmt"

func eachFirstN(values []int, n int, visit func(int)) {
	for i := 0; i < n && i < len(values); i++ {
		visit(values[i])
	}
}

func printHead(values []int) {
	eachFirstN(values, 3, func(v int) {
		fmt.Println(v)
	})
}
```

**Caught by.** `gopls` and `go fix` on Go 1.26 rewrite a counting three-clause loop into
`for i := range n` through the `rangeint` modernizer. Nothing rewrites a callback into an iterator,
because that changes the exported signature, so it is a review call: the reviewer looks for a
callback parameter whose caller has no way to stop the loop.

**Sources.** https://go.dev/doc/go1.22#language and https://go.dev/blog/range-functions and
https://pkg.go.dev/iter and
https://github.com/golang/tools/blob/master/gopls/doc/analyzers.md
