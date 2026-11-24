# Tashkent Tech — Academic Records & Grade Management Portal

Central, database-driven system for student records, grades, approvals and a complete audit trail.

**Stack:** Next.js 15 (App Router, React 19, TypeScript) · REST route handlers · PostgreSQL 16 · Tailwind CSS v4 · Recharts · ExcelJS · PDFKit · Bun runtime.

## Quick start

Requirements: [Bun](https://bun.sh) ≥ 1.2 and Docker.

```bash
bun install
docker compose up -d          # PostgreSQL 16 on localhost:5434
cp .env.example .env          # then generate ENCRYPTION_KEY and HASH_KEY (64 hex chars each)
bun run demo:reset            # EMPTY database only: create schema + load demo data
bun run dev                   # http://localhost:3000
```

### Demo accounts (defined in `scripts/seed.ts`; change before any real use)

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@2026!` | Administrator — full access |
| `operator` | `Operator@2026!` | Data Entry Officer — Faculty of Computer Engineering, assigned current-semester courses |
| `operator2` | `Operator@2026!` | Data Entry Officer — Faculty of Information Technologies |
| `viewer` | `Viewer@2026!` | Viewer / Academic Staff — read-only |

Demo data: 3 faculties, 5 departments, 6 programs (Bachelor/Master/PhD), 14 groups, 4 academic years (8 semesters; past ones locked), 66 subjects, ~250 students, ~200 courses, ~3,800 enrollments and ~17,700 marks with full history, attendance, pending/approved/rejected change requests.

## Loading real students

```bash
bun run import:first-year "C:/path/Database TT 2026.xlsx"                 # add to existing data
bun run import:first-year "C:/path/Database TT 2026.xlsx" --replace-demo  # remove demo data first
```

The spreadsheet needs columns *Full Name, ID Matricula, Passport Details, Faculty, Group* (header row anywhere near the top). Everything is validated first; on any problem nothing is imported. **Never commit student spreadsheets or `backups/` — this repository is public.**

## Tests

> The API tests and `demo:reset` are for a **demo database only**. `demo:reset` refuses to run while real student records (IDs starting with TTB) exist.


```bash
bun run dev &                 # API tests need the running server
bun test tests                # 8 grading-engine unit tests + 29 end-to-end API tests (all roles)
bun scripts/smoke.ts          # renders every page as admin / operator / viewer
bun run demo:reset            # tests modify demo data — reset afterwards
```

## The three critical mechanisms

1. **Grade locking** — Admin → Academic Structure → Semesters → *Locked*. In a locked semester, users without `grades.override_lock` cannot change marks; their edits become change requests for an administrator (configurable).
2. **Grade change approval** — modifying or deleting an existing mark requires a reason; users without `grades.edit_direct` submit a request that an approver must accept (Grade Approvals). The approved change is recorded with requester, approver and request id.
3. **Complete audit trail** — a PostgreSQL trigger on `grades` writes every insert/update/delete to `grade_history` (old/new value, user, time, reason, IP, approval). `grade_history` and `audit_logs` are append-only: the database rejects UPDATE/DELETE, and marks can't be physically deleted (a deleted mark is `NULL` with a *Deleted* history row). This holds even for direct SQL, imports and future code.

## Features

- **Students:** full profile (identity, passport, JSHSHIR, program, group, year/semester, study mode, status, contacts, notes, custom fields), complete academic history, GPA, soft delete with typed confirmation and restore.
- **Grades:** configurable grading schemes (weights, max/min scores, pass mark, attendance minimum, retake cap, letter scale); P1, P2, coursework, midterm, final and retake (replaces the final); automatic totals, letters, grade points and pass/fail; instructor comments; attendance.
- **RBAC:** 25 permissions; Administrator / Data Entry Officer / Viewer presets; unlimited custom roles; per-user faculty data scope and course assignments.
- **Excel:** student and grade import with preview, validation, duplicate detection (Student ID, passport, JSHSHIR), confirmation, summary and error report; templates; exports with filters and column selection.
- **PDF:** transcripts, subject grade lists, semester and academic-year reports, individual performance reports.
- **Dashboard:** KPIs, students by faculty/program/year, grade distribution, pass-rate trend, subject performance, missing grades, retakes; filters, table view per chart, configurable widgets.
- **Search:** combinable filters by ID, name, passport/JSHSHIR (exact match through blind index, sensitive-data permission only), faculty, program, group, subject, academic year, semester, grade, result, status.
- **Administration without code changes:** faculties, departments, programs, groups, years, semesters, subjects, assessment types, custom student fields, custom modules (Markdown pages or links in the menu), built-in module switches, dashboard widgets, branding (name, logo, colours), approval workflow, security policy.
- **Notifications:** grade submissions, modifications, missing grades, pending approvals, import errors, retake results, semester locks (bell polls every 30 s).

## Security

- bcrypt (cost 12) password hashing; password policy; account lockout after failed logins.
- Sessions: random 256-bit token in an HttpOnly, SameSite=Lax cookie (Secure in production); only its SHA-256 is stored; sliding expiry; all sessions revoked on password reset or deactivation.
- Passport and JSHSHIR are encrypted with AES-256-GCM; HMAC blind indexes allow exact search and duplicate detection without decryption. Values are masked in the UI and only revealed on request to users with `students.view_sensitive`; every reveal and sensitive export is logged.
- CSRF protection (same-origin check on every state-changing API call); security headers; parameterised SQL throughout.
- Encrypted (AES-256-GCM, gzip) backups: automatic on a schedule plus manual; download and restore (restore takes a safety backup first).

## Production notes

- Run behind HTTPS (reverse proxy) with `NODE_ENV=production`; build with `bun run build`, start with `bun run start`.
- **Back up `ENCRYPTION_KEY` and `HASH_KEY` separately.** Without them, encrypted fields and backups can't be recovered. Never change them once data exists.
- Backups are written to `BACKUP_DIR` (default `./backups`) — copy them off the server, or mount it on separate storage. `pg_dump` of the database volume is also recommended.
- PDFs use a system Unicode font if one is found (Arial on Windows, DejaVu on Linux); set `PDF_FONT` / `PDF_FONT_BOLD` to TTF paths for full Cyrillic/Uzbek support on other systems.

## Project layout

```
db/schema.sql                  tables, indexes, views, integrity triggers
scripts/                       migrate, seed, smoke test
src/lib/                       db, auth, RBAC, crypto, grading engine, grade workflow, import, PDF, backup
src/app/api/                   REST endpoints
src/app/(app)/                 UI pages
tests/                         unit + end-to-end tests
```
