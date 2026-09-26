# Go Agent Skill & Instructions: Production Engineering & Best Practices (Go 1.26+)

> **Skill Name**: `golang-best-practices-skill`  
> **Version**: `2.0.0` (Updated 2026)  
> **Target AI Agents**: Claude Code, OpenAI Codex, GitHub Copilot (Agent Mode / Chat), Cursor, Gemini CLI, OpenCode, Antigravity  
> **Applicable Files**: `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.codex/config.toml`, `.agents/skills/golang.md`

---

## 1. System Prompt Meta-Rules for AI Coding Agents

When generating, refactoring, or reviewing Go code as an AI Coding Agent, you MUST adhere strictly to these operational directives:

### 1.1 Instruction Hierarchy & Configuration Layers
1. **Repository Agent Instructions (`AGENTS.md`) [Highest Scope Priority]**: Governs agentic workflows, environment execution, build/test commands, PR definitions of done, and project navigation.
2. **Style & Guidelines Instructions (`.github/copilot-instructions.md`, `CLAUDE.md`, `.cursorrules`)**: Establishes code conventions, language features, error-handling contracts, and explicit prohibitions.
3. **Task Prompt Files (`.github/prompts/*.prompt.md`)**: Reusable templates for PR reviews, security audits, and migrations.
4. **Session Reset (`/clear`)**: ALWAYS instruct or execute a session clear when switching from one major task (e.g., debugging regex) to an unrelated task (e.g., building a gRPC handler) to avoid context pollution.
5. **Plan Mode Before Execution**: Require Plan Mode (`/plan` or structured execution proposal) before executing multi-file refactors, database schema alterations, API contract changes, or complex concurrent pipelines.

### 1.2 Core Code Generation Principles
- **Left-Aligned Happy Path**: Minimize nesting. Handle errors immediately and return early (`if err != nil { return err }`). Avoid `else` blocks after returns.
- **Max Function Length**: Limit functions to 40 lines. Extract complex logic into unexported helper functions.
- **Zero-Value Usability**: Design structs so that their zero-value is immediately usable without requiring explicit constructor calls whenever possible (e.g., `sync.Mutex`, `bytes.Buffer`).
- **No Unreviewed Dependencies**: Never introduce external `go.mod` dependencies unless explicitly permitted by the project's whitelist/instructions. Rely on the standard library first.
- **Strict Error Handling**: NEVER swallow errors silently (`_ = fn()`). Either handle/wrap and return the error, or log it—**never do both** in the same call frame.

---

## 2. Software Architecture & Package Design

### 2.1 SOLID Principles in Go
- **Single Responsibility (SRP)**: Keep packages focused on a single domain concept. Small, cohesive packages are easier to test and maintain.
- **Open/Closed Principle (OCP)**: Extend behavior via struct embedding and interface satisfaction rather than modifying existing concrete types.
- **Liskov Substitution Principle (LSP)**: Interface implementations must conform strictly to expected behavior without unexpected side effects or unhandled panics.
- **Interface Segregation Principle (ISP)**: Define interfaces **at the point of consumption**, not at the point of definition. Keep interfaces small (1–3 methods).
  ```go
  // GOOD: Defined by the consumer needing read access
  type DocumentReader interface {
      Read(p []byte) (n int, err error)
  }
  ```
- **Dependency Inversion (DIP)**: High-level modules must depend on abstractions (interfaces), not concrete structs. Use constructor injection:
  ```go
  type Service struct {
      repo UserRepository
  }

  func NewService(repo UserRepository) *Service {
      return &Service{repo: repo}
  }
  ```

### 2.2 Package Layout Standard
- `cmd/`: Main executables (e.g., `cmd/server/main.go`). Minimal logic—only bootstrap and wiring.
- `internal/`: Private application code. Go compiler enforces that external modules cannot import `internal/`.
  - `internal/domain/`: Core business entities and repository interfaces.
  - `internal/service/`: Business logic handlers.
  - `internal/adapters/`: Concrete implementations (HTTP handlers, SQL repositories, gRPC clients).
- `pkg/`: Public, reusable library code explicitly intended for external consumption.

---

## 3. Go 1.26+ Modern Idioms & Modernization (`go fix`)

### 3.1 Direct Value Expression Pointers (`new(expr)`)
Go 1.26 allows passing arbitrary expressions to `new()`. Use this to allocate and initialize primitive/struct pointers inline, avoiding temporary variables:
```go
// Legacy approach (Go < 1.26)
enabled := true
cfg := Config{Enabled: &enabled}

// Modern Go 1.26 approach
cfg := Config{
    Enabled:  new(true),
    Timeout:  new(30 * time.Second),
    UserRole: new(RoleAdmin),
}
```

### 3.2 Type-Safe Error Inspection (`errors.AsType`)
Replace non-type-safe `errors.As(err, &target)` with generic `errors.AsType[T](err)` to catch type mismatch errors at compile time:
```go
// Legacy (Go < 1.26)
var netErr *net.OpError
if errors.As(err, &netErr) { ... }

// Modern Go 1.26+
if netErr, ok := errors.AsType[*net.OpError](err); ok {
    log.Printf("Failed op: %s", netErr.Op)
}
```

### 3.3 Multi-Destination Structured Logging (`slog.MultiHandler`)
Use `slog.NewMultiHandler` from `log/slog` to broadcast log attributes to multiple destinations (e.g., stdout JSON and a remote syslog/file) without custom wrapper structs:
```go
jsonHandler := slog.NewJSONHandler(os.Stdout, nil)
textHandler := slog.NewTextHandler(logFile, nil)

logger := slog.New(slog.NewMultiHandler(jsonHandler, textHandler))
slog.SetDefault(logger)
```

### 3.4 Modernized `sync.WaitGroup.Go` (Go 1.25+)
In Go 1.25/1.26+, use `wg.Go(fn)` to eliminate manual `wg.Add(1)` and `defer wg.Done()` boilerplate:
```go
var wg sync.WaitGroup
wg.Go(func() {
    processTask(ctx, taskA)
})
wg.Go(func() {
    processTask(ctx, taskB)
})
wg.Wait()
```

### 3.5 Memory Protection for Secrets (`runtime/secret`)
Use the Go 1.26 `secret.Do` wrapper to ensure sensitive cryptographic keys and passwords are zeroed out of memory buffers immediately after use, protecting against heap leaks:
```go
import "runtime/secret"

secret.Do(func() {
    key := deriveEphemeralKey(passphrase)
    decryptPayload(cipherText, key)
}) // 'key' and temporary stack/register buffers are guaranteed zeroed here
```

### 3.6 Automated Refactoring via `go fix`
Integrate `go fix ./...` into CI pipelines to automatically apply standard library modernizations (such as replacing manual loops with `slices.Contains`, converting `errors.As`, and modernizing `io.ReadAll`).

---

## 4. Concurrency & Synchronization Paradigms

### 4.1 Fundamental Rules of Go Concurrency
1. **Share memory by communicating**: Prefer channels for data ownership transfer; use `sync.Mutex` for localized, high-frequency state protection.
2. **Goroutine Lifetime Ownership**: Every goroutine MUST have a guaranteed, deterministic exit path. Whoever spawns a goroutine is responsible for managing its lifetime.
3. **Channel Ownership Rule**: The goroutine that creates and writes to a channel is responsible for closing it. Never close a channel from the receiving end or across multiple sender goroutines.

### 4.2 Preventing Goroutine Leaks
Unbuffered or unreceived channel sends block permanently, causing memory leaks. Always guard channel operations with context cancellation:
```go
// BROKEN: Leaks goroutine if receiver exits early
func producer() <-chan int {
    ch := make(chan int)
    go func() {
        for i := 0; ; i++ {
            ch <- i // Blocks forever if receiver stops reading!
        }
    }()
    return ch
}

// CORRECT: Guarded by context cancellation
func producer(ctx context.Context) <-chan int {
    ch := make(chan int)
    go func() {
        defer close(ch)
        for i := 0; ; i++ {
            select {
            case <-ctx.Done():
                return
            case ch <- i:
            }
        }
    }()
    return ch
}
```

### 4.3 Bounded Concurrency Patterns
- **Worker Pool Pattern**: Fixed set of workers reading from a shared jobs channel.
- **Semaphore Channel Pattern**: Use a buffered `chan struct{}` to bound concurrent slice execution:
  ```go
  sem := make(chan struct{}, maxConcurrency)
  var wg sync.WaitGroup

  for _, item := range items {
      sem <- struct{}{} // Acquire slot
      wg.Go(func() {
          defer func() { <-sem }() // Release slot
          process(item)
      })
  }
  wg.Wait()
  ```
- **Error Group (`golang.org/x/sync/errgroup`)**: Fan-out tasks concurrently, cap parallel execution via `g.SetLimit(n)`, capture the first error, and cancel sibling tasks:
  ```go
  g, ctx := errgroup.WithContext(parentCtx)
  g.SetLimit(10) // Bounded concurrency

  for _, url := range urls {
      url := url
      g.Go(func() error {
          return fetch(ctx, url)
      })
  }
  if err := g.Wait(); err != nil {
      return fmt.Errorf("batch fetch failed: %w", err)
  }
  ```

---

## 5. Microservices, REST & gRPC API Engineering

### 5.1 Communication Strategy
- **External Traffic (North-South)**: Use REST over HTTP/JSON (or OpenAPI/Swagger) for browser/public clients.
- **Internal Microservices (East-West)**: Use gRPC over HTTP/2 with Protocol Buffers (`proto3`). Benefits: binary serialization compactness, multiplexed single TCP connections, bi-directional streaming, and compile-time contract enforcement.

### 5.2 HTTP Client Best Practices
- **Stateless Client Structs**: `*http.Client` wrappers must only store configuration (`baseURL`, `authKey`, `*http.Client`). NEVER store `*http.Request` or per-request state in client fields.
- **Request Creation Per-Call**:
  ```go
  func (c *Client) GetUser(ctx context.Context, id string) (*User, error) {
      req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/users/"+id, nil)
      if err != nil {
          return nil, fmt.Errorf("building request: %w", err)
      }
      resp, err := c.httpClient.Do(req)
      if err != nil {
          return nil, fmt.Errorf("executing request: %w", err)
      }
      defer resp.Body.Close()

      if resp.StatusCode != http.StatusOK {
          return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
      }
      // Decode body...
  }
  ```
- **Stream Re-reading & Retries**: `io.Reader` streams can only be read once. When implementing HTTP retry loops, store the payload as `[]byte` and re-populate `req.Body = io.NopCloser(bytes.NewReader(buf))` before each attempt, or set `req.GetBody`.

---

## 6. Security, Input Validation & OWASP

### 6.1 Database Query Safety
- **Parameterized SQL Queries**: NEVER concatenate user input into SQL strings. Always pass parameters via `db.QueryContext(ctx, query, args...)`.
  ```go
  // PROHIBITED
  db.Query("SELECT * FROM users WHERE email = '" + input + "'")

  // MANDATORY
  db.QueryContext(ctx, "SELECT * FROM users WHERE email = $1", input)
  ```

### 6.2 XSS & HTML Sanitization
- Use `html/template` for web rendering (it automatically contextual-escapes HTML/JS).
- When parsing user-submitted raw HTML, sanitize with `bluemonday.UGCPolicy()`.

### 6.3 Secrets & Environment Configuration
- Never hardcode credentials, tokens, or private keys.
- Parse environment variables into a strongly-typed struct at application startup (e.g., using `Zod` or `envconfig`), validating required variables immediately.

---

## 7. Memory, Performance & Green Tea GC

### 7.1 Green Tea Garbage Collector (Go 1.26 Default)
- **Page-Based Scanning**: Replaces legacy object-graph scanning with 8 KiB page span scanning. Reduces cache misses by 50% and lowers GC CPU overhead by 10–40%.
- **SIMD / AVX-512 Acceleration**: Go 1.26 automatically uses vector instructions on modern AMD64 hardware (Intel Ice Lake+, AMD Zen 4+) to accelerate pointer bitmap scans.

### 7.2 Struct Field Alignment & Padding
Organize struct fields in decreasing order of byte size (8-byte fields first, then 4-byte, 2-byte, 1-byte, booleans) to eliminate compiler memory alignment padding:
```go
// BAD: 32 bytes due to padding gaps
type BadStruct struct {
    flagA bool      // 1 byte (+7 bytes padding)
    val   int64     // 8 bytes
    flagB bool      // 1 byte (+7 bytes padding)
    count int32     // 4 bytes (+4 bytes padding)
}

// GOOD: 16 bytes tightly packed
type GoodStruct struct {
    val   int64     // 8 bytes
    count int32     // 4 bytes
    flagA bool      // 1 byte
    flagB bool      // 1 byte (+2 bytes padding)
}
```

### 7.3 Slice Preallocation
Always specify capacity hints for slices when the required size is known upfront:
```go
// GOOD: Zero re-allocations during append loop
items := make([]Item, 0, len(rawInputs))
for _, raw := range rawInputs {
    items = append(items, transform(raw))
}
```

---

## 8. Testing, Benchmarking & Quality Assurance

### 8.1 Table-Driven Tests with Parallel Subtests
```go
func TestCalculateDiscount(t *testing.T) {
    t.Parallel()

    tests := []struct {
        name     string
        price    float64
        userTier string
        want     float64
    }{
        {name: "vip user", price: 100, userTier: "VIP", want: 80},
        {name: "standard user", price: 100, userTier: "STANDARD", want: 100},
    }

    for _, tt := range tests {
        tt := tt // Capture range variable for parallel execution
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel()
            got := CalculateDiscount(tt.price, tt.userTier)
            if got != tt.want {
                t.Errorf("CalculateDiscount() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

### 8.2 Mandatory Race Detection & Linters
- **CI Command**: Always execute `go test -race -count=1 ./...` in CI pipelines.
- **Static Analysis Suite (`golangci-lint`)**: Include `go vet`, `gosec` (security), `bodyclose` (HTTP body leaks), `errcheck`, `ineffassign`, `prealloc`, and `unparam`.

---

## Appendix: Agent Skills Directory & Integration Reference

AI Agents (Claude Code, OpenAI Codex, Copilot, Cursor) can load modular domain skills on demand. Below is the reference index of available Go agentic skills (from `samber/cc-skills-golang` and `awesome-copilot` libraries):

### A. General Purpose Go Skills

| Skill Identifier | Description & Primary Focus | Trigger Command / Keyword |
| :--- | :--- | :--- |
| `golang-code-style` | `gofmt`, `goimports`, formatting, comment conventions | `/golang-code-style` |
| `golang-data-structures` | High-performance slice/map/tree manipulation, memory alignment | `/golang-data-structures` |
| `golang-database` | SQL injection protection, ORM patterns, connection pooling | `/golang-database` |
| `golang-design-patterns` | Creational, structural, and behavioral Go design patterns | `/golang-design-patterns` |
| `golang-documentation` | `godoc` standards, package docs, runnable examples | `/golang-documentation` |
| `golang-error-handling` | `errors.Is/As/AsType`, sentinel errors, custom wrapped errors | `/golang-error-handling` |
| `golang-modernize` | Go 1.26 modernizations (`new(expr)`, `go fix`, `sync.WaitGroup.Go`) | `/golang-modernize` |
| `golang-naming` | Idiomatic Go naming conventions (MixedCaps, short loop variables) | `/golang-naming` |
| `golang-refactoring` | Safe multi-file refactoring using `gopls` rename/extract | `/golang-refactoring` |
| `golang-safety` | Panic prevention, nil safety, map race prevention | `/golang-safety` |
| `golang-security` | OWASP security checks, SAST rules, secret zeroing (`secret.Do`) | `/golang-security` |
| `golang-testing` | Table-driven unit tests, parallel testing, `goleak` verification | `/golang-testing` |
| `golang-concurrency` | Worker pools, channels, errgroup, goroutine leak prevention | `/golang-concurrency` |
| `golang-performance` | Allocation profiling (`pprof`), Green Tea GC tuning, `sync.Pool` | `/golang-performance` |
| `golang-observability` | Structured logging (`slog`), OpenTelemetry tracing, Prometheus | `/golang-observability` |
| `golang-project-layout` | Standard Go layout (`cmd/`, `internal/`, `pkg/`) | `/golang-project-layout` |

### B. Library & Framework Skills

| Skill Identifier | Ecosystem Domain | Installation / Usage |
| :--- | :--- | :--- |
| `golang-grpc` | gRPC service contracts, Protobuf generation, interceptors | `npx skills add samber/cc-skills-golang --skill golang-grpc` |
| `golang-google-wire` | Compile-time dependency injection with `google/wire` | `npx skills add samber/cc-skills-golang --skill golang-google-wire` |
| `golang-uber-fx` | Application lifecycle framework with `uber-go/fx` | `npx skills add samber/cc-skills-golang --skill golang-uber-fx` |
| `golang-spf13-cobra` | CLI application development with `spf13/cobra` | `npx skills add samber/cc-skills-golang --skill golang-spf13-cobra` |
| `golang-spf13-viper` | Layered application configuration with `spf13/viper` | `npx skills add samber/cc-skills-golang --skill golang-spf13-viper` |
| `golang-samber-lo` | Type-safe functional programming helpers (500+ generic functions) | `npx skills add samber/cc-skills-golang --skill golang-samber-lo` |
| `golang-samber-slog` | Multi-handler routing & APM sinks for `log/slog` | `npx skills add samber/cc-skills-golang --skill golang-samber-slog` |
| `golang-stretchr-testify` | Assertion and mock testing with `stretchr/testify` | `npx skills add samber/cc-skills-golang --skill golang-stretchr-testify` |

### C. Skill Installation Commands Across Tooling Platforms

```bash
# Universal Agent Skills CLI (Claude Code, Codex, Cursor, Copilot)
npx skills add https://github.com/samber/cc-skills-golang --all

# Claude Code Plugin Installation
/plugin marketplace add samber/cc
/plugin install cc-skills-golang@samber

# OpenAI Codex CLI Plugin Installation
codex plugin add github:samber/cc-skills

# Gemini CLI Extension
gemini extensions install https://github.com/samber/cc-skills-golang

# Cursor Cross-Client Discovery Path
git clone https://github.com/samber/cc-skills-golang.git ~/.cursor/skills/cc-skills-golang
```
