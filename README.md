# QUASTECH OS — COMPLETE PROJECT (Backend + Frontend, All Phases)

**One Next.js SSR application** = backend (58 API routes) + frontend (31 pages: Admin, Instructor, Student panels + public pages), per SRS v2.0.

## Frontend — 31 pages

| Area | Pages |
|---|---|
| Public | Landing + enquiry form (honeypot) · `/verify/:code` certificate check · `/login` (password + OTP) · forced `/change-password` |
| **Admin** (12) | Dashboard KPIs · **Enroll wizard** (search learner → course → batches auto-load → fee → receipt) · Learners (search/create/360° detail **with record-payment**) · Enquiries CRM · Courses + **full course builder** (module library reuse-by-link, sections, video/PDF **upload with progress**, quiz JSON, links, publish) · Batches (+detail: sessions, roster) · Fees pending report · Team · Branches · Campaigns ({{name}} personalization) · Banners (image upload) · Analytics (collections + CSV, trend, attendance w/ LOW flag) |
| **Instructor** (5) | Dashboard (KPIs, **one-click Start Session** → opens meet link) · My Batches · Batch detail (**checkbox attendance roster, bulk-present default**) · **Evaluation queue** (view file → marks → feedback → publish) · Recordings upload |
| **Student** (7, mobile-responsive) | Home (banners, **Continue Learning progress cards**, Today's Classes w/ Join) · My Courses · **Course Player** (tree sidebar, secure video via signed URL w/ download disabled, PDF viewer, **quiz attempt/submit**, assignment upload, auto/manual progress) · Calendar · Results · Certificates (PDF download) · Notifications |

Auth flow: httpOnly cookies · silent refresh on 401 · role-based redirect after login · middleware gates all three panels server-side (SRS Ch. 10).


Built per **SRS v2.0 Final**. One Next.js app (API Route Handlers) · TypeScript · MySQL 8 · Prisma · MySQL job queue · **zero third-party integrations** (console mailer + local storage adapters — SRS Ch. 9 policy).

## Coverage — 100% of the SRS backend

| Phase | Implemented |
|---|---|
| **1 Foundation** | Auth (login, OTP, refresh **rotation + theft detection**, logout, change-password, lockout) · RBAC 5 roles + automatic tenant/branch/instructor/student **scope injection** · Branches · Team (temp password + welcome email; only SUPER_ADMIN creates admins) · Learners CRM (search, 360° profile) · Enquiries (public form w/ honeypot) · **Manual enrollment — one transaction**: enrollment + fee account + first payment + receipt no. + audit · Fee payments (transactional, overpayment guard) · Pending-fee report |
| **2 Content & Video** | Courses (CRUD + publish) · **Module Library with reuse-by-link** · Sections · Materials (VIDEO/PDF/QUIZ/ASSIGNMENT/LINK/LIVE) · **Presigned uploads (browser → storage directly)** · Range-capable streaming · **`/materials/:id/stream-url` — 4h signed URL after enrollment check** |
| **3 Delivery** | Batches (instructor-scoped) · Sessions + auto **T-24h/T-1h reminders** · One-click Start Session · **Attendance: roster, bulk upsert, 48h instructor lock** · Recordings (+org approval toggle) · Student: My Courses, **player tree + progress**, dashboard (Continue Learning, Today's Classes, banners), calendar · `POST /progress` (idempotent, recomputes %, flips COMPLETED) |
| **4 Assessment** | **Quiz: attempt (answers stripped, seeded shuffle) → submit (server-side grading, negative marking, server-enforced timer +30s grace, attempt limits)** · Assignment submit (late flag, resubmit-until-evaluated) · Evaluation queue (oldest first, instructor-scoped) · Evaluate → Publish (notification + email) · Feedback forms + responses (anonymous option, trainer rating aggregates) · **Certificates: auto-issue at 100%, PDF render job, public `/api/verify/:code`** · Student results/gradebook |
| **5 Comms & Reports** | **Campaigns: audience filter → per-recipient queued sends → auto-SENT** · Banners (scheduled windows, signed image URLs) · Notifications (list, mark-read) · Admin dashboard (5 KPIs) · Instructor dashboard (batches, today, queue, avg rating) · **Collections report (+CSV export)** · Enrollment trend by branch/month · **Attendance report with <75% flag** · Receipt PDFs |
| **Jobs** | MySQL `job_queue`: atomic claim, 1m/10m/1h backoff, FAILED state · PM2 `worker.ts` (VPS) · `/api/cron/process` + `x-cron-key` (cPanel) · 7 job types implemented |

## Setup

Requirements: **Node 20+**, **MySQL 8**.

> **v3.5:** see `CHANGES-v3.5.md` for everything that changed (video streaming, uploads,
> security, lifecycle, new course builder) and a click-by-click test checklist.

**Fresh database (new laptop / new server):**

```bash
npm install
cp .env.example .env        # set DATABASE_URL, JWT_SECRET (32+ chars), CRON_KEY, APP_URL
npx prisma migrate deploy   # ONE clean baseline migration creates every table
npm run db:seed             # superadmin@quastech.local / ChangeMe@123
```

**Database you already had (built with the old migrations / `db push`) — run once:**

```bash
npm run db:baseline-existing   # syncs tables, then marks the new baseline as applied (no data is deleted)
```

Old migrations were moved to `prisma/_old_migrations_do_not_use/` (they cannot run on an empty database).

**Demo data and running:**

```bash
npm run db:demo             # FULL DEMO DATA: all role logins, 2 courses w/ PDFs+quizzes,
                            # fees+receipts, attendance, results, certificate.
                            # Optional: drop any .mp4 at demo-assets/sample.mp4 first
                            # to make video lessons playable. All demo logins are
                            # printed at the end (Admin@123 / Teach@123 / Learn@123).
npm run dev                 # http://localhost:3000
npm run worker              # jobs (separate terminal) — or use /api/cron/process
```

All "sent" emails appear in the console **and** the `Outbox` table (`npx prisma studio`).

## End-to-end smoke test (happy path)

```bash
B=http://localhost:3000
# login
curl -c jar -X POST $B/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@quastech.local","password":"ChangeMe@123"}'
# branch → course → module → link → section → material
curl -b jar -X POST $B/api/branches -H 'Content-Type: application/json' -d '{"name":"BLR","city":"Bangalore","state":"Karnataka"}'
curl -b jar -X POST $B/api/courses  -H 'Content-Type: application/json' -d '{"title":"Full Stack Web Dev"}'
curl -b jar -X POST $B/api/modules  -H 'Content-Type: application/json' -d '{"title":"React Basics"}'
curl -b jar -X POST $B/api/courses/<courseId>/modules -H 'Content-Type: application/json' -d '{"moduleId":"<moduleId>","position":0}'
curl -b jar -X POST $B/api/modules/<moduleId>/sections -H 'Content-Type: application/json' -d '{"title":"Intro","position":0}'
# upload a video: presign → PUT file to returned url → attach
curl -b jar -X POST $B/api/uploads/presign -H 'Content-Type: application/json' \
  -d '{"fileName":"lec1.mp4","contentType":"video/mp4","sizeBytes":1048576,"purpose":"material"}'
curl -X PUT --data-binary @lec1.mp4 "<upload.url>"
curl -b jar -X POST $B/api/sections/<sectionId>/materials -H 'Content-Type: application/json' \
  -d '{"type":"VIDEO","title":"Lecture 1","position":0,"fileKey":"<upload.key>","sizeBytes":1048576}'
# batch → learner → ENROLL (the core transaction)
curl -b jar -X POST $B/api/batches -H 'Content-Type: application/json' \
  -d '{"courseId":"<courseId>","branchId":"<branchId>","name":"Batch A","startDate":"2026-08-01T04:30:00Z"}'
curl -b jar -X POST $B/api/learners -H 'Content-Type: application/json' \
  -d '{"name":"Student One","email":"s1@test.local","phone":"9999999999"}'
curl -b jar -X POST $B/api/enrollments/manual -H 'Content-Type: application/json' \
  -d '{"learnerId":"<learnerId>","batchId":"<batchId>","fee":{"totalFee":25000,"discount":2000,"firstPayment":{"amount":10000,"mode":"UPI","referenceNo":"UPI123"}}}'
# → returns receiptNo; welcome email lands in Outbox; student can now login,
#   GET /api/me/courses, GET /api/materials/<id>/stream-url, POST /api/progress …
```

## Deployment (no Docker — SRS Ch. 7)

**cPanel:** MySQL DB in cPanel → Git clone → *Setup Node.js App* (Node 20) → `npm install && npx prisma migrate deploy && npm run build` → cron each minute: `curl -s -H "x-cron-key: <CRON_KEY>" https://domain.com/api/cron/process` → restart.

**VPS:** Node 20 + MySQL + Nginx → same build → `pm2 start "npm start" --name quastech && pm2 start "npm run worker" --name quastech-worker && pm2 save`.

**Large video uploads behind Nginx:** uploads arrive in 5 MB pieces, so allow a little more than that and
don't buffer them:

```nginx
client_max_body_size 20m;
proxy_request_buffering off;
proxy_read_timeout 300s;
```

Set `APP_URL` to the real domain (used in emails + certificates) and `APP_TIMEZONE=Asia/Kolkata`.
Run `npm run check` (type-check + build) before every deploy — type errors now stop the build.

## Post-completion integrations (SRS Ch. 9 — adapters ready)

| Adapter | Activate |
|---|---|
| SMTP (SendGrid/SES) | add `src/lib/adapters/mail/smtp.ts`, set `MAIL_DRIVER=smtp` |
| Cloudflare R2 | add `src/lib/adapters/storage/s3.ts` (same interface incl. presign/signedGetUrl), set `STORAGE_DRIVER=s3` |
| Razorpay | webhook route → verify signature → insert `FeePayment(mode: ONLINE)` via the same transactional path |
| Zoom | `MeetingProvider` fills `ClassSession.meetLink` instead of manual paste |

Business logic never changes — adapters only. Development runs with **zero external secrets**.

## Structure

```
app/api/…                    # 58 route handlers across all modules
middleware.ts                # Layer-1 panel gate (/admin /instructor /app)
prisma/schema.prisma         # 30 models, MySQL 8
prisma/seed.ts               # org + branch + SUPER_ADMIN
src/lib/auth/                # jose JWT, cookies, refresh rotation, RBAC + scope
src/lib/adapters/            # mail (console→Outbox) + storage (local w/ HMAC presign/stream)
src/lib/jobs/                # queue (atomic claim/backoff) + 7 processors (incl. PDFs)
src/lib/certificates.ts      # auto-issue rule + issue()
worker.ts                    # PM2 polling worker
```


## Integrations (Super Admin → Settings → Integrations)
Credentials for email/WhatsApp/Razorpay/Zoom/storage/Firebase/SMS can be managed from the
panel instead of the .env file. They are AES-256-GCM encrypted at rest (key derived from
JWT_SECRET, or set ENCRYPTION_KEY for a dedicated key), never shown again in full, and every
change is snapshotted so an older configuration can be restored with one click.
Resolution order at runtime: **active panel configuration → .env fallback**.

## Instructor permissions (Admin → Team → 🔑 Manage)
Instructors get their own batches, attendance, evaluations, Q&A and recordings by default.
Admins can additionally grant: manage course content · schedule own classes · post announcements ·
see learner contact details · edit attendance after 48h · publish recordings without approval.
