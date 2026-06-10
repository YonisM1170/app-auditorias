require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || sessionSecret.length < 32 || sessionSecret.includes('cambiar'))) {
  throw new Error('Configura SESSION_SECRET con un valor seguro antes de iniciar en produccion.');
}

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (isProduction) {
  app.set('trust proxy', 1);
}

if (allowedOrigins.length) {
  app.use(cors({ origin: allowedOrigins, credentials: true }));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: sessionSecret || 'local-dev-secret-change-before-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

function requireAdmin(req, res, next) {
  if (req.session.rol === 'admin') return next();
  return res.status(403).json({ error: 'Solo administradores pueden realizar esta accion' });
}

const validCatalogTypes = new Set(['estado', 'auditor', 'mercador', 'marca']);
const validRoles = new Set(['admin', 'usuario']);

function cleanText(value, maxLength = 255) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateAuditPayload(item) {
  const fecha = cleanText(item.fecha, 10);
  const orden = cleanText(item.orden, 80);
  const estado = cleanText(item.estado, 80);
  const auditor = cleanText(item.auditor, 120);
  const mercador = cleanText(item.mercador, 120);
  const marca = cleanText(item.marca, 120);
  const cantidad = cleanText(item.cantidad, 30);
  const cantidadRequerida = cleanText(item.cantidadRequerida, 30);

  if (!isValidDate(fecha)) return { error: 'Fecha invalida' };
  if (!orden) return { error: 'Orden es obligatoria' };
  if (!estado) return { error: 'Estado es obligatorio' };
  if (!auditor || !mercador || !marca) return { error: 'Auditor, mercador y marca son obligatorios' };

  const requeridoNumber = toNumber(cantidadRequerida) || 0;
  const cantidadNumber = toNumber(cantidad);
  if (estado === 'OK' && (cantidadNumber === null || cantidadNumber < 0)) {
    return { error: `Cantidad invalida para la orden ${orden}` };
  }

  const diferencia = estado === 'OK' ? cantidadNumber - requeridoNumber : '';

  return {
    value: {
      fecha,
      orden,
      referencia: cleanText(item.referencia, 120),
      material: cleanText(item.material, 120),
      descripcion: cleanText(item.descripcion, 500),
      valorMatriz: cleanText(item.valorMatriz, 120),
      cantidadRequerida,
      estado,
      cantidad: estado === 'OK' ? cantidad : '',
      diferencia,
      sobranteFaltante: diferencia,
      novedad: diferencia !== '' && diferencia !== 0 ? '1' : '',
      auditor,
      mercador,
      marca,
      observaciones: cleanText(item.observaciones, 1000)
    }
  };
}

function validateUserPayload(body, requirePassword = true) {
  body = body || {};
  const username = cleanText(body.username, 80);
  const password = String(body.password || '');
  const rol = cleanText(body.rol || 'usuario', 20);

  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) {
    return { error: 'El usuario debe tener minimo 3 caracteres y solo letras, numeros, punto, guion o guion bajo' };
  }
  if (requirePassword && password.length < 8) {
    return { error: 'La contrasena debe tener minimo 8 caracteres' };
  }
  if (!validRoles.has(rol)) {
    return { error: 'Rol invalido' };
  }

  return { value: { username, password, rol } };
}

app.post('/api/login', (req, res) => {
  const username = cleanText(req.body?.username, 80);
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contrasena son obligatorios' });
  }

  db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    try {
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Credenciales invalidas' });
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.rol = user.rol;
      return res.json({ success: true, id: user.id, username: user.username, rol: user.rol });
    } catch (error) {
      return res.status(500).json({ error: 'Error al validar credenciales' });
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/verify', requireAuth, (req, res) => {
  res.json({ id: req.session.userId, username: req.session.username, rol: req.session.rol });
});

app.get('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  db.all(
    'SELECT id, username, rol, created_at FROM usuarios ORDER BY username',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json(rows);
    }
  );
});

app.post('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const result = validateUserPayload(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  try {
    const hash = await bcrypt.hash(result.value.password, 10);
    db.run(
      'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
      [result.value.username, hash, result.value.rol],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'El usuario ya existe' });
          }
          return res.status(500).json({ error: err.message });
        }
        return res.status(201).json({
          id: this.lastID,
          username: result.value.username,
          rol: result.value.rol
        });
      }
    );
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

app.put('/api/usuarios/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contrasena debe tener minimo 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('UPDATE usuarios SET password = ? WHERE id = ?', [hash, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.json({ success: true, updated: this.changes });
    });
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo cambiar la contrasena' });
  }
});

app.delete('/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Usuario invalido' });
  }
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }

  db.get('SELECT id, rol FROM usuarios WHERE id = ?', [userId], (selectErr, user) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const deleteUser = () => {
      db.run('DELETE FROM usuarios WHERE id = ?', [userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ success: true, deleted: this.changes });
      });
    };

    if (user.rol !== 'admin') return deleteUser();

    db.get('SELECT COUNT(*) as total FROM usuarios WHERE rol = ?', ['admin'], (countErr, row) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      if ((row?.total || 0) <= 1) {
        return res.status(400).json({ error: 'No puedes eliminar el ultimo administrador' });
      }
      return deleteUser();
    });
  });
});

app.get('/api/catalogos', requireAuth, (req, res) => {
  db.all('SELECT tipo, valor FROM catalogos ORDER BY tipo, valor', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const catalogo = { estado: [], auditor: [], mercador: [], marca: [] };
    rows.forEach(row => {
      if (catalogo[row.tipo]) catalogo[row.tipo].push(row.valor);
    });
    return res.json(catalogo);
  });
});

app.post('/api/catalogos', requireAuth, (req, res) => {
  const tipo = cleanText(req.body?.tipo, 30);
  const valor = cleanText(req.body?.valor, 120);
  if (!validCatalogTypes.has(tipo) || !valor) {
    return res.status(400).json({ error: 'Catalogo invalido' });
  }

  db.run('INSERT OR IGNORE INTO catalogos (tipo, valor) VALUES (?, ?)', [tipo, valor], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({ success: true, id: this.lastID });
  });
});

app.put('/api/catalogos', requireAuth, requireAdmin, (req, res) => {
  const tipo = cleanText(req.body?.tipo, 30);
  const valor = cleanText(req.body?.valor, 120);
  const nuevo = cleanText(req.body?.nuevo, 120);
  if (!validCatalogTypes.has(tipo) || !valor || !nuevo) {
    return res.status(400).json({ error: 'Catalogo invalido' });
  }
  // evitar duplicados
  db.get('SELECT 1 FROM catalogos WHERE tipo = ? AND valor = ?', [tipo, nuevo], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'El valor nuevo ya existe' });
    db.run('UPDATE catalogos SET valor = ? WHERE tipo = ? AND valor = ?', [nuevo, tipo, valor], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'Valor no encontrado' });
      return res.json({ success: true, updated: this.changes });
    });
  });
});

app.delete('/api/catalogos', requireAuth, requireAdmin, (req, res) => {
  const tipo = cleanText(req.query?.tipo, 30);
  const valor = cleanText(req.query?.valor, 120);
  if (!validCatalogTypes.has(tipo) || !valor) {
    return res.status(400).json({ error: 'Catalogo invalido' });
  }

  db.run('DELETE FROM catalogos WHERE tipo = ? AND valor = ?', [tipo, valor], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({ success: true, deleted: this.changes });
  });
});

// Endpoint temporal y seguro para resetear la contraseña de admin usando un token de un solo uso.
// Uso: crea backend/reset_token.txt con el token, luego desde el navegador abre /reset_admin.html y envía token+password.
app.post('/reset_admin', (req, res) => {
  try {
    const tokenPath = path.join(__dirname, 'reset_token.txt');
    if (!fs.existsSync(tokenPath)) return res.status(404).send('Token no encontrado.');
    const tokenStored = fs.readFileSync(tokenPath, 'utf8').trim();
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.password || '');
    if (!token || !newPassword) return res.status(400).send('Faltan token o password.');
    if (token !== tokenStored) return res.status(403).send('Token invalido.');
    if (newPassword.length < 8) return res.status(400).send('La contrasena debe tener minimo 8 caracteres.');

    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE usuarios SET password = ? WHERE username = ?', [hash, 'admin'], function(err) {
      if (err) return res.status(500).send('Error al actualizar la contraseña: ' + err.message);
      if (!this.changes) return res.status(404).send('Usuario admin no encontrado.');
      try { fs.unlinkSync(tokenPath); } catch (e) {}
      return res.send('Contraseña de admin actualizada correctamente.');
    });
  } catch (err) {
    return res.status(500).send('Error interno.');
  }
});

app.post('/api/auditorias', requireAuth, (req, res) => {
  const auditorias = req.body;
  if (!Array.isArray(auditorias) || auditorias.length === 0 || auditorias.length > 1000) {
    return res.status(400).json({ error: 'Datos invalidos' });
  }

  const sanitized = [];
  for (const item of auditorias) {
    const result = validateAuditPayload(item || {});
    if (result.error) return res.status(400).json({ error: result.error });
    sanitized.push(result.value);
  }

  const stmt = db.prepare(`
    INSERT INTO auditorias (
      fecha, orden, referencia, material, descripcion, valor_matriz,
      cantidad_requerida, estado, cantidad, diferencia, sobrante_faltante,
      novedad, auditor, mercador, marca, observaciones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const errors = [];
  sanitized.forEach(a => {
    stmt.run([
      a.fecha,
      a.orden,
      a.referencia,
      a.material,
      a.descripcion,
      a.valorMatriz,
      a.cantidadRequerida,
      a.estado,
      a.cantidad,
      a.diferencia,
      a.sobranteFaltante,
      a.novedad,
      a.auditor,
      a.mercador,
      a.marca,
      a.observaciones
    ], (err) => {
      if (err) errors.push(err.message);
    });
  });

  stmt.finalize((err) => {
    if (err) errors.push(err.message);
    if (errors.length) {
      return res.status(500).json({ error: 'No se pudieron guardar todas las auditorias', details: errors });
    }
    return res.json({ success: true, count: sanitized.length });
  });
});

app.get('/api/auditorias', requireAuth, (req, res) => {
  let query = 'SELECT * FROM auditorias WHERE 1=1';
  const params = [];

  if (req.query.orden) {
    query += ' AND orden LIKE ?';
    params.push(`%${cleanText(req.query.orden, 80)}%`);
  }
  if (req.query.auditor) {
    query += ' AND auditor LIKE ?';
    params.push(`%${cleanText(req.query.auditor, 120)}%`);
  }
  if (req.query.mercador) {
    query += ' AND mercador LIKE ?';
    params.push(`%${cleanText(req.query.mercador, 120)}%`);
  }
  if (req.query.fecha) {
    const fecha = cleanText(req.query.fecha, 10);
    if (!isValidDate(fecha)) return res.status(400).json({ error: 'Fecha invalida' });
    query += ' AND fecha = ?';
    params.push(fecha);
  }

  query += ' ORDER BY fecha DESC, id DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.delete('/api/auditorias/:id', requireAuth, requireAdmin, (req, res) => {
  db.run('DELETE FROM auditorias WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({ success: true, deleted: this.changes });
  });
});

app.put('/api/auditorias/:id', requireAuth, requireAdmin, (req, res) => {
  const cantidad = cleanText(req.body.cantidad, 30);
  const cantidadNumber = toNumber(cantidad);
  if (cantidadNumber === null || cantidadNumber < 0) {
    return res.status(400).json({ error: 'Cantidad invalida' });
  }

  db.get('SELECT cantidad_requerida FROM auditorias WHERE id = ?', [req.params.id], (selectErr, row) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    if (!row) return res.status(404).json({ error: 'Auditoria no encontrada' });

    const diferencia = cantidadNumber - (toNumber(row.cantidad_requerida) || 0);
    const novedad = diferencia !== 0 ? '1' : '';

    db.run(
      'UPDATE auditorias SET cantidad = ?, diferencia = ?, sobrante_faltante = ?, novedad = ? WHERE id = ?',
      [cantidad, diferencia, diferencia, novedad, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ success: true, updated: this.changes });
      }
    );
  });
});

app.get('/api/resumen', requireAuth, (req, res) => {
  let query = `
    SELECT
      fecha, orden, auditor, mercador, marca,
      COUNT(*) as total_filas,
      SUM(CASE WHEN estado = 'OK' THEN 1 ELSE 0 END) as ok_count,
      SUM(CASE WHEN novedad = 1 THEN 1 ELSE 0 END) as novedades
    FROM auditorias
    WHERE 1=1
  `;
  const params = [];

  if (req.query.orden) {
    query += ' AND orden LIKE ?';
    params.push(`%${cleanText(req.query.orden, 80)}%`);
  }
  if (req.query.auditor) {
    query += ' AND auditor LIKE ?';
    params.push(`%${cleanText(req.query.auditor, 120)}%`);
  }
  if (req.query.mercador) {
    query += ' AND mercador LIKE ?';
    params.push(`%${cleanText(req.query.mercador, 120)}%`);
  }
  if (req.query.fecha) {
    const fecha = cleanText(req.query.fecha, 10);
    if (!isValidDate(fecha)) return res.status(400).json({ error: 'Fecha invalida' });
    query += ' AND fecha = ?';
    params.push(fecha);
  }
  if (req.query.mes) {
    const mes = cleanText(req.query.mes, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mes invalido' });
    query += ' AND fecha LIKE ?';
    params.push(`${mes}%`);
  }

  query += ' GROUP BY fecha, orden, auditor, mercador, marca ORDER BY fecha DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.get('/api/analisis', requireAuth, (req, res) => {
  let query = `
    SELECT
      auditor,
      COUNT(DISTINCT orden) as total_ops,
      SUM(CASE WHEN estado = 'OK' THEN 1 ELSE 0 END) as skus_auditados,
      SUM(CASE WHEN novedad = 1 THEN 1 ELSE 0 END) as total_novedades
    FROM auditorias
    WHERE auditor IS NOT NULL AND auditor != ''
  `;
  const params = [];

  if (req.query.auditor) {
    query += ' AND auditor LIKE ?';
    params.push(`%${cleanText(req.query.auditor, 120)}%`);
  }

  query += ' GROUP BY auditor ORDER BY total_ops DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Sistema de auditorias disponible en http://localhost:${PORT}`);
});
