import {
  LEAD_STATUS, LEAD_TEMPERATURES, MODALITIES, INTERACTION_CHANNELS,
  TASK_TYPES, PRIORITIES, ENROLLMENT_STATUS, PAYMENT_METHODS,
  PAYMENT_STATUS, ACTION_STATUS
} from './config.js';
import { supabase, crm } from './api.js';
import { exportExcel, exportPDF, exportJSON } from './export.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const statusMap = Object.fromEntries(LEAD_STATUS);
const tempMap = Object.fromEntries(LEAD_TEMPERATURES);
const modalityMap = Object.fromEntries(MODALITIES);
const channelMap = Object.fromEntries(INTERACTION_CHANNELS);
const taskTypeMap = Object.fromEntries(TASK_TYPES);
const priorityMap = Object.fromEntries(PRIORITIES);
const enrollmentStatusMap = Object.fromEntries(ENROLLMENT_STATUS);
const paymentMethodMap = Object.fromEntries(PAYMENT_METHODS);
const paymentStatusMap = Object.fromEntries(PAYMENT_STATUS);
const actionStatusMap = Object.fromEntries(ACTION_STATUS);

const state = {
  user: null,
  profile: null,
  workspaceId: null,
  data: emptyData(),
  month: localMonth(),
  currentPage: 'dashboard',
  leadView: 'table',
  charts: {},
  currentDetailLead: null
};

function emptyData() {
  return { courses: [], sources: [], leads: [], interests: [], interactions: [], tasks: [], enrollments: [], payments: [], plans: [], actions: [] };
}

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function startOfMonth(month = state.month) { return `${month}-01`; }
function endOfMonth(month = state.month) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 0, 23, 59, 59, 999);
}
function inSelectedMonth(value) {
  if (!value) return false;
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const [year, mon] = state.month.split('-').map(Number);
  return d.getFullYear() === year && d.getMonth() === mon - 1;
}
function monthLabel(month = state.month) {
  const [year, mon] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, mon - 1, 1));
}
function formatMoney(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }
function formatDate(value) {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(date);
}
function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function toLocalInput(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function optionList(items, selected = '', includeBlank = false, blankLabel = 'Selecione') {
  return `${includeBlank ? `<option value="">${escapeHTML(blankLabel)}</option>` : ''}${items.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}`;
}
function selectedValues(select) { return [...select.selectedOptions].map(option => option.value).filter(Boolean); }
function leadName(id) { return state.data.leads.find(item => item.id === id)?.full_name || ''; }
function sourceName(id) { return state.data.sources.find(item => item.id === id)?.name || ''; }
function enrollmentName(id) { return state.data.enrollments.find(item => item.id === id)?.student_name || ''; }
function courseNames(leadId) { return state.data.interests.filter(item => item.lead_id === leadId).map(item => item.courses?.name || state.data.courses.find(c => c.id === item.course_id)?.name).filter(Boolean); }
function getCurrentPlan() { return state.data.plans.find(plan => String(plan.reference_month).slice(0, 7) === state.month); }
function getPlanActions() {
  const plan = getCurrentPlan();
  return plan ? state.data.actions.filter(action => action.monthly_plan_id === plan.id) : [];
}
function safeNumber(value) { return Number(value || 0); }
function percent(value, target) { return target > 0 ? Math.min(100, (value / target) * 100) : 0; }

function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('#toast-container').appendChild(node);
  setTimeout(() => node.remove(), 3800);
}
function setLoading(active) { $('#loading-state').classList.toggle('hidden', !active); }
function setButtonLoading(button, active, label = 'Salvando...') {
  if (!button) return;
  if (active) { button.dataset.original = button.innerHTML; button.innerHTML = label; button.disabled = true; }
  else { button.innerHTML = button.dataset.original || button.innerHTML; button.disabled = false; }
}
function openDialog(selector) { const dialog = $(selector); if (dialog && !dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog?.open) dialog.close(); }
function confirmAction(message) { return window.confirm(message); }
function normalizePhone(value) { return String(value || '').replace(/\D/g, ''); }
function whatsAppLink(value) {
  const digits = normalizePhone(value);
  if (!digits) return '#';
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

function metrics() {
  const monthLeads = state.data.leads.filter(item => inSelectedMonth(item.created_at));
  const monthEnrollments = state.data.enrollments.filter(item => inSelectedMonth(item.enrollment_date) && item.status !== 'cancelada');
  const generatedRevenue = monthEnrollments.reduce((sum, item) => sum + safeNumber(item.total_contract_value), 0);
  const monthPayments = state.data.payments.filter(item => item.status === 'recebido' && inSelectedMonth(item.paid_at));
  const receivedRevenue = monthPayments.reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const totalRevenue = state.data.payments.filter(item => item.status === 'recebido').reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const pendingTasks = state.data.tasks.filter(item => item.status === 'pendente');
  const now = new Date();
  const overdueTasks = pendingTasks.filter(item => new Date(item.due_at) < now).length;
  const conversionRate = monthLeads.length ? (monthEnrollments.length / monthLeads.length) * 100 : 0;
  const averageTicket = monthEnrollments.length ? generatedRevenue / monthEnrollments.length : 0;
  const proposals = state.data.interactions.filter(item => inSelectedMonth(item.occurred_at) && safeNumber(item.proposal_amount) > 0).length;
  return {
    monthLeads: monthLeads.length,
    monthEnrollments: monthEnrollments.length,
    generatedRevenue,
    receivedRevenue,
    totalRevenue,
    pendingTasks: pendingTasks.length,
    overdueTasks,
    conversionRate,
    averageTicket,
    proposals
  };
}

async function init() {
  populateStaticSelects();
  bindEvents();
  $('#global-month').value = state.month;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) await enterApp(session.user);
  else showLogin();

  supabase.auth.onAuthStateChange(async (event, sessionState) => {
    if (event === 'SIGNED_OUT') showLogin();
    if (event === 'SIGNED_IN' && sessionState?.user && state.user?.id !== sessionState.user.id) await enterApp(sessionState.user);
  });
}

function populateStaticSelects() {
  $('#lead-status-filter').innerHTML = `<option value="">Todos os status</option>${optionList(LEAD_STATUS)}`;
  $('#lead-modality').innerHTML = optionList(MODALITIES, '', true, 'Não informado');
  $('#lead-temperature').innerHTML = optionList(LEAD_TEMPERATURES, 'morno');
  $('#lead-status').innerHTML = optionList(LEAD_STATUS, 'novo');
  $('#interaction-channel').innerHTML = optionList(INTERACTION_CHANNELS, 'whatsapp');
  $('#task-type').innerHTML = optionList(TASK_TYPES, 'follow_up');
  $('#task-priority').innerHTML = optionList(PRIORITIES, 'media');
  $('#enrollment-method').innerHTML = optionList(PAYMENT_METHODS, '', true, 'Não informado');
  $('#enrollment-status').innerHTML = optionList(ENROLLMENT_STATUS, 'ativa');
  $('#payment-method').innerHTML = optionList(PAYMENT_METHODS, 'pix');
  $('#payment-status').innerHTML = optionList(PAYMENT_STATUS, 'recebido');
  $('#action-status').innerHTML = optionList(ACTION_STATUS, 'nao_iniciada');
  $('#simple-modality').innerHTML = optionList(MODALITIES, '', true, 'Não informado');
}

function bindEvents() {
  $('#login-form').addEventListener('submit', handleLogin);
  $('#logout-button').addEventListener('click', () => supabase.auth.signOut());
  $('#sidebar-open').addEventListener('click', () => toggleSidebar(true));
  $('#sidebar-close').addEventListener('click', () => toggleSidebar(false));
  $('#sidebar-overlay').addEventListener('click', () => toggleSidebar(false));

  $$('.nav-item').forEach(button => button.addEventListener('click', () => goPage(button.dataset.page)));
  $$('[data-go-page]').forEach(button => button.addEventListener('click', () => goPage(button.dataset.goPage)));
  $('#global-month').addEventListener('change', event => { state.month = event.target.value || localMonth(); renderAll(); });

  $('#quick-lead-button').addEventListener('click', () => openLeadForm());
  $('#new-lead-button').addEventListener('click', () => openLeadForm());
  $('#lead-form').addEventListener('submit', saveLead);
  $('#lead-status').addEventListener('change', event => $('#lost-reason-field').classList.toggle('hidden', event.target.value !== 'perdido'));
  $('#lead-search').addEventListener('input', renderLeads);
  $('#lead-status-filter').addEventListener('change', renderLeads);
  $$('[data-lead-view]').forEach(button => button.addEventListener('click', () => setLeadView(button.dataset.leadView)));
  $('#interaction-form').addEventListener('submit', saveInteraction);

  $('#new-task-button').addEventListener('click', () => openTaskForm());
  $('#task-form').addEventListener('submit', saveTask);
  $('#task-filter').addEventListener('change', renderTasks);

  $('#new-enrollment-button').addEventListener('click', () => openEnrollmentForm());
  $('#enrollment-form').addEventListener('submit', saveEnrollment);
  $('#enrollment-lead').addEventListener('change', event => {
    const lead = state.data.leads.find(item => item.id === event.target.value);
    if (lead && !$('#enrollment-id').value) $('#enrollment-student').value = lead.full_name;
  });
  $('#enrollment-contract').addEventListener('input', autoInstallmentValue);
  $('#enrollment-installments').addEventListener('input', autoInstallmentValue);

  $('#new-payment-button').addEventListener('click', () => openPaymentForm());
  $('#payment-form').addEventListener('submit', savePayment);

  $('#edit-plan-button').addEventListener('click', openPlanForm);
  $('#plan-form').addEventListener('submit', savePlan);
  $('#new-action-button').addEventListener('click', () => openActionForm());
  $('#action-form').addEventListener('submit', saveAction);

  $('#new-course-button').addEventListener('click', () => openSimpleForm('course'));
  $('#new-source-button').addEventListener('click', () => openSimpleForm('source'));
  $('#simple-form').addEventListener('submit', saveSimpleItem);

  $('#export-excel-button').addEventListener('click', () => runExport('excel'));
  $('#export-pdf-button').addEventListener('click', () => runExport('pdf'));
  $('#export-json-button').addEventListener('click', () => runExport('json'));

  $$('.dialog-close').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeDialog(dialog);
  }));

  document.addEventListener('click', handleDelegatedClick);
  document.addEventListener('change', handleDelegatedChange);
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $('#login-button');
  setButtonLoading(button, true, 'Entrando...');
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('#login-email').value.trim(),
      password: $('#login-password').value
    });
    if (error) throw error;
  } catch (error) {
    toast(authErrorMessage(error), 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function authErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  return error?.message || 'Não foi possível entrar.';
}

async function enterApp(user) {
  setLoading(true);
  try {
    state.user = user;
    state.workspaceId = await crm.bootstrap(user);
    state.profile = await crm.getProfile();
    showApp();
    await refreshData(false);
  } catch (error) {
    console.error(error);
    toast(`Falha ao iniciar o CRM: ${error.message}`, 'error');
    await supabase.auth.signOut();
  } finally {
    setLoading(false);
  }
}

function showLogin() {
  state.user = null;
  state.profile = null;
  state.data = emptyData();
  $('#login-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
}

function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  const name = state.profile?.full_name || state.user?.email?.split('@')[0] || 'Usuário';
  $('#user-name').textContent = name;
  $('#user-email').textContent = state.user?.email || '';
  $('#user-avatar').textContent = name.split(/\s+/).slice(0,2).map(item => item[0]).join('').toUpperCase();
}

async function refreshData(withLoading = true) {
  if (withLoading) setLoading(true);
  try {
    state.data = await crm.getAllData();
    renderAll();
  } catch (error) {
    console.error(error);
    toast(`Não foi possível atualizar os dados: ${error.message}`, 'error');
  } finally {
    if (withLoading) setLoading(false);
  }
}

function renderAll() {
  refreshDynamicSelects();
  renderDashboard();
  renderLeads();
  renderTasks();
  renderEnrollments();
  renderFinance();
  renderPlanning();
  renderSettings();
}

function refreshDynamicSelects() {
  const activeCourses = state.data.courses.filter(item => item.active);
  const activeSources = state.data.sources.filter(item => item.active);
  $('#lead-source').innerHTML = `<option value="">Não informado</option>${activeSources.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join('')}`;
  $('#lead-courses').innerHTML = activeCourses.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join('');
  $('#task-lead').innerHTML = `<option value="">Sem lead relacionado</option>${state.data.leads.map(item => `<option value="${item.id}">${escapeHTML(item.full_name)}</option>`).join('')}`;
  $('#enrollment-lead').innerHTML = `<option value="">Sem lead relacionado</option>${state.data.leads.map(item => `<option value="${item.id}">${escapeHTML(item.full_name)}</option>`).join('')}`;
  $('#enrollment-course').innerHTML = `<option value="">Não informado</option>${activeCourses.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join('')}`;
  $('#payment-enrollment').innerHTML = `<option value="">Selecione</option>${state.data.enrollments.filter(item => item.status !== 'cancelada').map(item => `<option value="${item.id}">${escapeHTML(item.student_name)} • ${escapeHTML(item.courses?.name || 'Curso')}</option>`).join('')}`;
}

function goPage(page) {
  state.currentPage = page;
  const titles = {
    dashboard: ['VISÃO GERAL', 'Dashboard'], leads: ['RELACIONAMENTO', 'Leads'], agenda: ['ROTINA COMERCIAL', 'Agenda e follow-up'],
    enrollments: ['CONVERSÕES', 'Matrículas'], finance: ['RESULTADOS', 'Financeiro'], planning: ['ESTRATÉGIA', 'Planejamento 5W2H'],
    reports: ['DADOS E SEGURANÇA', 'Relatórios'], settings: ['CONFIGURAÇÕES', 'Cadastros auxiliares']
  };
  $$('.page').forEach(node => node.classList.remove('active-page'));
  $(`#page-${page}`).classList.add('active-page');
  $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.page === page));
  $('#page-eyebrow').textContent = titles[page][0];
  $('#page-title').textContent = titles[page][1];
  toggleSidebar(false);
  if (page === 'dashboard') renderDashboard();
}

function toggleSidebar(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#sidebar-overlay').classList.toggle('open', open);
}

function renderDashboard() {
  const m = metrics();
  const kpis = [
    ['Leads no mês', m.monthLeads, '◎', `${monthLabel()} selecionado`, ''],
    ['Matrículas no mês', m.monthEnrollments, '✓', `${m.conversionRate.toFixed(1)}% de conversão`, 'success'],
    ['Receita gerada', formatMoney(m.generatedRevenue), '↗', 'Valor dos contratos fechados', 'info'],
    ['Faturamento recebido', formatMoney(m.receivedRevenue), '$', `${formatMoney(m.totalRevenue)} recebido no total`, 'success'],
    ['Follow-ups pendentes', m.pendingTasks, '◷', `${m.overdueTasks} atrasado(s)`, m.overdueTasks ? 'warning' : ''],
    ['Propostas no mês', m.proposals, '◇', 'Atendimentos com valor proposto', ''],
    ['Ticket médio', formatMoney(m.averageTicket), '≈', 'Por matrícula realizada', 'info'],
    ['Leads ativos', state.data.leads.filter(item => !['matriculado','perdido'].includes(item.status)).length, '●', 'Em andamento no funil', '']
  ];
  $('#dashboard-kpis').innerHTML = kpis.map(([label, value, icon, help, tone]) => `
    <article class="kpi-card ${tone}">
      <div class="kpi-top"><span class="kpi-label">${escapeHTML(label)}</span><span class="kpi-icon">${icon}</span></div>
      <div class="kpi-value">${escapeHTML(value)}</div><div class="kpi-help">${escapeHTML(help)}</div>
    </article>`).join('');

  renderRevenueChart();
  renderFunnelChart();
  renderGoalProgress(m);
  renderDashboardTasks();
}

function renderRevenueChart() {
  const months = [];
  const base = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`);
  }
  const generated = months.map(month => state.data.enrollments.filter(item => item.status !== 'cancelada' && String(item.enrollment_date).startsWith(month)).reduce((sum,item) => sum + safeNumber(item.total_contract_value),0));
  const received = months.map(month => state.data.payments.filter(item => item.status === 'recebido' && String(item.paid_at || '').startsWith(month)).reduce((sum,item) => sum + safeNumber(item.amount),0));
  const labels = months.map(month => monthLabel(month).replace(/ de /g,' ').replace(/^./, c => c.toUpperCase()));
  state.charts.revenue?.destroy();
  state.charts.revenue = new Chart($('#revenue-chart'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Receita gerada', data: generated, tension: .35, fill: false, borderWidth: 3 },
      { label: 'Recebido', data: received, tension: .35, fill: false, borderWidth: 3 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: value => `R$ ${Number(value).toLocaleString('pt-BR')}` } }, x: { grid: { display: false } } } }
  });
}

function renderFunnelChart() {
  const labels = LEAD_STATUS.map(([,label]) => label);
  const values = LEAD_STATUS.map(([key]) => state.data.leads.filter(item => item.status === key).length);
  state.charts.funnel?.destroy();
  state.charts.funnel = new Chart($('#funnel-chart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Leads', data: values, borderRadius: 8 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } }
  });
}

function renderGoalProgress(m) {
  const plan = getCurrentPlan();
  if (!plan) {
    $('#goal-progress').innerHTML = `<div class="empty-state"><strong>Sem metas cadastradas</strong>Crie o planejamento de ${escapeHTML(monthLabel())} para acompanhar o progresso.<br><br><button class="btn btn-primary btn-sm" data-open-plan>Cadastrar metas</button></div>`;
    return;
  }
  const items = [
    ['Leads', m.monthLeads, plan.target_leads, String(m.monthLeads)],
    ['Matrículas', m.monthEnrollments, plan.target_enrollments, String(m.monthEnrollments)],
    ['Receita gerada', m.generatedRevenue, safeNumber(plan.target_generated_revenue), formatMoney(m.generatedRevenue)],
    ['Faturamento recebido', m.receivedRevenue, safeNumber(plan.target_received_revenue), formatMoney(m.receivedRevenue)]
  ];
  $('#goal-progress').innerHTML = items.map(([label,current,target,display]) => `
    <div class="goal-item"><div class="goal-line"><span>${escapeHTML(label)}</span><strong>${escapeHTML(display)} / ${label.includes('Receita') || label.includes('Faturamento') ? formatMoney(target) : target}</strong></div>
    <div class="progress-track"><div class="progress-fill" style="width:${percent(current,target)}%"></div></div></div>`).join('');
}

function renderDashboardTasks() {
  const items = state.data.tasks.filter(item => item.status === 'pendente').sort((a,b) => new Date(a.due_at)-new Date(b.due_at)).slice(0,6);
  $('#dashboard-tasks').innerHTML = items.length ? `<table><thead><tr><th>Tarefa</th><th>Lead</th><th>Prazo</th><th>Prioridade</th></tr></thead><tbody>${items.map(task => `<tr><td class="cell-main">${escapeHTML(task.title)}</td><td>${escapeHTML(leadName(task.lead_id) || '—')}</td><td>${formatDateTime(task.due_at)}</td><td>${priorityBadge(task.priority)}</td></tr>`).join('')}</tbody></table>` : emptyState('Agenda limpa', 'Nenhum follow-up pendente no momento.');
}

function renderLeads() {
  const search = $('#lead-search').value.trim().toLowerCase();
  const status = $('#lead-status-filter').value;
  const filtered = state.data.leads.filter(lead => {
    const haystack = [lead.full_name, lead.whatsapp, lead.phone, lead.email, ...courseNames(lead.id)].join(' ').toLowerCase();
    return (!search || haystack.includes(search)) && (!status || lead.status === status);
  });
  renderLeadsTable(filtered);
  renderKanban(filtered);
}

function renderLeadsTable(leads) {
  $('#leads-table-view').innerHTML = leads.length ? `<div class="table-wrap"><table><thead><tr><th>Lead</th><th>Interesse</th><th>Origem</th><th>Status</th><th>Próximo contato</th><th></th></tr></thead><tbody>${leads.map(lead => `
    <tr>
      <td><span class="cell-main">${escapeHTML(lead.full_name)}</span><span class="cell-sub">${escapeHTML(lead.whatsapp || lead.phone || lead.email || 'Sem contato')}</span></td>
      <td>${escapeHTML(courseNames(lead.id).join(', ') || 'Não informado')}</td>
      <td>${escapeHTML(sourceName(lead.source_id) || '—')}</td>
      <td>${statusBadge(lead.status)} <span class="temperature-dot temp-${lead.temperature}" title="${escapeHTML(tempMap[lead.temperature])}"></span></td>
      <td>${formatDateTime(lead.next_contact_at)}</td>
      <td><div class="table-actions"><button class="table-action" data-detail-lead="${lead.id}">Abrir</button><button class="table-action" data-edit-lead="${lead.id}">Editar</button>${lead.whatsapp ? `<a class="table-action" href="${whatsAppLink(lead.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></td>
    </tr>`).join('')}</tbody></table></div>` : emptyState('Nenhum lead encontrado', 'Cadastre um novo lead ou ajuste os filtros.');
}

function renderKanban(leads) {
  $('#leads-kanban-view').innerHTML = LEAD_STATUS.map(([key,label]) => {
    const items = leads.filter(lead => lead.status === key);
    return `<section class="kanban-column"><div class="kanban-head"><span>${escapeHTML(label)}</span><span class="kanban-count">${items.length}</span></div><div class="kanban-cards">${items.map(lead => `
      <article class="kanban-card" data-detail-lead="${lead.id}"><h3>${escapeHTML(lead.full_name)}</h3><p>${escapeHTML(courseNames(lead.id).join(', ') || 'Interesse não informado')}</p><p>${escapeHTML(lead.whatsapp || lead.phone || 'Sem telefone')}</p>
      <select data-quick-status="${lead.id}" aria-label="Alterar status">${optionList(LEAD_STATUS, lead.status)}</select></article>`).join('') || '<div class="empty-state">Sem leads</div>'}</div></section>`;
  }).join('');
}

function setLeadView(view) {
  state.leadView = view;
  $$('[data-lead-view]').forEach(button => button.classList.toggle('active', button.dataset.leadView === view));
  $('#leads-table-view').classList.toggle('hidden', view !== 'table');
  $('#leads-kanban-view').classList.toggle('hidden', view !== 'kanban');
}

function renderTasks() {
  const now = new Date();
  const today = todayISO();
  const pending = state.data.tasks.filter(item => item.status === 'pendente');
  const overdue = pending.filter(item => new Date(item.due_at) < now);
  const todayItems = pending.filter(item => String(item.due_at).slice(0,10) === today);
  $('#task-summary-pills').innerHTML = `<span class="summary-pill">Pendentes <strong>${pending.length}</strong></span><span class="summary-pill danger">Atrasados <strong>${overdue.length}</strong></span><span class="summary-pill">Hoje <strong>${todayItems.length}</strong></span>`;
  const filter = $('#task-filter').value;
  let items = [...state.data.tasks];
  if (filter === 'pending') items = pending;
  if (filter === 'today') items = state.data.tasks.filter(item => String(item.due_at).slice(0,10) === today);
  if (filter === 'overdue') items = overdue;
  items.sort((a,b) => new Date(a.due_at)-new Date(b.due_at));
  $('#tasks-list').innerHTML = items.length ? items.map(task => {
    const due = new Date(task.due_at);
    const tone = task.status === 'pendente' && due < now ? 'overdue' : String(task.due_at).slice(0,10) === today ? 'today' : '';
    return `<article class="task-card ${tone}"><button class="task-check ${task.status === 'concluida' ? 'done' : ''}" data-complete-task="${task.id}" data-completed="${task.status === 'concluida'}">${task.status === 'concluida' ? '✓' : ''}</button><div><h3>${escapeHTML(task.title)}</h3><div class="task-meta"><span>${formatDateTime(task.due_at)}</span><span>${escapeHTML(leadName(task.lead_id) || 'Sem lead')}</span><span>${escapeHTML(taskTypeMap[task.task_type] || task.task_type)}</span>${priorityBadge(task.priority)}</div>${task.description ? `<p class="cell-sub">${escapeHTML(task.description)}</p>` : ''}</div><div class="table-actions"><button class="table-action" data-edit-task="${task.id}">Editar</button><button class="table-action danger" data-delete-task="${task.id}">Excluir</button></div></article>`;
  }).join('') : emptyState('Nenhuma tarefa aqui', 'Sua agenda está livre para este filtro.');
}

function renderEnrollments() {
  const monthItems = state.data.enrollments.filter(item => inSelectedMonth(item.enrollment_date) && item.status !== 'cancelada');
  const generated = monthItems.reduce((sum,item) => sum + safeNumber(item.total_contract_value),0);
  $('#enrollment-summary').innerHTML = `<span class="summary-pill success">No mês <strong>${monthItems.length}</strong></span><span class="summary-pill">Receita gerada <strong>${formatMoney(generated)}</strong></span><span class="summary-pill">Total histórico <strong>${state.data.enrollments.length}</strong></span>`;
  $('#enrollments-table').innerHTML = state.data.enrollments.length ? `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Curso</th><th>Data</th><th>Valor total</th><th>Status</th><th></th></tr></thead><tbody>${state.data.enrollments.map(item => `<tr><td><span class="cell-main">${escapeHTML(item.student_name)}</span><span class="cell-sub">${escapeHTML(item.leads?.full_name || '')}</span></td><td>${escapeHTML(item.courses?.name || 'Não informado')}</td><td>${formatDate(item.enrollment_date)}</td><td>${formatMoney(item.total_contract_value)}</td><td>${enrollmentBadge(item.status)}</td><td><div class="table-actions"><button class="table-action" data-pay-enrollment="${item.id}">Receber</button><button class="table-action" data-edit-enrollment="${item.id}">Editar</button><button class="table-action danger" data-delete-enrollment="${item.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma matrícula registrada', 'Quando um lead fechar, registre a conversão aqui.');
}

function renderFinance() {
  const m = metrics();
  const expected = state.data.payments.filter(item => item.status === 'previsto').reduce((sum,item) => sum + safeNumber(item.amount),0);
  const late = state.data.payments.filter(item => item.status === 'atrasado').reduce((sum,item) => sum + safeNumber(item.amount),0);
  const cards = [
    ['Recebido no mês', formatMoney(m.receivedRevenue), '$', 'success'],
    ['Recebido total', formatMoney(m.totalRevenue), '↗', 'info'],
    ['Previsto', formatMoney(expected), '◷', ''],
    ['Em atraso', formatMoney(late), '!', late ? 'warning' : '']
  ];
  $('#finance-kpis').innerHTML = cards.map(([label,value,icon,tone]) => `<article class="kpi-card ${tone}"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${icon}</span></div><div class="kpi-value">${value}</div></article>`).join('');
  $('#payments-table').innerHTML = state.data.payments.length ? `<table><thead><tr><th>Matrícula</th><th>Descrição</th><th>Data</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${state.data.payments.map(item => `<tr><td class="cell-main">${escapeHTML(item.enrollments?.student_name || enrollmentName(item.enrollment_id))}</td><td>${escapeHTML(item.description || 'Recebimento')}</td><td>${formatDateTime(item.paid_at || item.due_date)}</td><td>${formatMoney(item.amount)}</td><td>${paymentBadge(item.status)}</td><td><div class="table-actions"><button class="table-action" data-edit-payment="${item.id}">Editar</button><button class="table-action danger" data-delete-payment="${item.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table>` : emptyState('Nenhum recebimento registrado', 'Registre os valores que efetivamente entraram no caixa.');
}

function renderPlanning() {
  const plan = getCurrentPlan();
  const m = metrics();
  if (!plan) {
    $('#monthly-plan-view').innerHTML = emptyState(`Sem planejamento para ${monthLabel()}`, 'Cadastre metas, campanhas e cursos prioritários.');
    $('#actions-table').innerHTML = emptyState('5W2H aguardando metas', 'Crie primeiro o planejamento do mês.');
    return;
  }
  $('#monthly-plan-view').innerHTML = `<div class="plan-metrics">
    ${planMetric('Meta de leads', `${m.monthLeads} / ${plan.target_leads}`)}
    ${planMetric('Meta de matrículas', `${m.monthEnrollments} / ${plan.target_enrollments}`)}
    ${planMetric('Receita gerada', `${formatMoney(m.generatedRevenue)} / ${formatMoney(plan.target_generated_revenue)}`)}
    ${planMetric('Faturamento', `${formatMoney(m.receivedRevenue)} / ${formatMoney(plan.target_received_revenue)}`)}
    ${planMetric('Conversão desejada', `${safeNumber(plan.target_conversion_rate).toFixed(1)}%`)}
    ${planMetric('Orçamento de anúncios', formatMoney(plan.ad_budget))}
  </div>
  ${planText('Cursos prioritários', plan.priority_courses)}${planText('Campanhas', plan.campaigns)}${planText('Observações', plan.notes)}`;
  const actions = getPlanActions();
  $('#actions-table').innerHTML = actions.length ? `<table><thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Custo</th><th>Progresso</th><th>Status</th><th></th></tr></thead><tbody>${actions.map(action => `<tr><td><span class="cell-main">${escapeHTML(action.what_action)}</span><span class="cell-sub">${escapeHTML(action.why_action || '')}</span></td><td>${escapeHTML(action.responsible || '—')}</td><td>${formatDate(action.end_date)}</td><td>${formatMoney(action.estimated_cost)}</td><td><div class="progress-mini"><span style="width:${action.progress}%"></span></div><span class="cell-sub">${action.progress}%</span></td><td>${actionBadge(action.status)}</td><td><div class="table-actions"><button class="table-action" data-edit-action="${action.id}">Editar</button><button class="table-action danger" data-delete-action="${action.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table>` : emptyState('Nenhuma ação cadastrada', 'Transforme suas metas em tarefas claras usando o 5W2H.');
}

function renderSettings() {
  $('#courses-list').innerHTML = state.data.courses.map(item => `<div class="simple-item"><div><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.category || 'Sem categoria')} • ${escapeHTML(modalityMap[item.modality] || 'Modalidade livre')} • ${formatMoney(item.list_price)}</span></div><button class="table-action ${item.active ? '' : 'danger'}" data-toggle-course="${item.id}" data-active="${item.active}">${item.active ? 'Ativo' : 'Inativo'}</button></div>`).join('') || emptyState('Nenhum curso', 'Cadastre os cursos e planos comercializados.');
  $('#sources-list').innerHTML = state.data.sources.map(item => `<div class="simple-item"><div><strong>${escapeHTML(item.name)}</strong><span>${item.active ? 'Disponível nos cadastros' : 'Oculta nos cadastros'}</span></div><button class="table-action ${item.active ? '' : 'danger'}" data-toggle-source="${item.id}" data-active="${item.active}">${item.active ? 'Ativa' : 'Inativa'}</button></div>`).join('') || emptyState('Nenhuma origem', 'Cadastre os canais que trazem seus leads.');
}

function emptyState(title, text) { return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(text)}</div>`; }
function planMetric(label, value) { return `<div class="plan-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`; }
function planText(label, value) { return value ? `<div class="plan-text"><h3>${escapeHTML(label)}</h3><p>${escapeHTML(value)}</p></div>` : ''; }
function statusBadge(status) {
  const classes = { novo:'badge-info', primeiro_contato:'badge-purple', em_atendimento:'badge-purple', qualificado:'badge-warning', proposta_enviada:'badge-warning', follow_up:'badge-info', matriculado:'badge-success', perdido:'badge-danger' };
  return `<span class="badge ${classes[status] || 'badge-neutral'}">${escapeHTML(statusMap[status] || status)}</span>`;
}
function priorityBadge(priority) { const cls = { baixa:'badge-neutral', media:'badge-info', alta:'badge-warning', urgente:'badge-danger' }; return `<span class="badge ${cls[priority] || 'badge-neutral'}">${escapeHTML(priorityMap[priority] || priority)}</span>`; }
function enrollmentBadge(status) { const cls = { ativa:'badge-success', pendente:'badge-warning', cancelada:'badge-danger', concluida:'badge-info' }; return `<span class="badge ${cls[status] || 'badge-neutral'}">${escapeHTML(enrollmentStatusMap[status] || status)}</span>`; }
function paymentBadge(status) { const cls = { recebido:'badge-success', previsto:'badge-info', atrasado:'badge-danger', cancelado:'badge-neutral' }; return `<span class="badge ${cls[status] || 'badge-neutral'}">${escapeHTML(paymentStatusMap[status] || status)}</span>`; }
function actionBadge(status) { const cls = { nao_iniciada:'badge-neutral', em_andamento:'badge-info', concluida:'badge-success', cancelada:'badge-danger' }; return `<span class="badge ${cls[status] || 'badge-neutral'}">${escapeHTML(actionStatusMap[status] || status)}</span>`; }

function openLeadForm(lead = null) {
  $('#lead-form').reset();
  $('#lead-id').value = lead?.id || '';
  $('#lead-dialog-title').textContent = lead ? 'Editar lead' : 'Cadastrar lead';
  $('#lead-name').value = lead?.full_name || '';
  $('#lead-whatsapp').value = lead?.whatsapp || '';
  $('#lead-phone').value = lead?.phone || '';
  $('#lead-email').value = lead?.email || '';
  $('#lead-city').value = lead?.city || '';
  $('#lead-source').value = lead?.source_id || '';
  $('#lead-campaign').value = lead?.campaign || '';
  $('#lead-modality').value = lead?.modality || '';
  $('#lead-temperature').value = lead?.temperature || 'morno';
  $('#lead-status').value = lead?.status || 'novo';
  $('#lead-next-contact').value = lead?.next_contact_at ? toLocalInput(lead.next_contact_at) : '';
  $('#lead-next-action').value = lead?.next_action || '';
  $('#lead-notes').value = lead?.notes || '';
  $('#lead-lost-reason').value = lead?.lost_reason || '';
  $('#lost-reason-field').classList.toggle('hidden', lead?.status !== 'perdido');
  const interests = lead ? state.data.interests.filter(item => item.lead_id === lead.id).map(item => item.course_id) : [];
  [...$('#lead-courses').options].forEach(option => option.selected = interests.includes(option.value));
  openDialog('#lead-dialog');
}

async function saveLead(event) {
  event.preventDefault();
  const button = $('#save-lead-button');
  setButtonLoading(button, true);
  try {
    const status = $('#lead-status').value;
    const payload = {
      full_name: $('#lead-name').value.trim(), whatsapp: $('#lead-whatsapp').value.trim() || null,
      phone: $('#lead-phone').value.trim() || null, email: $('#lead-email').value.trim() || null,
      city: $('#lead-city').value.trim() || null, source_id: $('#lead-source').value || null,
      campaign: $('#lead-campaign').value.trim() || null, modality: $('#lead-modality').value || null,
      temperature: $('#lead-temperature').value, status,
      next_contact_at: $('#lead-next-contact').value ? new Date($('#lead-next-contact').value).toISOString() : null,
      next_action: $('#lead-next-action').value.trim() || null, notes: $('#lead-notes').value.trim() || null,
      lost_reason: status === 'perdido' ? ($('#lead-lost-reason').value.trim() || null) : null
    };
    await crm.saveLead(payload, selectedValues($('#lead-courses')), $('#lead-id').value || null);
    closeDialog($('#lead-dialog'));
    toast($('#lead-id').value ? 'Lead atualizado.' : 'Lead cadastrado.');
    await refreshData();
  } catch (error) { toast(error.message, 'error'); }
  finally { setButtonLoading(button, false); }
}

function openLeadDetail(lead) {
  state.currentDetailLead = lead.id;
  $('#detail-lead-name').textContent = lead.full_name;
  const interactions = state.data.interactions.filter(item => item.lead_id === lead.id).sort((a,b) => new Date(b.occurred_at)-new Date(a.occurred_at));
  $('#lead-detail-content').innerHTML = `<div class="detail-actions"><button class="btn btn-primary btn-sm" data-new-interaction="${lead.id}">+ Registrar atendimento</button><button class="btn btn-secondary btn-sm" data-task-from-lead="${lead.id}">Agendar follow-up</button><button class="btn btn-secondary btn-sm" data-enroll-from-lead="${lead.id}">Criar matrícula</button>${lead.whatsapp ? `<a class="btn btn-secondary btn-sm" href="${whatsAppLink(lead.whatsapp)}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ''}<button class="btn btn-danger btn-sm" data-delete-lead="${lead.id}">Excluir lead</button></div>
  <div class="detail-grid"><div class="detail-card"><h3>Informações</h3><div class="detail-info">
    ${detailRow('Status', statusMap[lead.status])}${detailRow('Temperatura', tempMap[lead.temperature])}${detailRow('WhatsApp', lead.whatsapp)}${detailRow('E-mail', lead.email)}${detailRow('Cidade', lead.city)}${detailRow('Origem', sourceName(lead.source_id))}${detailRow('Interesses', courseNames(lead.id).join(', '))}${detailRow('Próximo contato', formatDateTime(lead.next_contact_at))}${detailRow('Próxima ação', lead.next_action)}
  </div>${lead.notes ? `<div class="plan-text"><h3>Observações</h3><p>${escapeHTML(lead.notes)}</p></div>` : ''}${lead.lost_reason ? `<div class="plan-text"><h3>Motivo da perda</h3><p>${escapeHTML(lead.lost_reason)}</p></div>` : ''}</div>
  <div class="detail-card"><h3>Linha do tempo</h3><div class="timeline">${interactions.length ? interactions.map(item => `<article class="timeline-item"><h4>${escapeHTML(channelMap[item.channel] || item.channel)} • ${escapeHTML(item.outcome || 'Atendimento')}</h4><p>${escapeHTML(item.summary)}</p>${item.objections ? `<p><strong>Objeções:</strong> ${escapeHTML(item.objections)}</p>` : ''}${item.proposal_amount ? `<p><strong>Proposta:</strong> ${formatMoney(item.proposal_amount)}</p>` : ''}<div class="timeline-meta">${formatDateTime(item.occurred_at)}${item.next_action ? ` • Próxima ação: ${escapeHTML(item.next_action)}` : ''}</div></article>`).join('') : emptyState('Sem atendimentos registrados', 'Registre cada conversa para preservar o histórico comercial.')}</div></div></div>`;
  openDialog('#lead-detail-dialog');
}
function detailRow(label, value) { return `<div class="detail-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || '—')}</strong></div>`; }

function openInteractionForm(leadId) {
  $('#interaction-form').reset();
  $('#interaction-lead-id').value = leadId;
  $('#interaction-channel').value = 'whatsapp';
  $('#interaction-date').value = toLocalInput();
  openDialog('#interaction-dialog');
}
async function saveInteraction(event) {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true);
  try {
    const payload = {
      lead_id: $('#interaction-lead-id').value, channel: $('#interaction-channel').value,
      summary: $('#interaction-summary').value.trim(), objections: $('#interaction-objections').value.trim() || null,
      proposal_amount: $('#interaction-proposal').value ? safeNumber($('#interaction-proposal').value) : null,
      outcome: $('#interaction-outcome').value.trim() || null, next_action: $('#interaction-next-action').value.trim() || null,
      occurred_at: new Date($('#interaction-date').value).toISOString()
    };
    await crm.saveInteraction(payload);
    if (payload.next_action) await crm.saveTask({ lead_id: payload.lead_id, title: payload.next_action, description: `Gerada a partir do atendimento: ${payload.summary}`, task_type: 'follow_up', due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'media', status: 'pendente', assigned_to: state.user.id });
    closeDialog($('#interaction-dialog'));
    closeDialog($('#lead-detail-dialog'));
    toast('Atendimento registrado no histórico.');
    await refreshData();
    const lead = state.data.leads.find(item => item.id === payload.lead_id);
    if (lead) openLeadDetail(lead);
  } catch (error) { toast(error.message, 'error'); }
  finally { setButtonLoading(button, false); }
}

function openTaskForm(task = null, leadId = '') {
  $('#task-form').reset();
  $('#task-id').value = task?.id || '';
  $('#task-dialog-title').textContent = task ? 'Editar tarefa' : 'Nova tarefa';
  $('#task-title').value = task?.title || '';
  $('#task-lead').value = task?.lead_id || leadId || '';
  $('#task-type').value = task?.task_type || 'follow_up';
  $('#task-due').value = task?.due_at ? toLocalInput(task.due_at) : toLocalInput(new Date(Date.now() + 24*60*60*1000));
  $('#task-priority').value = task?.priority || 'media';
  $('#task-description').value = task?.description || '';
  openDialog('#task-dialog');
}
async function saveTask(event) {
  event.preventDefault();
  const button = event.submitter; setButtonLoading(button, true);
  try {
    await crm.saveTask({ lead_id: $('#task-lead').value || null, title: $('#task-title').value.trim(), description: $('#task-description').value.trim() || null, task_type: $('#task-type').value, due_at: new Date($('#task-due').value).toISOString(), priority: $('#task-priority').value, status: 'pendente', assigned_to: state.user.id }, $('#task-id').value || null);
    closeDialog($('#task-dialog')); toast('Tarefa salva na agenda.'); await refreshData();
  } catch (error) { toast(error.message,'error'); } finally { setButtonLoading(button,false); }
}

function openEnrollmentForm(item = null, leadId = '') {
  $('#enrollment-form').reset();
  $('#enrollment-id').value = item?.id || '';
  $('#enrollment-dialog-title').textContent = item ? 'Editar matrícula' : 'Nova matrícula';
  $('#enrollment-lead').value = item?.lead_id || leadId || '';
  const lead = state.data.leads.find(l => l.id === (item?.lead_id || leadId));
  $('#enrollment-student').value = item?.student_name || lead?.full_name || '';
  $('#enrollment-course').value = item?.course_id || state.data.interests.find(i => i.lead_id === leadId)?.course_id || '';
  $('#enrollment-date').value = item?.enrollment_date || todayISO();
  $('#enrollment-contract').value = safeNumber(item?.contract_value);
  $('#enrollment-fee').value = safeNumber(item?.enrollment_fee);
  $('#enrollment-installments').value = item?.installments || 1;
  $('#enrollment-installment-value').value = safeNumber(item?.installment_value);
  $('#enrollment-method').value = item?.payment_method || '';
  $('#enrollment-due-day').value = item?.due_day || '';
  $('#enrollment-status').value = item?.status || 'ativa';
  $('#enrollment-notes').value = item?.notes || '';
  openDialog('#enrollment-dialog');
}
function autoInstallmentValue() {
  const total = safeNumber($('#enrollment-contract').value);
  const installments = Math.max(1, safeNumber($('#enrollment-installments').value));
  if (!$('#enrollment-id').value || !safeNumber($('#enrollment-installment-value').value)) $('#enrollment-installment-value').value = (total / installments).toFixed(2);
}
async function saveEnrollment(event) {
  event.preventDefault(); const button = event.submitter; setButtonLoading(button,true);
  try {
    await crm.saveEnrollment({ lead_id: $('#enrollment-lead').value || null, course_id: $('#enrollment-course').value || null, student_name: $('#enrollment-student').value.trim(), enrollment_date: $('#enrollment-date').value, contract_value: safeNumber($('#enrollment-contract').value), enrollment_fee: safeNumber($('#enrollment-fee').value), installments: Math.max(1,safeNumber($('#enrollment-installments').value)), installment_value: safeNumber($('#enrollment-installment-value').value), payment_method: $('#enrollment-method').value || null, due_day: $('#enrollment-due-day').value ? safeNumber($('#enrollment-due-day').value) : null, status: $('#enrollment-status').value, notes: $('#enrollment-notes').value.trim() || null }, $('#enrollment-id').value || null);
    closeDialog($('#enrollment-dialog')); toast('Matrícula registrada.'); await refreshData();
  } catch (error) { toast(error.message,'error'); } finally { setButtonLoading(button,false); }
}

function openPaymentForm(item = null, enrollmentId = '') {
  $('#payment-form').reset();
  $('#payment-id').value = item?.id || '';
  $('#payment-enrollment').value = item?.enrollment_id || enrollmentId || '';
  const enrollment = state.data.enrollments.find(e => e.id === (item?.enrollment_id || enrollmentId));
  $('#payment-description').value = item?.description || '';
  $('#payment-number').value = item?.installment_number || '';
  $('#payment-amount').value = safeNumber(item?.amount || enrollment?.installment_value || enrollment?.total_contract_value);
  $('#payment-date').value = item?.paid_at ? toLocalInput(item.paid_at) : toLocalInput();
  $('#payment-method').value = item?.payment_method || enrollment?.payment_method || 'pix';
  $('#payment-status').value = item?.status || 'recebido';
  $('#payment-notes').value = item?.notes || '';
  openDialog('#payment-dialog');
}
async function savePayment(event) {
  event.preventDefault(); const button = event.submitter; setButtonLoading(button,true);
  try {
    const status = $('#payment-status').value;
    const paidAt = $('#payment-date').value ? new Date($('#payment-date').value).toISOString() : null;
    await crm.savePayment({ enrollment_id: $('#payment-enrollment').value, description: $('#payment-description').value.trim() || null, installment_number: $('#payment-number').value ? safeNumber($('#payment-number').value) : null, amount: safeNumber($('#payment-amount').value), status, paid_at: status === 'recebido' ? paidAt : null, due_date: paidAt ? paidAt.slice(0,10) : null, payment_method: $('#payment-method').value || null, notes: $('#payment-notes').value.trim() || null }, $('#payment-id').value || null);
    closeDialog($('#payment-dialog')); toast('Recebimento registrado.'); await refreshData();
  } catch (error) { toast(error.message,'error'); } finally { setButtonLoading(button,false); }
}

function openPlanForm() {
  const plan = getCurrentPlan(); $('#plan-form').reset(); $('#plan-id').value = plan?.id || '';
  $('#plan-leads').value = plan?.target_leads || 0; $('#plan-proposals').value = plan?.target_proposals || 0; $('#plan-enrollments').value = plan?.target_enrollments || 0;
  $('#plan-conversion').value = safeNumber(plan?.target_conversion_rate); $('#plan-generated').value = safeNumber(plan?.target_generated_revenue); $('#plan-received').value = safeNumber(plan?.target_received_revenue);
  $('#plan-ticket').value = safeNumber(plan?.target_average_ticket); $('#plan-budget').value = safeNumber(plan?.ad_budget); $('#plan-courses').value = plan?.priority_courses || ''; $('#plan-campaigns').value = plan?.campaigns || ''; $('#plan-notes').value = plan?.notes || '';
  openDialog('#plan-dialog');
}
async function savePlan(event) {
  event.preventDefault(); const button = event.submitter; setButtonLoading(button,true);
  try {
    await crm.savePlan({ reference_month: startOfMonth(), target_leads: safeNumber($('#plan-leads').value), target_proposals: safeNumber($('#plan-proposals').value), target_enrollments: safeNumber($('#plan-enrollments').value), target_conversion_rate: safeNumber($('#plan-conversion').value), target_generated_revenue: safeNumber($('#plan-generated').value), target_received_revenue: safeNumber($('#plan-received').value), target_average_ticket: safeNumber($('#plan-ticket').value), ad_budget: safeNumber($('#plan-budget').value), priority_courses: $('#plan-courses').value.trim() || null, campaigns: $('#plan-campaigns').value.trim() || null, notes: $('#plan-notes').value.trim() || null }, $('#plan-id').value || null);
    closeDialog($('#plan-dialog')); toast('Planejamento mensal salvo.'); await refreshData();
  } catch (error) { toast(error.message,'error'); } finally { setButtonLoading(button,false); }
}

function openActionForm(action = null) {
  const plan = getCurrentPlan();
  if (!plan) { toast('Cadastre primeiro o planejamento deste mês.', 'warning'); openPlanForm(); return; }
  $('#action-form').reset(); $('#action-id').value = action?.id || ''; $('#action-dialog-title').textContent = action ? 'Editar ação' : 'Nova ação';
  $('#action-what').value = action?.what_action || ''; $('#action-why').value = action?.why_action || ''; $('#action-where').value = action?.where_action || ''; $('#action-who').value = action?.responsible || '';
  $('#action-start').value = action?.start_date || todayISO(); $('#action-end').value = action?.end_date || ''; $('#action-how').value = action?.how_action || ''; $('#action-cost').value = safeNumber(action?.estimated_cost); $('#action-status').value = action?.status || 'nao_iniciada'; $('#action-progress').value = action?.progress || 0; $('#action-result').value = action?.result || '';
  openDialog('#action-dialog');
}
async function saveAction(event) {
  event.preventDefault(); const button = event.submitter; setButtonLoading(button,true);
  try {
    const plan = getCurrentPlan();
    await crm.saveAction({ monthly_plan_id: plan.id, what_action: $('#action-what').value.trim(), why_action: $('#action-why').value.trim() || null, where_action: $('#action-where').value.trim() || null, responsible: $('#action-who').value.trim() || null, start_date: $('#action-start').value || null, end_date: $('#action-end').value || null, how_action: $('#action-how').value.trim() || null, estimated_cost: safeNumber($('#action-cost').value), status: $('#action-status').value, progress: Math.min(100,Math.max(0,safeNumber($('#action-progress').value))), result: $('#action-result').value.trim() || null }, $('#action-id').value || null);
    closeDialog($('#action-dialog')); toast('Ação 5W2H salva.'); await refreshData();
  } catch (error) { toast(error.message,'error'); } finally { setButtonLoading(button,false); }
}

function openSimpleForm(type) {
  $('#simple-form').reset(); $('#simple-type').value = type; const course = type === 'course';
  $('#simple-title').textContent = course ? 'Novo curso ou plano' : 'Nova origem de lead';
  $('#simple-eyebrow').textContent = course ? 'CATÁLOGO' : 'AQUISIÇÃO';
  $('#simple-category-field').classList.toggle('hidden', !course); $('#simple-modality-field').classList.toggle('hidden', !course); $('#simple-price-field').classList.toggle('hidden', !course);
  openDialog('#simple-dialog');
}
async function saveSimpleItem(event) {
  event.preventDefault(); const button = event.submitter; setButtonLoading(button,true);
  try {
    if ($('#simple-type').value === 'course') await crm.saveCourse({ name: $('#simple-name').value.trim(), category: $('#simple-category').value.trim() || null, modality: $('#simple-modality').value || null, list_price: safeNumber($('#simple-price').value), active: true });
    else await crm.saveSource($('#simple-name').value.trim());
    closeDialog($('#simple-dialog')); toast('Cadastro salvo.'); await refreshData();
  } catch (error) { toast(error.message,'error'); } finally { setButtonLoading(button,false); }
}

async function handleDelegatedClick(event) {
  if (event.target.closest('[data-quick-status]')) return;
  const target = event.target.closest('button, [data-detail-lead]');
  if (!target) return;
  try {
    if (target.matches('[data-detail-lead]') && !target.matches('select')) { const lead = state.data.leads.find(item => item.id === target.dataset.detailLead); if (lead) openLeadDetail(lead); }
    else if (target.dataset.editLead) openLeadForm(state.data.leads.find(item => item.id === target.dataset.editLead));
    else if (target.dataset.newInteraction) openInteractionForm(target.dataset.newInteraction);
    else if (target.dataset.taskFromLead) { closeDialog($('#lead-detail-dialog')); openTaskForm(null,target.dataset.taskFromLead); }
    else if (target.dataset.enrollFromLead) { closeDialog($('#lead-detail-dialog')); openEnrollmentForm(null,target.dataset.enrollFromLead); }
    else if (target.dataset.deleteLead) await deleteLead(target.dataset.deleteLead);
    else if (target.dataset.editTask) openTaskForm(state.data.tasks.find(item => item.id === target.dataset.editTask));
    else if (target.dataset.deleteTask) await deleteTask(target.dataset.deleteTask);
    else if (target.dataset.completeTask) await toggleTask(target.dataset.completeTask,target.dataset.completed === 'true');
    else if (target.dataset.editEnrollment) openEnrollmentForm(state.data.enrollments.find(item => item.id === target.dataset.editEnrollment));
    else if (target.dataset.payEnrollment) openPaymentForm(null,target.dataset.payEnrollment);
    else if (target.dataset.deleteEnrollment) await deleteEnrollment(target.dataset.deleteEnrollment);
    else if (target.dataset.editPayment) openPaymentForm(state.data.payments.find(item => item.id === target.dataset.editPayment));
    else if (target.dataset.deletePayment) await deletePayment(target.dataset.deletePayment);
    else if (target.dataset.editAction) openActionForm(state.data.actions.find(item => item.id === target.dataset.editAction));
    else if (target.dataset.deleteAction) await deleteAction(target.dataset.deleteAction);
    else if (target.dataset.toggleCourse) await toggleCourse(target.dataset.toggleCourse,target.dataset.active === 'true');
    else if (target.dataset.toggleSource) await toggleSource(target.dataset.toggleSource,target.dataset.active === 'true');
    else if (target.hasAttribute('data-open-plan')) openPlanForm();
  } catch (error) { toast(error.message,'error'); }
}

async function handleDelegatedChange(event) {
  if (event.target.dataset.quickStatus) {
    event.stopPropagation();
    try { await crm.updateLeadStatus(event.target.dataset.quickStatus,event.target.value); toast('Status atualizado.'); await refreshData(); }
    catch (error) { toast(error.message,'error'); }
  }
}

async function deleteLead(id) { if (!confirmAction('Excluir este lead e todo o histórico relacionado?')) return; await crm.deleteLead(id); closeDialog($('#lead-detail-dialog')); toast('Lead excluído.'); await refreshData(); }
async function deleteTask(id) { if (!confirmAction('Excluir esta tarefa?')) return; await crm.deleteTask(id); toast('Tarefa excluída.'); await refreshData(); }
async function toggleTask(id, completed) { await crm.completeTask(id,!completed); toast(completed ? 'Tarefa reaberta.' : 'Tarefa concluída.'); await refreshData(); }
async function deleteEnrollment(id) { if (!confirmAction('Excluir esta matrícula? Os recebimentos vinculados também serão removidos.')) return; await crm.deleteEnrollment(id); toast('Matrícula excluída.'); await refreshData(); }
async function deletePayment(id) { if (!confirmAction('Excluir este recebimento?')) return; await crm.deletePayment(id); toast('Recebimento excluído.'); await refreshData(); }
async function deleteAction(id) { if (!confirmAction('Excluir esta ação do 5W2H?')) return; await crm.deleteAction(id); toast('Ação excluída.'); await refreshData(); }
async function toggleCourse(id, active) { await crm.toggleCourse(id,!active); toast(active ? 'Curso desativado.' : 'Curso ativado.'); await refreshData(); }
async function toggleSource(id, active) { await crm.toggleSource(id,!active); toast(active ? 'Origem desativada.' : 'Origem ativada.'); await refreshData(); }

function runExport(type) {
  try {
    const helpers = { sourceName, courseNames, leadName, enrollmentName, currentPlan: getCurrentPlan, monthLabel };
    if (type === 'excel') exportExcel(state.data,state.month,helpers);
    if (type === 'pdf') exportPDF(state.data,state.month,metrics(),helpers);
    if (type === 'json') exportJSON(state.data,state.month);
    toast(type === 'pdf' ? 'Relatório PDF gerado.' : 'Exportação concluída.');
  } catch (error) { toast(error.message,'error'); }
}

init();
