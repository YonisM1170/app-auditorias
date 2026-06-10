console.log("🚀 SERVIDOR INICIANDO...");
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const pg = require('./database_pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CREAR TABLAS
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

    console.log("✅ TABLAS POSTGRES LISTAS");
  } catch (err) {
    console.error(err);
  }
}
crearTablas();

// ✅ CREAR ADMIN
async function crearAdmin() {
  const hash = await bcrypt.hash('admin123', 10);
  await pg.query(`
    INSERT INTO usuarios (username, password, rol)
    VALUES ('admin',$1,'admin')
    ON CONFLICT (username) DO NOTHING
  `, [hash]);

  console.log("✅ admin / admin123 listo");
}
crearAdmin();

// ✅ MIDDLEWARE
app.use(express.json());
app.use(express.static(__dirname));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// ✅ HELPERS
function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  next();
}

function admin(req, res, next) {
  if (req.session.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

// ✅ LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const result = await pg.query(
    'SELECT * FROM usuarios WHERE username=$1',
    [username]
  );

  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Credenciales' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales' });

  req.session.userId = user.id;
  req.session.rol = user.rol;

  res.json({ success: true });
});

// ✅ USUARIOS
app.get('/api/usuarios', auth, admin, async (req, res) => {
  const data = await pg.query('SELECT id, username, rol FROM usuarios');
  res.json(data.rows);
});

app.post('/api/usuarios', auth, admin, async (req, res) => {
  const { username, password, rol } = req.body;

  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await pg.query(
      'INSERT INTO usuarios (username,password,rol) VALUES ($1,$2,$3) RETURNING *',
      [username, hash, rol]
    );
    res.json(result.rows[0]);
  } catch {
    res.status(400).json({ error: 'Usuario existe' });
  }
});

app.delete('/api/usuarios/:id', auth, admin, async (req, res) => {
  await pg.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ✅ AUDITORIAS POSTGRES ✅ (ANTES SQLITE)
app.post('/api/auditorias', auth, async (req, res) => {
  const lista = req.body;

  try {
    for (const a of lista) {
      await pg.query(`
        INSERT INTO auditorias (
          fecha, orden, referencia, material, descripcion,
          valor_matriz, cantidad_requerida, estado, cantidad,
          diferencia, sobrante_faltante, novedad,
          auditor, mercador, marca, observaciones
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
        )
      `, [
        a.fecha, a.orden, a.referencia, a.material,
        a.descripcion, a.valorMatriz, a.cantidadRequerida,
        a.estado, a.cantidad, a.diferencia,
        a.sobranteFaltante, a.novedad,
        a.auditor, a.mercador, a.marca, a.observaciones
      ]);
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error guardando auditorias' });
  }
});

// ✅ CONSULTAR AUDITORIAS
app.get('/api/auditorias', auth, async (req, res) => {
  const data = await pg.query(
    'SELECT * FROM auditorias ORDER BY id DESC'
  );
  res.json(data.rows);
});

// ✅ ELIMINAR AUDITORIA
app.delete('/api/auditorias/:id', auth, admin, async (req, res) => {
  await pg.query('DELETE FROM auditorias WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ✅ INICIO
app.listen(PORT, () => {
  console.log(`🔥 APP LISTA EN PUERTO ${PORT}`);
});
