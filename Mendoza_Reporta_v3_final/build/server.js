const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'public', 'uploads');

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(path.join(DATA, 'mendoza-reporta.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 type TEXT NOT NULL,
 zone TEXT NOT NULL,
 description TEXT NOT NULL,
 priority TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Pendiente',
 admin_note TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS photos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 report_id INTEGER NOT NULL,
 filename TEXT NOT NULL,
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
);
`);

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@mendozareporta.local').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
if (adminPassword.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');

const existingAdmin = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
if (!existingAdmin) {
  db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
    .run('Administrador', adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cambia-esta-clave-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOADS));

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { files: 5, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF.'));
  }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Debés iniciar sesión.' });
  const user = db.prepare('SELECT id,name,email,role,active FROM users WHERE id=?').get(req.session.user.id);
  if (!user || !user.active) {
    return req.session.destroy(() => res.status(403).json({ error: 'Usuario inactivo o inexistente.' }));
  }
  req.user = user;
  req.session.user = publicUser(user);
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso exclusivo de administrador.' });
    next();
  });
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, email y contraseña de al menos 8 caracteres son obligatorios.' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO users (name,email,password_hash) VALUES (?,?,?)'
    ).run(name, email, bcrypt.hashSync(password, 12));

    const user = db.prepare(
      'SELECT id,name,email,role,active FROM users WHERE id=?'
    ).get(result.lastInsertRowid);

    req.session.user = publicUser(user);
    res.status(201).json({ user: req.session.user });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ese email ya está registrado.' });
    }
    console.error(e);
    res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);

  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }

  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/reports', requireAuth, upload.array('photos', 5), (req, res) => {
  const { type, zone, description, priority } = req.body;

  if (!type || !zone?.trim() || !description?.trim() ||
      !['Baja', 'Media', 'Alta'].includes(priority)) {
    (req.files || []).forEach(f => fs.rmSync(f.path, { force: true }));
    return res.status(400).json({ error: 'Completá todos los campos del reporte.' });
  }

  const tx = db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO reports (user_id,type,zone,description,priority) VALUES (?,?,?,?,?)'
    ).run(req.user.id, type, zone.trim(), description.trim(), priority);

    const insert = db.prepare(
      'INSERT INTO photos (report_id,filename,original_name,mime_type) VALUES (?,?,?,?)'
    );
    for (const f of (req.files || [])) {
      insert.run(r.lastInsertRowid, f.filename, f.originalname, f.mimetype);
    }
    return r.lastInsertRowid;
  });

  try {
    const id = tx();
    res.status(201).json({ id, message: 'Reporte enviado correctamente.' });
  } catch (e) {
    (req.files || []).forEach(f => fs.rmSync(f.path, { force: true }));
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar el reporte.' });
  }
});

function reportWithPhotos(id) {
  const r = db.prepare(`
    SELECT r.*, u.name AS user_name, u.email AS user_email
    FROM reports r
    JOIN users u ON u.id=r.user_id
    WHERE r.id=?
  `).get(id);
  if (!r) return null;

  r.photos = db.prepare(
    'SELECT id,filename,original_name,mime_type FROM photos WHERE report_id=? ORDER BY id'
  ).all(id).map(p => ({ ...p, url: '/uploads/' + p.filename }));

  return r;
}

app.get('/api/reports', requireAuth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`
        SELECT r.*,u.name AS user_name,u.email AS user_email
        FROM reports r JOIN users u ON u.id=r.user_id
        ORDER BY r.id DESC
      `).all()
    : db.prepare(`
        SELECT r.*,u.name AS user_name,u.email AS user_email
        FROM reports r JOIN users u ON u.id=r.user_id
        WHERE r.user_id=? ORDER BY r.id DESC
      `).all(req.user.id);

  const photos = db.prepare(
    'SELECT id,report_id,filename,original_name,mime_type FROM photos'
  ).all();

  const map = new Map();
  for (const p of photos) {
    if (!map.has(p.report_id)) map.set(p.report_id, []);
    map.get(p.report_id).push({ ...p, url: '/uploads/' + p.filename });
  }

  res.json({ reports: rows.map(r => ({ ...r, photos: map.get(r.id) || [] })) });
});

app.patch('/api/reports/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status, admin_note = '' } = req.body;

  if (!['Pendiente', 'En revisión', 'Resuelto', 'Rechazado'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  const result = db.prepare(
    'UPDATE reports SET status=?,admin_note=? WHERE id=?'
  ).run(status, String(admin_note).slice(0, 2000), id);

  if (!result.changes) return res.status(404).json({ error: 'Reporte no encontrado.' });
  res.json({ report: reportWithPhotos(id) });
});

app.delete('/api/reports/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const photos = db.prepare('SELECT filename FROM photos WHERE report_id=?').all(id);
  const result = db.prepare('DELETE FROM reports WHERE id=?').run(id);

  if (!result.changes) return res.status(404).json({ error: 'Reporte no encontrado.' });

  photos.forEach(p => fs.rmSync(path.join(UPLOADS, p.filename), { force: true }));
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id,name,email,role,active,created_at FROM users ORDER BY id DESC'
  ).all().map(u => ({ ...u, active: !!u.active }));

  res.json({ users });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No podés desactivarte a vos mismo.' });

  const target = db.prepare('SELECT id,role FROM users WHERE id=?').get(id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (target.role === 'admin') return res.status(400).json({ error: 'No se puede desactivar otra cuenta administradora desde este panel.' });

  const active = !!req.body.active;
  db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, id);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminar tu propia cuenta.' });

  const photos = db.prepare(`
    SELECT p.filename
    FROM photos p JOIN reports r ON r.id=p.report_id
    WHERE r.user_id=?
  `).all(id);

  const result = db.prepare("DELETE FROM users WHERE id=? AND role!='admin'").run(id);
  if (!result.changes) return res.status(404).json({ error: 'Usuario no encontrado o no permitido.' });

  photos.forEach(p => fs.rmSync(path.join(UPLOADS, p.filename), { force: true }));
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM reports').get().c;
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c;
  const pending = db.prepare("SELECT COUNT(*) c FROM reports WHERE status='Pendiente'").get().c;
  const resolved = db.prepare("SELECT COUNT(*) c FROM reports WHERE status='Resuelto'").get().c;
  res.json({ total, users, pending, resolved });
});

// Express 5: esta sintaxis permite cualquier ruta del frontend sin romper el servidor.
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// Errores de subida/API en JSON, para que el frontend pueda mostrar el mensaje.
app.use((err, req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Cada foto puede pesar como máximo 5 MB.' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Podés adjuntar como máximo 5 fotos.' });
  }
  if (err.message?.includes('Solo se permiten imágenes')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Mendoza Reporta activo en http://localhost:${PORT}`);
  console.log(`Administrador: ${adminEmail}`);
});
