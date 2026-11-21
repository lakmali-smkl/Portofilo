# Kasunika - Personal Portfolio Website

A modern, responsive, and performance-optimized personal portfolio website built with pure **HTML5**, **CSS3**, and **Vanilla JavaScript** on the frontend, backed by a small **Node.js/Express** API that stores everything in **MongoDB Atlas** (a free cloud database) — including uploaded photos.

---

## 📁 Project Structure

```text
portfolio/
│
├── index.html            # Main HTML5 structure & content
├── style.css             # Modern dark-themed design system & animations
├── script.js              # Interactive features, admin panel, research workspace
│
├── images/
│   └── profile.jpg       # First-paint fallback photo (used before the backend responds)
│
├── assets/
│   └── Kasunika_CV.pdf   # Your Curriculum Vitae PDF (drop your PDF here)
│
└── backend/               # Express API for the in-browser Portfolio Manager
    ├── server.js          # REST API (owner login + CRUD for every section, image upload)
    ├── db.js              # MongoDB Atlas connection
    ├── models.js          # Mongoose models (flexible, schema-less collections)
    ├── migrate-to-mongo.js  # One-time import of old local data into MongoDB
    ├── reset-password.js  # Forgot your password? Run this (see below)
    ├── package.json       # Backend dependencies
    ├── .env                # Your MongoDB connection string + optional email settings (not committed)
    └── .env.example       # Template showing what to put in .env
```

All content (profile, projects, skills, education, experience, events, certificates, messages, research projects) and every uploaded photo live in your MongoDB Atlas database — nothing is stored as local files anymore, so it survives restarts and works from any machine with the same `.env`.

---

## 🚀 How to Run Locally

The site itself is plain HTML/CSS/JS and can be opened directly in a browser. The **Manage Projects** panel — which edits every section of the site — talks to the Node.js backend, so start that first if you want to use it.

### 1. Set up your database (one-time)

1. Create a free cluster at [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) (no credit card needed).
2. Get its connection string (**Database → Connect → Drivers → Node.js**).
3. Copy `backend/.env.example` to `backend/.env` and paste your connection string into `MONGODB_URI`:
   ```
   MONGODB_URI=mongodb+srv://<db_username>:<db_password>@cluster0.xxxxx.mongodb.net/portfolio?appName=Cluster0
   ```

### 2. Start the backend (required for editing anything)
Requires [Node.js](https://nodejs.org/) (v18+).
```bash
cd backend
npm install      # first time only
node server.js
```
You should see the `🚀 Kasunika Portfolio API is running!` banner, including `🗄️ Database: MongoDB Atlas`.

**First run only:** the console also prints a one-time, randomly generated **owner password**, e.g.:
```
🔐 OWNER LOGIN CREATED (first run only)
Password: aB3xY9kLm2Qz
```
Copy it now — it's never shown again. Use it to log in on the site (see **Owner Login**, below), then change it to something memorable from **Manage Projects → Profile & Links → Change Password**.

### 3. Open the website
**Simplest: let the backend serve it.** With `node server.js` running, just open **http://localhost:3001** — the site and the API come from the same server, exactly like when it's deployed.

Other ways still work while developing (they talk to the backend on port 3001):

**Direct Browser Open**
1. Double-click on `index.html` in your file explorer, **or**
2. Right-click `index.html` &rarr; **Open with** &rarr; Chrome / Edge / Firefox / Safari.

**Live Server (VS Code / Antigravity IDE)**
1. If using VS Code or IDE with Live Server, right-click `index.html` &rarr; **Open with Live Server**.

**Local Python HTTP Server**
Run this in PowerShell / Terminal inside the project folder:
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000` in your web browser.

> Note: without the backend running, the site still loads and shows built-in fallback projects (read-only), but nothing can be edited and the rest of the dynamic sections (Skills, Education, Experience, Events, Certificates) will appear empty until `node server.js` is started.

---

## 🔐 Owner Login

Only you (the owner) can add, edit, or delete content — visitors always see a read-only site.

1. Click **Manage Projects** near the hero section.
2. Since you're not logged in yet, a **Login** dialog appears instead. Enter the owner password (see above). Click the eye icon to show/hide what you're typing.
3. You're now logged in for 7 days (stored locally in your browser) and the full **Portfolio & Project Manager** opens, with a **Log Out** button in its header.
4. To change your password, go to the **Profile & Links** tab → **Change Password**.

**Forgot your password?** Run this from the `backend` folder:
```bash
node reset-password.js YourNewPassword123
```
This updates it directly in MongoDB Atlas — no need to touch any files. Restart the backend afterwards if it's currently running, then log in with the new password. This does **not** affect your projects or content, only the login credential.

---

## 🛠️ Managing Your Content

Nothing needs to be hand-edited in `index.html` anymore — once logged in, every section is managed from the **Manage Projects** panel:

| Tab | What it edits |
|---|---|
| **Projects** | Featured project cards — title, category, description, tech stack, links, photos |
| **Skills** | Skills & Expertise — name, category, badge, and an optional proficiency % (leave blank to show as a plain tag, like the Soft Skills group) |
| **Education** | The Education timeline — institution, period, degree, status, description, tags, photos |
| **Experience** | Experience & Activities cards — title, badge, description, tags, photos |
| **Events** | Coding competitions, conferences, tech talks — title, type, description, date, location, link, photos |
| **Certificates** | Certificates — name, issuing org, date, description, certificate photos |
| **Achievements** | Achievements & Awards — title, type (award, scholarship, competition…), awarded by, date, description, link, photos |
| **Publications** | Publications & Blog — title, type (article, blog post, paper…), where it was published, date, summary, link, tags, photos |
| **Gallery** | Photo Gallery albums — title, date, description, and as many photos as you like |
| **Testimonials** | Quotes from lecturers, mentors or teammates — name, role, quote, profile link, photo(s) |
| **Research (Private)** | Opens the full-screen **Research Workspace** — see below. Never shown to visitors, and the data can't be read even via a direct API call without logging in |
| **Messages** | Your Contact form inbox — every visitor message is saved here, with an optional email copy (see **Email notifications**, below) |
| **Profile & Links** | Your name, degree, photo, email, phone, LinkedIn, GitHub, location, hero bio, the full **About Me** text, and your password |
| **Backup & Export** | Download a full JSON snapshot of everything, or restore the original default template (deletes all custom content and photos) |

Every tab follows the same pattern: fill in the form and **Save**, or click **Edit** / **Delete** on an item in the list below it.

**Photos:** every section except Skills and your Profile photo (which stays a single photo) takes **any number of photos** per item. Pick several at once, or keep adding more batches before saving (max 5MB each, up to 30 new photos per save; save, then add more). The first photo is the cover: click ★ on a photo to make it the cover, or × to remove it. On the public site, items with more than one photo show a photo-count badge, and clicking any photo opens a full-screen slideshow (arrow keys or swipe to browse, Esc to close).

**Achievements, Publications, Gallery and Testimonials** stay hidden on the public site, and out of the menu, until you add something to them, so your portfolio never shows an empty section. Once they have content, they appear under **More** in the top menu.

Two things still live directly in `index.html`, since they're files rather than form fields:
- **Profile photo fallback**: if `images/profile.jpg` exists it's used as the very first paint before the backend responds; after that, whatever you upload via the Profile tab takes over.
- **CV / Resume**: drop your PDF in `assets/Kasunika_CV.pdf` (exact filename) to activate the Download/View CV buttons.

### 🔬 Research Workspace (private)

A full-screen, project-management-style app for your own research — totally separate from the public portfolio. Each research project has its own set of tabs:

| Tab | Purpose |
|---|---|
| **Project Details** | Title, field, status, a private link, notes, tags, cover image |
| **Timeline** | A dated diary/journal — add a note any time you make progress |
| **Literature** | A table of every paper you read — authors, link, status, % read, and your key findings |
| **Schedule** | A milestone table (Literature Review, Build, Testing, Writing…) with start/end dates and status |
| **Tasks** | A simple to-do checklist for quick action items, with optional due dates |
| **Progress** | Visual dashboard — donut charts for reading/milestone/task completion, status-breakdown bars, and your next upcoming deadline |
| **Resources** | Saved links — datasets, tools, references, contacts |

Use **Export Project** (top-right of any project) to download everything for that project as a single JSON backup file.

### 📧 Email notifications for the Contact form

Optional — without it, every message is still saved and visible in the **Messages** tab. To also get an email copy, add to `backend/.env`:
```
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your16charapppassword   # a Gmail "App Password", not your real password
SMTP_TO=youraddress@gmail.com     # optional, defaults to SMTP_USER
```
See the comments in `backend/.env.example` for the full Gmail App Password setup steps.

---

## 🔄 Upgrading from the old local-file version

If you have an older copy of this project that stored data in `backend/data/*.json` and photos in `backend/uploads/`, set up your `.env` with `MONGODB_URI` (see above) and run, once:
```bash
cd backend
node migrate-to-mongo.js
```
This copies your existing profile, projects, skills, education, experience, certificates, messages, owner login, and photos into MongoDB without touching anything that's already there. After it finishes, `backend/data/` and `backend/uploads/` are no longer used and can be left alone or deleted.

---

## 🧪 Running the Tests

The backend has an automated test suite (in `backend/test/`) covering login, every API endpoint, image uploads, the contact form, the research workspace, and reset.
```bash
cd backend
npm install   # first time only
npm test
```
The tests run against a temporary in-memory MongoDB, so they **never touch your real Atlas database** and never send real email — no `.env` needed. The first run downloads a MongoDB binary, so it takes a little longer.

---

## ✨ Features Included

- ☁️ **Cloud Database**: Everything — content and photos — is stored in MongoDB Atlas, not local files.
- 🔐 **Owner-Only Login**: A password-protected session (JWT) gates every edit — visitors browse a fully read-only site.
- 🗂️ **Full Content Manager**: Add/edit/delete Projects, Skills, Education, Experience, Events, Certificates, and your Profile — all from the site itself, with photo upload.
- 🔬 **Private Research Workspace**: A full project-management mini-app (details, diary, literature table, schedule, tasks, progress charts, resources) visible only to you.
- 📬 **Contact Form → Messages Inbox**: Visitor messages are saved and readable only by you, with optional email notifications.
- 🏆 **Events & Competitions Section**: Showcase coding competitions, conferences, and tech talks with photos and links.
- ⚡ **Zero Framework Overhead**: Fast, lightweight, pure vanilla code on the frontend.
- 🎨 **Modern Dark UI Design**: Glassmorphism, cyber gradients, subtle ambient glows, and clean typography.
- 📱 **100% Fully Responsive**: Pixel-perfect layout across mobile, tablet, laptop, and 4K displays.
- ⌨️ **Live Typing Animation**: Dynamic subtitle typewriter effect on hero banner.
- 🔍 **Real-Time Project Filtering**: Filter projects by Web, Database, and Programming without reload.
- 📜 **Active Nav Highlighting & Smooth Scrolling**: Automatic sticky header and section tracking.
- 👁️ **Interactive Certificate Modal**: Clean preview popup with keyboard (ESC) and backdrop dismiss.
- 🛡️ **Client-Side Form Validation**: Validates name, valid email regex, and message with feedback.
- 🔝 **Back to Top Button**: Floating scroll-to-top button with smooth transition.
- ♿ **Accessibility & SEO Friendly**: Semantic tags, ARIA labels, proper hierarchy, and contrast compliance.

---

## 🌍 Deploying it online (Render — free)

The backend serves the website too, so the whole portfolio is **one web service** plus your existing MongoDB Atlas database. These steps use [Render](https://render.com) (free plan); any Node.js host works the same way.

**Before you deploy**
1. Replace the placeholders in `index.html` — search for `[Your-` (GitHub, LinkedIn, email links).
2. Put your CV at `assets/Kasunika_CV.pdf` (exact name) so the Download CV button works.
3. Commit and push the project to a GitHub repository. `backend/.env` is git-ignored and must **not** be committed — its values go into Render's settings instead.

**Create the service**
1. On Render: **New → Web Service** → connect your GitHub repo.
2. Settings:
   - **Root Directory:** leave empty (the project root)
   - **Runtime:** Node
   - **Build Command:** `npm install --prefix backend`
   - **Start Command:** `node backend/server.js`
   - **Instance type:** Free
3. **Environment → Add Environment Variable**, copying the values from your local `backend/.env`:
   - `MONGODB_URI` (required)
   - `SMTP_USER`, `SMTP_PASS`, `SMTP_TO` (optional, for contact-form emails)
4. **Create Web Service.** After the build, your site is live at `https://<your-service>.onrender.com`, with HTTPS included.
5. Log in with your **existing** owner password — it's stored in Atlas, so it's the same one you use locally. (If the database is brand new, the first-run password is printed in Render's **Logs** tab.)

**MongoDB Atlas network access:** Render's free plan has no fixed IP address, so Atlas must allow connections from anywhere (`0.0.0.0/0`, under **Network Access**). The database is still protected by your username and password, so use a long, random database password.

**Good to know**
- Free Render services go to sleep after ~15 minutes without visitors; the first visit after that takes 30–60 seconds to wake up. A paid instance avoids this.
- **Login protection:** after 5 wrong passwords, login is locked for 15 minutes for that visitor (adjustable with `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES`). Restarting the server clears lockouts.
- **Your own domain:** add it under Render → Settings → Custom Domains. Nothing in the code needs to change.
- **Hosting the frontend separately** (e.g. GitHub Pages) instead: set `window.PORTFOLIO_API_BASE = 'https://<your-backend>'` in a `<script>` before `script.js`, and add the frontend's address to `ALLOWED_ORIGINS` on the backend.
- Everything you configure is listed in `backend/.env.example`.
