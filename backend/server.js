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
 *   - CORS enabled for frontend at http://localhost:8000
 * ==========================================================================
 *   To run:   node server.js
 *   API runs: http://localhost:3001
 * ==========================================================================
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const { connectDB } = require('./db');
const { resourceModel, Image, Profile, Auth } = require('./models');

const app = express();
const PORT = 3001;

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: ['http://localhost:8000', 'http://127.0.0.1:8000', 'null'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== FILE UPLOAD CONFIG (MULTER) ====================
// Files are held in memory just long enough to be written into MongoDB as
// an Image document — nothing touches the local disk.
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) return cb(null, true);
  cb(new Error('Only image files are allowed (jpg, png, gif, webp, svg)'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max per file
});

async function saveImageFile(file) {
  if (!file) return null;
  const id = uuidv4();
  await Image.create({ id, data: file.buffer, contentType: file.mimetype });
  return `/api/images/${id}`;
}

async function deleteImageByPath(imagePath) {
  if (imagePath && imagePath.startsWith('/api/images/')) {
    const id = imagePath.replace('/api/images/', '');
    await Image.deleteOne({ id }).catch(() => {});
  }
}

// Serve images stored in MongoDB
app.get('/api/images/:id', async (req, res) => {
  try {
    // Not .lean() — the Buffer schema type only casts the stored BSON
    // Binary into a real Node Buffer on a hydrated Mongoose document.
    const image = await Image.findOne({ id: req.params.id });
    if (!image) return res.status(404).send('Not found');
    res.set('Content-Type', image.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
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

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
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

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password || !bcrypt.compareSync(password, AUTH.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }
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
      github: 'https://github.com/[Your-GitHub]',
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
      github: 'https://github.com/[Your-GitHub]',
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
      github: 'https://github.com/[Your-GitHub]',
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
    email: '',
    phone: '',
    location: 'University of Jaffna, Sri Lanka',
    linkedin: '',
    github: '',
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
app.get('/api/projects', async (req, res) => {
  const projects = await Project.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: projects });
});

// GET single project by ID
app.get('/api/projects/:id', async (req, res) => {
  const project = await Project.findOne({ id: req.params.id }).lean();
  if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
  res.json({ success: true, data: project });
});

// POST - Add new project (supports image upload)
app.post('/api/projects', requireAuth, upload.single('image'), async (req, res) => {
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

    const newProject = {
      id: uuidv4(),
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      tech: techArray,
      github: github ? github.trim() : 'https://github.com/[Your-GitHub]',
      demo: demo ? demo.trim() : '#contact',
      image: await saveImageFile(req.file),
      createdAt: new Date().toISOString()
    };

    await Project.create(newProject);
    res.status(201).json({ success: true, data: newProject, message: 'Project added successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT - Edit existing project (supports image replacement)
app.put('/api/projects/:id', requireAuth, upload.single('image'), async (req, res) => {
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

    // If a new image was uploaded, delete the old one
    let image = project.image;
    if (req.file) {
      if (project.image) await deleteImageByPath(project.image);
      image = await saveImageFile(req.file);
    }

    const updated = {
      title: title ? title.trim() : project.title,
      category: category ? category.trim() : project.category,
      description: description ? description.trim() : project.description,
      tech: techArray,
      github: github ? github.trim() : project.github,
      demo: demo ? demo.trim() : project.demo,
      image,
      updatedAt: new Date().toISOString()
    };

    await Project.updateOne({ id: req.params.id }, updated);
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
    if (deleted.image) await deleteImageByPath(deleted.image);
    res.json({ success: true, data: deleted, message: 'Project deleted successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PROFILE ENDPOINTS ====================

// GET profile
app.get('/api/profile', async (req, res) => {
  const profile = (await Profile.findOne({}).lean()) || {};
  res.json({ success: true, data: profile });
});

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
      html: `<p><strong>From:</strong> ${msg.name} (${msg.email})</p><p>${msg.message.replace(/\n/g, '<br>')}</p>`
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
app.get('/api/messages', requireAuth, async (req, res) => {
  const messages = await Message.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: messages });
});

// DELETE a message (owner only)
app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  const deleted = await Message.findOneAndDelete({ id: req.params.id }).lean();
  if (!deleted) return res.status(404).json({ success: false, message: 'Message not found' });
  res.json({ success: true, data: deleted, message: 'Message deleted.' });
});

// ==================== GENERIC RESOURCE ENDPOINTS ====================
// Powers /api/skills, /api/education, /api/experience, /api/certificates,
// /api/events — all MongoDB collections of { id, title, ...fields }.

function buildResourceItem(def, body, imagePath, existing = {}) {
  const out = { ...existing };
  Object.keys(body).forEach(key => {
    if (key === 'id') return;
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

  if (def.hasImage && imagePath) out.image = imagePath;
  delete out._id;
  return out;
}

Object.entries(RESOURCES).forEach(([name, def]) => {
  const Model = resourceModel(name);
  // Always run multer so multipart/form-data text fields get parsed into
  // req.body, even for resources (like skills) that don't store an image.
  const uploadMiddleware = upload.single('image');

  // GET all (public)
  app.get(`/api/${name}`, async (req, res) => {
    const items = await Model.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  });

  // POST - create (owner only)
  app.post(`/api/${name}`, requireAuth, uploadMiddleware, async (req, res) => {
    try {
      if (!req.body.title || !req.body.title.trim()) {
        return res.status(400).json({ success: false, message: 'title is required.' });
      }

      const imagePath = def.hasImage ? await saveImageFile(req.file) : null;
      const newItem = buildResourceItem(def, req.body, imagePath, {
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

      let imagePath = existing.image;
      if (req.file) {
        if (existing.image) await deleteImageByPath(existing.image);
        imagePath = await saveImageFile(req.file);
      }

      const updatedItem = buildResourceItem(def, req.body, imagePath, {
        ...existing,
        updatedAt: new Date().toISOString()
      });
      await Model.updateOne({ id: req.params.id }, updatedItem);

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
      if (deleted.image) await deleteImageByPath(deleted.image);

      res.json({ success: true, data: deleted, message: `${def.label} deleted successfully!` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

// ==================== RESET ENDPOINT ====================

// POST - Wipe all custom content (incl. uploaded images) and restore defaults (owner only)
app.post('/api/reset', requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({}).lean();
    for (const p of projects) if (p.image) await deleteImageByPath(p.image);
    await Project.deleteMany({});

    const profile = await Profile.findOne({}).lean();
    if (profile && profile.photo) await deleteImageByPath(profile.photo);
    await Profile.deleteMany({});

    for (const name of Object.keys(RESOURCES)) {
      const Model = resourceModel(name);
      const items = await Model.find({}).lean();
      for (const item of items) if (item.image) await deleteImageByPath(item.image);
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
  }
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.url} not found` });
});

// ==================== START SERVER ====================
async function main() {
  console.log('Connecting to MongoDB Atlas...');
  await connectDB();
  console.log('✅ Connected to MongoDB Atlas');

  AUTH = await bootstrapAuth();
  await seedAllDefaults();

  app.listen(PORT, () => {
    console.log('');
    console.log('==============================================');
    console.log(`  🚀 Kasunika Portfolio API is running!`);
    console.log(`  📡 Backend URL: http://localhost:${PORT}`);
    console.log(`  📁 Projects:   http://localhost:${PORT}/api/projects`);
    console.log(`  👤 Profile:    http://localhost:${PORT}/api/profile`);
    console.log(`  🖼️  Images:     http://localhost:${PORT}/api/images/`);
    console.log(`  🗄️  Database:   MongoDB Atlas`);
    console.log('==============================================');
    console.log('');
  });
}

main().catch(err => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});
