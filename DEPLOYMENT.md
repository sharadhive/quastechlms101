# QUASTECH OS — Deployment Guide

Step-by-step setup on **Render, Railway, cPanel and Vercel** — each **with Git** (auto-deploy from GitHub)
and **without Git** (upload from your computer).

**Contents**

1. [Which platform should I use?](#1-which-platform-should-i-use)
2. [What the app needs (read first)](#2-what-the-app-needs-read-first)
3. [Prepare once: database, environment variables, secrets](#3-prepare-once)
4. [Render](#4-render)
5. [Railway](#5-railway)
6. [cPanel](#6-cpanel-shared-hosting-with-setup-nodejs-app)
7. [Vercel](#7-vercel-read-the-warning-first)
8. [After the first deploy — checklist](#8-after-the-first-deploy--checklist)
9. [Updating the live site](#9-updating-the-live-site)
10. [Moving to another host / backups](#10-moving-to-another-host--backups)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Which platform should I use?

| | **Render** | **Railway** | **cPanel** | **Vercel** |
|---|---|---|---|---|
| Works with this app as it is today | ✅ on a **paid** instance + disk | ✅ with a volume | ✅ if your host has *Setup Node.js App* | ❌ not until files move to cloud storage |
| Uploaded videos / PDFs / certificates are kept | Only with a **Persistent Disk** (paid plans) | With a **Volume** | ✅ (your home folder) | ❌ |
| Background jobs (emails, class reminders, PDFs) | ✅ built in | ✅ built in | Add a cron (1 line) | Vercel Cron (every minute needs **Pro**) |
| Deploy **without Git** | ❌ needs GitHub/GitLab/Bitbucket (or a Docker image) | ✅ `railway up` | ✅ upload a zip | ✅ `vercel` command |
| Free plan usable for real students | ❌ sleeps after 15 min, files are deleted | ❌ 0.5 GB volume | depends on host | ❌ |

**Recommendation:** **Railway** (easiest, works with or without Git) or **Render** on a paid instance with a disk.
Use **cPanel** if you already pay for hosting that offers *Setup Node.js App* + Terminal/SSH.
Use **Vercel** only after videos/files are moved to Cloudflare R2 / S3 (see [section 7](#7-vercel-read-the-warning-first)).

> Video traffic costs money on most hosts. 50 students watching a 1-hour 720p lecture ≈ **56 GB** of download.
> Check your plan's included bandwidth. Moving videos to Cloudflare R2 (no download fees) is the long-term fix.

---

## 2. What the app needs (read first)

| Need | Why | Where it's set |
|---|---|---|
| **Node.js 20 or newer** | Next.js 14 | Platform setting (`NODE_VERSION=20` on Render, version picker on cPanel) |
| **MySQL 8** | All data (Prisma, `provider = "mysql"`) | `DATABASE_URL` |
| **A folder that survives restarts** | Videos, PDFs, assignment files, receipts, certificates are saved on the server's disk (`STORAGE_DRIVER=local`) | `LOCAL_STORAGE_PATH` → disk / volume / home folder |
| **HTTPS** | Login cookies are `Secure` in production — on plain `http://` users cannot stay logged in | Automatic on Render/Railway/Vercel; AutoSSL on cPanel |
| **An always-on process or a 1-minute cron** | Emails, reminders, campaigns and PDFs are sent by background jobs | Built in on Render/Railway; cron on cPanel/Vercel |
| **Database reachable while building** | `npm run build` = `prisma generate` + `prisma migrate deploy` (creates/updates tables) + `next build` | `DATABASE_URL` must work during the build |

The three commands every platform runs:

```bash
npm ci            # install (or: npm install)
npm run build     # generate Prisma client + apply new DB migrations + build Next.js
npm start         # next start -H 0.0.0.0 -p $PORT   (cPanel uses: node server.js)
```

Health check URL (all platforms): **`/api/health`** → `{"ok":true,"db":"up"}` when the app and database are fine.

> **Do not set `NODE_ENV` yourself** (except where this guide says so for cPanel). If `NODE_ENV=production`
> is set during install, npm skips the build tools (Prisma CLI, TypeScript) and the build fails.
> `npm start` sets production mode automatically.

---

## 3. Prepare once

### 3.1 Database

Pick one:

| Option | When | `DATABASE_URL` looks like |
|---|---|---|
| **Aiven MySQL** (what the project uses now) | Any platform — the same database can be used from Render, Railway, Vercel or your PC | `mysql://USER:PASSWORD@HOST.aivencloud.com:PORT/defaultdb?sslaccept=accept_invalid_certificates` |
| **Railway MySQL** | Hosting on Railway | `${{MySQL.MYSQL_PUBLIC_URL}}` (see [5.1](#51-railway-with-git-github)) |
| **cPanel MySQL** | Hosting on cPanel | `mysql://cpuser_dbuser:PASSWORD@localhost:3306/cpuser_dbname` |

- If the password contains `@ : / ? # & %`, write it URL-encoded (`@` → `%40`, `#` → `%23`, `%` → `%25`).
- **Aiven:** in the Aiven console → your service → *Allowed IP addresses*, allow the host's IPs, or `0.0.0.0/0` for
  Render/Railway/Vercel (their IPs change). Optional stricter SSL: `?sslcert=../ca.pem&sslaccept=strict`
  (uses the `ca.pem` in the project root; Prisma resolves the path from the `prisma/` folder). The current
  `sslaccept=accept_invalid_certificates` setting also works.
- **Already have data?** Nothing special: each build runs `prisma migrate deploy`, which only adds what is new.
  A database that was created long ago with `db push` / old migrations needs **one** run of
  `npm run db:baseline-existing` (see [Troubleshooting](#11-troubleshooting), error *P3005*).

### 3.2 Environment variables

Set these in the platform's **Environment / Variables** screen (cPanel: in a `.env` file — see section 6).

| Variable | Required | Example / value | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | see 3.1 | |
| `JWT_SECRET` | ✅ | 64 random characters | Signs logins. **Never change it after go-live** (everyone gets logged out and saved integration passwords can't be read — see `ENCRYPTION_KEY`) |
| `ENCRYPTION_KEY` | recommended | 64 random characters | Encrypts passwords saved in *Admin → Integrations*. If empty, `JWT_SECRET` is used. Keep it the same on every server |
| `APP_URL` | ✅ | `https://lms.yourdomain.com` | Your real public address, **https**, no trailing slash. Used in emails, certificates and login renewal |
| `APP_TIMEZONE` | ✅ | `Asia/Kolkata` | Dates in emails and PDFs |
| `MAIL_DRIVER` | ✅ | `smtp` | `console` = emails are only saved in the Outbox table and **never sent** |
| `STORAGE_DRIVER` | ✅ | `local` | `s3` is not built yet |
| `LOCAL_STORAGE_PATH` | ✅ | `/var/data/storage` (Render) · `/data/storage` (Railway) · `/home/USER/quastech-storage` (cPanel) | Must be on the persistent disk / volume |
| `CRON_KEY` | ✅ | 32 random characters | Protects `/api/cron/process` |
| `CRON_SECRET` | Vercel only | same value as `CRON_KEY` | Vercel Cron sends it as `Authorization: Bearer …` |
| `REFRESH_TOKEN_TTL_DAYS` | optional | `30` (default) | Users stay logged in as long as they open the app at least once in this many days |
| `ACCESS_TOKEN_TTL_MIN` | optional | `15` (default) | Renewed automatically; no need to change |
| `JOBS_IN_APP` | optional | `false` only on Vercel | `true` (default) = the app sends emails/reminders itself every 15 s |
| `SMARTACCESS_API_URL` | optional | `https://smartaccess.in/api/lms` | Registration dropdowns |
| `NEXT_PUBLIC_ORG_ID` | optional | `seed-org` (default) | Only if your organisation id is different. Set **before** building |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | optional | | Fallback only — the email settings in *Super Admin → Integrations → Email* win |
| `NODE_VERSION` | Render | `20` | Node version on Render |

Create random secrets on your computer:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Your GitHub repository is public.** `.env` is not in it (good), but anyone can read the code.
> Consider *GitHub → repository → Settings → Danger Zone → Change visibility → Private*.
> Render, Railway and Vercel can all deploy private repositories.

---

## 4. Render

Render runs `npm start` on a Linux server. Its disk is **wiped on every deploy/restart** unless you attach a
**Persistent Disk** — and disks are **not available on the free instance** (free also sleeps after 15 minutes
without visitors). For real students use a paid instance (Starter or higher) with a disk.

### 4.1 Render with Git (GitHub)

1. Push the project to GitHub (already done: `sharadhive/quastechlms101`, branch `main`).
2. Render Dashboard → **New → Web Service** → connect GitHub → choose the repository.
3. Fill in:
   | Field | Value |
   |---|---|
   | Branch | `main` |
   | Runtime / Language | Node |
   | Build Command | `npm ci && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | Starter or higher (needed for a disk) |
4. **Environment** → add every variable from [3.2](#32-environment-variables), plus `NODE_VERSION=20` and
   `LOCAL_STORAGE_PATH=/var/data/storage`.
5. **Advanced → Add Disk**: Name `storage`, Mount Path **`/var/data`**, size for your videos (start with 20 GB; it can grow later).
6. **Advanced → Health Check Path**: `/api/health`.
7. **Create Web Service** and watch the logs. Success = `✓ Compiled successfully` then `Ready`.
8. Open the `https://….onrender.com` address → `/api/health` must show `"db":"up"`.
9. Custom domain: **Settings → Custom Domains → Add**, create the DNS record Render shows, then set
   `APP_URL=https://your-domain` and redeploy.

Every `git push` to `main` now deploys automatically (Settings → *Auto-Deploy*).

> With a disk attached, a deploy has a few seconds of downtime and the service can't be scaled to 2+ instances.
> That's fine for one institute.

### 4.2 Render without Git

Render cannot take a zip or a folder from your computer — it deploys only from a Git repository
(GitHub, GitLab, Bitbucket, or a public Git URL) or from a Docker image.
If you don't want to use Git commands:

- Use **GitHub Desktop** (free app, no commands): *File → Add local repository* → choose the project folder →
  *Publish repository* (tick *Keep this code private*). Then follow [4.1](#41-render-with-git-github).
  To update later: open GitHub Desktop → *Commit to main* → *Push origin*.
- Or choose **Railway** ([5.2](#52-railway-without-git-cli-upload)) or **cPanel** ([6.2](#62-cpanel-without-git-zip-upload)),
  which accept uploads directly.

---

## 5. Railway

Railway builds the app from `package.json` (`npm run build`, `npm start`) and gives it a `PORT` automatically.
Files are kept on a **Volume** (Free/Trial 0.5 GB, Hobby 5 GB, Pro 50 GB — videos need Hobby or Pro).

### 5.1 Railway with Git (GitHub)

1. [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** → choose the repository.
   The first build may fail because variables are missing — that's expected.
2. **Database** — choose one:
   - **Keep Aiven:** set `DATABASE_URL` to the Aiven URL.
   - **Railway MySQL:** **+ New → Database → MySQL**. Open the MySQL service → **Settings → Networking →
     enable Public Networking** (this creates `MYSQL_PUBLIC_URL`). In the **app** service variables set
     ```
     DATABASE_URL=${{MySQL.MYSQL_PUBLIC_URL}}
     ```
     Use the **public** URL: the build runs database migrations, and Railway's private network
     (`mysql.railway.internal`) is not reachable during the build.
3. **Volume:** **+ New → Volume** (or right-click the app service → *Attach Volume*) → attach to the **app**
   service → Mount path **`/data`**. Set `LOCAL_STORAGE_PATH=/data/storage`.
4. **Variables** (app service → *Variables* → *Raw Editor*): paste every variable from [3.2](#32-environment-variables).
5. **Settings → Deploy → Healthcheck Path:** `/api/health`.
6. **Settings → Networking → Generate Domain** (or *Custom Domain*). Put that address in `APP_URL`.
7. **Deploy** (or push to GitHub). Open `/api/health`.

If the build log says Prisma can't find **OpenSSL / libssl**: *Settings → Build → Builder* → choose **Nixpacks**
(the project's `nixpacks.toml` adds OpenSSL).

### 5.2 Railway without Git (CLI upload)

Uploads the folder from your computer — no GitHub needed.

```bash
npm i -g @railway/cli        # once (Node.js 16+)
railway login                # opens the browser
cd path/to/quastech-os-v34   # your project folder
railway init                 # first time: create a new project   (or: railway link  → existing project)
railway up                   # build + deploy this folder
```

Then do steps **2–6** of [5.1](#51-railway-with-git-github) in the dashboard (database, volume, variables,
healthcheck, domain) and run `railway up` again. Files listed in `.gitignore` (`node_modules`, `.next`,
`.env`, `storage/`) are not uploaded. To update the site later: `railway up`.

---

## 6. cPanel (shared hosting with *Setup Node.js App*)

**You need:** *Setup Node.js App* in cPanel (CloudLinux Node.js Selector) with Node 20+, *MySQL Databases*,
*Terminal* or SSH access, and SSL (AutoSSL). Builds use 1–2 GB of memory — cheap plans may stop the build
(`Killed`); then build on your computer ([6.3](#63-low-memory-hosting-build-on-your-computer)).

The project includes **`server.js`**, the startup file cPanel needs.

### 6.0 Database + SSL (both ways)

1. **MySQL® Databases** → create database `quastech` → create user → **Add User To Database** → *ALL PRIVILEGES*.
   cPanel adds your username as a prefix: `cpuser_quastech`, `cpuser_dbuser`.
   ```
   DATABASE_URL="mysql://cpuser_dbuser:PASSWORD@localhost:3306/cpuser_quastech"
   ```
2. **SSL/TLS Status** → run **AutoSSL** for the domain/subdomain (login needs https).

### 6.1 cPanel with Git

1. **Git™ Version Control → Create**
   - Clone URL: `https://github.com/sharadhive/quastechlms101.git`
     (a private repo needs an SSH key: *SSH Access → Manage SSH Keys*, add the public key to GitHub *Deploy keys*,
     and use the `git@github.com:…` URL)
   - Repository Path: `/home/USER/quastech` → **Create**.
2. **Create the settings file** — *File Manager* → `/home/USER/quastech` → **+ File** → `.env`
   (enable *Settings → Show Hidden Files*). Paste every variable from [3.2](#32-environment-variables), e.g.:
   ```
   DATABASE_URL="mysql://cpuser_dbuser:PASSWORD@localhost:3306/cpuser_quastech"
   JWT_SECRET="…"
   ENCRYPTION_KEY="…"
   APP_URL=https://lms.yourdomain.com
   APP_TIMEZONE=Asia/Kolkata
   MAIL_DRIVER=smtp
   STORAGE_DRIVER=local
   LOCAL_STORAGE_PATH=/home/USER/quastech-storage
   CRON_KEY="…"
   ```
   Keep `LOCAL_STORAGE_PATH` **outside** the app folder so updates never touch uploaded files.
   The app folder is outside `public_html`, so `.env` is not visible on the web.
3. **Setup Node.js App → Create Application**
   | Field | Value |
   |---|---|
   | Node.js version | 20 (or newer) |
   | Application mode | Production |
   | Application root | `quastech` |
   | Application URL | your domain / subdomain |
   | Application startup file | `server.js` |

   **Create**, then **Stop** the app for now. At the top of the page, copy the command
   *"Enter to the virtual environment"* (looks like `source /home/USER/nodevenv/quastech/20/bin/activate && cd /home/USER/quastech`).
4. **Terminal** (cPanel → *Terminal*, or SSH) — paste the copied command, then:
   ```bash
   npm install --include=dev     # build tools are dev packages; production mode would skip them
   npm run build                 # creates tables / applies migrations + builds the site
   ```
   Don't upload or create `node_modules` yourself — cPanel manages it (it is a link to the virtual environment).
5. **Setup Node.js App → Start** (or **Restart**). Open `https://your-domain/api/health`.
6. **Cron Jobs** → *Once Per Minute* (`* * * * *`) → command:
   ```bash
   curl -s -H "x-cron-key: YOUR_CRON_KEY" https://your-domain/api/cron/process > /dev/null 2>&1
   ```
   This sends queued emails/reminders and keeps the app awake (cPanel puts idle apps to sleep).

### 6.2 cPanel without Git (zip upload)

1. On your computer, make a zip of the project **without** these folders/files:
   `node_modules`, `.next`, `storage`, `.git`, `.env`, `Claude outputs`.
   (Windows: select the remaining files and folders → right-click → *Send to → Compressed (zipped) folder*.)
2. **File Manager** → home folder → **+ Folder** `quastech` → open it → **Upload** the zip → right-click → **Extract**.
   Make sure `package.json` and `server.js` are directly inside `/home/USER/quastech` (not in a sub-folder).
3. Continue with steps **2–6** of [6.1](#61-cpanel-with-git) (`.env`, Node.js app, Terminal build, Start, cron).

### 6.3 Low-memory hosting: build on your computer

If `npm run build` on the server ends with `Killed` or *out of memory*:

1. On your computer, set `.env` → `DATABASE_URL` to the **live** database (the build applies migrations to it).
   For cPanel MySQL use the server's hostname instead of `localhost`, and allow your IP in cPanel → *Remote MySQL®*.
2. Run `npm run build` on your computer.
3. Upload the project as in [6.2](#62-cpanel-without-git-zip-upload) **including the `.next` folder**.
4. In the cPanel Terminal (inside the virtual environment):
   ```bash
   npm install --include=dev
   npx prisma generate           # creates the database client for the server's Linux system
   ```
5. **Restart** the app.

---

## 7. Vercel (read the warning first)

> ⚠️ **Not ready for Vercel yet.** Vercel runs the app as short-lived functions without a permanent disk:
> - video / PDF uploads fail: they are sent in 5 MB pieces and Vercel accepts at most **4.5 MB** per request (error 413);
> - uploaded files, receipts and certificates are not kept, and videos can't be streamed from disk;
> - background jobs need Vercel Cron — **once per day** on Hobby, **every minute** only on **Pro**.
>
> Vercel becomes a good option after files move to Cloudflare R2 / S3 (`STORAGE_DRIVER=s3`, not built yet).
> The steps below are for that future setup, or for a demo without uploads.

### 7.1 Vercel with Git (GitHub)

1. [vercel.com](https://vercel.com) → **Add New → Project → Import** the GitHub repository. Framework: **Next.js** (detected).
2. **Environment Variables**: everything from [3.2](#32-environment-variables), plus
   `CRON_SECRET` (same value as `CRON_KEY`) and `JOBS_IN_APP=false`.
   Add `&connection_limit=5` to the end of `DATABASE_URL` (many functions run at once).
   Aiven must allow `0.0.0.0/0`.
3. **Deploy.** Then *Settings → Domains* for your domain → set `APP_URL` → redeploy.
4. **Background jobs** — add a file `vercel.json` in the project root and push:
   ```json
   { "crons": [ { "path": "/api/cron/process", "schedule": "* * * * *" } ] }
   ```
   `* * * * *` (every minute) needs **Pro**. On Hobby use `"0 6 * * *"` (daily), or call the URL every minute
   from any external cron service that can send the header `x-cron-key: YOUR_CRON_KEY`.

### 7.2 Vercel without Git (CLI)

```bash
npm i -g vercel
vercel login
cd path/to/quastech-os-v34
vercel            # first time: answers a few questions, makes a preview deployment
vercel --prod     # deploy to the live address
```

Add the environment variables in the Vercel dashboard (*Project → Settings → Environment Variables*)
before `vercel --prod`.

---

## 8. After the first deploy — checklist

1. **`https://your-domain/api/health`** → `{"ok":true,"db":"up"}`.
2. **First Super Admin — only for a NEW, empty database.** On your computer, with `.env` → `DATABASE_URL` pointing
   to the live database:
   ```bash
   npm run db:seed        # creates superadmin@quastech.local / ChangeMe@123
   ```
   Log in and **change this password immediately**. (Railway: `railway run npm run db:seed` does the same
   with Railway's variables.) Skip this if your live database already has users.
3. **Email:** *Super Admin → Integrations → Email (SMTP)* → fill in → **Test connection** → **Activate**.
   `MAIL_DRIVER` must be `smtp`.
4. **Payments:** *Integrations → Easebuzz* → test mode first, then live.
5. Log in from a phone and a laptop; upload a short video; **redeploy/restart once** and check the video still
   plays (proves the disk/volume is working).
6. cPanel / Vercel: confirm the cron runs (*Admin → Campaigns* → send a test to yourself; it should arrive within a minute or two).

---

## 9. Updating the live site

The build applies new database migrations automatically — never delete the `prisma/migrations` folder.
Before pushing, run `npx prisma generate` and then `npm run check` on your computer (type check + build).
`prisma generate` is needed whenever `prisma/schema.prisma` changed — without it the type check reports
errors like *Property 'videoWatch' does not exist*.

| Platform | With Git | Without Git |
|---|---|---|
| Render | `git push` → deploys automatically | GitHub Desktop → *Commit* → *Push origin* |
| Railway | `git push` → deploys automatically | `railway up` |
| cPanel | *Git Version Control → Manage → Pull or Deploy → Update from Remote* → Terminal: `npm install --include=dev && npm run build` → *Setup Node.js App → Restart* | Upload the changed files (or a new zip) → same Terminal commands → Restart |
| Vercel | `git push` | `vercel --prod` |

---

## 10. Moving to another host / backups

Everything lives in two places — copy both:

1. **Database** — keep using the same Aiven database (just reuse `DATABASE_URL`), or export/import:
   ```bash
   mysqldump --single-transaction -h HOST -P PORT -u USER -p DBNAME > backup.sql
   mysql -h NEWHOST -P PORT -u USER -p NEWDB < backup.sql
   ```
2. **Uploaded files** — the whole `LOCAL_STORAGE_PATH` folder (videos, PDFs, receipts, certificates).
   Download it (cPanel File Manager → *Compress* → download) and upload it to the new disk/volume.

Use the **same `JWT_SECRET` and `ENCRYPTION_KEY`** on the new host, otherwise everyone is logged out and the
passwords saved in *Integrations* must be entered again.

Back up the database daily (Aiven: check the backup settings of your plan; cPanel: *Backup* / *JetBackup*).

---

## 11. Troubleshooting

| Problem | Cause → fix |
|---|---|
| Login succeeds, then you're back on the login page | Site opened over `http://`. Enable SSL and use the `https://` address; `APP_URL` must be `https://…` |
| Uploaded videos/PDFs disappear after a deploy or restart | No persistent disk/volume, or `LOCAL_STORAGE_PATH` is not inside it (Render: `/var/data/…`, Railway: `/data/…`) |
| Upload fails with **413** / *Request Entity Too Large* | A proxy limits request size. Nginx: `client_max_body_size 20m; proxy_request_buffering off;`. On Vercel it can't work (4.5 MB limit) |
| Build: *Can't reach database server* (during `prisma migrate deploy`) | Database not reachable from the build. Railway: use `MYSQL_PUBLIC_URL`. Aiven: allow the IPs / `0.0.0.0/0`. cPanel: `localhost` |
| Build: `prisma: not found` / `tsc` / `typescript` missing | Dev packages were skipped because `NODE_ENV=production` during install. Remove that variable, or on cPanel run `npm install --include=dev` |
| Build ends with `Killed` / out of memory | Not enough RAM (cPanel). Build on your computer — [6.3](#63-low-memory-hosting-build-on-your-computer) |
| Error **P3005** *The database schema is not empty* | Old database created without these migrations → once: `npm run db:baseline-existing` (with `.env` pointing to that database) |
| *Prisma Client could not locate the Query Engine* | The client was made on another computer (e.g. Windows). On the server run `npx prisma generate`; never upload `node_modules` |
| Emails never arrive | `MAIL_DRIVER` must be `smtp`; *Integrations → Email → Test connection*; failed emails are listed in the `Outbox` table with the reason. Gmail allows ~500 emails/day — use Brevo/SES for big campaigns |
| Emails/reminders arrive late or only when someone opens the site | No always-on process → add the 1-minute cron (cPanel/Vercel), or use a paid instance that doesn't sleep |
| Saved integration passwords stopped working | `JWT_SECRET` / `ENCRYPTION_KEY` changed → set the old value back, or re-enter the passwords in *Integrations* |
| Site is slow on the first visit after a while | Free plans and cPanel put idle apps to sleep. Paid instance, or the 1-minute cron keeps it awake |
| cPanel shows *Application error* / 503 | *Setup Node.js App* → check the log file shown there; usually `.env` missing, build not run, or wrong startup file (`server.js`) |
| Render/Railway build used a different Node version | Render: `NODE_VERSION=20`. Railway: add `"engines": { "node": ">=20" }` to `package.json` |
