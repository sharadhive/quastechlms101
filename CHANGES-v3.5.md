# QUASTECH OS v3.5 — what changed and how to test it

## First, after pulling these changes

1. `npm install` (no new packages were added)
2. Existing local database → `npm run db:baseline-existing` (once). New database → `npx prisma migrate deploy`.
3. Add `APP_TIMEZONE=Asia/Kolkata` to `.env` (already added to yours).
4. `npm run typecheck` → must show 0 errors, then `npm run dev`.

---

## 1. Big videos — streaming and uploads

| Before | Now |
|---|---|
| Every "play" loaded the **whole video file into server memory** (a 1 GB lecture = 1 GB RAM per student) | Video is streamed from disk in 2 MB pieces. Tested: 20 students starting a 100 MB video at once → server memory stayed ~140 MB |
| Uploads held the whole file in memory; one PUT; a dropped connection restarted from 0 | Uploads go in **5 MB resumable chunks**, written straight to disk. A network drop retries and **continues from the last byte** |
| Any file type could be uploaded (e.g. `.html` → could run scripts on your site) | Whitelist per upload type (video / PDF / office / images / zip) + size limits; files that aren't media/PDF are always served as downloads with `nosniff` |
| Video/PDF links used `APP_URL` (`localhost`) → broken on phones and on the live server | Links are relative → work on any domain / phone |

Files: `app/api/stream/[token]`, `app/api/uploads/*`, `src/lib/client/api.ts` (`uploadFile`), `src/lib/utils/files.ts`, `src/lib/adapters/storage/local.ts`.

## 2. Security & passwords

- Temporary passwords are **never stored** any more (they were saved in plain text in `profile` and visible to every admin). They are shown **once** after create/reset (copy / WhatsApp buttons) and emailed. Old stored ones are stripped when read.
- "Must change password" is now enforced on the **server** (middleware + every API), not only on the login page.
- An Admin can no longer reset another Admin's password (only the Super Admin can manage admin accounts).
- New **Forgot password** page (`/forgot-password`): email code → new password → signed in. Also linked from the login and change-password pages (fixes learners who only had OTP and got stuck).
- Minimum password length is 8 everywhere.
- Enrolment emails no longer say "(use your existing password…)"; account emails contain the login link + temp password.

## 3. Bugs fixed

- **Students lost access to videos after finishing a course** (COMPLETED) → COMPLETED learners keep access, stay on rosters, attendance, notes, leaderboard and calendars.
- Two crashes hidden by `ignoreBuildErrors` (missing `forbidden` / `can` imports) fixed; all 19 TypeScript errors fixed; **`ignoreBuildErrors` is now off**.
- Instructor permissions now actually work: *Schedule classes*, *Post announcements*, *See contact details*, *Edit attendance after 48h* (lock added to the attendance screen), *Publish recordings directly*.
- Quiz timer can't be reset by restarting; an expired attempt counts. Quizzes/assignments only count as "complete" after they're really submitted.
- Progress % only counts lessons that exist now (deleted/hidden lessons no longer distort it).
- Deleting a lesson/topic with student submissions gave a 500 → now a clear message + a **Hide** option. Deleted lessons also delete their files from disk.
- Learner profile crashed for self-paced (online) students → fixed.
- "Result published" notification pointed to a missing page → `/app/results`.
- Receipt PDFs can now be downloaded (learner profile → 🧾). ₹ is printed as "Rs." (the PDF font has no ₹ symbol).
- Reminder emails use Indian time; rescheduled/cancelled classes don't send stale reminders.
- Stuck background jobs are picked up again after 15 min; job table no longer stores passwords in plain text.
- `/api/health` and `/api/lookups` could be frozen at build time → now always live.
- Payment callback can't be processed twice.

## 4. Things you can now manage (lifecycle)

| Who | Can now… | Where |
|---|---|---|
| Super Admin | edit / change role / move branch / deactivate / reset any team member | Admin → Team & Instructors |
| Admin | same for instructors | Admin → Team & Instructors |
| Admin | edit learner details, deactivate / reactivate, reset password | Learner profile |
| Admin | **drop / reactivate** an enrolment, **move to another batch**, set **access end date** | Learner profile → each course |
| Admin | issue / **revoke** / restore certificates, open the PDF | Learner profile |
| Admin | **edit a batch** (instructor, dates, seats, timing), delete an empty batch; seats are enforced | Batches → open batch |
| Admin / permitted instructor | **reschedule / cancel** a class (reminders follow) | Batch page |
| Admin | **approve / hide / delete** class recordings | Admin → Class Recordings |
| Admin | archive, unpublish, delete (if unused) a course | Course → ③ Publish & settings |

## 5. Easier course building (all panels)

- **Admin / Super Admin → Courses:** "＋ New course" → name + price → opens the builder straight away.
- **Course builder** (shared by Admin and Instructor), 3 tabs:
  1. *Course details* — title, description, category, thumbnail, price.
  2. *Curriculum & lessons* — Module → Topic → Lessons. One **"+ Add lesson"** form with type buttons: 🎬 Video, 📄 PDF, ❓ Quiz, 📝 Assignment (instructions, due date, marks), 🔗 Link, 📡 Live class link. Progress bar while uploading, title auto-filled from the file name, video length detected automatically. Preview 👁, move ↑↓, rename, **hide/show**, delete, extra video qualities.
  3. *Publish & settings* — ready-to-publish checklist, publish/unpublish/archive, public/private, batches of the course, delete.
- **Instructor → My Courses:** instructors open the courses they teach. With the *Manage course content* permission they get the same builder (curriculum only); without it they see it read-only with a note on how to get access.
- **Student course player:** topics shown in the lesson list, opens the first unfinished lesson automatically, **Next / Previous lesson** buttons, quiz countdown timer + resume + score + answers, assignment instructions / due date / status / marks / feedback, PDF download when allowed, live-class links.
- **Student → Class Recordings** page (new) and **Admin → Class Recordings** page (new).
- Admin dashboard has **quick-action tiles** (new course, new batch, enrol, add instructor, recordings).
- Admin sidebar reorganised: Learning · People · Finance · Marketing · Organisation · Super Admin.

## 5b. Instructor → My Batches → open a batch (simplified)

The old page mixed a tick-box (topic done) and a hidden row-click (attendance) on the same line.
It now has 4 clear tabs:

| Tab | What it's for |
|---|---|
| ✅ **Take a class** (opens first) | 3 steps: ① tick the topic(s) you taught (next syllabus topics are suggested) ② everyone starts *Present* — tap absentees ③ pick the date / today's scheduled class → **Save class**. One save marks the topics as taught **and** stores attendance. |
| 📚 **Syllabus** | Every topic shows its status in words: *Not taught yet* / *Taught on 27 Aug · 4 of 5 present* / *attendance not taken*. Buttons: **Mark as taught**, **Take / Edit attendance**, **Undo**. Filters: Not taught · Taught · Attendance missing. |
| 📅 **Classes** | Schedule a class (with permission), **Start & join**, reschedule, cancel; past classes with **Take / Edit attendance**. |
| 👥 **Students** | Attendance % per student (below 75% in red) + course progress. |

New API: `POST /api/batches/:id/class-log` (topics + attendance in one transaction, 48 h lock for instructors).
Attendance % now counts only classes where attendance was actually taken.

## 5c. Fixes from the full end-to-end check

- **Background jobs now run inside the app.** Emails, class reminders, receipt PDFs and certificates used to wait for a separate worker that was never started. `instrumentation.ts` now starts a small job loop (every 15 s) when the Node server starts. Restart `npm run dev` / `npm start` once to activate it. If you run the PM2 worker or cron instead, set `JOBS_IN_APP=false`.
- **Email failures are clear, not a crash.** When Gmail rejects the login (error 535), Forgot password / OTP now shows "We could not send the email right now…" instead of a 500, and the attempt is saved in the Outbox with the error. Fix: Super Admin → Integrations → Email → use a 16-character Gmail **App Password** (not your normal Gmail password).
- **Counselling request (Explore → course → Request counselling)** no longer fails silently: blank email/phone are ignored, the signed-in student's details are used, and the page shows an error if it cannot save.
- **Certificates are issued once** even if the job is retried; the email step can't make it issue twice.
- **Header name/role** now comes from the server, so it shows the right person (not "User") after a new tab, cleared storage or switching accounts.

## 6. Behaviour changes to know about

- Instructor recording uploads now **wait for admin approval** unless the instructor has *Publish recordings directly*.
- Instructors can only schedule/reschedule classes with *Schedule their own classes* (marking topics + attendance still works without it).
- Instructors only see courses/lessons of batches they teach.
- A course can't be published with zero visible lessons.

---

## Test checklist (15 minutes)

**Super Admin** (`superadmin@quastech.local`)
- [ ] Team → create an Admin → credentials card appears (copy / WhatsApp) → the Team list does **not** show any password.
- [ ] Log in as that Admin in another browser → forced to set a password → then lands on the dashboard.
- [ ] As Admin, try to reset the Super Admin/other Admin → not offered / refused.

**Admin**
- [ ] Courses → ＋ New course → builder opens → add Module → Topic → Video (upload a 500 MB+ file; turn Wi-Fi off/on halfway — it should resume) → PDF → Quiz → Assignment.
- [ ] ③ Publish → checklist → Publish.
- [ ] Batches → create batch with 2 seats → Enrol 3 learners → 3rd is refused "batch is full".
- [ ] Batch page → schedule class → reschedule → cancel.
- [ ] Team → instructor → 🔑 Permissions → tick *Manage course content*.
- [ ] Learner profile → record payment → open 🧾 receipt → move batch → drop → reactivate → set access date.

**Instructor**
- [ ] My Courses → open course → add a lesson (with permission) / read-only (without).
- [ ] Upload a recording → shows "Waiting for admin approval" → Admin approves in Class Recordings.

**Student**
- [ ] My Courses → course opens at the first unfinished lesson → watch video to the end (auto-complete) → Next lesson.
- [ ] Quiz: start, refresh page, "Resume quiz" keeps the same timer.
- [ ] Assignment: try uploading an `.html` file → refused; upload a PDF → "Submitted".
- [ ] Finish every lesson → course COMPLETED → videos still open → certificate appears.
- [ ] Class Recordings shows the approved recording.
- [ ] Log out → Forgot password → code from email/Outbox → new password works.

## Verified during this update
- `tsc --noEmit`: 0 errors · `next build`: success with type checking on.
- Streaming: 206 with 2 MB pieces, exact byte ranges, suffix ranges, 416 for bad ranges, HTML served as download + `nosniff`, forged links 403, full downloads byte-identical; memory flat under 20 parallel viewers.
- Uploads: 23 MB file in 5 MB chunks byte-identical, resume offset reported, out-of-order chunk → 409, oversize → 413, forged link → 401.
- Middleware: not logged in → /login?next=…, wrong panel → own panel, temp password → /change-password; APIs return `MUST_CHANGE_PASSWORD`.
- Baseline migration applied cleanly to an empty MySQL-compatible database; every model, column, nullability, index and foreign key matches `schema.prisma`.
- Full lifecycle run on the live dev app (Super Admin → Admin → Instructor → Student → certificate → public verify), every admin/instructor/student page opened as its role, wrong-panel URLs redirect to the user's own panel.

## Still recommended later (not done here)
- Move videos to Cloudflare R2 / S3 + CDN (the storage adapter is ready; `STORAGE_DRIVER=s3` still needs its driver) and add HLS transcoding for adaptive quality.
- Easebuzz server-to-server webhook so a payment is confirmed even if the student closes the tab.
- WhatsApp / Razorpay / Zoom / SMS / Firebase integration forms are saved but not yet used by the app.
- Automated tests (at least for enrolment, fees, progress and permissions).
