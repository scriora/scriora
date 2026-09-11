# Scriora — State & Error Model

> **Status:** Canonical Engineering Specification (State & Error Model 100% Complete)
> **Scope:** All State Machines, Lifecycle Transitions, and Unified Error Taxonomy across Scriora
> **Core Principle:** Every entity has a defined set of states with explicit, auditable transitions. Every error has a canonical code, a severity, and a prescribed handling strategy.

---

# PART I — UNIFIED STATE MACHINES

---

# 1. State Machine Philosophy

Scriora manages complex, multi-step business processes that span multiple repositories, asynchronous workers, and external platforms. Without explicit state modeling:
- Incomplete operations leave entities in ambiguous states.
- Retries produce duplicate actions on external platforms.
- Debugging becomes reconstruction of distributed events.

### State Machine Invariants
1. Every entity has exactly **one current state** at any moment.
2. Transitions are **event-driven** — no implicit background mutations.
3. Every transition is **auditable** — the reason, actor, and timestamp are recorded.
4. **Terminal states** cannot be re-entered once reached (except via explicit admin action).
5. **No state can be set by the Agent directly** — only Core Application Contracts set state.

---

# 2. State Transition Notation

```text
STATE_A
    │
    ├── [Event: trigger] ──► STATE_B
    │    (Guard: condition)
    │    (Effect: side-effect)
    │
    └── [Event: other]   ──► STATE_C
```

---

# 3. Content State Machine

`Content` represents the business object — independent of publication.

```text
DRAFT
  ├── [submit_for_review] ──► IN_REVIEW
  └── [archive]           ──► ARCHIVED

IN_REVIEW
  ├── [approve]           ──► APPROVED
  ├── [request_changes]   ──► DRAFT  (returns to draft for revision)
  └── [reject]            ──► REJECTED

APPROVED
  ├── [schedule / publish] ──► PUBLISHING (via Publication)
  ├── [revoke_approval]    ──► DRAFT
  └── [archive]            ──► ARCHIVED

REJECTED
  └── [revise]             ──► DRAFT

ARCHIVED
  └── [restore]            ──► DRAFT  (admin action only)
```

**Notes:**
- Approval does not equal publication. Approved content requires a Publication to reach a platform.
- Modifying an APPROVED content version automatically reverts it to DRAFT.

---

# 4. ContentVariant State Machine

Each `ContentVariant` (per-platform adaptation) has its own lifecycle:

```text
DRAFT
  ├── [submit]      ──► PENDING_APPROVAL (if approval policy requires it)
  └── [auto_approve]──► APPROVED         (if autonomy level L4)

PENDING_APPROVAL
  ├── [approved]    ──► APPROVED
  └── [rejected]    ──► DRAFT
  └── [expired]     ──► EXPIRED

APPROVED
  ├── [publish]     ──► USED
  └── [superseded]  ──► SUPERSEDED

USED            (terminal: variant was published)
SUPERSEDED      (terminal: replaced by newer variant)
EXPIRED         (terminal: approval link expired)
```

---

# 5. Publication State Machine

`Publication` represents a single publish event to a specific platform account.

```text
DRAFT
  └── [schedule]            ──► SCHEDULED

SCHEDULED
  ├── [execute_now / timer] ──► EXECUTING
  └── [cancel]              ──► CANCELLED

EXECUTING
  ├── [platform_accepted]   ──► VERIFYING
  ├── [platform_rejected]   ──► FAILED_PERMANENT
  └── [timeout]             ──► FAILED_RETRYABLE

VERIFYING
  ├── [confirmed_live]      ──► SUCCEEDED
  ├── [not_found_after_wait]──► UNKNOWN_EXTERNAL_STATE
  └── [platform_deleted]    ──► FAILED_PERMANENT

SUCCEEDED       (terminal: post live and verified)
CANCELLED       (terminal: cancelled before execution)
FAILED_RETRYABLE
  └── [retry]               ──► EXECUTING
  └── [max_retries]         ──► FAILED_PERMANENT

FAILED_PERMANENT (terminal: no further retry)
UNKNOWN_EXTERNAL_STATE
  └── [reconcile]           ──► VERIFYING
  └── [manual_resolve]      ──► SUCCEEDED / FAILED_PERMANENT
```

---

# 6. PublishAttempt State Machine

Each retry of a Publication is tracked as a `PublishAttempt`:

```text
INITIATED
  ├── [command_sent]      ──► PENDING
  └── [pre_check_failed]  ──► ABORTED

PENDING
  ├── [acknowledged]      ──► PROCESSING
  └── [timeout]           ──► TIMED_OUT

PROCESSING
  ├── [success_response]  ──► SUCCEEDED
  ├── [error_response]    ──► FAILED
  └── [network_timeout]   ──► TIMED_OUT

SUCCEEDED   (terminal)
FAILED      (terminal — triggers retry decision on parent Publication)
TIMED_OUT   (terminal — triggers UNKNOWN_EXTERNAL_STATE on parent Publication)
ABORTED     (terminal — never reached platform)
```

---

# 7. Approval State Machine

`Approval` represents a human governance decision required before a controlled action.

```text
PENDING
  ├── [link_opened]          ──► UNDER_REVIEW  (informational transition)
  └── [expired]              ──► EXPIRED

UNDER_REVIEW
  ├── [approved]             ──► APPROVED
  ├── [rejected]             ──► REJECTED
  └── [changes_requested]    ──► CHANGES_REQUESTED

APPROVED
  └── [resource_modified]    ──► INVALIDATED (version binding broken)

REJECTED        (terminal)
EXPIRED         (terminal: TTL elapsed without action)
INVALIDATED     (terminal: approved resource was subsequently modified)
CHANGES_REQUESTED
  └── [revised_and_resubmit] ──► PENDING (new approval cycle)
```

**Key Invariant:** An `APPROVED` approval is immediately `INVALIDATED` if the resource it approved is modified. A new approval cycle must be initiated.

---

# 8. Mission State Machine

`Mission` represents the highest-level commercial growth objective:

```text
DRAFT
  └── [activate]        ──► ACTIVE

ACTIVE
  ├── [pause]           ──► PAUSED
  ├── [complete]        ──► COMPLETED
  └── [abandon]         ──► ABANDONED

PAUSED
  ├── [resume]          ──► ACTIVE
  └── [abandon]         ──► ABANDONED

COMPLETED     (terminal: goal achieved or time window expired with review)
ABANDONED     (terminal: manually terminated)
```

---

# 9. Hypothesis State Machine

```text
DRAFT
  └── [submit_for_testing]  ──► PENDING

PENDING
  └── [experiment_started]  ──► TESTING

TESTING
  ├── [validated]           ──► VALIDATED
  ├── [disproven]           ──► DISPROVEN
  └── [inconclusive]        ──► INCONCLUSIVE

VALIDATED       (terminal: hypothesis confirmed with statistical significance)
DISPROVEN       (terminal: hypothesis rejected with statistical significance)
INCONCLUSIVE    (terminal: insufficient data to determine outcome)
```

---

# 10. Experiment State Machine

```text
DRAFT
  ├── [approve]        ──► APPROVED
  └── [discard]        ──► DISCARDED

APPROVED
  └── [launch]         ──► ACTIVE

ACTIVE
  ├── [complete]       ──► COLLECTING_EVIDENCE
  └── [abort]          ──► ABORTED

COLLECTING_EVIDENCE
  └── [evidence_sealed]──► COMPLETED

COMPLETED     (terminal)
ABORTED       (terminal: stopped early by user or policy)
DISCARDED     (terminal: never launched)
```

---

# 11. AgentTask State Machine

```text
PENDING
  └── [claim]            ──► PLANNING

PLANNING
  ├── [plan_ready]       ──► WAITING_APPROVAL  (if approval required)
  └── [plan_ready]       ──► EXECUTING         (if no approval required)

WAITING_APPROVAL
  ├── [human_approved]   ──► EXECUTING
  ├── [human_rejected]   ──► CANCELLED
  └── [timeout]          ──► CANCELLED

EXECUTING
  ├── [success]          ──► SUCCEEDED
  ├── [retryable_error]  ──► FAILED_RETRYABLE
  ├── [permanent_error]  ──► FAILED_PERMANENT
  └── [paused]           ──► PAUSED

PAUSED
  ├── [resume]           ──► EXECUTING
  └── [cancel]           ──► CANCELLED

FAILED_RETRYABLE
  └── [retry]            ──► EXECUTING
  └── [max_retries]      ──► FAILED_PERMANENT

SUCCEEDED         (terminal)
FAILED_PERMANENT  (terminal)
CANCELLED         (terminal)
```

---

# 12. MediaAsset State Machine

```text
REGISTERED
  └── [upload_complete]    ──► UPLOADED

UPLOADED
  └── [start_validation]   ──► VALIDATING

VALIDATING
  ├── [valid]              ──► PROCESSING  (if transformation needed)
  └── [valid_no_transform] ──► READY
  └── [invalid]            ──► FAILED_PERMANENT

PROCESSING
  ├── [complete]           ──► READY
  └── [transient_error]    ──► FAILED_RETRYABLE
  └── [permanent_error]    ──► FAILED_PERMANENT

FAILED_RETRYABLE
  └── [retry]              ──► PROCESSING
  └── [max_retries]        ──► FAILED_PERMANENT

READY
  └── [expire]             ──► EXPIRED
  └── [delete]             ──► DELETED

EXPIRED         (terminal)
DELETED         (terminal)
FAILED_PERMANENT (terminal)
```

---

# 13. SocialAccount State Machine

```text
PENDING_AUTH
  └── [oauth_completed]     ──► CONNECTED

CONNECTED
  ├── [token_expired]       ──► REFRESH_REQUIRED
  └── [revoked_by_user]     ──► REVOKED
  └── [platform_revoked]    ──► REVOKED

REFRESH_REQUIRED
  ├── [refresh_success]     ──► CONNECTED
  └── [refresh_failed]      ──► REVOKED

REVOKED
  └── [reconnect]           ──► PENDING_AUTH  (new OAuth flow)
```

---

# 14. SkillExecution State Machine

```text
INITIATED
  └── [started]        ──► RUNNING

RUNNING
  ├── [completed]      ──► SUCCEEDED
  ├── [failed]         ──► FAILED
  └── [aborted]        ──► ABORTED

SUCCEEDED   (terminal)
FAILED      (terminal)
ABORTED     (terminal: parent task cancelled mid-execution)
```

---

# 15. Master State Transition Summary

| Entity | Initial State | Terminal States |
| :--- | :--- | :--- |
| Content | DRAFT | ARCHIVED, REJECTED |
| ContentVariant | DRAFT | USED, SUPERSEDED, EXPIRED |
| Publication | DRAFT | SUCCEEDED, FAILED_PERMANENT, CANCELLED |
| PublishAttempt | INITIATED | SUCCEEDED, FAILED, TIMED_OUT, ABORTED |
| Approval | PENDING | APPROVED, REJECTED, EXPIRED, INVALIDATED |
| Mission | DRAFT | COMPLETED, ABANDONED |
| Hypothesis | DRAFT | VALIDATED, DISPROVEN, INCONCLUSIVE |
| Experiment | DRAFT | COMPLETED, ABORTED, DISCARDED |
| AgentTask | PENDING | SUCCEEDED, FAILED_PERMANENT, CANCELLED |
| MediaAsset | REGISTERED | READY, EXPIRED, DELETED, FAILED_PERMANENT |
| SocialAccount | PENDING_AUTH | REVOKED (recoverable via reconnect) |
| SkillExecution | INITIATED | SUCCEEDED, FAILED, ABORTED |

---

# PART II — UNIFIED ERROR MODEL

---

# 16. Error Model Philosophy

> **Every error is a first-class domain event, not an exception to be swallowed.**

Scriora maintains a canonical, hierarchical error taxonomy that flows consistently from database layer through domain logic through API boundary to client presentation.

### Core Error Principles
1. All errors have a **canonical error code** (namespaced string).
2. All errors are classified as **Retryable**, **Terminal**, or **Reconciliation-required**.
3. No error is swallowed silently — every error produces a log entry.
4. External errors (platform API failures) are mapped to internal canonical errors before propagation.
5. No internal stack traces or database error messages are returned to API clients.

---

# 17. The Canonical Error Code Taxonomy

```text
ERR_AUTH_*          Authentication failures
ERR_FORBIDDEN_*     Authorization / permission failures
ERR_VALIDATION_*    Input schema and business rule violations
ERR_NOT_FOUND_*     Resource does not exist or is inaccessible
ERR_CONFLICT_*      State conflict or concurrent modification
ERR_RATE_LIMIT_*    Quota or rate limit exceeded
ERR_PLATFORM_*      External social platform API errors
ERR_PROVIDER_*      AI model provider errors
ERR_MEDIA_*         Media processing errors
ERR_STORAGE_*       Object storage errors
ERR_WORKER_*        Background job execution errors
ERR_AGENT_*         Agent cognitive execution errors
ERR_APPROVAL_*      Approval workflow errors
ERR_TIMEOUT_*       Operation timeout errors
ERR_INTERNAL_*      Unexpected internal system errors
ERR_EXTERNAL_UNKNOWN_* Ambiguous external system state
```

---

# 18. HTTP API Error Response Format

Every API error returns a consistent JSON body:

```json
{
  "error": {
    "code": "ERR_VALIDATION_CONTENT_TOO_LONG",
    "message": "Content text exceeds the maximum allowed length for LinkedIn.",
    "details": {
      "field": "body",
      "limit": 3000,
      "actual": 3521
    },
    "request_id": "req_01jxyz123456"
  }
}
```

- `code`: Machine-readable canonical error code.
- `message`: Human-readable explanation (safe to display to users).
- `details`: Optional structured context (field-level validation errors).
- `request_id`: Correlation ID for log tracing.

**Never included:** stack traces, SQL errors, internal IDs, secrets.

---

# 19. Error Severity Classification

| Severity | Description | User Visible? | Alert? |
| :--- | :--- | :---: | :---: |
| INFO | Expected business outcome (e.g., validation failure) | Yes | No |
| WARN | Recoverable issue requiring attention (e.g., retry) | Partial | No |
| ERROR | Unexpected failure requiring investigation | No (sanitized) | Yes |
| CRITICAL | System integrity at risk (e.g., RLS bypass attempt) | No | Immediate |

---

# 20. Retryable vs Terminal vs Reconciliation

Every error handler must classify the failure before deciding on action:

| Classification | Meaning | Action |
| :--- | :--- | :--- |
| **RETRYABLE** | Transient failure — same operation may succeed if retried | Exponential backoff retry |
| **TERMINAL** | Permanent failure — retrying will never succeed | Mark failed, alert user |
| **RECONCILIATION** | External state is unknown — must query before deciding | Query external API for status |

---

# 21. Retryable Errors

```text
ERR_RATE_LIMIT_PLATFORM      ← Retry after Retry-After header
ERR_RATE_LIMIT_PROVIDER      ← Retry after backoff
ERR_TIMEOUT_PLATFORM         ← Retry with shorter timeout
ERR_TIMEOUT_PROVIDER         ← Retry with fresh model call
ERR_STORAGE_UNAVAILABLE      ← Retry storage operation
ERR_WORKER_TRANSIENT         ← Retry job execution
ERR_PROVIDER_TRANSIENT       ← Retry with same or alternate provider
ERR_PLATFORM_MAINTENANCE     ← Retry after maintenance window
```

---

# 22. Terminal Errors

```text
ERR_VALIDATION_*             ← Fix input; retrying is futile
ERR_FORBIDDEN_*              ← Permission not granted; retrying is futile
ERR_NOT_FOUND_*              ← Resource does not exist; retrying is futile
ERR_AUTH_TOKEN_REVOKED       ← Token revoked; reconnect account
ERR_PLATFORM_CONTENT_POLICY  ← Content rejected by platform policy
ERR_MEDIA_CORRUPTED          ← File is irrecoverably corrupted
ERR_PROVIDER_CONTENT_FILTER  ← AI output blocked by safety filter (don't retry same prompt)
ERR_CONFLICT_VERSION         ← Optimistic lock conflict (user action required)
```

---

# 23. Reconciliation-Required Errors

These errors indicate that the external system's state is unknown after an attempted operation. Blind retry would risk duplicate actions:

```text
ERR_EXTERNAL_UNKNOWN_PUBLISH   ← Did the post publish or not?
ERR_EXTERNAL_UNKNOWN_PAYMENT   ← Was the payment captured or not?
ERR_TIMEOUT_PUBLISH            ← Request sent, no response received
```

**Reconciliation Protocol:**
1. Wait a minimum reconciliation delay (e.g., 60 seconds).
2. Query the external API to determine the actual current state.
3. If found → mark `SUCCEEDED` or `FAILED_PERMANENT` based on result.
4. If not found after max wait → mark `FAILED_PERMANENT`.

---

# 24. Retry Strategy — Exponential Backoff with Jitter

```text
Attempt 1: wait 2s  ± random(0, 1s)
Attempt 2: wait 4s  ± random(0, 2s)
Attempt 3: wait 8s  ± random(0, 4s)
Attempt 4: wait 16s ± random(0, 8s)
Attempt 5: wait 32s ± random(0, 16s)
→ Terminal failure after max attempts
```

- **Max attempts:** Configurable per job type (default: 5).
- **Max delay cap:** 5 minutes.
- **Jitter:** Prevents thundering herd on mass retry events.

---

# 25. The Outbox Pattern & Exactly-Once Delivery

Scriora uses the Transactional Outbox pattern to guarantee reliable event delivery:

```text
Database Transaction
    ├── INSERT into business_table (e.g., publications)
    └── INSERT into outbox_commands (pending command)

Background Worker (Polling outbox_commands)
    └── Execute command (e.g., call social API)
         ├── SUCCESS → mark outbox_command as COMPLETED
         └── FAILURE → mark as FAILED_RETRYABLE or FAILED_PERMANENT
```

**Idempotency:** Every outbox command carries an `idempotency_key`. External APIs are called with this key so that duplicate deliveries are detected and rejected safely.

---

# 26. Dead Letter Queue (DLQ) Protocol

Jobs that exhaust all retries are moved to the Dead Letter Queue:

1. Job moved to DLQ with full execution history and final error.
2. Workspace owner notified via in-app alert and email.
3. DLQ jobs visible in admin dashboard with human-readable failure summary.
4. Admin can manually retry, permanently close, or escalate.
5. DLQ entries older than 30 days are auto-archived.

---

# 27. Circuit Breaker Pattern

When an external dependency fails repeatedly, the circuit breaker prevents cascading failures:

```text
CLOSED (normal operation)
    │ Failure threshold exceeded
    ▼
OPEN (requests rejected immediately)
    │ After cool-down period (e.g., 30 seconds)
    ▼
HALF-OPEN (probe request allowed)
    ├── Success → CLOSED
    └── Failure → OPEN (reset timer)
```

Circuit breakers are implemented per social platform and per AI provider.

---

# 28. Platform Error Normalization — Social Networks

Every platform-specific error is mapped to a canonical internal error code:

| Platform HTTP Status | Platform Error | Canonical Code | Classification |
| :--- | :--- | :--- | :--- |
| 429 | Rate limit exceeded | `ERR_RATE_LIMIT_PLATFORM` | RETRYABLE |
| 401 | Token expired | `ERR_AUTH_TOKEN_EXPIRED` | TERMINAL (reconnect) |
| 403 | Permission denied | `ERR_FORBIDDEN_PLATFORM` | TERMINAL |
| 422 | Content policy violation | `ERR_PLATFORM_CONTENT_POLICY` | TERMINAL |
| 503 | Platform maintenance | `ERR_PLATFORM_MAINTENANCE` | RETRYABLE |
| Network timeout | — | `ERR_TIMEOUT_PLATFORM` | RECONCILIATION |
| 5xx (unknown) | — | `ERR_EXTERNAL_UNKNOWN_PUBLISH` | RECONCILIATION |

---

# 29. Provider Error Normalization — AI Models

| Provider Status | Canonical Code | Classification |
| :--- | :--- | :--- |
| 429 Rate limit | `ERR_RATE_LIMIT_PROVIDER` | RETRYABLE |
| 503 Overloaded | `ERR_PROVIDER_TRANSIENT` | RETRYABLE |
| Output rejected by content filter | `ERR_PROVIDER_CONTENT_FILTER` | TERMINAL |
| Invalid schema in response | `ERR_PROVIDER_SCHEMA_MISMATCH` | RETRYABLE (re-prompt) |
| Connection timeout | `ERR_TIMEOUT_PROVIDER` | RETRYABLE |
| Model not available | `ERR_PROVIDER_MODEL_UNAVAILABLE` | RETRYABLE (fallback) |

---

# 30. Media Processing Error Codes

```text
ERR_MEDIA_INVALID_MAGIC_BYTES        ← File type mismatch (TERMINAL)
ERR_MEDIA_DECOMPRESSION_BOMB         ← Pixel count exceeds limit (TERMINAL)
ERR_MEDIA_CORRUPTED_STREAM           ← Binary parse failure (TERMINAL)
ERR_MEDIA_UNSUPPORTED_FORMAT         ← Codec not supported (TERMINAL)
ERR_MEDIA_EXCEEDS_SIZE_LIMIT         ← File too large (TERMINAL)
ERR_MEDIA_EXCEEDS_DURATION_LIMIT     ← Video too long (TERMINAL)
ERR_MEDIA_PROCESSING_TIMEOUT         ← FFmpeg killed by timeout (RETRYABLE)
ERR_MEDIA_STORAGE_UNAVAILABLE        ← Object storage unreachable (RETRYABLE)
ERR_MEDIA_PROCESSING_OOM             ← Out of memory during transcode (RETRYABLE)
```

---

# 31. Agent Error Codes

```text
ERR_AGENT_INPUT_INVALID              ← Task input failed schema validation (TERMINAL)
ERR_AGENT_CONTEXT_UNAVAILABLE        ← Required business context missing (TERMINAL)
ERR_AGENT_POLICY_DENIED              ← Action blocked by workspace policy (TERMINAL)
ERR_AGENT_APPROVAL_REQUIRED          ← Action requires human approval (PAUSE — not error)
ERR_AGENT_MODEL_SCHEMA_MISMATCH      ← LLM output failed Zod validation (RETRYABLE)
ERR_AGENT_HALLUCINATION_DETECTED     ← Output contains fabricated metrics (TERMINAL)
ERR_AGENT_TOOL_NOT_FOUND             ← Requested tool does not exist (TERMINAL)
ERR_AGENT_TOOL_PERMISSION_DENIED     ← Tool requires unmet permissions (TERMINAL)
ERR_AGENT_BUDGET_EXCEEDED            ← Cost policy limit reached (TERMINAL)
ERR_AGENT_TIMEOUT                    ← Task exceeded max runtime (RETRYABLE)
ERR_AGENT_INTERNAL                   ← Uncaught runtime exception (TERMINAL)
```

---

# 32. Approval Error Codes

```text
ERR_APPROVAL_NOT_FOUND               ← Approval ID does not exist
ERR_APPROVAL_EXPIRED                 ← Signed link TTL elapsed
ERR_APPROVAL_ALREADY_DECIDED         ← Already approved or rejected
ERR_APPROVAL_INVALID_SIGNATURE       ← HMAC verification failed
ERR_APPROVAL_RESOURCE_VERSION_MISMATCH ← Approved resource has since been modified
ERR_APPROVAL_NONCE_REPLAYED          ← Signed link already used (replay attack)
```

---

# 33. Conflict & Concurrency Error Codes

```text
ERR_CONFLICT_VERSION                 ← Optimistic lock: record modified by another actor
ERR_CONFLICT_DUPLICATE_IDEMPOTENCY   ← Idempotency key already processed
ERR_CONFLICT_SCHEDULE_OVERLAP        ← Two publications scheduled for same account at same time
ERR_CONFLICT_APPROVAL_RACE           ← Approval submitted while resource was being modified
```

---

# 34. The Master Error Reference Table

| Code Pattern | HTTP Status | Retryable? | User Alert? |
| :--- | :---: | :---: | :---: |
| `ERR_AUTH_*` | 401 | No | Yes |
| `ERR_FORBIDDEN_*` | 403 | No | Yes |
| `ERR_VALIDATION_*` | 422 | No | Yes |
| `ERR_NOT_FOUND_*` | 404 | No | Yes |
| `ERR_CONFLICT_*` | 409 | No | Yes |
| `ERR_RATE_LIMIT_PLATFORM_*` | 429 (propagated) | Yes | Partial |
| `ERR_RATE_LIMIT_PROVIDER_*` | — (internal) | Yes | No |
| `ERR_PLATFORM_CONTENT_POLICY` | 422 | No | Yes |
| `ERR_TIMEOUT_*` | 504 / internal | Depends | Partial |
| `ERR_EXTERNAL_UNKNOWN_*` | — (internal) | Reconcile | Yes |
| `ERR_MEDIA_*` | 422 / 500 | Depends | Yes |
| `ERR_AGENT_*` | — (internal) | Depends | Partial |
| `ERR_PROVIDER_*` | — (internal) | Depends | No |
| `ERR_INTERNAL_*` | 500 | No | Yes (sanitized) |

---

# 35. Error Observability Requirements

Every error event must be logged with:
- `error_code`: Canonical code
- `severity`: INFO / WARN / ERROR / CRITICAL
- `workspace_id`: Tenant context (never nullable in production)
- `request_id` / `correlation_id`: Distributed tracing link
- `component`: Repository and function name
- `classification`: RETRYABLE / TERMINAL / RECONCILIATION
- `attempt_number`: Current retry count
- `sanitized_message`: Safe for logging (no secrets, no PII)

---

# 36. No Silent Failures

The following patterns are strictly prohibited:

```typescript
// FORBIDDEN — swallowed error
try {
  await publishToLinkedIn(post);
} catch {
  // nothing
}

// FORBIDDEN — generic catch without classification
catch (err) {
  logger.error("Something went wrong");
}

// REQUIRED — explicit classification and action
catch (err) {
  const canonical = normalizeError(err);
  logger.error({ code: canonical.code, attempt: task.attemptCount, ...canonical.context });
  if (canonical.classification === "RETRYABLE") scheduleRetry(task);
  else markTerminalFailure(task, canonical);
}
```

---

# 37. Status: 100% Complete

```text
State & Error Model
████████████████████████████████████ 100% COMPLETE
```

All state machines (12 entities), error taxonomy (11 namespaces), retry strategies, outbox patterns, circuit breakers, dead letter queues, and observability requirements are formally frozen and canonical.
