/**
 * ==========================================================================
 *   KASUNIKA PORTFOLIO - BACKEND API SERVER
 * ==========================================================================
 *   Features:
 *   - Owner-only login (password + JWT) protecting all write operations
 *   - Full CRUD (+ image upload) for: projects, skills, education,
 *     experience, certificates, events
 *   - GET/POST            /api/profile      (profile info + photo upload)
 *   - POST                /api/contact      (public — saves + emails the owner)
 *   - GET/DELETE          /api/messages     (owner only — the contact inbox)
 *   - GET                 /api/images/:id   (serve uploaded images)
 *   - Everything (content + images) is persisted in MongoDB Atlas — no
 *     local files, so it survives restarts and works from any machine.
 *   - Also serves the website itself (index.html, script.js, style.css,
 *     images/, assets/), so the whole portfolio deploys as ONE service.
 *   - CORS: local dev origins + anything listed in ALLOWED_ORIGINS
 * ==========================================================================
 *   To run:   node server.js
 *   Open:     http://localhost:3001   (site + API on the same address)
 *   Hosting:  the port comes from process.env.PORT when the host sets it
 * ==========================================================================
 */

const path = require('path');
// Load backend/.env no matter which folder the server is started from.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { randomUUID: uuidv4 } = require('crypto');

const { connectDB } = require('./db');
const { resourceModel, Image, Profile, Auth } = require('./models');

const app = express();
// Hosting services (Render, Railway, ...) choose the port and pass it in PORT.
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Behind a hosting provider's proxy, trust its X-Forwarded-For header so
// req.ip is the visitor's real address (needed for the login limiter).
if (process.env.TRUST_PROXY !== 'false' && (process.env.TRUST_PROXY || process.env.RENDER || process.env.NODE_ENV === 'production')) {
  app.set('trust proxy', 1);
}

// ==================== MIDDLEWARE ====================
// When the site is served by this server (the normal setup, locally and
// when deployed) requests are same-origin and need no CORS at all. These
// origins are only for opening the site some other way while developing
// (file://, `python -m http.server 8000`, VS Code Live Server on 5500),
// plus any extra domains listed in ALLOWED_ORIGINS (comma separated).
const DEV_ORIGINS = [
  'http://localhost:8000', 'http://127.0.0.1:8000',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'null' // pages opened straight from disk (file://)
];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

app.use(cors({
  origin: [...DEV_ORIGINS, ...EXTRA_ORIGINS],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== WEBSITE (static frontend) ====================
// Only the site's own files are served — never the backend folder (which
// holds .env and the server code).
const SITE_ROOT = path.join(__dirname, '..');
const sendSiteFile = (file) => (req, res) => res.sendFile(path.join(SITE_ROOT, file));
// index.html gets a marker telling script.js "the API is on this same
// address" (when the page is opened any other way, it uses localhost:3001).
const fs = require('fs');
app.get(['/', '/index.html'], (req, res, next) => {
  fs.readFile(path.join(SITE_ROOT, 'index.html'), 'utf8', (err, html) => {
    if (err) return next(err);
    res.type('html').set('Cache-Control', 'no-cache')
      .send(html.replace(/<head>/i, '<head>\n  <meta name="portfolio-api" content="same-origin" />'));
  });
});
app.get('/script.js', sendSiteFile('script.js'));
app.get('/style.css', sendSiteFile('style.css'));
app.use('/images', express.static(path.join(SITE_ROOT, 'images'), { fallthrough: true }));
app.use('/assets', express.static(path.join(SITE_ROOT, 'assets'), { fallthrough: true }));

// ==================== FILE UPLOAD CONFIG (MULTER) ====================
// Files are held in memory just long enough to be written into MongoDB as
// an Image document — nothing touches the local disk.
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) return cb(null, true);
  const err = new Error('Only image files are allowed (jpg, png, gif, webp, svg)');
  err.status = 400; // a rejected file type is a bad request, not a server failure
  cb(err);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max per file
});

// `isPrivate` marks images that belong to owner-only content (research
// projects) so GET /api/images/:id only serves them to the logged-in owner.
async function saveImageFile(file, { isPrivate = false } = {}) {
  if (!file) return null;
  const id = uuidv4();
  await Image.create({ id, data: file.buffer, contentType: file.mimetype, private: isPrivate });
  return `/api/images/${id}`;
}

function imageIdFromPath(imagePath) {
  return imagePath && imagePath.startsWith('/api/images/') ? imagePath.replace('/api/images/', '') : null;
}

// Escape user input before putting it into an HTML email.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Express 4 does not catch errors thrown by async handlers — without this
// a database error would leave the request hanging forever.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function deleteImageByPath(imagePath) {
  const id = imageIdFromPath(imagePath);
  if (id) await Image.deleteOne({ id }).catch(() => {});
}

// ==================== MULTI-PHOTO SUPPORT ====================
// Every section item (except the profile, which keeps one photo) holds any
// number of photos in `images` (ordered; the first is the cover). `image`
// is kept in sync with images[0] so older code and data keep working.
const MAX_PHOTOS_PER_UPLOAD = 30;
const uploadPhotos = upload.fields([
  { name: 'image', maxCount: 1 },               // legacy single-photo field
  { name: 'images', maxCount: MAX_PHOTOS_PER_UPLOAD }
]);

// Photos of an item, coping with items saved before `images` existed.
function itemImages(item) {
  if (!item) return [];
  if (Array.isArray(item.images)) return item.images.filter(Boolean);
  return item.image ? [item.image] : [];
}

function uploadedFiles(req) {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return [...(req.files.image || []), ...(req.files.images || [])];
}

// Works out an item's new photo list from an add/edit request.
//   keepImages (optional, JSON array): which existing photos to keep, in
//     the new order. Omitted = keep them all as they are. Paths that are not
//     already on this item are ignored, so a request can't "adopt" another
//     item's photo.
//   uploaded files: appended after the kept photos.
// Returns the new list plus the photos that were dropped (to delete only
// after the item is saved).
async function resolveImages(req, existingItem, { isPrivate = false } = {}) {
  const current = itemImages(existingItem);
  let kept = current;

  if (req.body.keepImages !== undefined) {
    let requested;
    try {
      requested = JSON.parse(req.body.keepImages);
    } catch {
      requested = String(req.body.keepImages).split(',').map(s => s.trim());
    }
    if (!Array.isArray(requested)) requested = [];
    kept = [...new Set(requested.filter(p => current.includes(p)))];
  }

  const added = [];
  for (const file of uploadedFiles(req)) {
    added.push(await saveImageFile(file, { isPrivate }));
  }

  const images = [...kept, ...added];
  const removed = current.filter(p => !kept.includes(p));
  return { images, removed };
}

async function deleteImages(paths) {
  for (const p of paths) await deleteImageByPath(p);
}

// Fields that describe photos are managed by resolveImages(), never copied
// from the request body as plain text.
const PHOTO_BODY_KEYS = ['image', 'images', 'keepImages'];

// Serve images stored in MongoDB
app.get('/api/images/:id', async (req, res) => {
  try {
    // Not .lean() — the Buffer schema type only casts the stored BSON
    // Binary into a real Node Buffer on a hydrated Mongoose document.
    const image = await Image.findOne({ id: req.params.id });
    if (!image) return res.status(404).send('Not found');
    if (image.private && !isOwnerRequest(req)) {
      // Same response as a missing image, so private ids can't be probed.
      return res.status(404).send('Not found');
    }
    res.set('Content-Type', image.contentType || 'application/octet-stream');
    res.set('Cache-Control', image.private
      ? 'private, no-store'
      : 'public, max-age=31536000, immutable');
    res.send(image.data);
  } catch (err) {
    res.status(500).send('Error loading image');
  }
});

// ==================== OWNER AUTHENTICATION ====================
// A single owner account, protected by a password. On first run a random
// password is generated and printed once to the console — change it from
// the site (Manage Projects -> Profile & Links -> Change Password) after
// logging in with it.
async function bootstrapAuth() {
  const existing = await Auth.findOne({}).lean();
  if (existing) return existing;

  const password = crypto.randomBytes(9).toString('base64url'); // 12-char url-safe password
  const auth = {
    passwordHash: bcrypt.hashSync(password, 10),
    jwtSecret: crypto.randomBytes(32).toString('hex')
  };
  await Auth.create(auth);

  console.log('');
  console.log('==============================================');
  console.log('  🔐 OWNER LOGIN CREATED (first run only)');
  console.log(`  Password: ${password}`);
  console.log('  Save this now — it will not be shown again.');
  console.log('  Log in on the site, then change it from');
  console.log('  Manage Projects -> Profile & Links -> Change Password.');
  console.log('==============================================');
  console.log('');

  return auth;
}

let AUTH;

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function isOwnerRequest(req) {
  const token = bearerToken(req);
  if (!token) return false;
  try {
    jwt.verify(token, AUTH.jwtSecret);
    return true;
  } catch (e) {
    return false;
  }
}

function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Login required.' });
  }
  try {
    jwt.verify(token, AUTH.jwtSecret);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

// ---- Login attempt limiter ----
// After LOGIN_MAX_ATTEMPTS wrong passwords from one address within the
// window, that address is locked out for LOGIN_LOCK_MINUTES. A correct
// login clears its count. Kept in memory: a restart clears all lockouts.
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5;
const LOGIN_LOCK_MS = (parseFloat(process.env.LOGIN_LOCK_MINUTES) || 15) * 60 * 1000;
const loginFailures = new Map(); // ip -> { count, firstAt, lockedUntil }

function loginLockRemainingMs(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) return entry.lockedUntil - now;
  if (entry.lockedUntil || now - entry.firstAt > LOGIN_LOCK_MS) loginFailures.delete(ip);
  return 0;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginFailures.get(ip) || { count: 0, firstAt: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) entry.lockedUntil = now + LOGIN_LOCK_MS;
  loginFailures.set(ip, entry);
  // Stop the map growing forever on a long-running server
  if (loginFailures.size > 10000) {
    for (const [key, e] of loginFailures) {
      if ((!e.lockedUntil || e.lockedUntil < now) && now - e.firstAt > LOGIN_LOCK_MS) loginFailures.delete(key);
    }
  }
  return entry;
}

function tooManyAttempts(res, remainingMs) {
  const minutes = Math.ceil(remainingMs / 60000);
  res.set('Retry-After', String(Math.ceil(remainingMs / 1000)));
  return res.status(429).json({
    success: false,
    message: `Too many wrong passwords. Login is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`
  });
}

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip;
  const locked = loginLockRemainingMs(ip);
  if (locked) return tooManyAttempts(res, locked);

  const { password } = req.body;
  if (!password || !bcrypt.compareSync(String(password), AUTH.passwordHash)) {
    const entry = recordLoginFailure(ip);
    if (entry.lockedUntil) return tooManyAttempts(res, entry.lockedUntil - Date.now());
    const left = LOGIN_MAX_ATTEMPTS - entry.count;
    return res.status(401).json({
      success: false,
      message: `Incorrect password. ${left} attempt${left === 1 ? '' : 's'} left before login is locked for a while.`
    });
  }

  loginFailures.delete(ip);
  const token = jwt.sign({ role: 'owner' }, AUTH.jwtSecret, { expiresIn: '7d' });
  res.json({ success: true, token });
});

app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ success: true });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !bcrypt.compareSync(currentPassword, AUTH.passwordHash)) {
    // 400, not 401: the bearer session is valid — only the submitted
    // "current password" field is wrong. A 401 here would make the
    // frontend's authFetch() treat it as an expired session and log the
    // owner out on a simple typo.
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
  }
  AUTH.passwordHash = bcrypt.hashSync(newPassword, 10);
  await Auth.updateOne({}, { passwordHash: AUTH.passwordHash });
  res.json({ success: true, message: 'Password updated successfully.' });
});

// ==================== SEED DEFAULT CONTENT ====================
// Only runs the first time a collection is empty — never overwrites
// anything the owner has already saved in MongoDB.
async function seedDefaultProjects() {
  const Project = resourceModel('projects');
  if (await Project.countDocuments() > 0) return;
  const defaults = [
    {
      id: uuidv4(),
      title: 'Database Management System',
      category: 'database',
      description: 'A relational database solution with optimized schema, normalized tables, complex queries, and transaction management.',
      tech: ['SQL', 'MariaDB / MySQL', 'ER Modeling', 'Schema Design'],
      github: 'https://github.com/lakmali-smkl',
      demo: '#contact',
      image: null,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      title: 'Student Management System',
      category: 'programming',
      description: 'An application to streamline student record administration, course registrations, and grade tracking.',
      tech: ['Java / Python', 'OOP', 'SQL Database', 'CRUD Operations'],
      github: 'https://github.com/lakmali-smkl',
      demo: '#contact',
      image: null,
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      title: 'Personal Portfolio Website',
      category: 'web',
      description: 'A modern, responsive portfolio website with HTML5, CSS3, and Vanilla JavaScript.',
      tech: ['HTML5', 'CSS3', 'Vanilla JavaScript', 'Responsive Design'],
      github: 'https://github.com/lakmali-smkl',
      demo: '#home',
      image: null,
      createdAt: new Date().toISOString()
    }
  ];
  await Project.insertMany(defaults);
  console.log('✅ Default projects seeded to MongoDB');
}

async function seedDefaultProfile() {
  const existing = await Profile.findOne({});
  if (existing) return;
  await Profile.create({
    name: 'Kasunika',
    degree: "Bachelor's Degree, University of Jaffna",
    email: 'smkl.lakmali@gmail.com',
    phone: '',
    location: 'University of Jaffna, Sri Lanka',
    linkedin: 'https://www.linkedin.com/in/kasunika-lakmali-27b5952a3',
    github: 'https://github.com/lakmali-smkl',
    bio: 'A passionate university student driven by problem solving, software development, databases, and continuous learning. Focused on building impactful solutions and collaborating through student initiatives.',
    about: 'I am a university student at the University of Jaffna with a deep enthusiasm for technology, programming, database management, and modern software development.\n\nMy academic journey is anchored in building a strong foundation in core computer science principles, database design, and web technologies. I believe in continuous learning, constantly exploring new tools and methodologies to solve practical problems effectively.\n\nBeyond academics, I am actively engaged in student activities, volunteering initiatives, and IEEE-related programs. These experiences have enriched my teamwork, communication, leadership, and collaborative problem-solving capabilities.',
    photo: null
  });
  console.log('✅ Default profile seeded to MongoDB');
}

// Generic collections: skills, education, experience, certificates, events.
// Each is a MongoDB collection of { id, title, ...fields, image?, createdAt }.
const RESOURCES = {
  skills: {
    label: 'Skill',
    hasImage: false,
    arrayFields: [],
    numberFields: ['level'],
    seed: () => [
      { category: 'Programming', title: 'Python', badge: 'Core', level: 78 },
      { category: 'Programming', title: 'Java', badge: 'OOP', level: 72 },
      { category: 'Programming', title: 'C / C++', badge: 'Fundamentals', level: 68 },
      { category: 'Programming', title: 'JavaScript', badge: 'Scripting', level: 74 },
      { category: 'Web Development', title: 'HTML5', badge: 'Semantic', level: 85 },
      { category: 'Web Development', title: 'CSS3', badge: 'Responsive', level: 80 },
      { category: 'Web Development', title: 'JavaScript (ES6+)', badge: 'DOM & Logic', level: 75 },
      { category: 'Web Development', title: 'Responsive UI/UX', badge: 'Design', level: 78 },
      { category: 'Database Management', title: 'SQL', badge: 'Queries & DDL', level: 76 },
      { category: 'Database Management', title: 'MariaDB / MySQL', badge: 'RDBMS', level: 72 },
      { category: 'Database Management', title: 'Database Design', badge: 'ERD & Normalization', level: 75 },
      { category: 'Database Management', title: 'Data Modeling', badge: 'Schema', level: 70 },
      { category: 'Professional & Soft Skills', title: 'Git & GitHub' },
      { category: 'Professional & Soft Skills', title: 'Problem Solving' },
      { category: 'Professional & Soft Skills', title: 'Teamwork' },
      { category: 'Professional & Soft Skills', title: 'Communication' },
      { category: 'Professional & Soft Skills', title: 'Continuous Learning' },
      { category: 'Professional & Soft Skills', title: 'Time Management' }
    ]
  },
  education: {
    label: 'Education entry',
    hasImage: true,
    arrayFields: ['tags'],
    numberFields: [],
    seed: () => [
      {
        title: 'University of Jaffna',
        period: '2022 - Present',
        degree: "Bachelor's Degree in Computing / Technology",
        status: 'Currently Enrolled',
        description: 'Engaged in foundational coursework and practical modules covering programming concepts, data structures, relational database systems, software engineering fundamentals, and web technologies.',
        tags: ['Programming', 'Databases', 'Software Development', 'Web Technologies']
      },
      {
        title: 'High School / College',
        period: 'Completed G.C.E. Advanced Level',
        degree: 'Physical Science / Technology Stream',
        status: 'Completed',
        description: 'Built foundational knowledge in mathematics, science, and logical reasoning, preparing for higher education in technology and software development.',
        tags: []
      }
    ]
  },
  experience: {
    label: 'Experience entry',
    hasImage: true,
    arrayFields: ['tags'],
    numberFields: [],
    seed: () => [
      {
        title: 'IEEE Student Branch Activities',
        badge: 'Active Participant',
        description: 'Active involvement in IEEE student branch initiatives, tech talks, hackathons, and webinars. Engaging with the broader engineering community to stay abreast of modern technology trends and best practices.',
        tags: ['Technical Events', 'Networking', 'Workshops']
      },
      {
        title: 'Volunteering & Community Service',
        badge: 'Social Contribution',
        description: 'Participating in university student initiatives and community volunteering programs. Supporting event coordination, student welfare projects, and outreach activities with high dedication.',
        tags: ['Event Coordination', 'Team Collaboration', 'Outreach']
      },
      {
        title: 'Workshops & Skill Development',
        badge: 'Continuous Learning',
        description: 'Attending hands-on technical workshops, coding bootcamps, and developer sessions focused on programming languages, database architectures, and contemporary web development.',
        tags: ['Hands-on Practice', 'Self-Development', 'Tech Stacks']
      },
      {
        title: 'Teamwork & Academic Group Projects',
        badge: 'Collaboration',
        description: 'Collaborating with peers on academic projects, code reviews, and group presentations. Exercising agile teamwork habits, structured version control, and clear technical communication.',
        tags: ['Peer Collaboration', 'Version Control', 'Problem Solving']
      }
    ]
  },
  certificates: {
    label: 'Certificate',
    hasImage: true,
    arrayFields: [],
    numberFields: [],
    seed: () => [
      {
        title: 'Programming Fundamentals',
        organization: 'Coursera / IEEE / University',
        date: '2023',
        description: 'Demonstrates verified understanding of foundational programming concepts, algorithms, and structured coding practices.'
      },
      {
        title: 'Database Design & SQL',
        organization: 'Online Academy / University',
        date: '2023',
        description: 'Focuses on relational schema architecture, structured query language, relational integrity, and normalization techniques.'
      },
      {
        title: 'Web Development Basics',
        organization: 'FreeCodeCamp / Workshop',
        date: '2024',
        description: 'Practical training covering responsive HTML5 web structuring, CSS styling paradigms, and JavaScript DOM interaction.'
      }
    ]
  },
  events: {
    label: 'Event',
    hasImage: true,
    arrayFields: [],
    numberFields: [],
    seed: () => [] // no fabricated defaults — the owner adds their own
  },
  // The four sections below start empty — the public site hides each one
  // until the owner adds something, so no placeholder content is invented.
  achievements: {
    label: 'Achievement',
    hasImage: true,
    arrayFields: [],
    numberFields: [],
    seed: () => []
  },
  publications: {
    label: 'Publication',
    hasImage: true,
    arrayFields: ['tags'],
    numberFields: [],
    seed: () => []
  },
  testimonials: {
    label: 'Testimonial',
    hasImage: true,
    arrayFields: [],
    numberFields: [],
    seed: () => []
  },
  gallery: {
    label: 'Gallery album',
    hasImage: true,
    arrayFields: [],
    numberFields: [],
    seed: () => []
  },
  research: {
    label: 'Research Project',
    hasImage: true,
    private: true, // GET is also owner-only — never shown on the public site
    arrayFields: ['tags'],
    numberFields: [],
    seed: () => []
  }
};

async function seedResource(name, def) {
  const Model = resourceModel(name);
  if (await Model.countDocuments() > 0) return;
  const items = def.seed().map(item => ({
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...item
  }));
  if (items.length) await Model.insertMany(items);
}

async function seedAllDefaults() {
  await seedDefaultProjects();
  await seedDefaultProfile();
  for (const [name, def] of Object.entries(RESOURCES)) {
    await seedResource(name, def);
  }
}

// ==================== API HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Kasunika Portfolio API is running', port: PORT });
});

// ==================== PROJECTS ENDPOINTS ====================
const Project = resourceModel('projects');

// GET all projects
app.get('/api/projects', asyncHandler(async (req, res) => {
  const projects = await Project.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: projects });
}));

// GET single project by ID
app.get('/api/projects/:id', asyncHandler(async (req, res) => {
  const project = await Project.findOne({ id: req.params.id }).lean();
  if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
  res.json({ success: true, data: project });
}));

// POST - Add new project (supports any number of photos)
app.post('/api/projects', requireAuth, uploadPhotos, async (req, res) => {
  try {
    const { title, category, description, tech, github, demo } = req.body;

    if (!title || !category || !description || !tech) {
      return res.status(400).json({ success: false, message: 'title, category, description, and tech are required.' });
    }

    // Parse tech - can come as comma-separated string or JSON array
    let techArray = [];
    try {
      techArray = JSON.parse(tech);
    } catch {
      techArray = tech.split(',').map(t => t.trim()).filter(Boolean);
    }

    const { images } = await resolveImages(req, null);
    const newProject = {
      id: uuidv4(),
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      tech: techArray,
      github: github ? github.trim() : 'https://github.com/lakmali-smkl',
      demo: demo ? demo.trim() : '#contact',
      images,
      image: images[0] || null,
      createdAt: new Date().toISOString()
    };

    await Project.create(newProject);
    res.status(201).json({ success: true, data: newProject, message: 'Project added successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT - Edit existing project (add / remove / reorder photos)
app.put('/api/projects/:id', requireAuth, uploadPhotos, async (req, res) => {
  try {
    const project = await Project.findOne({ id: req.params.id }).lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const { title, category, description, tech, github, demo } = req.body;

    let techArray = project.tech;
    if (tech) {
      try {
        techArray = JSON.parse(tech);
      } catch {
        techArray = tech.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    const { images, removed } = await resolveImages(req, project);

    const updated = {
      title: title ? title.trim() : project.title,
      category: category ? category.trim() : project.category,
      description: description ? description.trim() : project.description,
      tech: techArray,
      github: github ? github.trim() : project.github,
      demo: demo ? demo.trim() : project.demo,
      images,
      image: images[0] || null,
      updatedAt: new Date().toISOString()
    };

    await Project.updateOne({ id: req.params.id }, updated);
    await deleteImages(removed);
    res.json({ success: true, data: { ...project, ...updated }, message: 'Project updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE - Remove project and its image
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Project.findOneAndDelete({ id: req.params.id }).lean();
    if (!deleted) return res.status(404).json({ success: false, message: 'Project not found' });
    await deleteImages(itemImages(deleted));
    res.json({ success: true, data: deleted, message: 'Project deleted successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PROFILE ENDPOINTS ====================

// GET profile
app.get('/api/profile', asyncHandler(async (req, res) => {
  const profile = (await Profile.findOne({}).lean()) || {};
  res.json({ success: true, data: profile });
}));

// POST - Save / update profile (supports profile photo upload)
app.post('/api/profile', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const existing = (await Profile.findOne({}).lean()) || {};
    const { name, degree, email, phone, location, linkedin, github, bio, about } = req.body;

    // Replace old profile photo if a new one is uploaded
    let photo = existing.photo;
    if (req.file) {
      if (existing.photo) await deleteImageByPath(existing.photo);
      photo = await saveImageFile(req.file);
    }

    const updatedProfile = {
      ...existing,
      name: name ? name.trim() : existing.name,
      degree: degree ? degree.trim() : existing.degree,
      email: email ? email.trim() : existing.email,
      phone: phone ? phone.trim() : existing.phone,
      location: location ? location.trim() : existing.location,
      linkedin: linkedin ? linkedin.trim() : existing.linkedin,
      github: github ? github.trim() : existing.github,
      bio: bio ? bio.trim() : existing.bio,
      about: about ? about.trim() : existing.about,
      photo,
      updatedAt: new Date().toISOString()
    };
    delete updatedProfile._id;

    await Profile.findOneAndUpdate({}, updatedProfile, { upsert: true });
    res.json({ success: true, data: updatedProfile, message: 'Profile updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== CONTACT FORM & MESSAGES INBOX ====================
// Every submission is always saved to MongoDB (readable only by the
// owner). Emailing the owner a copy is optional — it only activates if
// SMTP_USER / SMTP_PASS are set in backend/.env (see .env.example).
const Message = resourceModel('messages');

let mailTransporter;
let mailTransporterInitAttempted = false;

function getMailTransporter() {
  if (mailTransporterInitAttempted) return mailTransporter;
  mailTransporterInitAttempted = true;

  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    console.log('ℹ️  Email notifications are OFF (SMTP_USER / SMTP_PASS not set in backend/.env). Messages are still saved to MongoDB.');
    mailTransporter = null;
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return mailTransporter;
}

async function sendContactEmail(msg) {
  const transporter = getMailTransporter();
  if (!transporter) return { sent: false, reason: 'not_configured' };

  const to = process.env.SMTP_TO || process.env.SMTP_USER;
  try {
    await transporter.sendMail({
      from: `"Portfolio Contact Form" <${process.env.SMTP_USER}>`,
      to,
      replyTo: msg.email,
      subject: `New portfolio message from ${msg.name}`,
      text: `From: ${msg.name} <${msg.email}>\n\n${msg.message}`,
      html: `<p><strong>From:</strong> ${escapeHtml(msg.name)} (${escapeHtml(msg.email)})</p><p>${escapeHtml(msg.message).replace(/\n/g, '<br>')}</p>`
    });
    return { sent: true };
  } catch (err) {
    console.error('⚠️  Contact email failed to send:', err.message);
    return { sent: false, reason: err.message };
  }
}

// POST - Public: anyone visiting the site can submit the contact form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !name.trim() || !email || !email.trim() || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const newMessage = {
      id: uuidv4(),
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      createdAt: new Date().toISOString()
    };

    await Message.create(newMessage);

    const emailResult = await sendContactEmail(newMessage);

    res.status(201).json({
      success: true,
      data: newMessage,
      emailSent: emailResult.sent,
      message: 'Your message has been received!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all messages (owner only — contains visitors' contact details)
app.get('/api/messages', requireAuth, asyncHandler(async (req, res) => {
  const messages = await Message.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: messages });
}));

// DELETE a message (owner only)
app.delete('/api/messages/:id', requireAuth, asyncHandler(async (req, res) => {
  const deleted = await Message.findOneAndDelete({ id: req.params.id }).lean();
  if (!deleted) return res.status(404).json({ success: false, message: 'Message not found' });
  res.json({ success: true, data: deleted, message: 'Message deleted.' });
}));

// ==================== GENERIC RESOURCE ENDPOINTS ====================
// Powers /api/skills, /api/education, /api/experience, /api/certificates,
// /api/events — all MongoDB collections of { id, title, ...fields }.

// `images` is the item's full, ordered photo list (from resolveImages), or
// null to leave the photos untouched.
function buildResourceItem(def, body, images, existing = {}) {
  const out = { ...existing };
  Object.keys(body).forEach(key => {
    if (key === 'id' || PHOTO_BODY_KEYS.includes(key)) return;
    let val = body[key];

    if (def.arrayFields.includes(key)) {
      try {
        val = JSON.parse(val);
      } catch {
        val = String(val).split(',').map(s => s.trim()).filter(Boolean);
      }
    } else if (def.numberFields.includes(key)) {
      if (val === '' || val === null || val === undefined) {
        delete out[key];
        return;
      }
      val = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    } else if (typeof val === 'string') {
      val = val.trim();
    }

    out[key] = val;
  });

  if (def.hasImage && Array.isArray(images)) {
    out.images = images;
    out.image = images[0] || null;
  }
  delete out._id;
  return out;
}

Object.entries(RESOURCES).forEach(([name, def]) => {
  const Model = resourceModel(name);
  // Always run multer so multipart/form-data text fields get parsed into
  // req.body, even for resources (like skills) that don't store photos.
  const uploadMiddleware = uploadPhotos;
  const photoOptions = { isPrivate: !!def.private };

  // GET all — public, except resources marked `private: true` (owner only,
  // never exposed to site visitors even via a direct API call).
  const getGuards = def.private ? [requireAuth] : [];
  app.get(`/api/${name}`, ...getGuards, asyncHandler(async (req, res) => {
    const items = await Model.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  }));

  // POST - create (owner only)
  app.post(`/api/${name}`, requireAuth, uploadMiddleware, async (req, res) => {
    try {
      if (!req.body.title || !req.body.title.trim()) {
        return res.status(400).json({ success: false, message: 'title is required.' });
      }

      const images = def.hasImage ? (await resolveImages(req, null, photoOptions)).images : null;
      const newItem = buildResourceItem(def, req.body, images, {
        id: uuidv4(),
        createdAt: new Date().toISOString()
      });
      await Model.create(newItem);

      res.status(201).json({ success: true, data: newItem, message: `${def.label} added successfully!` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // PUT - update (owner only)
  app.put(`/api/${name}/:id`, requireAuth, uploadMiddleware, async (req, res) => {
    try {
      const existing = await Model.findOne({ id: req.params.id }).lean();
      if (!existing) return res.status(404).json({ success: false, message: `${def.label} not found` });

      let images = null;
      let removed = [];
      if (def.hasImage) ({ images, removed } = await resolveImages(req, existing, photoOptions));

      const updatedItem = buildResourceItem(def, req.body, images, {
        ...existing,
        updatedAt: new Date().toISOString()
      });
      // replaceOne, not updateOne: buildResourceItem can *remove* a field
      // (e.g. clearing a skill's level), and updateOne would only $set the
      // remaining keys, leaving the old value in the database.
      await Model.replaceOne({ id: req.params.id }, updatedItem);
      await deleteImages(removed);

      res.json({ success: true, data: updatedItem, message: `${def.label} updated successfully!` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // DELETE (owner only)
  app.delete(`/api/${name}/:id`, requireAuth, async (req, res) => {
    try {
      const deleted = await Model.findOneAndDelete({ id: req.params.id }).lean();
      if (!deleted) return res.status(404).json({ success: false, message: `${def.label} not found` });
      await deleteImages(itemImages(deleted));

      res.json({ success: true, data: deleted, message: `${def.label} deleted successfully!` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

// ==================== RESEARCH DIARY (nested log entries) ====================
// A running, dated journal per research project — like a project diary.
// Still fully private: both routes require the owner's login.
const Research = resourceModel('research');

app.post('/api/research/:id/logs', requireAuth, async (req, res) => {
  try {
    const { date, note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: 'A note is required.' });
    }
    const entry = {
      id: uuidv4(),
      date: date || new Date().toISOString().slice(0, 10),
      note: note.trim(),
      createdAt: new Date().toISOString()
    };
    const updated = await Research.findOneAndUpdate(
      { id: req.params.id },
      { $push: { logs: entry } },
      { returnDocument: 'after' }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, message: 'Research project not found' });
    res.status(201).json({ success: true, data: updated, message: 'Diary entry added.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/research/:id/logs/:logId', requireAuth, async (req, res) => {
  try {
    const updated = await Research.findOneAndUpdate(
      { id: req.params.id },
      { $pull: { logs: { id: req.params.logId } } },
      { returnDocument: 'after' }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, message: 'Research project not found' });
    res.json({ success: true, data: updated, message: 'Diary entry removed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Three more nested sub-tables on a research project — papers (literature),
// milestones (schedule), and resources (saved links) — all shaped the same
// way, so one generic add/edit/delete registrar covers all three.
function registerResearchSubTable(fieldName, requiredField) {
  app.post(`/api/research/:id/${fieldName}`, requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body[requiredField] || !String(body[requiredField]).trim()) {
        return res.status(400).json({ success: false, message: `${requiredField} is required.` });
      }
      // Server-generated id/createdAt come last so the request can't override them.
      const entry = { ...body, id: uuidv4(), createdAt: new Date().toISOString() };
      const updated = await Research.findOneAndUpdate(
        { id: req.params.id },
        { $push: { [fieldName]: entry } },
        { returnDocument: 'after' }
      ).lean();
      if (!updated) return res.status(404).json({ success: false, message: 'Research project not found' });
      res.status(201).json({ success: true, data: updated, message: 'Added.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put(`/api/research/:id/${fieldName}/:itemId`, requireAuth, async (req, res) => {
    try {
      const research = await Research.findOne({ id: req.params.id }).lean();
      if (!research) return res.status(404).json({ success: false, message: 'Research project not found' });
      const list = Array.isArray(research[fieldName]) ? research[fieldName] : [];
      const index = list.findIndex(x => x.id === req.params.itemId);
      if (index === -1) return res.status(404).json({ success: false, message: 'Entry not found' });

      const current = list[index];
      list[index] = {
        ...current,
        ...req.body,
        id: current.id, // never let an edit change the entry's id
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      };
      const updated = await Research.findOneAndUpdate(
        { id: req.params.id },
        { $set: { [fieldName]: list } },
        { returnDocument: 'after' }
      ).lean();
      res.json({ success: true, data: updated, message: 'Updated.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete(`/api/research/:id/${fieldName}/:itemId`, requireAuth, async (req, res) => {
    try {
      const updated = await Research.findOneAndUpdate(
        { id: req.params.id },
        { $pull: { [fieldName]: { id: req.params.itemId } } },
        { returnDocument: 'after' }
      ).lean();
      if (!updated) return res.status(404).json({ success: false, message: 'Research project not found' });
      res.json({ success: true, data: updated, message: 'Removed.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

registerResearchSubTable('papers', 'title');
registerResearchSubTable('milestones', 'task');
registerResearchSubTable('resources', 'title');
registerResearchSubTable('tasks', 'title');

// ==================== RESET ENDPOINT ====================

// POST - Wipe all custom content (incl. uploaded images) and restore defaults (owner only)
app.post('/api/reset', requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({}).lean();
    for (const p of projects) await deleteImages(itemImages(p));
    await Project.deleteMany({});

    const profile = await Profile.findOne({}).lean();
    if (profile && profile.photo) await deleteImageByPath(profile.photo);
    await Profile.deleteMany({});

    for (const name of Object.keys(RESOURCES)) {
      const Model = resourceModel(name);
      const items = await Model.find({}).lean();
      for (const item of items) await deleteImages(itemImages(item));
      await Model.deleteMany({});
    }

    await seedAllDefaults();

    res.json({ success: true, message: 'All data reset to defaults.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Max 5MB allowed.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: `Too many photos in one upload (max ${MAX_PHOTOS_PER_UPLOAD} at a time — save, then add more).`
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.url} not found` });
});

// ==================== START SERVER ====================
// Loads the owner auth secrets and seeds default content. Split out from
// main() so the test suite can run it against an in-memory database.
async function initApp() {
  AUTH = await bootstrapAuth();
  await seedAllDefaults();
  await markPrivateImages();
}

// Images uploaded before private-image support existed have no `private`
// flag. Mark every image used by a private resource (research) so it is
// only served to the logged-in owner. Safe to run on every start.
async function markPrivateImages() {
  for (const [name, def] of Object.entries(RESOURCES)) {
    if (!def.private) continue;
    const items = await resourceModel(name).find({}, { image: 1, images: 1 }).lean();
    const ids = items.flatMap(itemImages).map(imageIdFromPath).filter(Boolean);
    if (ids.length) await Image.updateMany({ id: { $in: ids } }, { $set: { private: true } });
  }
}

async function main() {
  console.log('Connecting to MongoDB Atlas...');
  await connectDB();
  console.log('✅ Connected to MongoDB Atlas');

  await initApp();

  app.listen(PORT, () => {
    console.log('');
    console.log('==============================================');
    console.log(`  🚀 Kasunika Portfolio API is running!`);
    console.log(`  🌐 Website:    http://localhost:${PORT}   <- open this`);
    console.log(`  📡 Backend URL: http://localhost:${PORT}`);
    console.log(`  📁 Projects:   http://localhost:${PORT}/api/projects`);
    console.log(`  👤 Profile:    http://localhost:${PORT}/api/profile`);
    console.log(`  🖼️  Images:     http://localhost:${PORT}/api/images/`);
    console.log(`  🗄️  Database:   MongoDB Atlas`);
    console.log('==============================================');
    console.log('');
  });
}

module.exports = { app, initApp, buildResourceItem, RESOURCES };

// Only start listening when run directly (`node server.js`), not when the
// test suite require()s this file.
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  });
}
