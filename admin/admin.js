const isPreview = window.location.hostname.endsWith('github.io');
const loginPanel = document.querySelector('#login-panel');
const workspace = document.querySelector('#workspace');
const tokenInput = document.querySelector('#admin-token');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const list = document.querySelector('#application-list');
const details = document.querySelector('#details');
const statusFilter = document.querySelector('#status-filter');
const modeLabel = document.querySelector('#mode-label');
let adminToken = sessionStorage.getItem('remuvki-admin-token') || '';
let applications = [];

const statusLabels = { submitted:'Заявка получена', in_review:'На проверке', calculation:'Расчёт', awaiting_customer:'Ожидаем клиента', approved:'Согласовано', converted:'Передано в ЦЕХ', cancelled:'Отменено' };
const technologyLabels = { sublimation:'Сублимация', dtf:'DTF', film:'Плёнка', embroidery:'Вышивка', help:'Помочь выбрать' };
const demoApplications = [
  { id:'demo-1', public_number:'RM-DEMO-001', status:'submitted', assigned_manager_name:'Мария', customer_name:'Анна Смирнова', company_name:'Бренд одежды', phone:'+7 999 000-00-00', email:'anna@example.com', receiving_city:'Москва', desired_ship_date:'2026-09-15', technology_code:'sublimation', quantity:500, submitted_at:'2026-08-28T09:30:00Z' },
  { id:'demo-2', public_number:'RM-DEMO-002', status:'in_review', assigned_manager_name:'Алексей', customer_name:'Илья Волков', company_name:'Event Agency', phone:'+7 999 111-00-00', email:'ilya@example.com', receiving_city:'Санкт-Петербург', desired_ship_date:'2026-09-20', technology_code:'embroidery', quantity:200, submitted_at:'2026-08-28T08:10:00Z' },
];
const demoComments = {
  'demo-1': [],
  'demo-2': [{ author_name:'Алексей', body:'Проверить минимальную толщину линий в макете.', created_at:'2026-08-28T10:00:00Z' }],
};

function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value ?? '—'; return node.innerHTML; }
function escapeAttr(value) { return escapeHtml(value).replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function authHeaders() { return { authorization:`Bearer ${adminToken}` }; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:value.includes('T')?'short':undefined}).format(new Date(value)) : '—'; }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers:{ ...authHeaders(), ...(options.headers||{}) } });
  if (response.status === 401) throw new Error('unauthorized');
  if (!response.ok) throw new Error('request_failed');
  return response.json();
}

function renderList() {
  list.innerHTML = applications.length ? applications.map(item => `<button class="application-row" data-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.public_number)}</strong><small>${escapeHtml(item.company_name || item.customer_name)} · ${escapeHtml(item.quantity)} шт.</small></span><i class="status">${escapeHtml(statusLabels[item.status] || item.status)}</i></button>`).join('') : '<div class="empty">Заявок не найдено</div>';
  list.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => openApplication(button.dataset.id)));
}

async function loadApplications() {
  if (isPreview) applications = demoApplications.filter(item => !statusFilter.value || item.status === statusFilter.value);
  else applications = (await api(`/api/admin/applications?status=${encodeURIComponent(statusFilter.value)}`)).applications;
  renderList();
}

function detailMarkup(application, files = [], events = [], comments = []) {
  const rows = [['Контакт',application.customer_name],['Компания',application.company_name],['Телефон',application.phone],['Email',application.email],['Город',application.receiving_city],['Технология',technologyLabels[application.technology_code]||application.technology_code],['Тираж',`${application.quantity} шт.`],['Желаемая дата',formatDate(application.desired_ship_date)]];
  return `<div class="details-head"><div><small>${escapeHtml(formatDate(application.submitted_at))}</small><h2>${escapeHtml(application.public_number)}</h2><p>${escapeHtml(application.company_name || application.customer_name)}</p></div><span class="status">${escapeHtml(statusLabels[application.status] || application.status)}</span></div><dl class="details-grid">${rows.map(([key,value])=>`<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><section><h3>Менеджер</h3><div class="assignment-control"><input id="manager-name" value="${escapeAttr(application.assigned_manager_name||'')}" placeholder="Имя менеджера"><button id="save-manager">Назначить</button></div></section><section><h3>Статус</h3><div class="status-control"><select id="detail-status">${Object.entries(statusLabels).map(([code,label])=>`<option value="${code}" ${code===application.status?'selected':''}>${label}</option>`).join('')}</select><button id="save-status">Сохранить</button></div></section><section><h3>Внутренние комментарии</h3><div class="comment-form"><input id="comment-author" value="${escapeAttr(application.assigned_manager_name||'')}" placeholder="Автор"><input id="comment-body" placeholder="Комментарий для команды"><button id="add-comment">Добавить</button></div><div id="comments-list">${comments.length?comments.map(comment=>`<div class="comment-row"><strong>${escapeHtml(comment.author_name)}</strong><p>${escapeHtml(comment.body)}</p><small>${escapeHtml(formatDate(comment.created_at))}</small></div>`).join(''):'<p>Комментариев пока нет</p>'}</div></section><section><h3>Файлы</h3>${files.length?files.map(file=>`<div class="file-row"><strong>${escapeHtml(file.original_name)}</strong><br><small>${escapeHtml(file.mime_type)} · ${Math.ceil(file.size_bytes/1024)} КБ · ${escapeHtml(file.scan_status)}</small></div>`).join(''):'<p>Файлов нет</p>'}</section><section><h3>История</h3>${events.length?events.map(event=>`<div class="event-row"><strong>${escapeHtml(event.event_type)}</strong><br><small>${escapeHtml(formatDate(event.created_at))}</small></div>`).join(''):'<p>История пока пуста</p>'}</section>`;
}

async function openApplication(id) {
  list.querySelectorAll('[data-id]').forEach(row => row.classList.toggle('is-active', row.dataset.id === id));
  let data;
  if (isPreview) data = { application:demoApplications.find(item=>item.id===id), files:id==='demo-2'?[{original_name:'maket.pdf',mime_type:'application/pdf',size_bytes:240000,scan_status:'pending'}]:[], events:[{event_type:'application_submitted',created_at:'2026-08-28T09:30:00Z'}], comments:demoComments[id] };
  else data = await api(`/api/admin/applications/${id}`);
  details.innerHTML = detailMarkup(data.application, data.files, data.events, data.comments);
  document.querySelector('#save-status').addEventListener('click', async () => {
    const status = document.querySelector('#detail-status').value;
    if (isPreview) data.application.status = status;
    else await api(`/api/admin/applications/${id}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({status}) });
    await loadApplications();
    if (applications.some(item=>item.id===id)) openApplication(id);
  });
  document.querySelector('#save-manager').addEventListener('click', async () => {
    const managerName = document.querySelector('#manager-name').value.trim();
    if (!managerName) return;
    if (isPreview) data.application.assigned_manager_name = managerName;
    else await api(`/api/admin/applications/${id}/assignment`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({manager_name:managerName}) });
    await loadApplications(); openApplication(id);
  });
  document.querySelector('#add-comment').addEventListener('click', async () => {
    const authorName = document.querySelector('#comment-author').value.trim();
    const body = document.querySelector('#comment-body').value.trim();
    if (!authorName || !body) return;
    if (isPreview) data.comments.unshift({author_name:authorName,body,created_at:new Date().toISOString()});
    else await api(`/api/admin/applications/${id}/comments`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({author_name:authorName,body}) });
    openApplication(id);
  });
}

async function login() {
  loginError.textContent = '';
  if (isPreview) { adminToken='demo'; modeLabel.textContent='Демонстрационные данные'; }
  else { adminToken=tokenInput.value.trim(); if (!adminToken) { loginError.textContent='Введите секрет администратора.'; return; } }
  try {
    await loadApplications();
    if (!isPreview) sessionStorage.setItem('remuvki-admin-token',adminToken);
    loginPanel.classList.add('is-hidden'); workspace.classList.remove('is-hidden');
  } catch (error) { loginError.textContent=error.message==='unauthorized'?'Неверный секрет администратора.':'Не удалось загрузить заявки.'; }
}

loginButton.addEventListener('click', login);
tokenInput.addEventListener('keydown', event => { if (event.key==='Enter') login(); });
statusFilter.addEventListener('change', loadApplications);
if (isPreview) { tokenInput.closest('label').classList.add('is-hidden'); loginButton.textContent='Открыть демо-админку'; }
else if (adminToken) { tokenInput.value=adminToken; login(); }
