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

### 3. Serve the frontend
Pick whichever is easiest:

**Direct Browser Open (Simplest)**
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
| **Projects** | Featured project cards — title, category, description, tech stack, links, photo |
| **Skills** | Skills & Expertise — name, category, badge, and an optional proficiency % (leave blank to show as a plain tag, like the Soft Skills group) |
| **Education** | The Education timeline — institution, period, degree, status, description, tags, optional photo |
| **Experience** | Experience & Activities cards — title, badge, description, tags, optional photo |
| **Events** | Coding competitions, conferences, tech talks — title, type, description, date, location, link, photo |
| **Certificates** | Certificates & Achievements — name, issuing org, date, description, optional certificate image |
| **Research (Private)** | Opens the full-screen **Research Workspace** — see below. Never shown to visitors, and the data can't be read even via a direct API call without logging in |
| **Messages** | Your Contact form inbox — every visitor message is saved here, with an optional email copy (see **Email notifications**, below) |
| **Profile & Links** | Your name, degree, photo, email, phone, LinkedIn, GitHub, location, hero bio, the full **About Me** text, and your password |
| **Backup & Export** | Download a full JSON snapshot of everything, or restore the original default template (deletes all custom content and photos) |

Every tab follows the same pattern: fill in the form and **Save**, or click **Edit** / **Delete** on an item in the list below it.

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

## ⚠️ A note on deploying this publicly

This project is built for **local personal use** (running on your own machine). If you ever host it somewhere public:
- Serve the backend over **HTTPS** — the login password and session token are sent in plain HTTP otherwise.
- The login has no rate-limiting/lockout; add one before exposing it to the internet.
- Update the CORS origins in `backend/server.js` to your real domain instead of `localhost`.
- In MongoDB Atlas, narrow the Network Access list from "Allow Access from Anywhere" down to your server's actual IP once you know it.
