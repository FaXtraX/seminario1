const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let me = null;
let booted = false;

async function api(url, opt = {}) {
  const r = await fetch(url, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || 'Ocurrió un error.');
  return d;
}

function toast(message) {
  const x = $('#toast');
  x.textContent = message;
  x.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => x.style.display = 'none', 3000);
}

function validPage(id) {
  return id && document.getElementById(id)?.classList.contains('page');
}

function go(id, { push = true } = {}) {
  if (!validPage(id)) id = 'inicio';

  $$('.page').forEach(x => x.classList.remove('active'));
  $('#' + id).classList.add('active');

  const url = id === 'inicio' ? location.pathname : `${location.pathname}#${id}`;
  if (push) history.pushState({ page: id }, '', url);

  if (id === 'mis-reportes' && me) loadMy().catch(e => toast(e.message));
  if (id === 'admin' && me?.role === 'admin') loadAdmin().catch(e => toast(e.message));

  scrollTo({ top: 0, behavior: 'smooth' });
}

function nav() {
  const n = $('#nav');
  n.innerHTML = me
    ? `<button data-go="inicio">Inicio</button>
       <button data-go="reportar">Reportar</button>
       <button data-go="mis-reportes">Mis reportes</button>
       ${me.role === 'admin' ? '<button data-go="admin">Administración</button>' : ''}
       <button id="logout">Salir</button>`
    : `<button data-go="inicio">Inicio</button>
       <button data-go="auth">Iniciar sesión</button>`;
}

function setAuth(mode) {
  $('#loginForm').classList.toggle('hidden', mode !== 'login');
  $('#registerForm').classList.toggle('hidden', mode !== 'register');
}

function initialPage() {
  const hash = location.hash.slice(1);
  if (hash === 'auth') return 'auth';
  if (hash === 'reportar' && me) return 'reportar';
  if (hash === 'mis-reportes' && me) return 'mis-reportes';
  if (hash === 'admin' && me?.role === 'admin') return 'admin';
  return 'inicio';
}

async function init() {
  const d = await api('/api/me');
  me = d.user;
  nav();
  booted = true;
  go(initialPage(), { push: false });
}

window.addEventListener('popstate', () => {
  go(location.hash.slice(1) || 'inicio', { push: false });
});

window.addEventListener('hashchange', () => {
  // Compatibilidad con enlaces #inicio/#auth y botones externos.
  if (!booted) return;
  go(location.hash.slice(1) || 'inicio', { push: false });
});

document.addEventListener('click', async e => {
  const g = e.target.closest('[data-go]');
  if (g) {
    e.preventDefault();
    go(g.dataset.go);
    return;
  }

  const auth = e.target.closest('[data-auth]');
  if (auth) {
    e.preventDefault();
    setAuth(auth.dataset.auth);
    go('auth');
    return;
  }

  if (e.target.id === 'logout') {
    try {
      await api('/api/logout', { method: 'POST' });
      me = null;
      nav();
      go('inicio');
      toast('Sesión cerrada.');
    } catch (err) {
      toast(err.message);
    }
  }
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginMsg').textContent = 'Ingresando...';
  try {
    const d = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('#loginEmail').value,
        password: $('#loginPassword').value
      })
    });
    me = d.user;
    nav();
    go(me.role === 'admin' ? 'admin' : 'mis-reportes');
    toast('Bienvenido/a.');
  } catch (x) {
    $('#loginMsg').textContent = x.message;
    $('#loginMsg').style.color = '#b42318';
  }
});

$('#registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#regMsg').textContent = 'Creando cuenta...';
  try {
    const d = await api('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#regName').value,
        email: $('#regEmail').value,
        password: $('#regPassword').value
      })
    });
    me = d.user;
    nav();
    go('mis-reportes');
    toast('Cuenta creada correctamente.');
  } catch (x) {
    $('#regMsg').textContent = x.message;
    $('#regMsg').style.color = '#b42318';
  }
});

const photoInput = $('#photos');
photoInput.addEventListener('change', () => {
  const files = [...photoInput.files];
  $('#preview').innerHTML = files.slice(0, 5)
    .map(f => `<img alt="Vista previa" src="${URL.createObjectURL(f)}">`)
    .join('');
});

$('#reportForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!me) {
    go('auth');
    setAuth('login');
    return;
  }

  const files = [...photoInput.files];
  if (files.length > 5) {
    $('#reportMsg').textContent = 'Podés adjuntar como máximo 5 fotos.';
    return;
  }
  if (files.some(f => f.size > 5 * 1024 * 1024)) {
    $('#reportMsg').textContent = 'Cada foto debe pesar como máximo 5 MB.';
    return;
  }

  const fd = new FormData();
  fd.append('type', $('#type').value);
  fd.append('zone', $('#zone').value);
  fd.append('description', $('#description').value);
  fd.append('priority', $('#priority').value);
  files.forEach(f => fd.append('photos', f));

  try {
    await api('/api/reports', { method: 'POST', body: fd });
    e.target.reset();
    $('#preview').innerHTML = '';
    $('#reportMsg').textContent = '✓ Reporte enviado correctamente.';
    $('#reportMsg').style.color = '#067647';
    toast('Reporte enviado.');
  } catch (x) {
    $('#reportMsg').textContent = x.message;
    $('#reportMsg').style.color = '#b42318';
  }
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

function photosHTML(ps) {
  return ps.length
    ? `<div class="photos">${ps.map(p =>
        `<a href="${p.url}" target="_blank" rel="noopener">
           <img class="photo" src="${p.url}" alt="Evidencia: ${escapeHtml(p.original_name)}">
         </a>`).join('')}</div>`
    : '';
}

function card(r, admin = false) {
  return `<article class="reporte">
    <h3>${escapeHtml(r.type)} <span class="reportId">#${r.id}</span></h3>
    <div class="meta">
      <span class="tag ${r.priority === 'Alta' ? 'alta' : ''}">${r.priority}</span>
      <span class="tag">${escapeHtml(r.status)}</span>
      <span class="tag">${new Date(r.created_at).toLocaleString('es-AR')}</span>
    </div>
    ${admin ? `<p><strong>Usuario:</strong> ${escapeHtml(r.user_name)} · ${escapeHtml(r.user_email)}</p>` : ''}
    <p><strong>Zona:</strong> ${escapeHtml(r.zone)}</p>
    <p><strong>Descripción:</strong> ${escapeHtml(r.description)}</p>
    ${r.admin_note ? `<p><strong>Observación:</strong> ${escapeHtml(r.admin_note)}</p>` : ''}
    ${photosHTML(r.photos)}
    ${admin ? `<div class="actions">
      <select data-status="${r.id}">
        ${['Pendiente','En revisión','Resuelto','Rechazado']
          .map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input data-note="${r.id}" placeholder="Observación para el usuario" value="${escapeHtml(r.admin_note || '')}">
      <button data-save="${r.id}">Guardar</button>
      <button class="danger" data-delete-report="${r.id}">Eliminar</button>
    </div>` : ''}
  </article>`;
}

async function loadMy() {
  const d = await api('/api/reports');
  $('#myReports').innerHTML = d.reports.length
    ? d.reports.map(r => card(r)).join('')
    : '<div class="empty">Todavía no tenés reportes.</div>';
}

async function loadAdmin() {
  const [s, r, u] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/reports'),
    api('/api/admin/users')
  ]);

  $('#stats').innerHTML = `
    <div class="stat"><strong>${s.total}</strong><span>Reportes totales</span></div>
    <div class="stat"><strong>${s.pending}</strong><span>Pendientes</span></div>
    <div class="stat"><strong>${s.resolved}</strong><span>Resueltos</span></div>
    <div class="stat"><strong>${s.users}</strong><span>Usuarios</span></div>`;

  $('#adminReports').innerHTML = r.reports.length
    ? r.reports.map(x => card(x, true)).join('')
    : '<div class="empty">No hay reportes.</div>';

  $('#adminUsers').innerHTML = u.users.map(x => `
    <article class="user">
      <div>
        <strong>${escapeHtml(x.name)}</strong>
        <small>${escapeHtml(x.email)} · ${x.role === 'admin' ? 'Administrador' : 'Usuario'}</small>
      </div>
      <div class="actions">
        ${x.role === 'user'
          ? `<button data-toggle-user="${x.id}" data-active="${x.active}">
               ${x.active ? 'Desactivar' : 'Activar'}
             </button>
             <button class="danger" data-delete-user="${x.id}">Eliminar</button>`
          : '<span class="tag">Cuenta administradora</span>'}
      </div>
    </article>`).join('');
}

document.addEventListener('click', async e => {
  try {
    if (e.target.dataset.save) {
      const id = e.target.dataset.save;
      await api('/api/reports/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: $(`[data-status="${id}"]`).value,
          admin_note: $(`[data-note="${id}"]`).value
        })
      });
      toast('Reporte actualizado.');
      loadAdmin();
    }

    if (e.target.dataset.deleteReport && confirm('¿Eliminar este reporte y sus fotos?')) {
      await api('/api/reports/' + e.target.dataset.deleteReport, { method: 'DELETE' });
      toast('Reporte eliminado.');
      loadAdmin();
    }

    if (e.target.dataset.toggleUser) {
      await api('/api/admin/users/' + e.target.dataset.toggleUser, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: e.target.dataset.active !== 'true' })
      });
      loadAdmin();
    }

    if (e.target.dataset.deleteUser && confirm('¿Eliminar este usuario y todos sus reportes?')) {
      await api('/api/admin/users/' + e.target.dataset.deleteUser, { method: 'DELETE' });
      toast('Usuario eliminado.');
      loadAdmin();
    }
  } catch (x) {
    toast(x.message);
  }
});

$$('[data-admin-tab]').forEach(b => b.addEventListener('click', () => {
  $$('[data-admin-tab]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $('#adminReports').classList.toggle('hidden', b.dataset.adminTab !== 'reports');
  $('#adminUsers').classList.toggle('hidden', b.dataset.adminTab !== 'users');
}));

init().catch(err => {
  console.error(err);
  toast('No se pudo conectar con el servidor. Verificá que Node esté ejecutando la aplicación.');
});
