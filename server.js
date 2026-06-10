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
      CREATE TABLE IF NOT EXISTS catalogos (
        id SERIAL PRIMARY KEY,
        tipo TEXT,
        valor TEXT
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

    console.log("✅ TABLAS LISTAS");
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

// ✅ AUTH
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

  const result = await pg.query('SELECT * FROM usuarios WHERE username=$1', [username]);
  const user = result.rows[0];

  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  req.session.userId = user.id;
  req.session.rol = user.rol;

  res.json({
    success: true,
    username: user.username,
    rol: user.rol
  });
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
      'INSERT INTO usuarios (username,password,rol) VALUES ($1,$2,$3) RETURNING id,username,rol',
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

// ✅ CATALOGOS
app.get('/api/catalogos', async (req, res) => {
  const result = await pg.query('SELECT tipo, valor FROM catalogos');

  const data = { estado: [], auditor: [], mercador: [], marca: [] };

  result.rows.forEach(r => {
    if (data[r.tipo]) data[r.tipo].push(r.valor);
  });

  res.json(data);
});

app.post('/api/catalogos', async (req, res) => {
  const { tipo, valor } = req.body;

  await pg.query(
    'INSERT INTO catalogos (tipo, valor) VALUES ($1,$2)',
    [tipo, valor]
  );

  res.json({ success: true });
});

app.put('/api/catalogos', async (req, res) => {
  const { tipo, valor, nuevo } = req.body;

  await pg.query(
    'UPDATE catalogos SET valor=$1 WHERE tipo=$2 AND valor=$3',
    [nuevo, tipo, valor]
  );

  res.json({ success: true });
});

app.delete('/api/catalogos', async (req, res) => {
  const { tipo, valor } = req.query;

  await pg.query(
    'DELETE FROM catalogos WHERE tipo=$1 AND valor=$2',
    [tipo, valor]
  );

  res.json({ success: true });
});

// ✅ AUDITORIAS
app.post('/api/auditorias', auth, async (req, res) => {
  const lista = req.body;

  for (const a of lista) {
    await pg.query(`
      INSERT INTO auditorias (
        fecha, orden, referencia, material, descripcion,
        valor_matriz, cantidad_requerida, estado,
        cantidad, diferencia, sobrante_faltante,
        novedad, auditor, mercador, marca, observaciones
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      a.fecha, a.orden, a.referencia, a.material, a.descripcion,
      a.valorMatriz, a.cantidadRequerida, a.estado,
      a.cantidad, a.diferencia, a.sobranteFaltante,
      a.novedad, a.auditor, a.mercador, a.marca, a.observaciones
    ]);
  }

  res.json({ success: true });
});

app.get('/api/auditorias', auth, async (req, res) => {
  try {
    let query = 'SELECT * FROM auditorias WHERE 1=1';
    const params = [];

    if (req.query.orden) {
      params.push(`%${req.query.orden}%`);
      query += ` AND orden ILIKE $${params.length}`;
    }

    if (req.query.auditor) {
      params.push(`%${req.query.auditor}%`);
      query += ` AND auditor ILIKE $${params.length}`;
    }

    if (req.query.mercador) {
      params.push(`%${req.query.mercador}%`);
      query += ` AND mercador ILIKE $${params.length}`;
    }

    if (req.query.fecha) {
      params.push(req.query.fecha);
      query += ` AND DATE(fecha) = $${params.length}`;
    }

    if (req.query.mes) {
      params.push(`${req.query.mes}%`);
      query += ` AND TO_CHAR(fecha, 'YYYY-MM') LIKE $${params.length}`;
    }

    query += ' ORDER BY fecha DESC, id DESC';

    const result = await pg.query(query, params);

    res.json(result.rows);

  } catch (err) {
    console.error('Error filtrando auditorias:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.delete('/api/auditorias/:id', auth, admin, async (req, res) => {
  await pg.query('DELETE FROM auditorias WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ✅ START
app.listen(PORT, () => {
  console.log(`🔥 APP FUNCIONANDO EN ${PORT}`);
});
