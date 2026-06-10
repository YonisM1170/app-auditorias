console.log("🚀 SERVIDOR INICIANDO...");
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database'); // TEMPORAL (solo auditorias)
const pg = require('./database_pg');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ POSTGRES TABLAS
async function crearTablas() {
  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username VARCHAR(80) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        rol VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pg.query(`
      CREATE TABLE IF NOT EXISTS auditorias (
        id SERIAL PRIMARY KEY,
        fecha DATE,
        orden TEXT,
        referencia TEXT,
        material TEXT,
        descripcion TEXT,
        valor_matriz TEXT,
        cantidad_requerida TEXT,
        estado TEXT,
        cantidad TEXT,
        diferencia TEXT,
        sobrante_faltante TEXT,
        novedad TEXT,
        auditor TEXT,
        mercador TEXT,
        marca TEXT,
        observaciones TEXT
      );
    `);

    await pg.query(`
      CREATE TABLE IF NOT EXISTS catalogos (
        id SERIAL PRIMARY KEY,
        tipo TEXT,
        valor TEXT
      );
    `);

    console.log("🔥 TABLAS POSTGRES LISTAS");
  } catch (err) {
    console.error("❌ Error creando tablas:", err);
  }
}
crearTablas();

// ✅ ADMIN
async function crearAdmin() {
  try {
    const hash = await bcrypt.hash('admin123', 10);

    await pg.query(
      `INSERT INTO usuarios (username, password, rol)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', hash, 'admin']
    );

    console.log("✅ Admin listo: admin / admin123");
  } catch (err) {
    console.error(err);
  }
}
crearAdmin();

// ✅ MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// ✅ HELPERS
function cleanText(value, maxLength = 255) {
  return String(value || '').trim().slice(0, maxLength);
}

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'No autorizado' });
}

function requireAdmin(req, res, next) {
  if (req.session.rol === 'admin') return next();
  res.status(403).json({ error: 'Solo admin' });
}

// ✅ LOGIN POSTGRES
app.post('/api/login', async (req, res) => {
  const username = cleanText(req.body.username);
  const password = req.body.password;

  try {
    const result = await pg.query(
      'SELECT * FROM usuarios WHERE username = $1',
      [username]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    req.session.userId = user.id;
    req.session.rol = user.rol;

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error servidor' });
  }
});

// ✅ USUARIOS POSTGRES
app.get('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const data = await pg.query('SELECT id, username, rol FROM usuarios');
  res.json(data.rows);
});

app.post('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, rol } = req.body;

  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await pg.query(
      `INSERT INTO usuarios (username, password, rol)
       VALUES ($1,$2,$3) RETURNING id,username,rol`,
      [username, hash, rol]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Usuario existente' });
  }
});

app.delete('/api/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  await pg.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ✅ AUDITORIAS (SIGUEN EN SQLITE POR AHORA)
app.post('/api/auditorias', requireAuth, (req, res) => {
  const stmt = db.prepare(`INSERT INTO auditorias (fecha, orden) VALUES (?,?)`);

  req.body.forEach(a => {
    stmt.run([a.fecha, a.orden]);
  });

  stmt.finalize();
  res.json({ success: true });
});

// ✅ START
app.listen(PORT, () => {
  console.log(`✅ App activa en puerto ${PORT}`);
});
