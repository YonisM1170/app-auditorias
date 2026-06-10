const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'auditorias.db');
const db = new sqlite3.Database(dbPath);
const isProduction = process.env.NODE_ENV === 'production';

const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || '';
const defaultDemoPassword = process.env.DEFAULT_DEMO_PASSWORD || '';

if (isProduction && (!defaultAdminPassword || defaultAdminPassword.length < 12 || defaultAdminPassword.includes('cambia'))) {
  throw new Error('Configura DEFAULT_ADMIN_PASSWORD con una contrasena segura para produccion.');
}

function createDefaultUser(username, password, rol) {
  if (!password) return;
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT OR IGNORE INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
    [username, hash, rol]
  );
  db.run(
    'UPDATE usuarios SET password = ?, rol = ? WHERE username = ?',
    [hash, rol, username]
  );
}

db.serialize(() => {
  // Ajustes de rendimiento y concurrencia para SQLite
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA temp_store = MEMORY');
  db.run('PRAGMA busy_timeout = 5000');

  db.run(`
    CREATE TABLE IF NOT EXISTS auditorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      orden TEXT NOT NULL,
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
      observaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT DEFAULT 'usuario',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS catalogos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      valor TEXT NOT NULL,
      UNIQUE(tipo, valor)
    )
  `);

  const catalogosDefault = [
    ['estado', 'OK'],
    ['estado', 'V'],
    ['estado', 'No lleva'],
    ['auditor', 'Ana Lopez'],
    ['auditor', 'Carlos Ruiz'],
    ['auditor', 'Marta Gomez'],
    ['mercador', 'Juan Perez'],
    ['mercador', 'Luis Fernandez'],
    ['mercador', 'Sofia Martinez'],
    ['marca', 'Nike'],
    ['marca', 'Adidas'],
    ['marca', 'Puma'],
    ['marca', 'Reebok']
  ];

  // Insertar valores por defecto solo si la tabla esta vacia (evita re-sembrar tras borrados)
  db.get('SELECT COUNT(*) as cnt FROM catalogos', (err, row) => {
    if (err) {
      console.error('Error comprobando catalogos:', err);
      return;
    }
    const count = row?.cnt || 0;
    if (count === 0) {
      const stmt = db.prepare('INSERT OR IGNORE INTO catalogos (tipo, valor) VALUES (?, ?)');
      catalogosDefault.forEach(([tipo, valor]) => {
        stmt.run([tipo, valor]);
      });
      stmt.finalize();
    }
  });

  createDefaultUser('admin', defaultAdminPassword, 'admin');
  createDefaultUser('demo', defaultDemoPassword, 'usuario');

  // Crear indices para consultas frecuentes (mejora rendimiento)
  db.run('CREATE INDEX IF NOT EXISTS idx_aud_fecha ON auditorias(fecha)');
  db.run('CREATE INDEX IF NOT EXISTS idx_aud_orden ON auditorias(orden)');
  db.run('CREATE INDEX IF NOT EXISTS idx_aud_auditor ON auditorias(auditor)');
  db.run('CREATE INDEX IF NOT EXISTS idx_aud_mercador ON auditorias(mercador)');
  db.run('CREATE INDEX IF NOT EXISTS idx_aud_marca ON auditorias(marca)');
  db.run('CREATE INDEX IF NOT EXISTS idx_aud_fecha_orden ON auditorias(fecha, orden)');

  // Analizar para optimizador y reducir latencias en consultas posteriores
  db.run('ANALYZE');

  console.log('Base de datos inicializada correctamente (PRAGMA y indices aplicados)');
});

module.exports = db;
