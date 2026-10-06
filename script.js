/**
 * ==========================================================================
 *   KASUNIKA - PERSONAL PORTFOLIO JAVASCRIPT
 * ==========================================================================
 *   Features:
 *   1. Backend-driven content: Projects, Skills, Education, Experience,
 *      Events, Certificates, Profile — all editable from the Manage panel
 *   2. Owner-only login (password + JWT) gating every edit action
 *   3. Photo upload (project/profile/education/experience/certificate/event)
 *   4. Subtitle Typing Effect
 *   5. Sticky Navbar & Scroll Styling
 *   6. Mobile Drawer Navigation
 *   7. Active Section Highlighting on Scroll
 *   8. Scroll Reveal Animations (Intersection Observer)
 *   9. Real-time Project Category Filtering
 *   10. Certificate Preview Modal
 *   11. Contact Form Client-Side Validation
 *   12. Back To Top Button
 *   13. Profile Image Fallback Handling
 *   14. Dynamic Copyright Year
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ==================== 1. BACKEND API CONFIGURATION ==================== */
  const API_BASE = 'http://localhost:3001';
  const API_PROJECTS = `${API_BASE}/api/projects`;
  const API_PROFILE = `${API_BASE}/api/profile`;
  const TOKEN_KEY = 'kasunika_admin_token';

  // Resolve a stored image path (e.g. "/uploads/xyz.jpg") into a full backend URL.
  // Leaves data: URIs (instant local previews) and absolute URLs untouched.
  function resolveImageUrl(imagePath) {
    if (!imagePath) return '';
    if (/^(https?:|data:)/i.test(imagePath)) return imagePath;
    return `${API_BASE}${imagePath}`;
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ==================== 2. OWNER AUTH (login gate for all edits) ==================== */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* ignore */ }
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  }
  function isLoggedIn() {
    return !!getToken();
  }

  // fetch() wrapper that attaches the owner's bearer token and, on a 401
  // (missing/expired session), clears it and re-opens the login modal so
  // the caller's existing error handling just shows why the save failed.
  async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = options.headers ? { ...options.headers } : {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      clearToken();
      updateAuthUI();
      openLoginModal();
    }
    return res;
  }

  /* ==================== 3. FALLBACK DATA & CACHES ==================== */
  // Fallback data shown if the backend server isn't reachable
  const defaultProjects = [
    {
      id: 'proj-1',
      title: 'Database Management System',
      category: 'database',
      notice: '[Database Project]',
      description: 'A relational database solution designed with optimized schema structures, normalized tables, complex queries, and transaction management to store and retrieve data reliably.',
      tech: ['SQL', 'MariaDB / MySQL', 'ER Modeling', 'Schema Design'],
      github: 'https://github.com/[Your-GitHub]',
      demo: '#contact'
    },
    {
      id: 'proj-2',
      title: 'Student Management System',
      category: 'programming',
      notice: '[Programming Project]',
      description: 'An application built to streamline student record administration, course registrations, and grade tracking with a structured data architecture and intuitive interface.',
      tech: ['Java / Python', 'OOP', 'SQL Database', 'CRUD Operations'],
      github: 'https://github.com/[Your-GitHub]',
      demo: '#contact'
    },
    {
      id: 'proj-3',
      title: 'Personal Portfolio Website',
      category: 'web',
      notice: '[Web Project]',
      description: 'A modern, responsive personal portfolio website engineered with clean HTML5, custom CSS3, and vanilla JavaScript featuring dynamic interactions and smooth animations.',
      tech: ['HTML5', 'CSS3', 'Vanilla JavaScript', 'Responsive Design'],
      github: 'https://github.com/[Your-GitHub]',
      demo: '#home'
    },
    {
      id: 'proj-4',
      title: 'Interactive Web Application',
      category: 'web',
      notice: '[Web Project]',
      description: 'A dynamic client-side web application implementing asynchronous data handling, responsive user interface components, and state management logic.',
      tech: ['JavaScript ES6', 'REST APIs', 'CSS Flexbox/Grid', 'DOM Manipulation'],
      github: 'https://github.com/[Your-GitHub]',
      demo: '#contact'
    }
  ];

  // In-memory caches, refreshed from the backend each time we fetch
  let cachedProjects = [];
  let cachedProfile = {};
  let cachedSkills = [];
  let cachedEducation = [];
  let cachedExperience = [];
  let cachedCertificates = [];
  let cachedEvents = [];
  let cachedResearch = [];

  async function fetchProjects() {
    try {
      const res = await fetch(API_PROJECTS);
      const json = await res.json();
      cachedProjects = json.success ? json.data : defaultProjects;
    } catch (e) {
      console.warn('Could not reach backend server, showing fallback data:', e);
      cachedProjects = defaultProjects;
    }
    return cachedProjects;
  }

  async function fetchProfile() {
    try {
      const res = await fetch(API_PROFILE);
      const json = await res.json();
      cachedProfile = json.success ? json.data : {};
    } catch (e) {
      console.warn('Could not reach backend server for profile:', e);
      cachedProfile = {};
    }
    return cachedProfile;
  }

  // Generic public GET for the flat-array resources (skills/education/etc.)
  async function fetchResource(name) {
    try {
      const res = await fetch(`${API_BASE}/api/${name}`);
      const json = await res.json();
      return json.success ? json.data : [];
    } catch (e) {
      console.warn(`Could not reach backend server for ${name}:`, e);
      return [];
    }
  }

  async function fetchSkills() { cachedSkills = await fetchResource('skills'); return cachedSkills; }
  async function fetchEducation() { cachedEducation = await fetchResource('education'); return cachedEducation; }
  async function fetchExperience() { cachedExperience = await fetchResource('experience'); return cachedExperience; }
  async function fetchCertificates() { cachedCertificates = await fetchResource('certificates'); return cachedCertificates; }
  async function fetchEvents() { cachedEvents = await fetchResource('events'); return cachedEvents; }

  // Research projects are private: the GET route itself requires the owner's
  // login, so this (unlike fetchResource above) must use authFetch — and
  // must only ever be called while logged in (see openResearchWorkspace()).
  async function fetchResearch() {
    try {
      const res = await authFetch(`${API_BASE}/api/research`);
      const json = await res.json();
      cachedResearch = json.success ? json.data : [];
    } catch (e) {
      console.warn('Could not reach backend server for research:', e);
      cachedResearch = [];
    }
    return cachedResearch;
  }

  /* ==================== 4. ICON HELPERS ==================== */
  function getBannerIcon(category) {
    if (category === 'database') {
      return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
    }
    if (category === 'programming') {
      return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    }
    return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  }

  function getEventIcon() {
    return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  }

  function getEventTypeLabel(type) {
    const map = { competition: 'Competition', conference: 'Conference', 'tech-talk': 'Tech Talk', workshop: 'Workshop', other: 'Event' };
    return map[type] || 'Event';
  }

  const skillCategoryIcons = {
    programming: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    web: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
    database: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    default: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
  };

  function getSkillCategoryIcon(category) {
    const key = (category || '').toLowerCase();
    if (key.includes('program') || key.includes('code')) return skillCategoryIcons.programming;
    if (key.includes('web')) return skillCategoryIcons.web;
    if (key.includes('data')) return skillCategoryIcons.database;
    return skillCategoryIcons.default;
  }

  const educationIcons = [
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>`
  ];

  const experienceIcons = [
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m10 15 5-3-5-3v6Z"/></svg>`,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
  ];

  /* ==================== 5. DYNAMIC PROJECTS RENDERING ==================== */
  const projectsGrid = document.getElementById('projects-grid');
  let currentFilter = 'all';

  async function renderProjects(filter = currentFilter) {
    if (!projectsGrid) return;
    currentFilter = filter;
    const projects = await fetchProjects();

    projectsGrid.innerHTML = '';

    projects.forEach((proj, index) => {
      const card = document.createElement('article');
      card.className = `project-card reveal active ${filter !== 'all' && proj.category !== filter ? 'hide' : ''}`;
      card.setAttribute('data-category', proj.category);

      const techTags = Array.isArray(proj.tech)
        ? proj.tech.map(t => `<span class="tech-tag">${escapeHtml(t.trim())}</span>`).join('')
        : '';

      const bannerClass = `project-banner-${(index % 4) + 1}`;
      const bannerMedia = proj.image
        ? `<img class="project-banner-img" src="${resolveImageUrl(proj.image)}" alt="${escapeHtml(proj.title)}" />`
        : `<div class="banner-icon">${getBannerIcon(proj.category)}</div>`;

      card.innerHTML = `
        <div class="project-banner ${bannerClass}">
          <div class="project-badge">${escapeHtml(proj.category)}</div>
          ${bannerMedia}
        </div>
        <div class="project-body">
          <h3 class="project-title">${escapeHtml(proj.title)}</h3>
          <p class="project-placeholder-notice">${escapeHtml(proj.notice || `[${proj.category} Project]`)}</p>
          <p class="project-description">${escapeHtml(proj.description)}</p>
          <div class="project-tech-stack">
            ${techTags}
          </div>
          <div class="project-actions">
            <a href="${escapeHtml(proj.github || '#')}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/></svg>
              <span>GitHub</span>
            </a>
            <a href="${escapeHtml(proj.demo || '#contact')}" class="btn btn-sm btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>Live Demo</span>
            </a>
          </div>
        </div>
      `;

      projectsGrid.appendChild(card);
    });

    renderAdminProjectList();
  }

  /* ==================== 6. PROJECT FILTERING ==================== */
  const filterBtns = document.querySelectorAll('.filter-btn');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const filterValue = btn.getAttribute('data-filter');
      renderProjects(filterValue);
    });
  });

  /* ==================== 7. ADMIN MODAL (open/close/tabs) ==================== */
  const adminModal = document.getElementById('admin-modal');
  const btnAdminToggle = document.getElementById('btn-admin-toggle');
  const adminModalClose = document.getElementById('admin-modal-close');
  const adminTabs = document.querySelectorAll('.admin-tab-btn');
  const adminTabContents = document.querySelectorAll('.admin-tab-content');

  function openAdminModal() {
    if (!adminModal) return;
    adminModal.classList.add('open');
    adminModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    updateAuthUI();
    populateProfileForm();
    renderMessagesAdmin();
  }

  function closeAdminModal() {
    if (!adminModal) return;
    adminModal.classList.remove('open');
    adminModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (btnAdminToggle) {
    btnAdminToggle.addEventListener('click', () => {
      if (isLoggedIn()) {
        openAdminModal();
      } else {
        pendingOpenAdminAfterLogin = true;
        openLoginModal();
      }
    });
  }

  if (adminModalClose) adminModalClose.addEventListener('click', closeAdminModal);
  if (adminModal) {
    adminModal.addEventListener('click', (e) => {
      if (e.target === adminModal) closeAdminModal();
    });
  }

  adminTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      adminTabs.forEach(b => b.classList.remove('active'));
      adminTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.getAttribute('data-tab'));
      if (targetTab) targetTab.classList.add('active');
    });
  });

  /* ==================== 8. OWNER LOGIN MODAL ==================== */
  const loginModal = document.getElementById('login-modal');
  const loginModalClose = document.getElementById('login-modal-close');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');

  let pendingOpenAdminAfterLogin = false;

  function openLoginModal() {
    if (!loginModal) return;
    loginModal.classList.add('open');
    loginModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (loginError) loginError.style.display = 'none';
    if (loginPassword) {
      loginPassword.value = '';
      loginPassword.focus();
    }
  }

  function closeLoginModal() {
    if (!loginModal) return;
    loginModal.classList.remove('open');
    loginModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function updateAuthUI() {
    if (btnLogout) btnLogout.hidden = !isLoggedIn();
  }

  if (loginModalClose) {
    loginModalClose.addEventListener('click', () => {
      closeLoginModal();
      pendingOpenAdminAfterLogin = false;
    });
  }
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        closeLoginModal();
        pendingOpenAdminAfterLogin = false;
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = loginPassword.value;
      const btn = document.getElementById('btn-login-submit');
      if (btn) btn.disabled = true;
      if (loginError) loginError.style.display = 'none';

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Login failed.');

        setToken(json.token);
        updateAuthUI();
        closeLoginModal();

        if (pendingOpenAdminAfterLogin) {
          pendingOpenAdminAfterLogin = false;
          openAdminModal();
        }
      } catch (err) {
        if (loginError) {
          loginError.textContent = err.message || 'Incorrect password.';
          loginError.style.display = 'block';
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      clearToken();
      updateAuthUI();
      closeAdminModal();
    });
  }

  // Show/hide toggle for every password field (Login, Change Password)
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    const input = document.getElementById(btn.getAttribute('data-toggle-for'));
    const eyeIcon = btn.querySelector('.icon-eye');
    const eyeOffIcon = btn.querySelector('.icon-eye-off');
    if (!input) return;

    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      if (eyeIcon) eyeIcon.hidden = !showing;
      if (eyeOffIcon) eyeOffIcon.hidden = showing;
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  /* ==================== 9. PROJECT FORM (Add / Edit / Delete) ==================== */
  const manageProjectForm = document.getElementById('manage-project-form');
  const editProjectId = document.getElementById('edit-project-id');
  const projTitle = document.getElementById('proj-title');
  const projCategory = document.getElementById('proj-category');
  const projDesc = document.getElementById('proj-desc');
  const projTech = document.getElementById('proj-tech');
  const projGithub = document.getElementById('proj-github');
  const projDemo = document.getElementById('proj-demo');
  const projImageFile = document.getElementById('proj-image-file');
  const projImagePreview = document.getElementById('proj-image-preview');
  const projectFormTitle = document.getElementById('project-form-title');
  const btnCancelProjectEdit = document.getElementById('btn-cancel-project-edit');
  const adminProjectList = document.getElementById('admin-project-list');

  function renderAdminProjectList() {
    if (!adminProjectList) return;
    const projects = cachedProjects;

    if (projects.length === 0) {
      adminProjectList.innerHTML = '<p class="admin-text">No projects added yet.</p>';
      return;
    }

    adminProjectList.innerHTML = projects.map(p => `
      <div class="admin-project-item">
        <div class="admin-proj-left">
          ${p.image ? `<img class="admin-proj-thumb" src="${resolveImageUrl(p.image)}" alt="${escapeHtml(p.title)}" />` : ''}
          <div class="admin-proj-info">
            <span class="admin-proj-name">${escapeHtml(p.title)}</span>
            <span class="admin-proj-meta">${escapeHtml(p.category.toUpperCase())} &bull; ${escapeHtml(p.tech.join(', '))}</span>
          </div>
        </div>
        <div class="admin-proj-actions">
          <button class="btn-icon-action btn-edit" data-id="${p.id}">Edit</button>
          <button class="btn-icon-action btn-delete" data-id="${p.id}">Delete</button>
        </div>
      </div>
    `).join('');

    adminProjectList.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const proj = cachedProjects.find(p => p.id === id);
        if (proj) {
          editProjectId.value = proj.id;
          projTitle.value = proj.title;
          projCategory.value = proj.category;
          projDesc.value = proj.description;
          projTech.value = proj.tech.join(', ');
          projGithub.value = proj.github || '';
          projDemo.value = proj.demo || '';

          if (projImageFile) projImageFile.value = '';
          if (projImagePreview) {
            if (proj.image) {
              projImagePreview.src = resolveImageUrl(proj.image);
              projImagePreview.hidden = false;
            } else {
              projImagePreview.hidden = true;
              projImagePreview.removeAttribute('src');
            }
          }

          projectFormTitle.textContent = 'Edit Project';
          if (btnCancelProjectEdit) btnCancelProjectEdit.style.display = 'inline-flex';
          projTitle.focus();
        }
      });
    });

    adminProjectList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to remove this project?')) return;
        try {
          const res = await authFetch(`${API_PROJECTS}/${id}`, { method: 'DELETE' });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Delete failed');
          renderProjects();
        } catch (err) {
          alert(`Could not delete project: ${err.message}`);
        }
      });
    });
  }

  function resetProjectForm() {
    if (!manageProjectForm) return;
    manageProjectForm.reset();
    editProjectId.value = '';
    if (projImagePreview) {
      projImagePreview.hidden = true;
      projImagePreview.removeAttribute('src');
    }
    projectFormTitle.textContent = 'Add New Project';
    if (btnCancelProjectEdit) btnCancelProjectEdit.style.display = 'none';
  }

  if (projImageFile && projImagePreview) {
    projImageFile.addEventListener('change', () => {
      const file = projImageFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        projImagePreview.src = e.target.result;
        projImagePreview.hidden = false;
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnCancelProjectEdit) {
    btnCancelProjectEdit.addEventListener('click', resetProjectForm);
  }

  if (manageProjectForm) {
    manageProjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = projTitle.value.trim();
      const category = projCategory.value;
      const desc = projDesc.value.trim();
      const tech = projTech.value.split(',').map(t => t.trim()).filter(Boolean);
      const github = projGithub.value.trim() || 'https://github.com/[Your-GitHub]';
      const demo = projDemo.value.trim() || '#contact';

      if (!title || !category || !desc || tech.length === 0) {
        alert('Please fill in the required project fields.');
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      formData.append('description', desc);
      formData.append('tech', JSON.stringify(tech));
      formData.append('github', github);
      formData.append('demo', demo);
      if (projImageFile && projImageFile.files[0]) {
        formData.append('image', projImageFile.files[0]);
      }

      const existingId = editProjectId.value;
      const url = existingId ? `${API_PROJECTS}/${existingId}` : API_PROJECTS;
      const method = existingId ? 'PUT' : 'POST';

      const saveBtn = document.getElementById('btn-save-project');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const res = await authFetch(url, { method, body: formData });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Save failed');

        await renderProjects();
        resetProjectForm();
        alert('Project saved successfully!');
      } catch (err) {
        alert(`Could not save project: ${err.message}`);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  /* ==================== 10. GENERIC RESOURCE ADMIN (Skills / Education / Experience / Events / Certificates) ==================== */
  // Wires one add/edit form + one list (Edit & Delete) for a flat-array
  // backend resource, following the exact same pattern as Projects above.
  function setupResourceAdmin(cfg) {
    function resetForm() {
      if (!cfg.form) return;
      cfg.form.reset();
      if (cfg.idInput) cfg.idInput.value = '';
      if (cfg.imagePreview) {
        cfg.imagePreview.hidden = true;
        cfg.imagePreview.removeAttribute('src');
      }
      if (cfg.formTitleEl) cfg.formTitleEl.textContent = cfg.addTitleText;
      if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
    }

    if (cfg.imageInput && cfg.imagePreview) {
      cfg.imageInput.addEventListener('change', () => {
        const file = cfg.imageInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          cfg.imagePreview.src = e.target.result;
          cfg.imagePreview.hidden = false;
        };
        reader.readAsDataURL(file);
      });
    }

    if (cfg.cancelBtn) cfg.cancelBtn.addEventListener('click', resetForm);

    function renderList() {
      if (!cfg.listEl) return;
      const items = cfg.getCache();

      if (items.length === 0) {
        cfg.listEl.innerHTML = `<p class="admin-text">${cfg.emptyText}</p>`;
        return;
      }

      cfg.listEl.innerHTML = items.map(item => `
        <div class="admin-project-item">
          <div class="admin-proj-left">
            ${item.image ? `<img class="admin-proj-thumb" src="${resolveImageUrl(item.image)}" alt="${escapeHtml(item.title)}" />` : ''}
            <div class="admin-proj-info">
              <span class="admin-proj-name">${escapeHtml(item.title)}</span>
              <span class="admin-proj-meta">${escapeHtml(cfg.buildMeta(item))}</span>
            </div>
          </div>
          <div class="admin-proj-actions">
            <button class="btn-icon-action btn-edit" data-id="${item.id}">Edit</button>
            <button class="btn-icon-action btn-delete" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `).join('');

      cfg.listEl.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const item = cfg.getCache().find(i => i.id === id);
          if (!item) return;

          if (cfg.idInput) cfg.idInput.value = item.id;
          cfg.fields.forEach(f => {
            if (!f.el) return;
            if (f.type === 'tags') {
              f.el.value = Array.isArray(item[f.key]) ? item[f.key].join(', ') : '';
            } else {
              f.el.value = (item[f.key] !== undefined && item[f.key] !== null) ? item[f.key] : '';
            }
          });

          if (cfg.imageInput) cfg.imageInput.value = '';
          if (cfg.imagePreview) {
            if (item.image) {
              cfg.imagePreview.src = resolveImageUrl(item.image);
              cfg.imagePreview.hidden = false;
            } else {
              cfg.imagePreview.hidden = true;
              cfg.imagePreview.removeAttribute('src');
            }
          }

          if (cfg.formTitleEl) cfg.formTitleEl.textContent = cfg.editTitleText;
          if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'inline-flex';
          if (cfg.fields[0] && cfg.fields[0].el) cfg.fields[0].el.focus();
        });
      });

      cfg.listEl.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm(cfg.confirmDeleteText)) return;
          try {
            const res = await authFetch(`${cfg.apiPath}/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || 'Delete failed');
            await cfg.afterChange();
          } catch (err) {
            alert(`Could not delete: ${err.message}`);
          }
        });
      });
    }

    if (cfg.form) {
      cfg.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const missingRequired = cfg.fields.some(f => f.required && f.el && !f.el.value.trim());
        if (missingRequired) {
          alert('Please fill in the required fields.');
          return;
        }

        const formData = new FormData();
        cfg.fields.forEach(f => {
          if (!f.el) return;
          formData.append(f.key, f.el.value.trim());
        });
        if (cfg.imageInput && cfg.imageInput.files[0]) {
          formData.append('image', cfg.imageInput.files[0]);
        }

        const existingId = cfg.idInput ? cfg.idInput.value : '';
        const url = existingId ? `${cfg.apiPath}/${existingId}` : cfg.apiPath;
        const method = existingId ? 'PUT' : 'POST';

        const saveBtn = document.getElementById(cfg.saveBtnId);
        if (saveBtn) saveBtn.disabled = true;

        try {
          const res = await authFetch(url, { method, body: formData });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Save failed');

          await cfg.afterChange();
          resetForm();
          alert(json.message || 'Saved successfully!');
        } catch (err) {
          alert(`Could not save: ${err.message}`);
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }

    return { renderList, resetForm };
  }

  const skillsAdmin = setupResourceAdmin({
    apiPath: `${API_BASE}/api/skills`,
    form: document.getElementById('manage-skill-form'),
    idInput: document.getElementById('edit-skill-id'),
    formTitleEl: document.getElementById('skill-form-title'),
    addTitleText: 'Add New Skill',
    editTitleText: 'Edit Skill',
    cancelBtn: document.getElementById('btn-cancel-skill-edit'),
    saveBtnId: 'btn-save-skill',
    listEl: document.getElementById('admin-skills-list'),
    emptyText: 'No skills added yet.',
    confirmDeleteText: 'Remove this skill?',
    fields: [
      { key: 'title', el: document.getElementById('skill-title'), required: true },
      { key: 'category', el: document.getElementById('skill-category'), required: true },
      { key: 'badge', el: document.getElementById('skill-badge') },
      { key: 'level', el: document.getElementById('skill-level') }
    ],
    getCache: () => cachedSkills,
    buildMeta: (s) => `${s.category}${(s.level !== undefined && s.level !== null && s.level !== '') ? ' • ' + s.level + '%' : ''}`,
    afterChange: () => renderSkills()
  });

  const educationAdmin = setupResourceAdmin({
    apiPath: `${API_BASE}/api/education`,
    form: document.getElementById('manage-education-form'),
    idInput: document.getElementById('edit-education-id'),
    formTitleEl: document.getElementById('education-form-title'),
    addTitleText: 'Add Education Entry',
    editTitleText: 'Edit Education Entry',
    cancelBtn: document.getElementById('btn-cancel-education-edit'),
    saveBtnId: 'btn-save-education',
    listEl: document.getElementById('admin-education-list'),
    emptyText: 'No education entries added yet.',
    confirmDeleteText: 'Remove this education entry?',
    imageInput: document.getElementById('edu-image-file'),
    imagePreview: document.getElementById('edu-image-preview'),
    fields: [
      { key: 'title', el: document.getElementById('edu-title'), required: true },
      { key: 'period', el: document.getElementById('edu-period') },
      { key: 'degree', el: document.getElementById('edu-degree') },
      { key: 'status', el: document.getElementById('edu-status') },
      { key: 'description', el: document.getElementById('edu-desc') },
      { key: 'tags', el: document.getElementById('edu-tags'), type: 'tags' }
    ],
    getCache: () => cachedEducation,
    buildMeta: (e) => [e.period, e.degree].filter(Boolean).join(' • ') || 'Education entry',
    afterChange: () => renderEducation()
  });

  const experienceAdmin = setupResourceAdmin({
    apiPath: `${API_BASE}/api/experience`,
    form: document.getElementById('manage-experience-form'),
    idInput: document.getElementById('edit-experience-id'),
    formTitleEl: document.getElementById('experience-form-title'),
    addTitleText: 'Add Experience / Activity',
    editTitleText: 'Edit Experience / Activity',
    cancelBtn: document.getElementById('btn-cancel-experience-edit'),
    saveBtnId: 'btn-save-experience',
    listEl: document.getElementById('admin-experience-list'),
    emptyText: 'No experience entries added yet.',
    confirmDeleteText: 'Remove this entry?',
    imageInput: document.getElementById('exp-image-file'),
    imagePreview: document.getElementById('exp-image-preview'),
    fields: [
      { key: 'title', el: document.getElementById('exp-title'), required: true },
      { key: 'badge', el: document.getElementById('exp-badge') },
      { key: 'description', el: document.getElementById('exp-desc') },
      { key: 'tags', el: document.getElementById('exp-tags'), type: 'tags' }
    ],
    getCache: () => cachedExperience,
    buildMeta: (e) => e.badge || 'Experience entry',
    afterChange: () => renderExperience()
  });

  const eventsAdmin = setupResourceAdmin({
    apiPath: `${API_BASE}/api/events`,
    form: document.getElementById('manage-event-form'),
    idInput: document.getElementById('edit-event-id'),
    formTitleEl: document.getElementById('event-form-title'),
    addTitleText: 'Add New Event',
    editTitleText: 'Edit Event',
    cancelBtn: document.getElementById('btn-cancel-event-edit'),
    saveBtnId: 'btn-save-event',
    listEl: document.getElementById('admin-events-list'),
    emptyText: 'No events added yet.',
    confirmDeleteText: 'Remove this event?',
    imageInput: document.getElementById('event-image-file'),
    imagePreview: document.getElementById('event-image-preview'),
    fields: [
      { key: 'title', el: document.getElementById('event-title'), required: true },
      { key: 'type', el: document.getElementById('event-type') },
      { key: 'description', el: document.getElementById('event-desc') },
      { key: 'date', el: document.getElementById('event-date') },
      { key: 'location', el: document.getElementById('event-location') },
      { key: 'link', el: document.getElementById('event-link') }
    ],
    getCache: () => cachedEvents,
    buildMeta: (e) => [getEventTypeLabel(e.type), e.date].filter(Boolean).join(' • '),
    afterChange: () => renderEvents()
  });

  const certificatesAdmin = setupResourceAdmin({
    apiPath: `${API_BASE}/api/certificates`,
    form: document.getElementById('manage-certificate-form'),
    idInput: document.getElementById('edit-certificate-id'),
    formTitleEl: document.getElementById('certificate-form-title'),
    addTitleText: 'Add New Certificate',
    editTitleText: 'Edit Certificate',
    cancelBtn: document.getElementById('btn-cancel-certificate-edit'),
    saveBtnId: 'btn-save-certificate',
    listEl: document.getElementById('admin-certificates-list'),
    emptyText: 'No certificates added yet.',
    confirmDeleteText: 'Remove this certificate?',
    imageInput: document.getElementById('cert-image-file'),
    imagePreview: document.getElementById('cert-image-preview'),
    fields: [
      { key: 'title', el: document.getElementById('cert-title-input'), required: true },
      { key: 'organization', el: document.getElementById('cert-org') },
      { key: 'date', el: document.getElementById('cert-date-input') },
      { key: 'description', el: document.getElementById('cert-desc-input') }
    ],
    getCache: () => cachedCertificates,
    buildMeta: (c) => [c.organization, c.date].filter(Boolean).join(' • ') || 'Certificate',
    afterChange: () => renderCertificates()
  });

  /* ==================== 10b. RESEARCH WORKSPACE (private, full-screen) ====================
     Not built on setupResourceAdmin — it's a mini app in its own right: a
     sidebar of projects, and per-project tabs for Details / Timeline /
     Literature / Schedule / Progress / Resources. */
  const researchWorkspace = document.getElementById('research-workspace');
  const btnOpenResearchWorkspace = document.getElementById('btn-open-research-workspace');
  const researchWorkspaceClose = document.getElementById('research-workspace-close');
  const researchProjectListEl = document.getElementById('research-project-list');
  const researchEmptyState = document.getElementById('research-empty-state');
  const researchDetailContent = document.getElementById('research-detail-content');
  const researchDetailTitleEl = document.getElementById('research-detail-title');
  const researchUnsavedHint = document.getElementById('research-unsaved-hint');
  const researchForm = document.getElementById('manage-research-form');
  const researchIdInput = document.getElementById('edit-research-id');
  const researchImageInput = document.getElementById('research-image-file');
  const researchImagePreview = document.getElementById('research-image-preview');
  const btnNewResearch = document.getElementById('btn-new-research');
  const btnDeleteResearch = document.getElementById('btn-delete-research');
  const researchDiaryForm = document.getElementById('research-diary-form');
  const researchTimelineEl = document.getElementById('research-timeline');
  const researchTaskForm = document.getElementById('research-task-form');
  const researchTaskListEl = document.getElementById('research-task-list');
  const btnExportResearch = document.getElementById('btn-export-research');
  const researchInnerTabBtns = document.querySelectorAll('.research-inner-tab-btn');
  const researchProgressGrid = document.getElementById('research-progress-grid');

  const researchFields = [
    { key: 'title', el: document.getElementById('research-title') },
    { key: 'field', el: document.getElementById('research-field') },
    { key: 'status', el: document.getElementById('research-status') },
    { key: 'link', el: document.getElementById('research-link') },
    { key: 'description', el: document.getElementById('research-desc') },
    { key: 'tags', el: document.getElementById('research-tags'), type: 'tags' }
  ];

  let selectedResearchId = null;

  function openResearchWorkspace() {
    if (!researchWorkspace) return;
    closeAdminModal();
    researchWorkspace.classList.add('open');
    researchWorkspace.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    fetchResearch().then(() => {
      renderResearchProjectList();
      if (selectedResearchId && cachedResearch.some(r => r.id === selectedResearchId)) {
        selectResearchProject(selectedResearchId);
      } else {
        showResearchEmptyState();
      }
    });
  }

  function closeResearchWorkspace() {
    if (!researchWorkspace) return;
    researchWorkspace.classList.remove('open');
    researchWorkspace.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (btnOpenResearchWorkspace) btnOpenResearchWorkspace.addEventListener('click', openResearchWorkspace);
  if (researchWorkspaceClose) researchWorkspaceClose.addEventListener('click', closeResearchWorkspace);

  function switchResearchTab(tabName) {
    researchInnerTabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-rtab') === tabName));
    document.querySelectorAll('.research-pane').forEach(p => {
      p.hidden = p.getAttribute('data-rpane') !== tabName;
    });
    if (tabName === 'progress') renderResearchProgress();
  }

  researchInnerTabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchResearchTab(btn.getAttribute('data-rtab')));
  });

  function setResearchTabsLocked(locked) {
    researchInnerTabBtns.forEach(b => {
      if (b.getAttribute('data-rtab') === 'overview') return;
      b.disabled = locked;
    });
  }

  function showResearchEmptyState() {
    selectedResearchId = null;
    if (researchEmptyState) researchEmptyState.hidden = false;
    if (researchDetailContent) researchDetailContent.hidden = true;
    renderResearchProjectList();
  }

  function showResearchForm(isNew) {
    if (researchEmptyState) researchEmptyState.hidden = true;
    if (researchDetailContent) researchDetailContent.hidden = false;
    if (researchUnsavedHint) researchUnsavedHint.hidden = !isNew;
    if (btnDeleteResearch) btnDeleteResearch.style.display = isNew ? 'none' : 'inline-flex';
    setResearchTabsLocked(isNew);
    if (isNew) switchResearchTab('overview');
  }

  function renderResearchProjectList() {
    if (!researchProjectListEl) return;
    if (cachedResearch.length === 0) {
      researchProjectListEl.innerHTML = '<p class="admin-text">No research projects yet. Create your first one above.</p>';
      return;
    }
    researchProjectListEl.innerHTML = cachedResearch.map(r => `
      <button type="button" class="research-project-card ${r.id === selectedResearchId ? 'active' : ''}" data-id="${r.id}">
        <span class="rp-title">${escapeHtml(r.title)}</span>
        <span class="rp-meta">${escapeHtml([r.field, r.status].filter(Boolean).join(' • ') || 'Research project')}</span>
      </button>
    `).join('');

    researchProjectListEl.querySelectorAll('.research-project-card').forEach(card => {
      card.addEventListener('click', () => selectResearchProject(card.getAttribute('data-id')));
    });
  }

  function selectResearchProject(id) {
    const item = cachedResearch.find(r => r.id === id);
    if (!item) return;
    selectedResearchId = id;
    renderResearchProjectList();
    showResearchForm(false);

    if (researchDetailTitleEl) researchDetailTitleEl.textContent = item.title;
    if (researchIdInput) researchIdInput.value = item.id;
    researchFields.forEach(f => {
      if (!f.el) return;
      if (f.type === 'tags') {
        f.el.value = Array.isArray(item[f.key]) ? item[f.key].join(', ') : '';
      } else {
        f.el.value = (item[f.key] !== undefined && item[f.key] !== null) ? item[f.key] : '';
      }
    });

    if (researchImageInput) researchImageInput.value = '';
    if (researchImagePreview) {
      if (item.image) {
        researchImagePreview.src = resolveImageUrl(item.image);
        researchImagePreview.hidden = false;
      } else {
        researchImagePreview.hidden = true;
        researchImagePreview.removeAttribute('src');
      }
    }

    renderResearchTimeline(item);
    papersTable.renderTable();
    milestonesTable.renderTable();
    resourcesTable.renderTable();
    renderResearchTasks(item);
    renderResearchProgress();
  }

  function renderResearchTimeline(item) {
    if (!researchTimelineEl) return;
    const logs = Array.isArray(item.logs) ? [...item.logs].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')) : [];
    if (logs.length === 0) {
      researchTimelineEl.innerHTML = '<p class="admin-text">No diary entries yet. Add your first update above.</p>';
      return;
    }
    researchTimelineEl.innerHTML = logs.map(log => `
      <div class="research-timeline-item">
        <span class="research-timeline-date">${escapeHtml(log.date || '')}</span>
        <p class="research-timeline-note">${escapeHtml(log.note)}</p>
        <button type="button" class="research-timeline-delete" data-log-id="${log.id}">Remove</button>
      </div>
    `).join('');

    researchTimelineEl.querySelectorAll('.research-timeline-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!selectedResearchId || !confirm('Remove this diary entry?')) return;
        try {
          const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}/logs/${btn.getAttribute('data-log-id')}`, { method: 'DELETE' });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Delete failed');
          await fetchResearch();
          renderResearchTimeline(cachedResearch.find(r => r.id === selectedResearchId) || {});
          renderResearchProgress();
        } catch (err) {
          alert(`Could not remove entry: ${err.message}`);
        }
      });
    });
  }

  // Tasks are a checklist, not a table, so they get their own small
  // renderer rather than going through setupResearchSubTable — but still
  // use the same generic /tasks sub-resource routes on the backend.
  function renderResearchTasks(item) {
    if (!researchTaskListEl) return;
    const tasks = Array.isArray(item.tasks)
      ? [...item.tasks].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1))
      : [];
    if (tasks.length === 0) {
      researchTaskListEl.innerHTML = '<p class="admin-text">No tasks yet. Add your first one above.</p>';
      return;
    }
    researchTaskListEl.innerHTML = tasks.map(t => `
      <div class="research-task-item ${t.done ? 'done' : ''}">
        <label class="research-task-check">
          <input type="checkbox" class="research-task-checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''} />
          <span class="research-task-text">${escapeHtml(t.title)}</span>
        </label>
        ${t.dueDate ? `<span class="research-task-due">${escapeHtml(t.dueDate)}</span>` : ''}
        <button type="button" class="research-task-delete" data-id="${t.id}" aria-label="Delete task">✕</button>
      </div>
    `).join('');

    researchTaskListEl.querySelectorAll('.research-task-checkbox').forEach(cb => {
      cb.addEventListener('change', async () => {
        if (!selectedResearchId) return;
        try {
          const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}/tasks/${cb.getAttribute('data-id')}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ done: cb.checked })
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Update failed');
          await fetchResearch();
          renderResearchTasks(cachedResearch.find(r => r.id === selectedResearchId) || {});
          renderResearchProgress();
        } catch (err) {
          alert(`Could not update task: ${err.message}`);
        }
      });
    });

    researchTaskListEl.querySelectorAll('.research-task-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!selectedResearchId || !confirm('Delete this task?')) return;
        try {
          const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}/tasks/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Delete failed');
          await fetchResearch();
          renderResearchTasks(cachedResearch.find(r => r.id === selectedResearchId) || {});
          renderResearchProgress();
        } catch (err) {
          alert(`Could not delete: ${err.message}`);
        }
      });
    });
  }

  if (researchTaskForm) {
    researchTaskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedResearchId) return;

      const titleInput = document.getElementById('task-title');
      const dueInput = document.getElementById('task-due');
      if (!titleInput || !titleInput.value.trim()) return;

      try {
        const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: titleInput.value.trim(), dueDate: dueInput ? dueInput.value : '' })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Could not add task');

        await fetchResearch();
        renderResearchTasks(cachedResearch.find(r => r.id === selectedResearchId) || {});
        renderResearchProgress();
        titleInput.value = '';
        if (dueInput) dueInput.value = '';
      } catch (err) {
        alert(`Could not add task: ${err.message}`);
      }
    });
  }

  if (btnExportResearch) {
    btnExportResearch.addEventListener('click', () => {
      if (!selectedResearchId) return;
      const project = cachedResearch.find(r => r.id === selectedResearchId);
      if (!project) return;
      const exportData = { ...project };
      delete exportData._id;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project.title || 'research-project').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Shared helper powering the Literature / Schedule / Resources tables —
  // each is a nested array on the selected research project, with its own
  // add-form, plain JSON POST/PUT/DELETE, and table render.
  function setupResearchSubTable(cfg) {
    function getItems() {
      const project = cachedResearch.find(r => r.id === selectedResearchId);
      return (project && Array.isArray(project[cfg.fieldName])) ? project[cfg.fieldName] : [];
    }

    function resetForm() {
      if (cfg.form) cfg.form.reset();
      if (cfg.idInput) cfg.idInput.value = '';
      if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
      if (cfg.submitBtn) cfg.submitBtn.querySelector('span').textContent = cfg.submitLabels.add;
    }

    function renderTable() {
      if (!cfg.tableBody) return;
      const items = getItems();
      if (items.length === 0) {
        cfg.tableBody.innerHTML = `<tr><td colspan="${cfg.colSpan}" class="research-table-empty">${cfg.emptyText}</td></tr>`;
        return;
      }
      cfg.tableBody.innerHTML = items.map(cfg.renderRow).join('');

      cfg.tableBody.querySelectorAll('.rt-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = items.find(i => i.id === btn.getAttribute('data-id'));
          if (!item) return;
          if (cfg.idInput) cfg.idInput.value = item.id;
          cfg.fields.forEach(f => {
            if (f.el) f.el.value = (item[f.key] !== undefined && item[f.key] !== null) ? item[f.key] : '';
          });
          if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'inline-flex';
          if (cfg.submitBtn) cfg.submitBtn.querySelector('span').textContent = cfg.submitLabels.edit;
          if (cfg.fields[0] && cfg.fields[0].el) cfg.fields[0].el.focus();
        });
      });

      cfg.tableBody.querySelectorAll('.rt-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!selectedResearchId || !confirm(cfg.confirmDeleteText)) return;
          try {
            const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}/${cfg.fieldName}/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || 'Delete failed');
            await fetchResearch();
            renderTable();
            renderResearchProgress();
          } catch (err) {
            alert(`Could not remove: ${err.message}`);
          }
        });
      });
    }

    if (cfg.cancelBtn) cfg.cancelBtn.addEventListener('click', resetForm);

    if (cfg.form) {
      cfg.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedResearchId) return;

        const payload = {};
        cfg.fields.forEach(f => { payload[f.key] = f.el ? f.el.value.trim() : ''; });

        const existingId = cfg.idInput ? cfg.idInput.value : '';
        const url = existingId
          ? `${API_BASE}/api/research/${selectedResearchId}/${cfg.fieldName}/${existingId}`
          : `${API_BASE}/api/research/${selectedResearchId}/${cfg.fieldName}`;
        const method = existingId ? 'PUT' : 'POST';

        try {
          const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Save failed');
          await fetchResearch();
          renderTable();
          renderResearchProgress();
          resetForm();
        } catch (err) {
          alert(`Could not save: ${err.message}`);
        }
      });
    }

    return { renderTable, resetForm };
  }

  const papersTable = setupResearchSubTable({
    fieldName: 'papers',
    form: document.getElementById('research-paper-form'),
    idInput: document.getElementById('paper-edit-id'),
    cancelBtn: document.getElementById('btn-cancel-paper-edit'),
    submitBtn: document.getElementById('btn-save-paper'),
    submitLabels: { add: 'Add Paper', edit: 'Update Paper' },
    tableBody: document.getElementById('papers-table-body'),
    colSpan: 6,
    emptyText: 'No papers added yet.',
    confirmDeleteText: 'Remove this paper?',
    fields: [
      { key: 'title', el: document.getElementById('paper-title') },
      { key: 'authors', el: document.getElementById('paper-authors') },
      { key: 'link', el: document.getElementById('paper-link') },
      { key: 'status', el: document.getElementById('paper-status') },
      { key: 'progress', el: document.getElementById('paper-progress') },
      { key: 'notes', el: document.getElementById('paper-notes') }
    ],
    renderRow: (p) => `
      <tr>
        <td>${p.link ? `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.title)}</a>` : escapeHtml(p.title)}</td>
        <td>${escapeHtml(p.authors || '')}</td>
        <td><span class="research-status-badge status-${(p.status || 'Not Started').replace(/\s+/g, '-').toLowerCase()}">${escapeHtml(p.status || 'Not Started')}</span></td>
        <td>${p.progress !== undefined && p.progress !== '' && p.progress !== null ? escapeHtml(String(p.progress)) + '%' : '—'}</td>
        <td>${escapeHtml(p.notes || '')}</td>
        <td class="research-table-actions">
          <button type="button" class="btn-icon-action rt-edit" data-id="${p.id}">Edit</button>
          <button type="button" class="btn-icon-action rt-delete" data-id="${p.id}">Delete</button>
        </td>
      </tr>`
  });

  const milestonesTable = setupResearchSubTable({
    fieldName: 'milestones',
    form: document.getElementById('research-milestone-form'),
    idInput: document.getElementById('milestone-edit-id'),
    cancelBtn: document.getElementById('btn-cancel-milestone-edit'),
    submitBtn: document.getElementById('btn-save-milestone'),
    submitLabels: { add: 'Add Phase', edit: 'Update Phase' },
    tableBody: document.getElementById('milestones-table-body'),
    colSpan: 6,
    emptyText: 'No schedule phases added yet.',
    confirmDeleteText: 'Remove this phase?',
    fields: [
      { key: 'task', el: document.getElementById('milestone-task') },
      { key: 'startDate', el: document.getElementById('milestone-start') },
      { key: 'endDate', el: document.getElementById('milestone-end') },
      { key: 'status', el: document.getElementById('milestone-status') },
      { key: 'notes', el: document.getElementById('milestone-notes') }
    ],
    renderRow: (m) => `
      <tr>
        <td>${escapeHtml(m.task)}</td>
        <td>${escapeHtml(m.startDate || '—')}</td>
        <td>${escapeHtml(m.endDate || '—')}</td>
        <td><span class="research-status-badge status-${(m.status || 'Not Started').replace(/\s+/g, '-').toLowerCase()}">${escapeHtml(m.status || 'Not Started')}</span></td>
        <td>${escapeHtml(m.notes || '')}</td>
        <td class="research-table-actions">
          <button type="button" class="btn-icon-action rt-edit" data-id="${m.id}">Edit</button>
          <button type="button" class="btn-icon-action rt-delete" data-id="${m.id}">Delete</button>
        </td>
      </tr>`
  });

  const resourcesTable = setupResearchSubTable({
    fieldName: 'resources',
    form: document.getElementById('research-resource-form'),
    idInput: document.getElementById('resource-edit-id'),
    cancelBtn: document.getElementById('btn-cancel-resource-edit'),
    submitBtn: document.getElementById('btn-save-resource'),
    submitLabels: { add: 'Add Resource', edit: 'Update Resource' },
    tableBody: document.getElementById('resources-table-body'),
    colSpan: 5,
    emptyText: 'No resources saved yet.',
    confirmDeleteText: 'Remove this resource?',
    fields: [
      { key: 'title', el: document.getElementById('resource-title') },
      { key: 'url', el: document.getElementById('resource-url') },
      { key: 'type', el: document.getElementById('resource-type') },
      { key: 'notes', el: document.getElementById('resource-notes') }
    ],
    renderRow: (r) => `
      <tr>
        <td>${escapeHtml(r.title)}</td>
        <td>${escapeHtml(r.type || 'Other')}</td>
        <td>${r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : '—'}</td>
        <td>${escapeHtml(r.notes || '')}</td>
        <td class="research-table-actions">
          <button type="button" class="btn-icon-action rt-edit" data-id="${r.id}">Edit</button>
          <button type="button" class="btn-icon-action rt-delete" data-id="${r.id}">Delete</button>
        </td>
      </tr>`
  });

  // Progress tab: pure-CSS donut charts (conic-gradient) + stacked status
  // bars built from the papers/milestones/logs already cached — no chart
  // library needed.
  function renderResearchProgress() {
    if (!researchProgressGrid || !selectedResearchId) return;
    const project = cachedResearch.find(r => r.id === selectedResearchId);
    if (!project) return;

    const papers = Array.isArray(project.papers) ? project.papers : [];
    const milestones = Array.isArray(project.milestones) ? project.milestones : [];
    const logs = Array.isArray(project.logs) ? project.logs : [];
    const tasks = Array.isArray(project.tasks) ? project.tasks : [];

    function countByStatus(list) {
      const counts = { 'Not Started': 0, 'In Progress': 0, Completed: 0 };
      list.forEach(item => {
        const s = item.status || 'Not Started';
        counts[s] = (counts[s] || 0) + 1;
      });
      return counts;
    }

    const paperCounts = countByStatus(papers);
    const milestoneCounts = countByStatus(milestones);
    const totalPapers = papers.length;
    const totalMilestones = milestones.length;

    const avgProgress = totalPapers > 0
      ? Math.round(papers.reduce((sum, p) => {
          const pct = parseInt(p.progress, 10);
          return sum + (Number.isFinite(pct) ? pct : (p.status === 'Completed' ? 100 : 0));
        }, 0) / totalPapers)
      : 0;
    const milestonePct = totalMilestones > 0 ? Math.round((milestoneCounts.Completed / totalMilestones) * 100) : 0;

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.done).length;
    const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const nextDeadline = milestones
      .filter(m => m.status !== 'Completed' && m.endDate)
      .sort((a, b) => a.endDate.localeCompare(b.endDate))[0];

    function donut(pct, color) {
      return `<div class="research-donut" style="--pct:${pct}; --donut-color:${color};"><span class="research-donut-value">${pct}%</span></div>`;
    }

    function statusBar(counts, total) {
      if (total === 0) return '<p class="admin-text">No data yet.</p>';
      const pct = (n) => Math.round((n / total) * 100);
      return `
        <div class="research-stackbar">
          <div class="research-stackbar-seg seg-completed" style="width:${pct(counts.Completed)}%"></div>
          <div class="research-stackbar-seg seg-inprogress" style="width:${pct(counts['In Progress'])}%"></div>
          <div class="research-stackbar-seg seg-notstarted" style="width:${pct(counts['Not Started'])}%"></div>
        </div>
        <div class="research-stackbar-legend">
          <span><i class="dot dot-completed"></i>Completed (${counts.Completed})</span>
          <span><i class="dot dot-inprogress"></i>In Progress (${counts['In Progress']})</span>
          <span><i class="dot dot-notstarted"></i>Not Started (${counts['Not Started']})</span>
        </div>`;
    }

    researchProgressGrid.innerHTML = `
      <div class="research-chart-card">
        <h5>Average Reading Progress</h5>
        ${donut(avgProgress, 'var(--accent-primary)')}
        <p class="admin-text">${paperCounts.Completed} of ${totalPapers} papers completed</p>
      </div>
      <div class="research-chart-card">
        <h5>Milestones Completed</h5>
        ${donut(milestonePct, 'var(--accent-secondary)')}
        <p class="admin-text">${milestoneCounts.Completed} of ${totalMilestones} phases done</p>
      </div>
      <div class="research-chart-card">
        <h5>Tasks Completed</h5>
        ${donut(taskPct, 'var(--success)')}
        <p class="admin-text">${doneTasks} of ${totalTasks} tasks done</p>
      </div>
      <div class="research-chart-card">
        <h5>Next Deadline</h5>
        ${nextDeadline
          ? `<p class="research-next-deadline">${escapeHtml(nextDeadline.task)}</p><p class="admin-text">${escapeHtml(nextDeadline.endDate)}</p>`
          : '<p class="admin-text">No upcoming deadlines set.</p>'}
      </div>
      <div class="research-chart-card research-chart-wide">
        <h5>Literature Review Breakdown</h5>
        ${statusBar(paperCounts, totalPapers)}
      </div>
      <div class="research-chart-card research-chart-wide">
        <h5>Schedule Breakdown</h5>
        ${statusBar(milestoneCounts, totalMilestones)}
      </div>
      <div class="research-chart-card research-chart-wide">
        <h5>Diary Activity</h5>
        <p class="admin-text">${logs.length} ${logs.length === 1 ? 'entry' : 'entries'} logged so far.</p>
      </div>
    `;
  }

  if (researchImageInput && researchImagePreview) {
    researchImageInput.addEventListener('change', () => {
      const file = researchImageInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        researchImagePreview.src = e.target.result;
        researchImagePreview.hidden = false;
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnNewResearch) {
    btnNewResearch.addEventListener('click', () => {
      selectedResearchId = null;
      renderResearchProjectList();
      showResearchForm(true);
      if (researchForm) researchForm.reset();
      if (researchIdInput) researchIdInput.value = '';
      if (researchDetailTitleEl) researchDetailTitleEl.textContent = 'New Research Project';
      if (researchImagePreview) {
        researchImagePreview.hidden = true;
        researchImagePreview.removeAttribute('src');
      }
      if (researchTimelineEl) researchTimelineEl.innerHTML = '';
      if (researchTaskListEl) researchTaskListEl.innerHTML = '';
      papersTable.renderTable();
      milestonesTable.renderTable();
      resourcesTable.renderTable();
      if (researchProgressGrid) researchProgressGrid.innerHTML = '<p class="admin-text">Save the project first to see progress charts.</p>';
      const titleField = researchFields.find(f => f.key === 'title');
      if (titleField && titleField.el) titleField.el.focus();
    });
  }

  if (researchForm) {
    researchForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleField = researchFields.find(f => f.key === 'title');
      if (!titleField.el || !titleField.el.value.trim()) {
        alert('Please enter a title.');
        return;
      }

      const formData = new FormData();
      researchFields.forEach(f => {
        if (!f.el) return;
        formData.append(f.key, f.el.value.trim());
      });
      if (researchImageInput && researchImageInput.files[0]) {
        formData.append('image', researchImageInput.files[0]);
      }

      const url = selectedResearchId ? `${API_BASE}/api/research/${selectedResearchId}` : `${API_BASE}/api/research`;
      const method = selectedResearchId ? 'PUT' : 'POST';

      const saveBtn = document.getElementById('btn-save-research');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const res = await authFetch(url, { method, body: formData });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Save failed');

        await fetchResearch();
        selectResearchProject(json.data.id);
      } catch (err) {
        alert(`Could not save: ${err.message}`);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  if (btnDeleteResearch) {
    btnDeleteResearch.addEventListener('click', async () => {
      if (!selectedResearchId || !confirm('Delete this entire research project, including its diary, papers, schedule and resources?')) return;
      try {
        const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Delete failed');
        await fetchResearch();
        showResearchEmptyState();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }

  if (researchDiaryForm) {
    researchDiaryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedResearchId) return;

      const dateInput = document.getElementById('diary-date');
      const noteInput = document.getElementById('diary-note');
      if (!noteInput || !noteInput.value.trim()) return;

      try {
        const res = await authFetch(`${API_BASE}/api/research/${selectedResearchId}/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateInput ? dateInput.value : '', note: noteInput.value.trim() })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Could not add entry');

        await fetchResearch();
        renderResearchTimeline(cachedResearch.find(r => r.id === selectedResearchId) || {});
        renderResearchProgress();
        noteInput.value = '';
        if (dateInput) dateInput.value = '';
      } catch (err) {
        alert(`Could not add diary entry: ${err.message}`);
      }
    });
  }

  /* ==================== 11. SKILLS RENDERING (grouped by category) ==================== */
  async function renderSkills() {
    const skillsGrid = document.getElementById('skills-grid');
    if (!skillsGrid) return;
    const skills = await fetchSkills();

    const groups = [];
    const groupMap = {};
    skills.forEach(s => {
      const cat = s.category || 'Other';
      if (!groupMap[cat]) {
        groupMap[cat] = { category: cat, items: [] };
        groups.push(groupMap[cat]);
      }
      groupMap[cat].items.push(s);
    });

    if (groups.length === 0) {
      skillsGrid.innerHTML = '<p class="admin-text">No skills added yet.</p>';
    } else {
      skillsGrid.innerHTML = groups.map(g => {
        const hasBars = g.items.some(s => s.level !== undefined && s.level !== null && s.level !== '');

        const rows = g.items.map(s => {
          if (hasBars) {
            const lvl = (s.level !== undefined && s.level !== null && s.level !== '') ? Math.max(0, Math.min(100, s.level)) : 0;
            return `
              <div class="skill-item">
                <div class="skill-info">
                  <span class="skill-name">${escapeHtml(s.title)}</span>
                  ${s.badge ? `<span class="skill-badge">${escapeHtml(s.badge)}</span>` : ''}
                </div>
                <div class="skill-bar"><div class="skill-progress" style="width: ${lvl}%;"></div></div>
              </div>`;
          }
          return `<span class="tag">${escapeHtml(s.title)}</span>`;
        });

        const itemsWrap = hasBars
          ? `<div class="skill-items">${rows.join('')}</div>`
          : `<div class="skill-tags">${rows.join('')}</div>`;

        return `
          <div class="skill-category-card reveal active">
            <div class="category-header">
              <div class="category-icon">${getSkillCategoryIcon(g.category)}</div>
              <div>
                <h3 class="category-title">${escapeHtml(g.category)}</h3>
              </div>
            </div>
            ${itemsWrap}
          </div>`;
      }).join('');
    }

    skillsAdmin.renderList();
  }

  /* ==================== 12. EDUCATION TIMELINE RENDERING ==================== */
  async function renderEducation() {
    const timeline = document.getElementById('education-timeline');
    if (!timeline) return;
    const items = await fetchEducation();

    if (items.length === 0) {
      timeline.innerHTML = '<p class="admin-text">No education entries added yet.</p>';
    } else {
      timeline.innerHTML = items.map((edu, i) => {
        const icon = educationIcons[i % educationIcons.length];
        const isActive = /current|enroll|ongoing|present/i.test(edu.status || '');
        const tags = Array.isArray(edu.tags) && edu.tags.length
          ? `<div class="timeline-tags">${edu.tags.map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>`
          : '';
        const thumb = edu.image ? `<img class="entry-thumb" src="${resolveImageUrl(edu.image)}" alt="${escapeHtml(edu.title)}" />` : '';

        return `
          <div class="timeline-item reveal active">
            <div class="timeline-marker"><div class="timeline-icon">${icon}</div></div>
            <div class="timeline-content card">
              <div class="timeline-header">
                <div>
                  ${edu.period ? `<span class="timeline-period">${escapeHtml(edu.period)}</span>` : ''}
                  <h3 class="timeline-title">${escapeHtml(edu.title)}</h3>
                </div>
                ${edu.status ? `<span class="status-tag ${isActive ? 'active' : ''}">${escapeHtml(edu.status)}</span>` : ''}
                ${thumb}
              </div>
              ${edu.degree ? `<h4 class="timeline-subtitle">${escapeHtml(edu.degree)}</h4>` : ''}
              ${edu.description ? `<p class="timeline-description">${escapeHtml(edu.description)}</p>` : ''}
              ${tags}
            </div>
          </div>`;
      }).join('');
    }

    educationAdmin.renderList();
  }

  /* ==================== 13. EXPERIENCE & ACTIVITIES RENDERING ==================== */
  async function renderExperience() {
    const grid = document.getElementById('experience-grid');
    if (!grid) return;
    const items = await fetchExperience();

    if (items.length === 0) {
      grid.innerHTML = '<p class="admin-text">No experience entries added yet.</p>';
    } else {
      grid.innerHTML = items.map((exp, i) => {
        const icon = experienceIcons[i % experienceIcons.length];
        const tags = Array.isArray(exp.tags) && exp.tags.length
          ? `<div class="activity-highlights">${exp.tags.map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>`
          : '';
        const thumb = exp.image ? `<img class="entry-thumb" src="${resolveImageUrl(exp.image)}" alt="${escapeHtml(exp.title)}" />` : '';

        return `
          <div class="activity-card reveal active">
            <div class="activity-header">
              <div class="activity-icon">${icon}</div>
              <div>
                <h3 class="activity-title">${escapeHtml(exp.title)}</h3>
                ${exp.badge ? `<span class="activity-badge">${escapeHtml(exp.badge)}</span>` : ''}
              </div>
              ${thumb}
            </div>
            ${exp.description ? `<p class="activity-text">${escapeHtml(exp.description)}</p>` : ''}
            ${tags}
          </div>`;
      }).join('');
    }

    experienceAdmin.renderList();
  }

  /* ==================== 14. EVENTS RENDERING ==================== */
  async function renderEvents() {
    const grid = document.getElementById('events-grid');
    const emptyMsg = document.getElementById('events-empty-msg');
    if (!grid) return;
    const items = await fetchEvents();

    if (emptyMsg) emptyMsg.hidden = items.length !== 0;

    grid.innerHTML = items.map((ev, i) => {
      const bannerClass = `project-banner-${(i % 4) + 1}`;
      const bannerMedia = ev.image
        ? `<img class="project-banner-img" src="${resolveImageUrl(ev.image)}" alt="${escapeHtml(ev.title)}" />`
        : `<div class="banner-icon">${getEventIcon()}</div>`;

      const metaParts = [];
      if (ev.date) metaParts.push(`<span>${escapeHtml(ev.date)}</span>`);
      if (ev.location) metaParts.push(`<span>${escapeHtml(ev.location)}</span>`);

      const linkBtn = ev.link
        ? `<div class="project-actions">
            <a href="${escapeHtml(ev.link)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>View</span>
            </a>
          </div>`
        : '';

      return `
        <article class="project-card reveal active">
          <div class="project-banner ${bannerClass}">
            <div class="project-badge">${escapeHtml(getEventTypeLabel(ev.type))}</div>
            ${bannerMedia}
          </div>
          <div class="project-body">
            <h3 class="project-title">${escapeHtml(ev.title)}</h3>
            ${metaParts.length ? `<div class="event-meta">${metaParts.join('')}</div>` : ''}
            ${ev.description ? `<p class="project-description">${escapeHtml(ev.description)}</p>` : ''}
            ${linkBtn}
          </div>
        </article>`;
    }).join('');

    eventsAdmin.renderList();
  }

  /* ==================== 15. CERTIFICATES RENDERING ==================== */
  async function renderCertificates() {
    const grid = document.getElementById('certificates-grid');
    if (!grid) return;
    const items = await fetchCertificates();

    if (items.length === 0) {
      grid.innerHTML = '<p class="admin-text">No certificates added yet.</p>';
    } else {
      grid.innerHTML = items.map(c => {
        const thumb = c.image ? `<img class="cert-thumb" src="${resolveImageUrl(c.image)}" alt="${escapeHtml(c.title)}" />` : '';
        return `
          <div class="certificate-card reveal active">
            <div class="cert-header">
              <div class="cert-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg></div>
              ${c.date ? `<span class="cert-status">${escapeHtml(c.date)}</span>` : ''}
            </div>
            ${thumb}
            <h3 class="cert-title">${escapeHtml(c.title)}</h3>
            ${c.organization ? `<p class="cert-issuer"><strong>Issuing Org:</strong> ${escapeHtml(c.organization)}</p>` : ''}
            ${c.date ? `<p class="cert-date"><strong>Date:</strong> ${escapeHtml(c.date)}</p>` : ''}
            ${c.description ? `<p class="cert-desc">${escapeHtml(c.description)}</p>` : ''}
            <button
              class="btn btn-sm btn-outline btn-cert-preview"
              data-title="${escapeHtml(c.title)}"
              data-org="${escapeHtml(c.organization || '')}"
              data-date="${escapeHtml(c.date || '')}"
              data-details="${escapeHtml(c.description || '')}"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View Certificate</span>
            </button>
          </div>`;
      }).join('');

      grid.querySelectorAll('.btn-cert-preview').forEach(btn => {
        btn.addEventListener('click', () => {
          openCertModal(
            btn.getAttribute('data-title'),
            btn.getAttribute('data-org'),
            btn.getAttribute('data-date'),
            btn.getAttribute('data-details')
          );
        });
      });
    }

    certificatesAdmin.renderList();
  }

  /* ==================== 16. PROFILE, ABOUT & CONTACT CUSTOMIZATION ==================== */
  const manageProfileForm = document.getElementById('manage-profile-form');
  const profName = document.getElementById('prof-name');
  const profDegree = document.getElementById('prof-degree');
  const profEmail = document.getElementById('prof-email');
  const profPhone = document.getElementById('prof-phone');
  const profLinkedin = document.getElementById('prof-linkedin');
  const profGithub = document.getElementById('prof-github');
  const profLocation = document.getElementById('prof-location');
  const profBio = document.getElementById('prof-bio');
  const profAbout = document.getElementById('prof-about');
  const profImageFile = document.getElementById('prof-image-file');

  async function populateProfileForm() {
    const profile = await fetchProfile();
    if (!profile) return;
    if (profName && profile.name) profName.value = profile.name;
    if (profDegree && profile.degree) profDegree.value = profile.degree;
    if (profEmail && profile.email) profEmail.value = profile.email;
    if (profPhone && profile.phone) profPhone.value = profile.phone;
    if (profLinkedin && profile.linkedin) profLinkedin.value = profile.linkedin;
    if (profGithub && profile.github) profGithub.value = profile.github;
    if (profLocation && profile.location) profLocation.value = profile.location;
    if (profBio && profile.bio) profBio.value = profile.bio;
    if (profAbout && profile.about) profAbout.value = profile.about;
  }

  function renderAboutText(profile) {
    const container = document.getElementById('about-text-container');
    if (!container) return;
    const text = (profile && profile.about) || '';
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    container.innerHTML = paragraphs.length
      ? paragraphs.map(p => `<p class="about-text">${escapeHtml(p)}</p>`).join('')
      : '<p class="about-text">Add your story from Manage Projects &rarr; Profile &amp; Links &rarr; About Me.</p>';
  }

  async function applyStoredProfile() {
    const profile = await fetchProfile();
    if (!profile) return;

    if (profile.name) {
      document.querySelectorAll('.logo-text, #current-year + strong, .placeholder-name').forEach(el => {
        el.textContent = profile.name.toUpperCase();
      });
    }

    if (profile.email) {
      document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
        el.setAttribute('href', `mailto:${profile.email}`);
        if (el.classList.contains('contact-detail-val')) el.textContent = profile.email;
      });
    }

    const phoneItem = document.getElementById('contact-phone-item');
    const phoneLink = document.getElementById('contact-phone-link');
    if (profile.phone) {
      if (phoneItem) phoneItem.hidden = false;
      if (phoneLink) {
        phoneLink.setAttribute('href', `tel:${profile.phone.replace(/\s+/g, '')}`);
        phoneLink.textContent = profile.phone;
      }
    } else if (phoneItem) {
      phoneItem.hidden = true;
    }

    if (profile.linkedin) {
      document.querySelectorAll('a[href*="linkedin.com"]').forEach(el => {
        el.setAttribute('href', profile.linkedin);
        if (el.classList.contains('contact-detail-val')) el.textContent = profile.linkedin;
      });
    }

    if (profile.github) {
      document.querySelectorAll('a[href*="github.com"]').forEach(el => {
        el.setAttribute('href', profile.github);
        if (el.classList.contains('contact-detail-val')) el.textContent = profile.github;
      });
    }

    const locationVal = document.getElementById('contact-location-val');
    if (profile.location && locationVal) locationVal.textContent = profile.location;

    if (profile.photo) {
      const pImg = document.getElementById('profile-img');
      const pFb = document.getElementById('profile-fallback');
      if (pImg) {
        pImg.src = resolveImageUrl(profile.photo);
        pImg.style.display = 'block';
        if (pFb) pFb.style.display = 'none';
      }
    }

    renderAboutText(profile);
  }

  // Instant local preview of the selected profile photo (saved to the backend on submit)
  if (profImageFile) {
    profImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const pImg = document.getElementById('profile-img');
          const pFb = document.getElementById('profile-fallback');
          if (pImg) {
            pImg.src = event.target.result;
            pImg.style.display = 'block';
            if (pFb) pFb.style.display = 'none';
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (manageProfileForm) {
    manageProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData();
      if (profName.value.trim()) formData.append('name', profName.value.trim());
      if (profDegree.value.trim()) formData.append('degree', profDegree.value.trim());
      if (profEmail.value.trim()) formData.append('email', profEmail.value.trim());
      if (profPhone.value.trim()) formData.append('phone', profPhone.value.trim());
      if (profLinkedin.value.trim()) formData.append('linkedin', profLinkedin.value.trim());
      if (profGithub.value.trim()) formData.append('github', profGithub.value.trim());
      if (profLocation.value.trim()) formData.append('location', profLocation.value.trim());
      if (profBio.value.trim()) formData.append('bio', profBio.value.trim());
      if (profAbout.value.trim()) formData.append('about', profAbout.value.trim());
      if (profImageFile && profImageFile.files[0]) {
        formData.append('photo', profImageFile.files[0]);
      }

      const submitBtn = manageProfileForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await authFetch(API_PROFILE, { method: 'POST', body: formData });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Save failed');

        await applyStoredProfile();
        if (profImageFile) profImageFile.value = '';
        alert('Profile details updated successfully!');
      } catch (err) {
        alert(`Could not save profile: ${err.message}`);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ==================== 17. CHANGE PASSWORD ==================== */
  const changePasswordForm = document.getElementById('change-password-form');
  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;

      if (newPassword.length < 6) {
        alert('New password must be at least 6 characters.');
        return;
      }

      const btn = changePasswordForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      try {
        const res = await authFetch(`${API_BASE}/api/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Could not change password.');

        changePasswordForm.reset();
        alert('Password updated successfully!');
      } catch (err) {
        alert(`Could not change password: ${err.message}`);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  /* ==================== 17b. CONTACT MESSAGES INBOX (owner only) ==================== */
  async function fetchMessages() {
    try {
      const res = await authFetch(`${API_BASE}/api/messages`);
      const json = await res.json();
      return json.success ? json.data : [];
    } catch (e) {
      console.warn('Could not reach backend for messages:', e);
      return [];
    }
  }

  async function renderMessagesAdmin() {
    const list = document.getElementById('admin-messages-list');
    const countBadge = document.getElementById('messages-tab-count');
    if (!list) return;

    if (!isLoggedIn()) {
      list.innerHTML = '';
      if (countBadge) countBadge.hidden = true;
      return;
    }

    const messages = await fetchMessages();

    if (countBadge) {
      if (messages.length > 0) {
        countBadge.textContent = messages.length;
        countBadge.hidden = false;
      } else {
        countBadge.hidden = true;
      }
    }

    if (messages.length === 0) {
      list.innerHTML = '<p class="admin-text">No messages yet. Submissions from your Contact form will appear here.</p>';
      return;
    }

    list.innerHTML = messages.map(m => `
      <div class="admin-message-item">
        <div class="admin-message-header">
          <div>
            <span class="admin-message-sender">${escapeHtml(m.name)}</span>
            <a href="mailto:${escapeHtml(m.email)}" class="admin-message-email">${escapeHtml(m.email)}</a>
          </div>
          <span class="admin-message-date">${escapeHtml(new Date(m.createdAt).toLocaleString())}</span>
        </div>
        <p class="admin-message-text">${escapeHtml(m.message)}</p>
        <div class="admin-proj-actions">
          <button class="btn-icon-action btn-delete" data-id="${m.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        const id = btn.getAttribute('data-id');
        try {
          const res = await authFetch(`${API_BASE}/api/messages/${id}`, { method: 'DELETE' });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || 'Delete failed');
          renderMessagesAdmin();
        } catch (err) {
          alert(`Could not delete message: ${err.message}`);
        }
      });
    });
  }

  /* ==================== 18. BACKUP, EXPORT & RESET ==================== */
  const btnExportData = document.getElementById('btn-export-data');
  const btnResetData = document.getElementById('btn-reset-data');

  if (btnExportData) {
    btnExportData.addEventListener('click', async () => {
      const exportObj = {
        projects: await fetchProjects(),
        profile: await fetchProfile(),
        skills: await fetchSkills(),
        education: await fetchEducation(),
        experience: await fetchExperience(),
        certificates: await fetchCertificates(),
        events: await fetchEvents(),
        messages: await fetchMessages()
      };
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportObj, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'portfolio_data_backup.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  if (btnResetData) {
    btnResetData.addEventListener('click', async () => {
      if (!confirm('Reset all content to the original default template? This will permanently delete any uploaded photos.')) return;
      try {
        const res = await authFetch(`${API_BASE}/api/reset`, { method: 'POST' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Reset failed');
        location.reload();
      } catch (err) {
        alert(`Could not reset data: ${err.message}`);
      }
    });
  }

  /* ==================== 19. INITIAL RENDER ==================== */
  updateAuthUI();
  renderProjects();
  applyStoredProfile();
  renderSkills();
  renderEducation();
  renderExperience();
  renderCertificates();
  renderEvents();

  /* ==================== 20. DYNAMIC COPYRIGHT YEAR ==================== */
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  /* ==================== 21. PROFILE IMAGE FALLBACK HANDLER ==================== */
  const profileImg = document.getElementById('profile-img');
  const profileFallback = document.getElementById('profile-fallback');

  if (profileImg && profileFallback) {
    profileImg.addEventListener('error', () => {
      profileImg.style.display = 'none';
      profileFallback.style.display = 'flex';
    });

    if (!profileImg.complete || profileImg.naturalWidth === 0) {
      const testImg = new Image();
      testImg.src = profileImg.src;
      testImg.onerror = () => {
        if (!cachedProfile?.photo) {
          profileImg.style.display = 'none';
          profileFallback.style.display = 'flex';
        }
      };
    }
  }

  /* ==================== 22. TYPING ANIMATION ==================== */
  const typedTextElement = document.getElementById('typed-text');
  const phrases = [
    'University Student',
    'Aspiring Software Developer',
    'Technology Enthusiast',
    'Database & Web Explorer',
    'Continuous Learner'
  ];

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typeSpeed = 90;

  function typeEffect() {
    if (!typedTextElement) return;

    const currentPhrase = phrases[phraseIndex];

    if (isDeleting) {
      typedTextElement.textContent = currentPhrase.substring(0, charIndex - 1);
      charIndex--;
      typeSpeed = 45;
    } else {
      typedTextElement.textContent = currentPhrase.substring(0, charIndex + 1);
      charIndex++;
      typeSpeed = 95;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
      isDeleting = true;
      typeSpeed = 1600;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      typeSpeed = 400;
    }

    setTimeout(typeEffect, typeSpeed);
  }

  typeEffect();

  /* ==================== 23. STICKY NAVBAR ON SCROLL ==================== */
  const header = document.getElementById('header');
  const backToTopBtn = document.getElementById('back-to-top');

  function handleScrollState() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    if (header) {
      if (scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    if (backToTopBtn) {
      if (scrollY > 400) {
        backToTopBtn.classList.add('show');
      } else {
        backToTopBtn.classList.remove('show');
      }
    }
  }

  window.addEventListener('scroll', handleScrollState, { passive: true });
  handleScrollState();

  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  /* ==================== 24. MOBILE NAVIGATION MENU ==================== */
  const navToggle = document.getElementById('nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  if (navToggle && navMenu) {
    const toggleMenu = () => {
      const isOpen = navMenu.classList.toggle('open');
      navToggle.classList.toggle('active');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    const closeMenu = () => {
      navMenu.classList.remove('open');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    navToggle.addEventListener('click', toggleMenu);

    navLinks.forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (e) => {
      if (navMenu.classList.contains('open') &&
          !navMenu.contains(e.target) &&
          !navToggle.contains(e.target)) {
        closeMenu();
      }
    });
  }

  /* ==================== 25. ACTIVE SECTION HIGHLIGHTING ==================== */
  const sections = document.querySelectorAll('section[id]');

  function highlightActiveNavLink() {
    const scrollY = window.pageYOffset + 120;

    sections.forEach(section => {
      const sectionHeight = section.offsetHeight;
      const sectionTop = section.offsetTop;
      const sectionId = section.getAttribute('id');
      const activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);

      if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
        navLinks.forEach(link => link.classList.remove('active'));
        if (activeLink) {
          activeLink.classList.add('active');
        }
      }
    });
  }

  window.addEventListener('scroll', highlightActiveNavLink, { passive: true });

  /* ==================== 26. SCROLL REVEAL ==================== */
  const revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('active'));
  }

  /* ==================== 27. CERTIFICATE PREVIEW MODAL ==================== */
  const certModal = document.getElementById('cert-modal');
  const modalClose = document.getElementById('modal-close');
  const modalOkBtn = document.getElementById('modal-ok-btn');
  const modalTitle = document.getElementById('modal-title');
  const modalOrg = document.getElementById('modal-org');
  const modalDate = document.getElementById('modal-date');
  const modalDetails = document.getElementById('modal-details');

  function openCertModal(title, org, date, details) {
    if (!certModal) return;
    modalTitle.textContent = title || 'Certificate Details';
    modalOrg.textContent = org || 'Issuing Organization';
    modalDate.textContent = date || 'Date of Completion';
    modalDetails.textContent = details || 'This credential validates technical competence and learning milestones.';

    certModal.classList.add('open');
    certModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeCertModal() {
    if (!certModal) return;
    certModal.classList.remove('open');
    certModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (modalClose) modalClose.addEventListener('click', closeCertModal);
  if (modalOkBtn) modalOkBtn.addEventListener('click', closeCertModal);

  if (certModal) {
    certModal.addEventListener('click', (e) => {
      if (e.target === certModal) closeCertModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (certModal && certModal.classList.contains('open')) closeCertModal();
      if (researchWorkspace && researchWorkspace.classList.contains('open')) closeResearchWorkspace();
      if (adminModal && adminModal.classList.contains('open')) closeAdminModal();
      if (loginModal && loginModal.classList.contains('open')) {
        closeLoginModal();
        pendingOpenAdminAfterLogin = false;
      }
    }
  });

  /* ==================== 28. CONTACT FORM VALIDATION ==================== */
  const contactForm = document.getElementById('contact-form');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const messageInput = document.getElementById('message');
  const formStatus = document.getElementById('form-status');
  const submitBtn = document.getElementById('btn-submit');

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  function setError(input, isError) {
    const formGroup = input.closest('.form-group');
    if (formGroup) {
      if (isError) {
        formGroup.classList.add('has-error');
      } else {
        formGroup.classList.remove('has-error');
      }
    }
  }

  [nameInput, emailInput, messageInput].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        setError(input, false);
      });
    }
  });

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let hasError = false;

      if (!nameInput.value.trim()) {
        setError(nameInput, true);
        hasError = true;
      } else {
        setError(nameInput, false);
      }

      if (!isValidEmail(emailInput.value)) {
        setError(emailInput, true);
        hasError = true;
      } else {
        setError(emailInput, false);
      }

      if (!messageInput.value.trim()) {
        setError(messageInput, true);
        hasError = true;
      } else {
        setError(messageInput, false);
      }

      if (hasError) {
        if (formStatus) {
          formStatus.className = 'form-status error';
          formStatus.textContent = 'Please correct the highlighted fields above.';
        }
        return;
      }

      const senderName = nameInput.value.trim();
      const senderEmail = emailInput.value.trim();
      const senderMessage = messageInput.value.trim();

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Sending...</span>';
      }

      try {
        const res = await fetch(`${API_BASE}/api/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: senderName, email: senderEmail, message: senderMessage })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Could not send your message.');

        if (formStatus) {
          formStatus.className = 'form-status success';
          formStatus.innerHTML = `Thank you, <strong>${senderName}</strong>! Your message has been received. Connect via LinkedIn or Email for direct inquiries.`;
        }
        contactForm.reset();
      } catch (err) {
        if (formStatus) {
          formStatus.className = 'form-status error';
          formStatus.textContent = `Could not send your message: ${err.message} Please try emailing directly instead.`;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <span>Send Message</span>
            <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          `;
        }

        setTimeout(() => {
          if (formStatus) {
            formStatus.className = 'form-status';
            formStatus.textContent = '';
          }
        }, 8000);
      }
    });
  }
});
