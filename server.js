console.log("🚀 SERVIDOR INICIANDO...");
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database'); // (se mantiene por ahora)
const pg = require('./database_pg');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CREAR TABLAS POSTGRES
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

    console.log("🔥🔥🔥 TABLAS POSTGRES CREADAS 🔥🔥🔥");
  } catch (err) {
    console.error("❌ Error creando tablas:", err);
  }
}

crearTablas();

// ✅ CREAR ADMIN AUTOMÁTICO
async function crearAdmin() {
  try {
    const hash = await bcrypt.hash('admin123', 10);

    await pg.query(
      `INSERT INTO usuarios (username, password, rol)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', hash, 'admin']
    );

    console.log("✅ Admin listo → usuario: admin | contraseña: admin123");
  } catch (err) {
    console.error("❌ Error creando admin:", err);
  }
}

crearAdmin();

// ✅ CONFIGURACIÓN GENERAL
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Configura SESSION_SECRET correctamente');
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ SESIONES
app.use(session({
  secret: sessionSecret || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: isProduction }
}));

// ✅ HELPERS
function cleanText(value, maxLength = 255) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLength);
}

// ✅ LOGIN (POSTGRES ✅)
app.post('/api/login', async (req, res) => {
  const username = cleanText(req.body?.username, 80);
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña obligatorios' });
  }

  try {
    const result = await pg.query(
      'SELECT * FROM usuarios WHERE username = $1',
      [username]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.rol = user.rol;

    res.json({
      success: true,
      username: user.username,
      rol: user.rol
    });

  } catch (err) {
    console.error("❌ Error login:", err);
    res.status(500).json({ error: 'Error servidor' });
  }
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`✅ Sistema funcionando en puerto ${PORT}`);
});

