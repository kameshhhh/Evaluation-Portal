# PEMM Module — Operations Runbook

> **P**roduction-Grade **E**ntity **M**odeling **M**odule for the Bitsathy College Evaluation System.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Setup](#database-setup)
3. [Running Migrations](#running-migrations)
4. [Running Tests](#running-tests)
5. [CLI Scripts](#cli-scripts)
6. [Entity State Machines](#entity-state-machines)
7. [Freeze & Audit Workflow](#freeze--audit-workflow)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
server/src/
├── entities/                 # Immutable domain entities + errors
│   ├── EntityErrors.js       # 15 error classes (extends AppError)
│   ├── Person.js             # Object.freeze'd person entity
│   ├── Project.js            # Object.freeze'd project entity
│   ├── ProjectMember.js      # Object.freeze'd member entity
│   ├── ProjectStateMachine.js # DRAFT→ACTIVE→UNDER_REVIEW→LOCKED→ARCHIVED
│   └── SessionStateMachine.js # DRAFT→SCHEDULED→OPEN→IN_PROGRESS→CLOSED→LOCKED
│
├── lib/
│   ├── temporal/
│   │   ├── AcademicCalendar.js     # Academic year/semester resolution
│   │   └── TimePeriodCalculator.js # DB-backed period resolution
│   └── immutable/
│       └── HashChainService.js     # SHA-256 hash chains
│
├── events/
│   └── EntityEvents.js       # 26 domain event types (frozen)
│
├── validators/
│   ├── PersonValidator.js        # Zod-based person validation
│   ├── TeamSizeValidator.js      # 2 ≤ team_size ≤ 4
│   ├── TemporalValidator.js      # Academic year/semester/freeze checks
│   └── MembershipValidator.js    # Member eligibility + duplicates
│
├── repositories/
│   ├── PersonRepository.js       # Person CRUD → PostgreSQL
│   └── ProjectRepository.js      # Project CRUD → PostgreSQL
│
├── services/
│   ├── PersonService.js             # Person lifecycle
│   ├── ProjectEntityService.js      # Project lifecycle + state machine
│   ├── RealityFreezeService.js      # Freeze snapshots + hash chains
│   ├── ChangeAuditService.js        # Append-only change audit
│   ├── EntityIntegrityService.js    # Hash chain verification
│   ├── FreezeViolationDetector.js   # Post-freeze modification detection
│   ├── TemporalConsistencyService.js # Cross-period validation
│   └── EntityAuditLogger.js         # Structured audit logging
│
├── controllers/
│   ├── personController.js       # /api/persons endpoints
│   ├── projectController.js      # /api/projects endpoints
│   └── evaluationController.js   # /api/evaluations endpoints
│
├── middleware/
│   ├── freezeGuard.js            # HTTP-level freeze enforcement
│   └── entityErrorHandler.js     # PEMM-specific error responses
│
├── routes/
│   └── pemmRoutes.js             # Central route registration
│
├── migrations/
│   ├── 001_create_person_tables.sql
│   ├── 002_create_project_tables.sql
│   ├── 003_create_evaluation_tables.sql
│   ├── 004_create_freeze_tables.sql
│   └── 005_create_audit_tables.sql
│
└── scripts/
    ├── runMigrations.js          # Execute SQL migrations
    ├── data-integrity-check.js   # CLI: hash chain verification
    └── audit-verification.js     # CLI: audit trail verification
```

### Core Design Patterns

| Pattern                | Implementation                                          |
| ---------------------- | ------------------------------------------------------- |
| **Immutability**       | All entities use `Object.freeze(this)` in constructors  |
| **Event Sourcing**     | 26 frozen domain event types via `EntityEvents.js`      |
| **State Machine**      | Project + Session state machines with guard conditions  |
| **Hash Chains**        | SHA-256 linked hashes for tamper detection              |
| **Temporal DB**        | Academic year/semester partitioning with freeze support |
| **CQRS**               | Read-only paths bypass freeze guards                    |
| **Optimistic Locking** | Version column on all mutable tables                    |

---

## Database Setup

### Prerequisites

- PostgreSQL 14+ running on `localhost:5432`
- Database: `bitsathy_auth`
- User: `postgres` (or your configured user)

### Connection

The PEMM module uses the **same database pool** as the auth system:

```
DATABASE_URL=postgresql://postgres:kamesh123@localhost:5432/bitsathy_auth
```

---

## Running Migrations

```bash
# From the server/ directory
cd server

# Run all PEMM migrations (001–005)
npm run db:migrate

# Or directly:
node src/scripts/runMigrations.js
```

Migration files are located in `src/migrations/` and execute in order.

### Migration Order

1. `001_create_person_tables.sql` — persons, person_history
2. `002_create_project_tables.sql` — projects, project_members, state transitions
3. `003_create_evaluation_tables.sql` — sessions, scores, rubrics
4. `004_create_freeze_tables.sql` — freeze snapshots, freeze logs
5. `005_create_audit_tables.sql` — entity_change_audit, integrity_verifications

---

## Running Tests

```bash
# From the server/ directory
cd server

# Run ALL tests (auth + identity + PEMM)
npx jest --verbose

# Run only PEMM tests
npm run test:pemm

# Run a specific test file
npx jest src/entities/__tests__/Project.test.js --verbose

# Run tests with coverage
npx jest --coverage
```

### Test Suite Summary

| Suite               | Tests | Covers                                     |
| ------------------- | ----- | ------------------------------------------ |
| EntityErrors        | 18    | Error hierarchy, status codes, inheritance |
| Person              | 20    | Construction, immutability, serialization  |
| Project             | 25    | States, transitions, freeze, snapshots     |
| ProjectMember       | 16    | Roles, active/inactive, serialization      |
| ProjectStateMachine | 23    | Guards, transitions, available states      |
| SessionStateMachine | 20    | Full session lifecycle                     |
| PersonValidator     | 10    | Create/update validation, Zod schemas      |
| TeamSizeValidator   | 20    | Team size bounds 2–4                       |
| TemporalValidator   | 19    | Academic year, semester, freeze checks     |
| MembershipValidator | 12    | Eligibility, duplicates, project state     |
| AcademicCalendar    | 21    | Year mapping, period boundaries            |
| HashChainService    | 14    | Hashing, chains, tamper detection          |
| EntityEvents        | 20    | Event creation, factories, immutability    |
| freezeGuard         | 10    | HTTP passthrough, blocking, errors         |

---

## CLI Scripts

### Data Integrity Check

Verifies all cryptographic hash chains in the database.

```bash
# Full check — all persons and projects
node src/scripts/data-integrity-check.js

# Check a specific person
node src/scripts/data-integrity-check.js --person <uuid>

# Check a specific project's freeze snapshots
node src/scripts/data-integrity-check.js --project <uuid>

# Machine-readable JSON output (for CI/CD)
node src/scripts/data-integrity-check.js --json

# Verbose mode — show individual chain entries
node src/scripts/data-integrity-check.js --verbose
```

**Exit codes:**

- `0` — All integrity checks passed
- `1` — Integrity violation(s) detected (**TAMPERING**)
- `2` — Script error (connection failure, etc.)

### Audit Verification

Verifies completeness and consistency of the change audit trail.

```bash
# Full audit verification report
node src/scripts/audit-verification.js

# Filter by entity type
node src/scripts/audit-verification.js --entity project

# Filter by actor
node src/scripts/audit-verification.js --actor <uuid>

# Filter by date
node src/scripts/audit-verification.js --since 2025-01-01

# Verbose mode — show recent entries
node src/scripts/audit-verification.js --verbose

# JSON output
node src/scripts/audit-verification.js --json
```

**What it checks:**

1. Orphaned audit entries (entities deleted but audit remains)
2. Missing audit trails (entities without CREATE entries)
3. Actor validity (changed_by references valid users)
4. Summary statistics by type, action, actor

---

## Entity State Machines

### Project Lifecycle

```
  DRAFT ──────→ ACTIVE ──────→ UNDER_REVIEW ──→ LOCKED ──→ ARCHIVED
                  ↑                  │
                  └──────────────────┘ (returned with reason)
```

**Guard Conditions:**

- `draft → active`: Requires `activeMembers >= 2`
- `under_review → locked`: Requires `sessionId`
- `under_review → active`: Requires `reason` (return reason)
- `locked → archived`: Requires `scoringComplete === true`

### Evaluation Session Lifecycle

```
  DRAFT → SCHEDULED → OPEN → IN_PROGRESS → CLOSED → LOCKED
```

- Scoring is only allowed during `IN_PROGRESS`
- `LOCKED` is terminal — no further transitions

---

## Freeze & Audit Workflow

### Reality Freeze

When an evaluation session starts, the system "freezes" all relevant entities:

1. **Snapshot Creation** — Current entity state is captured as JSON
2. **Hash Calculation** — SHA-256 hash of the snapshot is computed
3. **Chain Linking** — Hash is linked to the previous snapshot's hash
4. **Freeze Flag** — Entity's `frozen_at` timestamp is set

### Freeze Guard (HTTP Layer)

The `freezeGuard` middleware blocks PUT/PATCH/DELETE requests on frozen entities:

- GET/HEAD requests always pass through
- Modification requests trigger a DB check for `frozen_at`
- If frozen, a `FreezeViolationError` (423 Locked) is thrown
- The error handler middleware formats the response

### Integrity Verification

Run periodically (or before evaluation sessions) to detect tampering:

```bash
# Nightly cron job
0 2 * * * cd /path/to/server && node src/scripts/data-integrity-check.js --json >> /var/log/pemm-integrity.log
```

---

## Troubleshooting

### Common Issues

**1. Migration fails with "relation already exists"**

- Migrations are idempotent (`IF NOT EXISTS`). Safe to re-run.
- If using manual SQL, check for partial runs.

**2. Tests fail with "Cannot find module '../middleware/errorHandler'"**

- Ensure `EntityErrors.js` uses the correct relative path: `../middleware/errorHandler`
- From `src/entities/`, the path goes up one level to `src/middleware/`

**3. "Object.freeze doesn't throw" in tests**

- Strict mode is required. Add `'use strict';` at the top of test files.
- Node.js CommonJS modules run in sloppy mode by default.

**4. Hash chain verification fails after manual DB edits**

- **This is by design.** The hash chain detects tampering.
- If you need to fix data, use the application layer (which updates hashes).
- Direct SQL updates bypass hash chain updates and will be detected.

**5. Academic year calculation seems off**

- Academic year is the year when the odd semester starts.
- January–May 2025 → Academic year 2024 (even semester of 2024-25)
- June–November 2025 → Academic year 2025 (odd semester of 2025-26)

### Emergency Procedures

**Force unfreeze an entity (admin only):**

```sql
-- CAUTION: This will break the hash chain!
-- Only use in genuine emergencies.
UPDATE projects SET frozen_at = NULL WHERE project_id = '<uuid>';
-- You MUST run a new freeze cycle afterward to repair the chain.
```

**Rebuild hash chain after emergency fix:**

- Currently requires manual intervention via the application layer.
- Run `data-integrity-check.js` afterward to confirm chain state.

---

## npm Scripts Reference

```json
{
  "test:pemm": "jest --verbose src/entities/__tests__/ src/validators/__tests__/ src/lib/__tests__/ src/events/__tests__/ src/middleware/__tests__/",
  "db:migrate": "node src/scripts/runMigrations.js"
}
```

---

_Last updated: auto-generated during PEMM module build._
