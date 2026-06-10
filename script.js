// ============ VARIABLES GLOBALES ============
let gestionRows = [];
let catalogos = {
  estado: ['OK', 'V', 'No lleva'],
  auditor: ['Auditor 1', 'Auditor 2', 'Auditor 3'],
  mercador: ['Mercador 1', 'Mercador 2', 'Mercador 3'],
  marca: ['Marca A', 'Marca B', 'Marca C']
};
let usuarioActual = null;
const CREATE_OPTION = '__crear_nuevo__';

// ============ AUTENTICACIÓN ============
async function verificarSesion() {
  const res = await fetch('/api/verify');
  if (res.ok) {
    const data = await res.json();
    usuarioActual = data;
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = `${data.username} (${data.rol})`;
    aplicarPermisos();
    await cargarCatalogos();
    await cargarHistorico();
    renderGestion();
  }
}

document.getElementById('loginBtn').onclick = async () => {
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  if (res.ok) {
    const data = await res.json();
    usuarioActual = data;
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = `${data.username} (${data.rol})`;
    aplicarPermisos();
    await cargarCatalogos();
    await cargarHistorico();
    renderGestion();
  } else {
    alert('Credenciales incorrectas');
  }
};

document.getElementById('logoutBtn').onclick = async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
};

function aplicarPermisos() {
  const esAdmin = usuarioActual?.rol === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });
}

async function cargarCatalogos() {
  try {
    const res = await fetch('/api/catalogos');
    if (res.ok) {
      const data = await res.json();
      catalogos = {
        estado: data.estado?.length ? data.estado : catalogos.estado,
        auditor: data.auditor?.length ? data.auditor : catalogos.auditor,
        mercador: data.mercador?.length ? data.mercador : catalogos.mercador,
        marca: data.marca?.length ? data.marca : catalogos.marca
      };
    }
  } catch(e) {}
}

// ============ FUNCIONES AUXILIARES ============
function formatearFecha(fechaISO) {
  if (!fechaISO) return '';

  const fecha = new Date(fechaISO);

  if (isNaN(fecha)) return '';

  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const año = fecha.getFullYear();

  return `${dia}/${mes}/${año}`;
}

function fechaLocalISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCatalogOptions(tipo, selectedValue) {
  const values = [...new Set(catalogos[tipo] || [])];
  if (selectedValue && !values.includes(selectedValue)) {
    values.unshift(selectedValue);
  }
  return `
    <option value="">Seleccionar</option>
    ${values.map(opt => `<option value="${escapeHTML(opt)}" ${selectedValue === opt ? 'selected' : ''}>${escapeHTML(opt)}</option>`).join('')}
    <option value="${CREATE_OPTION}">+ Crear nuevo...</option>
  `;
}

async function crearValorCatalogo(tipo) {
  const labels = {
    estado: 'estado',
    auditor: 'auditor',
    mercador: 'mercador',
    marca: 'marca'
  };
  const valor = prompt(`Crear nuevo ${labels[tipo]}:`);
  if (valor === null) return null;

  const limpio = valor.trim();
  if (!limpio) {
    alert('El valor no puede estar vacio.');
    return null;
  }

  const res = await fetch('/api/catalogos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, valor: limpio })
  });

  if (!res.ok) {
    alert('No se pudo crear el valor.');
    return null;
  }

  if (!catalogos[tipo].includes(limpio)) {
    catalogos[tipo].push(limpio);
    catalogos[tipo].sort((a, b) => a.localeCompare(b));
  }
  renderCatalogAdmin();
  return limpio;
}

function catalogLabel(tipo) {
  const labels = {
    estado: 'Estado',
    auditor: 'Auditor',
    mercador: 'Mercador',
    marca: 'Marca'
  };
  return labels[tipo] || tipo;
}

function renderCatalogAdmin() {
  const tbody = document.querySelector('#catalogosAdminTable tbody');
  const select = document.getElementById('catalogAdminType');
  if (!tbody || !select) return;

  const tipo = select.value || 'estado';
  const values = [...new Set(catalogos[tipo] || [])].sort((a, b) => a.localeCompare(b));
  tbody.innerHTML = '';

  values.forEach(valor => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(valor)}</td>
      <td>
        <button class="action-btn edit" data-catalog-edit="${escapeHTML(valor)}">Editar</button>
        <button class="action-btn delete" data-catalog-delete="${escapeHTML(valor)}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-catalog-edit]').forEach(button => {
    button.addEventListener('click', () => editarValorCatalogo(tipo, button.dataset.catalogEdit));
  });

  tbody.querySelectorAll('[data-catalog-delete]').forEach(button => {
    button.addEventListener('click', () => eliminarValorCatalogo(tipo, button.dataset.catalogDelete));
  });
}

async function eliminarValorCatalogo(tipo, valor) {
  if (usuarioActual?.rol !== 'admin') {
    alert('Solo los administradores pueden eliminar valores de listas.');
    return;
  }

  const enUsoGestion = gestionRows.some(row => row[tipo] === valor);
  const avisoUso = enUsoGestion
    ? '\n\nEste valor esta usado en filas cargadas actualmente. Se quitara de la lista, pero esas filas conservaran el valor hasta que lo cambies.'
    : '';

  if (!confirm(`Eliminar "${valor}" de la lista ${catalogLabel(tipo)}?${avisoUso}`)) return;

  const params = new URLSearchParams({ tipo, valor });
  const res = await fetch(`/api/catalogos?${params}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo eliminar el valor.');
    return;
  }

  catalogos[tipo] = (catalogos[tipo] || []).filter(item => item !== valor);
  renderCatalogAdmin();
  renderGestion();
}

async function editarValorCatalogo(tipo, valor) {
  if (usuarioActual?.rol !== 'admin') {
    alert('Solo los administradores pueden editar valores de listas.');
    return;
  }
  const nuevo = prompt(`Editar "${valor}" en ${catalogLabel(tipo)}:`, valor);
  if (nuevo === null) return; // cancelado
  const limpio = (nuevo || '').trim();
  if (!limpio) { alert('El valor no puede estar vacio.'); return; }
  if (limpio === valor) return; // sin cambios

  // advertir si está en uso
  const enUso = gestionRows.some(row => row[tipo] === valor);
  const avisoUso = enUso ? '\n\nEste valor esta usado en filas cargadas actualmente. Se actualizara en la lista y deberas revisar las filas.' : '';
  if (!confirm(`Cambiar "${valor}" por "${limpio}" en ${catalogLabel(tipo)}?${avisoUso}`)) return;

  try {
    const res = await fetch('/api/catalogos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, valor, nuevo: limpio })
    });
    if (!res.ok) {
      const data = await res.json().catch(()=>({}));
      alert(data.error || 'No se pudo editar el valor.');
      return;
    }
    // actualizar en memoria
    catalogos[tipo] = (catalogos[tipo] || []).map(v => (v === valor ? limpio : v));
    catalogos[tipo].sort((a,b)=>a.localeCompare(b));
    renderCatalogAdmin();
    renderGestion();
  } catch(e) {
    alert('Error en la solicitud.');
  }
}

function parseSAPLine(line) {
  const cleanTrim = s => String(s || '').replace(/\u00A0/g, ' ').trim();

    // 1) Prefer tab-separated values and keep empty fields (no filter)
  const partsByTab = line.split('\t').map(cleanTrim);
  if (partsByTab.length >= 6) {
    const orden = partsByTab[0] || '';
    const referencia = partsByTab[1] || '';
    const material = partsByTab[2] || '';
    const cantidadRequerida = String(partsByTab[partsByTab.length - 1] || '').replace(/,/g, '').trim();
    const valorMatriz = partsByTab[partsByTab.length - 2] ? partsByTab[partsByTab.length - 2].trim() : '';
    const descripcion = partsByTab.slice(3, partsByTab.length - 2).join(' ').trim();
    return [orden, referencia, material, descripcion, valorMatriz, cantidadRequerida];
  }

  // 2) Try double-spaces split (typical SAP pasted tables)
  const partsBySpaces = line.split(/\s{2,}/).map(cleanTrim).filter(Boolean);
  if (partsBySpaces.length >= 6) {
    const orden = partsBySpaces[0];
    const referencia = partsBySpaces[1];
    const material = partsBySpaces[2];
    const cantidadRequerida = String(partsBySpaces[partsBySpaces.length - 1] || '').replace(/,/g, '').trim();
    const valorMatriz = partsBySpaces[partsBySpaces.length - 2] || '';
    const descripcion = partsBySpaces.slice(3, partsBySpaces.length - 2).join(' ').trim();
    return [orden, referencia, material, descripcion, valorMatriz, cantidadRequerida];
  }

  // 3) Fallback: single-space tokenization
  const tokens = line.trim().split(/\s+/);
  if (tokens.length >= 6) {
    const orden = tokens[0];
    const referencia = tokens[1];
    const material = tokens[2];
    const cantidadRequerida = String(tokens[tokens.length - 1] || '').replace(/,/g, '').trim();
    const valorMatriz = looksLikeNumber(tokens[tokens.length - 2]) ? tokens[tokens.length - 2].replace(/,/g, '') : '';
    const descripcion = tokens.slice(3, valorMatriz ? tokens.length - 2 : tokens.length - 1).join(' ').trim();
    return [orden, referencia, material, descripcion, valorMatriz, cantidadRequerida];
  }

  return [];
}

// helper used in fallback: detect simple numeric-like token (digits, commas, dots)
function looksLikeNumber(s) {
  if (!s) return false;
  const cleaned = String(s).replace(/[^0-9.,-]/g, '');
  return /^(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)$/.test(cleaned);
}

function parseLines(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(line => line.trim());
  const rows = [];
  for (const line of lines) {
    let parts = [];
    try {
      parts = parseSAPLine(line) || [];
    } catch (err) {
      console.error('Error parsing line:', line, err);
      parts = [];
    }

    // Validate parsed parts: require at least orden and cantidadRequerida (last column)
    if (!parts || parts.length < 6) {
      // skip invalid/empty parse results
      continue;
    }
    const orden = String(parts[0] || '').trim();
    const cantidadRequerida = String(parts[5] || '').trim();
    if (!orden || !cantidadRequerida) {
      // skip rows missing essential columns
      continue;
    }

    rows.push({
      fecha: fechaLocalISO(),
      orden: orden,
      referencia: parts[1] || '',
      material: parts[2] || '',
      descripcion: parts[3] || '',
      valorMatriz: parts[4] || '',
      cantidadRequerida: cantidadRequerida,
      estado: '',
      cantidad: '',
      diferencia: '',
      sobranteFaltante: '',
      novedad: '',
      auditor: '',
      mercador: '',
      marca: '',
      observaciones: ''
    });
  }
  return rows;
}

function formatSobrante(value) {
  if (value === '' || value === null || value === undefined) return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric === 0) return '';
  const clase = numeric > 0 ? 'badge-rojo' : 'badge-naranja';
  const texto = numeric > 0 ? 'SOBRANTE' : 'FALTANTE';
  return `<span class="badge ${clase}">${texto}</span>`;
}

function actualizarCalculos(row) {
  if (row.estado !== 'OK' || !row.cantidad) {
    row.diferencia = '';
    row.sobranteFaltante = '';
    row.novedad = '';
    return;
  }
  const requerido = Number(row.cantidadRequerida) || 0;
  const cantidad = Number(row.cantidad) || 0;
  row.diferencia = cantidad - requerido;
  row.sobranteFaltante = row.diferencia;
  row.novedad = row.diferencia !== 0 ? 1 : '';
}

function filaCompleta(row) {
  if (!row.estado) return false;
  if (row.estado === 'OK' && (row.cantidad === '' || row.cantidad === null)) return false;
  if (!row.auditor) return false;
  if (!row.mercador) return false;
  if (!row.marca) return false;
  return true;
}

function setSameOrderField(order, field, value) {
  gestionRows.forEach(row => {
    if (row.orden === order) {
      row[field] = value;
    }
  });
}

// ============ ACTUALIZACIÓN DE CELDAS SIN RE-RENDER ============
function actualizarCeldaDiferencia(index) {
  const span = document.querySelector(`.diferencia-${index}`);
  if (span) span.textContent = gestionRows[index].diferencia || '';
}

function actualizarCeldaSobrante(index) {
  const span = document.querySelector(`.sobrante-${index}`);
  if (span) span.innerHTML = formatSobrante(gestionRows[index].sobranteFaltante);
}

function actualizarCeldaNovedad(index) {
  const span = document.querySelector(`.novedad-${index}`);
  if (span) span.innerHTML = gestionRows[index].novedad ? '<span class="badge badge-verde">1</span>' : '';
}

// ============ RENDERIZADO DE GESTIÓN ============
function renderGestion() {
  const tbody = document.querySelector('#gestionTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const ordenFiltro = document.querySelector('#filterOrden')?.value.toLowerCase() || '';

  gestionRows.forEach((row, index) => {
    if (ordenFiltro && !String(row.orden || '').toLowerCase().includes(ordenFiltro)) return;

    const tr = document.createElement('tr');
    if (!filaCompleta(row)) tr.classList.add('fila-incompleta');
    
    tr.innerHTML = `
      <td>${escapeHTML(formatearFecha(row.fecha))}</td>
      <td>${escapeHTML(row.orden)}</td>
      <td>${escapeHTML(row.referencia)}</td>
      <td>${escapeHTML(row.material)}</td>
      <td>${escapeHTML(row.descripcion)}</td>
      <td>${escapeHTML(row.valorMatriz)}</td>
      <td>${escapeHTML(row.cantidadRequerida)}</td>
      <td>
        <select data-index="${index}" class="estado-select">
          ${renderCatalogOptions('estado', row.estado)}
        </select>
       </td>
      <td>
        <input type="number" min="0" value="${escapeHTML(row.cantidad)}" data-index="${index}" class="cantidad-input" ${row.estado !== 'OK' ? 'disabled' : ''} />
       </td>
      <td><span class="diferencia-${index}">${escapeHTML(row.diferencia || '')}</span></td>
      <td><span class="sobrante-${index}">${formatSobrante(row.sobranteFaltante)}</span></td>
      <td><span class="novedad-${index}">${row.novedad ? '<span class="badge badge-verde">1</span>' : ''}</span></td>
      <td>
        <select data-index="${index}" class="auditor-input">
          ${renderCatalogOptions('auditor', row.auditor)}
        </select>
       </td>
      <td>
        <select data-index="${index}" class="mercador-input">
          ${renderCatalogOptions('mercador', row.mercador)}
        </select>
       </td>
      <td>
        <select data-index="${index}" class="marca-input">
          ${renderCatalogOptions('marca', row.marca)}
        </select>
       </td>
      <td><input type="text" value="${escapeHTML(row.observaciones)}" data-index="${index}" class="observaciones-input" /></td>
    `;
    tbody.appendChild(tr);
  });
  
  agregarEventosGestion();
}

// ============ EVENTOS DE GESTIÓN (CORREGIDO) ============
function agregarEventosGestion() {
  // Evento para Estado - CORREGIDO
  document.querySelectorAll('.estado-select').forEach(select => {
    select.onchange = async (e) => {
      const index = parseInt(e.target.dataset.index);
      const estadoAnterior = gestionRows[index].estado;
      let nuevoEstado = e.target.value;
      let creadoNuevo = false;

      if (nuevoEstado === CREATE_OPTION) {
        const creado = await crearValorCatalogo('estado');
        if (!creado) {
          e.target.value = estadoAnterior;
          return;
        }
        nuevoEstado = creado;
        creadoNuevo = true;
      }

      gestionRows[index].estado = nuevoEstado;
      
      // Buscar el input de cantidad en la misma fila
      const row = e.target.closest('tr');
      const cantidadInput = row.querySelector('.cantidad-input');
      
      if (nuevoEstado === 'OK') {
        // Habilitar el campo cantidad y mantener el valor si existe
        cantidadInput.disabled = false;
      } else {
        // Deshabilitar el campo cantidad y limpiar
        cantidadInput.disabled = true;
        cantidadInput.value = '';
        gestionRows[index].cantidad = '';
        gestionRows[index].diferencia = '';
        gestionRows[index].sobranteFaltante = '';
        gestionRows[index].novedad = '';
        
        actualizarCeldaDiferencia(index);
        actualizarCeldaSobrante(index);
        actualizarCeldaNovedad(index);
      }
      
      // Actualizar clase de fila incompleta
      if (!filaCompleta(gestionRows[index])) {
        row.classList.add('fila-incompleta');
      } else {
        row.classList.remove('fila-incompleta');
      }

      if (creadoNuevo) renderGestion();
    };
  });
  
  // Evento para Cantidad
  document.querySelectorAll('.cantidad-input').forEach(input => {
    input.oninput = (e) => {
      const index = parseInt(e.target.dataset.index);
      const valor = e.target.value;
      gestionRows[index].cantidad = valor;
      actualizarCalculos(gestionRows[index]);
      
      actualizarCeldaDiferencia(index);
      actualizarCeldaSobrante(index);
      actualizarCeldaNovedad(index);
      
      const tr = e.target.closest('tr');
      if (tr) {
        if (!filaCompleta(gestionRows[index])) {
          tr.classList.add('fila-incompleta');
        } else {
          tr.classList.remove('fila-incompleta');
        }
      }
    };
  });
  
  // Evento para Auditor
  document.querySelectorAll('.auditor-input').forEach(select => {
    select.onchange = async (e) => {
      const index = parseInt(e.target.dataset.index);
      const order = gestionRows[index].orden;
      const valorAnterior = gestionRows[index].auditor;
      let valor = e.target.value;
      let creadoNuevo = false;

      if (valor === CREATE_OPTION) {
        const creado = await crearValorCatalogo('auditor');
        if (!creado) {
          e.target.value = valorAnterior;
          return;
        }
        valor = creado;
        creadoNuevo = true;
      }

      setSameOrderField(order, 'auditor', valor);
      
      document.querySelectorAll('.auditor-input').forEach(sel => {
        const idx = parseInt(sel.dataset.index);
        if (gestionRows[idx] && gestionRows[idx].orden === order) {
          sel.value = valor;
          const tr = sel.closest('tr');
          if (tr) {
            if (!filaCompleta(gestionRows[idx])) {
              tr.classList.add('fila-incompleta');
            } else {
              tr.classList.remove('fila-incompleta');
            }
          }
        }
      });

      if (creadoNuevo) renderGestion();
    };
  });
  
  // Evento para Mercador
  document.querySelectorAll('.mercador-input').forEach(select => {
    select.onchange = async (e) => {
      const index = parseInt(e.target.dataset.index);
      const order = gestionRows[index].orden;
      const valorAnterior = gestionRows[index].mercador;
      let valor = e.target.value;
      let creadoNuevo = false;

      if (valor === CREATE_OPTION) {
        const creado = await crearValorCatalogo('mercador');
        if (!creado) {
          e.target.value = valorAnterior;
          return;
        }
        valor = creado;
        creadoNuevo = true;
      }

      setSameOrderField(order, 'mercador', valor);
      
      document.querySelectorAll('.mercador-input').forEach(sel => {
        const idx = parseInt(sel.dataset.index);
        if (gestionRows[idx] && gestionRows[idx].orden === order) {
          sel.value = valor;
          const tr = sel.closest('tr');
          if (tr) {
            if (!filaCompleta(gestionRows[idx])) {
              tr.classList.add('fila-incompleta');
            } else {
              tr.classList.remove('fila-incompleta');
            }
          }
        }
      });

      if (creadoNuevo) renderGestion();
    };
  });
  
  // Evento para Marca
  document.querySelectorAll('.marca-input').forEach(select => {
    select.onchange = async (e) => {
      const index = parseInt(e.target.dataset.index);
      const order = gestionRows[index].orden;
      const valorAnterior = gestionRows[index].marca;
      let valor = e.target.value;
      let creadoNuevo = false;

      if (valor === CREATE_OPTION) {
        const creado = await crearValorCatalogo('marca');
        if (!creado) {
          e.target.value = valorAnterior;
          return;
        }
        valor = creado;
        creadoNuevo = true;
      }

      setSameOrderField(order, 'marca', valor);
      
      document.querySelectorAll('.marca-input').forEach(sel => {
        const idx = parseInt(sel.dataset.index);
        if (gestionRows[idx] && gestionRows[idx].orden === order) {
          sel.value = valor;
          const tr = sel.closest('tr');
          if (tr) {
            if (!filaCompleta(gestionRows[idx])) {
              tr.classList.add('fila-incompleta');
            } else {
              tr.classList.remove('fila-incompleta');
            }
          }
        }
      });

      if (creadoNuevo) renderGestion();
    };
  });
  
  // Evento para Observaciones
  document.querySelectorAll('.observaciones-input').forEach(input => {
    input.oninput = (e) => {
      const index = parseInt(e.target.dataset.index);
      gestionRows[index].observaciones = e.target.value;
    };
  });
}

// ============ GUARDAR EN BD ============
async function guardarAuditoria() {
  if (!gestionRows.length) {
    alert('No hay registros para guardar.');
    return;
  }

  const ordenes = {};
  gestionRows.forEach((row, index) => {
    if (!ordenes[row.orden]) ordenes[row.orden] = [];
    ordenes[row.orden].push({ row, index });
  });

  const indicesAGuardar = [];
  const ordenesIncompletas = [];

  Object.entries(ordenes).forEach(([orden, filas]) => {
    const todasCompletas = filas.every(({ row }) => filaCompleta(row));
    if (todasCompletas) {
      filas.forEach(({ index }) => indicesAGuardar.push(index));
    } else {
      ordenesIncompletas.push(orden);
    }
  });

  if (!indicesAGuardar.length) {
    alert(`No hay órdenes listas para guardar.\n\nÓrdenes incompletas:\n• ${ordenesIncompletas.join('\n• ')}`);
    return;
  }

  const aGuardar = indicesAGuardar.map(i => gestionRows[i]);
  
  const res = await fetch('/api/auditorias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aGuardar)
  });

  if (res.ok) {
    indicesAGuardar.sort((a,b)=>b-a).forEach(i => gestionRows.splice(i,1));
    renderGestion();
    cargarHistorico();
    if (ordenesIncompletas.length) {
      alert(`✓ Guardadas.\nPendientes: ${ordenesIncompletas.join(', ')}`);
    } else {
      alert('Auditoría guardada exitosamente.');
    }
  } else {
    alert('Error al guardar en la base de datos.');
  }
}

// ============ HISTÓRICO ============
async function cargarHistorico() {
  const params = new URLSearchParams();
  const orden = document.getElementById('histOrden')?.value;
  const auditor = document.getElementById('histAuditor')?.value;
  const mercador = document.getElementById('histMercador')?.value;
  const fecha = document.getElementById('histFecha')?.value;
  if (orden) params.append('orden', orden);
  if (auditor) params.append('auditor', auditor);
  if (mercador) params.append('mercador', mercador);
  if (fecha) params.append('fecha', fecha);
  
  const res = await fetch(`/api/auditorias?${params}`);
  if (res.ok) {
    const data = await res.json();
    renderHistorico(data);
    renderResumen(data);
    renderAnalisis(data);
  }
}

function renderHistorico(data) {
  const tbody = document.querySelector('#historicoTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  data.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const acciones = usuarioActual?.rol === 'admin'
      ? `
        <button class="action-btn edit" data-action="edit" data-id="${escapeHTML(row.id)}" data-cantidad="${escapeHTML(row.cantidad || '')}">Editar</button>
        <button class="action-btn delete" data-action="delete" data-id="${escapeHTML(row.id)}">Eliminar</button>
       `
      : '';
    tr.innerHTML = `
      <td>${escapeHTML(formatearFecha(row.fecha))}</td>
      <td>${escapeHTML(row.orden)}</td>
      <td>${escapeHTML(row.referencia || '')}</td>
      <td>${escapeHTML(row.material || '')}</td>
      <td>${escapeHTML(row.descripcion || '')}</td>
      <td>${escapeHTML(row.valor_matriz || '')}</td>
      <td>${escapeHTML(row.cantidad_requerida || '')}</td>
      <td>${escapeHTML(row.estado || '')}</td>
      <td>${escapeHTML(row.cantidad || '')}</td>
      <td>${escapeHTML(row.diferencia || '')}</td>
      <td>${formatSobrante(row.sobrante_faltante)}</td>
      <td>${row.novedad ? '<span class="badge badge-verde">1</span>' : ''}</td>
      <td>${escapeHTML(row.auditor || '')}</td>
      <td>${escapeHTML(row.mercador || '')}</td>
      <td>${escapeHTML(row.marca || '')}</td>
      <td>${escapeHTML(row.observaciones || '')}</td>
      <td>${acciones}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="delete"]').forEach(button => {
    button.addEventListener('click', () => eliminarHistorico(button.dataset.id));
  });
  tbody.querySelectorAll('[data-action="edit"]').forEach(button => {
    button.addEventListener('click', () => editarHistorico(button.dataset.id, button.dataset.cantidad || ''));
  });
}

function exportHistoricoXlsx(tableID, filename) {
  const table = document.getElementById(tableID);
  if (!table) { alert('Tabla no encontrada'); return; }
  // detect indices of columns to exclude (e.g., 'Acciones')
  const thead = table.querySelector('thead');
  const excluded = new Set();
  if (thead) {
    const headers = Array.from(thead.querySelectorAll('th'));
    headers.forEach((th, i) => {
      if ((th.textContent || '').trim().toLowerCase() === 'acciones') excluded.add(i);
    });
  }

  // build array of arrays from visible rows
  const data = [];
  // header rows
  const headerRow = [];
  const headerCells = Array.from(table.querySelectorAll('thead tr th'));
  headerCells.forEach((cell, i) => { if (!excluded.has(i)) headerRow.push((cell.textContent||'').trim()); });
  if (headerRow.length) data.push(headerRow);

  // body rows
  table.querySelectorAll('tbody tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (cells.length === 0) return;
    const row = [];
    cells.forEach((cell, i) => {
      if (!excluded.has(i)) {
        row.push((cell.innerText||'').trim());
      }
    });
    data.push(row);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Historico');
  const filenameSafe = filename || `historico_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filenameSafe);
}

document.getElementById('exportHistoricoBtn')?.addEventListener('click', () => {
  if (typeof XLSX === 'undefined') {
    alert('Librería xlsx no cargada. Asegúrate de tener conexión a internet.');
    return;
  }
  exportHistoricoXlsx('historicoTable');
});

async function eliminarHistorico(id) {
  if (!confirm('¿Eliminar esta auditoría?')) return;
  const res = await fetch(`/api/auditorias/${id}`, { method: 'DELETE' });
  if (res.ok) {
    cargarHistorico();
  } else {
    alert('No se pudo eliminar. Verifica que tu usuario tenga permisos de administrador.');
  }
}

async function editarHistorico(id, cantidadActual) {
  const nueva = prompt('Editar cantidad:', cantidadActual);
  if (nueva === null) return;
  const res = await fetch(`/api/auditorias/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cantidad: nueva })
  });
  if (res.ok) {
    cargarHistorico();
  } else {
    alert('No se pudo editar. Verifica que tu usuario tenga permisos de administrador.');
  }
}

// ============ RESUMEN ============
function renderResumen(data) {
  const tbody = document.querySelector('#resumenTable tbody');
  if (!tbody) return;
  
  const ordenFiltro = document.getElementById('resumenOrden')?.value.toLowerCase() || '';
  const auditorFiltro = document.getElementById('resumenAuditor')?.value.toLowerCase() || '';
  const mercadorFiltro = document.getElementById('resumenMercador')?.value.toLowerCase() || '';
  const fechaFiltro = document.getElementById('resumenFecha')?.value || '';
  const mesFiltro = document.getElementById('resumenMes')?.value || '';
  
  const grupos = new Map();
  data.forEach(row => {
    if (ordenFiltro && !String(row.orden || '').toLowerCase().includes(ordenFiltro)) return;
    if (auditorFiltro && !String(row.auditor || '').toLowerCase().includes(auditorFiltro)) return;
    if (mercadorFiltro && !String(row.mercador || '').toLowerCase().includes(mercadorFiltro)) return;
    if (fechaFiltro && row.fecha !== fechaFiltro) return;
    if (mesFiltro && !row.fecha.startsWith(mesFiltro)) return;
    
    const key = `${row.fecha}|${row.orden}|${row.auditor}|${row.mercador}|${row.marca}`;
    if (!grupos.has(key)) {
      grupos.set(key, { fecha: row.fecha, orden: row.orden, auditor: row.auditor, mercador: row.mercador, marca: row.marca, total: 0, ok: 0, novedades: 0 });
    }
    const g = grupos.get(key);
    g.total++;
    if (row.estado === 'OK') g.ok++;
    if (row.novedad) g.novedades++;
  });
  
  tbody.innerHTML = '';
  for (const g of grupos.values()) {
    const porcentaje = g.total ? ((g.ok / g.total) * 100).toFixed(1) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(formatearFecha(g.fecha))}</td>
      <td>${escapeHTML(g.orden)}</td>
      <td>${escapeHTML(g.total)}</td>
      <td>${escapeHTML(g.ok)}</td>
      <td>${escapeHTML(porcentaje)}%</td>
      <td>${escapeHTML(g.novedades)}</td>
      <td>${escapeHTML(g.auditor || '-')}</td>
      <td>${escapeHTML(g.marca || '-')}</td>
      <td>${escapeHTML(g.mercador || '-')}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ============ ANÁLISIS ============
function renderAnalisis(data) {
  const tbody = document.querySelector('#analisisTable tbody');
  if (!tbody) return;
  
  const auditorFiltro = document.getElementById('analisisAuditor')?.value.toLowerCase() || '';
  
  const grupos = new Map();
  data.forEach(row => {
    if (!row.auditor) return;
    if (auditorFiltro && !String(row.auditor || '').toLowerCase().includes(auditorFiltro)) return;
    if (!grupos.has(row.auditor)) {
      grupos.set(row.auditor, { ordenes: new Set(), skus: 0, novedades: 0 });
    }
    const g = grupos.get(row.auditor);
    g.ordenes.add(row.orden);
    if (row.estado === 'OK') g.skus++;
    if (row.novedad) g.novedades++;
  });
  
  tbody.innerHTML = '';
  for (const [auditor, vals] of grupos) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(auditor)}</td>
      <td>${escapeHTML(vals.ordenes.size)}</td>
      <td>${escapeHTML(vals.skus)}</td>
      <td>${escapeHTML(vals.novedades)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ============ USUARIOS ============
async function cargarUsuarios() {
  if (usuarioActual?.rol !== 'admin') {
    alert('Solo los administradores pueden gestionar usuarios.');
    return;
  }

  const res = await fetch('/api/usuarios');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      alert('No se pudieron cargar los usuarios. Reinicia el servidor para cargar la ultima version del backend.');
    } else {
      alert(data.error || `No se pudieron cargar los usuarios. Codigo: ${res.status}`);
    }
    return;
  }
  const data = await res.json();
  renderUsuarios(data);
  renderCatalogAdmin();
}

function renderUsuarios(data) {
  const tbody = document.querySelector('#usuariosTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach(user => {
    const tr = document.createElement('tr');
    const esUsuarioActual = Number(user.id) === Number(usuarioActual?.id);
    tr.innerHTML = `
      <td>${escapeHTML(user.username)}</td>
      <td>${escapeHTML(user.rol)}</td>
      <td>${escapeHTML(user.created_at || '')}</td>
      <td>
        <input type="password" class="user-password-input" data-password-for="${escapeHTML(user.id)}" placeholder="Nueva clave" autocomplete="new-password" />
        <button class="action-btn edit" data-user-action="password" data-id="${escapeHTML(user.id)}" data-username="${escapeHTML(user.username)}">Cambiar clave</button>
        <button class="action-btn delete" data-user-action="delete" data-id="${escapeHTML(user.id)}" data-username="${escapeHTML(user.username)}" ${esUsuarioActual ? 'disabled' : ''}>Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-user-action="password"]').forEach(button => {
    button.addEventListener('click', () => cambiarPasswordUsuario(button.dataset.id, button.dataset.username));
  });
  tbody.querySelectorAll('[data-user-action="delete"]').forEach(button => {
    button.addEventListener('click', () => eliminarUsuario(button.dataset.id, button.dataset.username));
  });
}

async function crearUsuario() {
  if (usuarioActual?.rol !== 'admin') {
    alert('Solo los administradores pueden crear usuarios.');
    return;
  }

  const username = document.getElementById('newUsername')?.value.trim();
  const password = document.getElementById('newPassword')?.value || '';
  const rol = document.getElementById('newRole')?.value || 'usuario';

  if (!username || !password) {
    alert('Usuario y contrasena son obligatorios.');
    return;
  }

  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, rol })
  });

  if (res.ok) {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newRole').value = 'usuario';
    await cargarUsuarios();
    alert('Usuario creado correctamente.');
  } else {
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      alert('No se pudo crear el usuario. Reinicia el servidor para cargar la ultima version del backend.');
    } else {
      alert(data.error || `No se pudo crear el usuario. Codigo: ${res.status}`);
    }
  }
}

async function cambiarPasswordUsuario(id, username) {
  const input = [...document.querySelectorAll('.user-password-input')]
    .find(el => el.dataset.passwordFor === String(id));
  const password = input?.value || '';
  if (password.length < 8) {
    alert('La contrasena debe tener minimo 8 caracteres.');
    return;
  }

  const res = await fetch(`/api/usuarios/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  if (res.ok) {
    if (input) input.value = '';
    alert('Contrasena actualizada.');
  } else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo cambiar la contrasena.');
  }
}

async function eliminarUsuario(id, username) {
  if (!confirm(`Eliminar el usuario ${username}?`)) return;

  const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await cargarUsuarios();
  } else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo eliminar el usuario.');
  }
}

// ============ EVENTOS INICIALES ============
function init() {
  verificarSesion();
  
  document.getElementById('parseButton')?.addEventListener('click', () => {
    const text = document.getElementById('sapInput').value;
    if (!text.trim()) return alert('Ingresa datos de SAP');
    const parsed = parseLines(text);
    if (!parsed.length) {
      // debug info: show how each raw line was parsed (up to 10 lines)
      const rawLines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    const sample = rawLines.slice(0, 50).map(l => {
        let p = null;
        try { p = parseSAPLine(l); } catch (e) { p = { error: String(e) }; }
        return { line: l, parsed: p };
      });
    const outEl = document.getElementById('parseDebug');
    if (outEl) {
      outEl.style.display = 'block';
      outEl.textContent = 'Entrada: ' + rawLines.length + ' lineas. Filas parseadas: ' + parsed.length + "\n\n" + JSON.stringify(sample, null, 2);
    } else {
      alert('Entrada: ' + rawLines.length + ' lineas. Filas parseadas: ' + parsed.length + '. Abre la consola para detalles.');
      console.log(sample);
    }
    return;
    }
    gestionRows.push(...parsed);
    renderGestion();
    document.getElementById('sapInput').value = '';
  });
  
  document.getElementById('limpiarInput')?.addEventListener('click', () => {
    document.getElementById('sapInput').value = '';
  });
  
  document.getElementById('saveAudit')?.addEventListener('click', guardarAuditoria);
  document.getElementById('clearGestion')?.addEventListener('click', () => {
    if (confirm('¿Limpiar todas las filas?')) {
      gestionRows = [];
      renderGestion();
    }
  });
  
  // Filtros
  ['filterOrden'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => renderGestion());
  });
  
  ['histOrden', 'histAuditor', 'histMercador', 'histFecha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => cargarHistorico());
  });
  
  ['resumenOrden', 'resumenAuditor', 'resumenMercador', 'resumenFecha', 'resumenMes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => cargarHistorico());
  });
  
  document.getElementById('analisisAuditor')?.addEventListener('input', () => cargarHistorico());
  document.getElementById('createUserBtn')?.addEventListener('click', crearUsuario);
  document.getElementById('catalogAdminType')?.addEventListener('change', renderCatalogAdmin);
  
  // Tabs
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'usuarios' && usuarioActual?.rol !== 'admin') {
        alert('Solo los administradores pueden gestionar usuarios.');
        return;
      }

      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'usuarios') cargarUsuarios();
      if (!['gestion', 'usuarios'].includes(btn.dataset.tab)) cargarHistorico();
    });
  });
}

init();
