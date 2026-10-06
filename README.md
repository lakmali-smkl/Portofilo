# Kasunika - Personal Portfolio Website

A modern, responsive, and performance-optimized personal portfolio website built with pure **HTML5**, **CSS3**, and **Vanilla JavaScript** (no heavy external dependencies or frameworks).

---

## 📁 Project Structure

```text
portfolio/
│
├── index.html          # Main HTML5 structure & content
├── style.css           # Modern dark-themed design system & animations
├── script.js           # Interactive features, typing effect, validation, filtering
│
├── images/
│   └── profile.jpg     # Profile photo (with automatic fallback UI)
│
├── assets/
│   └── Kasunika_CV.pdf # Your Curriculum Vitae PDF (drop your PDF here)
│
└── backend/             # Express API for the in-browser Portfolio Manager
    ├── server.js        # REST API (owner login + CRUD for every section, image upload)
    ├── package.json     # Backend dependencies
    ├── data/             # Auto-created: projects/skills/education/experience/
    │                     #   certificates/events/profile/auth JSON files
    └── uploads/          # Auto-created: every uploaded photo
```

---

## 🚀 How to Run Locally

The site itself is plain HTML/CSS/JS and can be opened directly in a browser. The **Manage Projects** panel — which edits every section of the site (Profile, About, Skills, Education, Projects, Experience, Events, Certificates) — however, talks to a small Node.js backend — start that first if you want to use it.

### 1. Start the backend (required for editing anything)
Requires [Node.js](https://nodejs.org/) (v18+).
```bash
cd backend
npm install      # first time only
node server.js
```
You should see the `🚀 Kasunika Portfolio API is running!` banner. All content is stored in `backend/data/*.json`; uploaded photos are saved to `backend/uploads/`.

**First run only:** the console also prints a one-time, randomly generated **owner password**, e.g.:
```
🔐 OWNER LOGIN CREATED (first run only)
Password: aB3xY9kLm2Qz
```
Copy it now — it's never shown again. Use it to log in on the site (see **Owner Login**, below), then change it to something memorable from **Manage Projects → Profile & Links → Change Password**. It's saved (hashed, not in plain text) in `backend/data/auth.json` — don't commit or share that file.

### 2. Serve the frontend
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
2. Since you're not logged in yet, a **Login** dialog appears instead. Enter the owner password (see above).
3. You're now logged in for 7 days (stored locally in your browser) and the full **Portfolio & Project Manager** opens, with a **Log Out** button in its header.
4. To change your password, go to the **Profile & Links** tab → **Change Password**.

If you forget your password, delete `backend/data/auth.json` and restart the backend (`node server.js`) — a fresh one-time password will be generated and printed to the console. This does **not** delete your projects or content, only the login credential.

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
| **Profile & Links** | Your name, degree, photo, email, phone, LinkedIn, GitHub, location, hero bio, the full **About Me** text, and your password |
| **Backup & Export** | Download a full JSON snapshot of everything, or restore the original default template (deletes all custom content and photos) |

Every tab follows the same pattern: fill in the form and **Save**, or click **Edit** / **Delete** on an item in the list below it. Photos upload straight to `backend/uploads/`; all text content is saved to `backend/data/*.json`.

Two things still live directly in `index.html`, since they're files rather than form fields:
- **Profile photo fallback**: if `images/profile.jpg` exists it's used as the very first paint before the backend responds; after that, whatever you upload via the Profile tab takes over.
- **CV / Resume**: drop your PDF in `assets/Kasunika_CV.pdf` (exact filename) to activate the Download/View CV buttons.

---

## ✨ Features Included

- 🔐 **Owner-Only Login**: A password-protected session (JWT) gates every edit — visitors browse a fully read-only site.
- 🗂️ **Full Content Manager**: Add/edit/delete Projects, Skills, Education, Experience, Events, and Certificates, plus your Profile — all from the site itself, with photo upload, backed by a small Node.js/Express API.
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
