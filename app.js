const SUPABASE_URL = "https://hzvkdlhezowxlirpdylx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZGNH95JK7dol53IjEU8I6w__0GpswkK";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const statusLabels = {
  "no-prazo": "Dentro do prazo",
  "atencao": "Em atenção",
  "atrasado": "Atrasado",
  "concluido": "Concluído",
  "nao-iniciado": "Não iniciado"
};

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const adminMode = params.get("modo") === "admin";
const tvMode = params.get("tv") === "1";
if (tvMode) document.body.classList.add("tv-mode");

const DISPLAY_MODE_KEY = "painel-obras-display-mode";
const ROTATION_INTERVAL_KEY = "painel-obras-rotation-interval";
const ROTATION_INTERVALS = [10, 20, 30];
const OVERVIEW_PAGE_SIZE = 6;
const DEPARTMENTS = [
  "Secretaria da Casa Civil",
  "Secretaria de Administração",
  "Secretaria de Assistência Social",
  "Secretaria de Cultura e Turismo",
  "Secretaria de Desenvolvimento Econômico",
  "Secretaria de Educação",
  "Secretaria de Esportes",
  "Secretaria de Governo",
  "Secretaria de Meio Ambiente",
  "Secretaria de Mobilidade Urbana",
  "Secretaria de Negócios Jurídicos",
  "Secretaria de Obras",
  "Secretaria de Planejamento e Finanças",
  "Secretaria de Saúde",
  "Secretaria de Segurança Pública",
  "Secretaria de Serviços Públicos",
  "Secretaria de Tributação e Fiscalização"
];

function readPreference(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // O painel continua funcionando mesmo se o navegador bloquear o armazenamento local.
  }
}

let projects = [];
let activeIndex = 0;
let displayMode = readPreference(DISPLAY_MODE_KEY, "auto");
if (!["auto", "overview"].includes(displayMode)) displayMode = "auto";
let rotationInterval = Number(readPreference(ROTATION_INTERVAL_KEY, "10"));
if (!ROTATION_INTERVALS.includes(rotationInterval)) rotationInterval = 10;
let secondsLeft = rotationInterval;
let overviewPage = 0;
let rotationTimer;
let realtimeChannel;
let currentSession = null;
let currentProfile = null;

function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toProject(row) {
  return {
    id: row.id,
    department: row.department,
    slug: row.slug,
    name: row.name,
    description: row.description,
    location: row.location,
    responsible: row.responsible,
    startDate: row.start_date,
    deadline: row.deadline,
    unit: row.unit,
    target: Number(row.target),
    completed: Number(row.completed),
    budget: Number(row.budget),
    spent: Number(row.spent),
    status: row.status,
    nextStep: row.next_step,
    issue: row.issue,
    updatedAt: row.updated_at
  };
}

async function fetchProfile() {
  if (!currentSession?.user?.id) return null;
  const { data, error } = await db.from("profiles").select("*").eq("id", currentSession.user.id).single();
  if (error) throw error;
  currentProfile = data;
  return data;
}

async function fetchProjects() {
  const { data, error } = await db.from("projects").select("*").order("id");
  if (error) throw error;
  projects = (data || []).map(toProject);
  if (activeIndex >= projects.length) activeIndex = 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function percentage(project) {
  if (!Number(project.target)) return 0;
  return Math.max(0, Math.min(100,
    Math.round((Number(project.completed) / Number(project.target)) * 100)
  ));
}

function createUniqueSlug(name) {
  const base = String(name || "projeto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "projeto";
  let candidate = base;
  let suffix = 2;
  while (projects.some(project => project.slug === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function dashboardControls() {
  return `
    <div class="view-controls" aria-label="Modo de exibição">
      <div class="mode-switch">
        <button type="button" class="view-mode-button ${displayMode === "auto" ? "active" : ""}" data-view-mode="auto">Automático</button>
        <button type="button" class="view-mode-button ${displayMode === "overview" ? "active" : ""}" data-view-mode="overview">Visão geral</button>
      </div>
      <label class="interval-control" for="rotation-interval">
        <span>Intervalo</span>
        <select id="rotation-interval">
          ${ROTATION_INTERVALS.map(value => `<option value="${value}" ${value === rotationInterval ? "selected" : ""}>${value}s</option>`).join("")}
        </select>
      </label>
    </div>`;
}

function header(showAdminLink = true, showDashboardControls = false) {
  const action = showAdminLink
    ? '<a class="btn btn-light" href="?modo=admin">Atualizar dados</a>'
    : `<div class="admin-actions"><a class="btn btn-light" href="index.html">Ver painel</a>${currentSession ? '<button class="btn btn-ghost" id="logout" type="button">Sair</button>' : ""}</div>`;

  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">BO</div>
        <div>
          <p class="eyebrow">Painel executivo municipal</p>
          <h1>Prefeitura de Birigui</h1>
        </div>
      </div>
      <div class="top-actions">
        <div class="live-badge"><i></i> Dados em tempo real</div>
        ${showDashboardControls ? dashboardControls() : ""}
        <div class="clock"><strong id="clock-time">--:--</strong><span id="clock-date">Carregando data</span></div>
        ${action}
      </div>
    </header>`;
}

function updateClock() {
  const now = new Date();
  const time = document.querySelector("#clock-time");
  const date = document.querySelector("#clock-date");
  if (time) time.textContent = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
  if (date) date.textContent = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
}

function renderLoading(message = "Carregando projetos...") {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div><strong>${h(message)}</strong></div>`;
}

function renderError(error) {
  console.error(error);
  app.innerHTML = `
    <div class="message-screen">
      <h2>Não foi possível carregar os dados</h2>
      <p>Verifique a conexão com a internet e tente novamente.</p>
      <button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button>
    </div>`;
}

function dashboardStats() {
  const totalBudget = projects.reduce((sum, item) => sum + Number(item.budget || 0), 0);
  const totalSpent = projects.reduce((sum, item) => sum + Number(item.spent || 0), 0);
  const attention = projects.filter(item => item.status === "atencao").length;
  const delayed = projects.filter(item => item.status === "atrasado").length;
  const average = Math.round(
    projects.reduce((sum, item) => sum + percentage(item), 0) / projects.length
  );
  const investment = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return `
    <div class="stats">
      <article class="stat"><span class="stat-label">Projetos acompanhados</span><strong class="stat-value">${projects.length}</strong><span class="stat-context">Todas as secretarias</span></article>
      <article class="stat"><span class="stat-label">Progresso médio</span><strong class="stat-value">${average}%</strong><span class="stat-context">Média dos projetos</span></article>
      <article class="stat"><span class="stat-label">Em atenção</span><strong class="stat-value">${attention}</strong><span class="stat-context">Exigem acompanhamento</span></article>
      <article class="stat"><span class="stat-label">Atrasados</span><strong class="stat-value">${delayed}</strong><span class="stat-context">Prazo comprometido</span></article>
      <article class="stat"><span class="stat-label">Investimento executado</span><strong class="stat-value">${investment}%</strong><span class="stat-context">${formatCurrency(totalSpent)} de ${formatCurrency(totalBudget)}</span></article>
    </div>`;
}

function automaticView() {
  const active = projects[activeIndex];
  return `
    <div class="focus-grid">
      <article class="focus-card">
        <div class="focus-head">
          <div><span class="section-label">Projeto em destaque</span><h2>${h(active.name)}</h2><p class="location">${h(active.location)}</p></div>
          <span class="status ${h(active.status)}">${h(statusLabels[active.status] || active.status)}</span>
        </div>
        <div class="progress-block">
          <div class="progress-top"><strong>${percentage(active)}%</strong><span>${formatNumber(active.completed)} de ${formatNumber(active.target)} ${h(active.unit)}</span></div>
          <div class="progress"><div class="progress-bar" style="width:${percentage(active)}%"></div></div>
        </div>
        <div class="numbers">
          <div class="number-box"><span>Meta</span><strong>${formatNumber(active.target)} ${h(active.unit)}</strong></div>
          <div class="number-box"><span>Realizado</span><strong>${formatNumber(active.completed)} ${h(active.unit)}</strong></div>
          <div class="number-box"><span>Restante</span><strong>${formatNumber(Math.max(0, active.target - active.completed))} ${h(active.unit)}</strong></div>
        </div>
        <div class="details">
          <div class="detail"><span>Próxima etapa</span><strong>${h(active.nextStep)}</strong></div>
          <div class="detail"><span>Impedimento atual</span><strong>${h(active.issue)}</strong></div>
          <div class="detail"><span>Responsável</span><strong>${h(active.responsible)}</strong></div>
          <div class="detail"><span>Prazo previsto</span><strong>${formatDate(active.deadline)}</strong></div>
          <div class="detail"><span>Orçamento previsto</span><strong>${formatCurrency(active.budget)}</strong></div>
          <div class="detail"><span>Valor executado</span><strong>${formatCurrency(active.spent)}</strong></div>
        </div>
      </article>

      <aside class="project-list">
        <div class="list-head"><h3>Projetos</h3><span class="countdown">Alterna em <b id="countdown">${secondsLeft}</b>s</span></div>
        ${projects.map((project, index) => `
          <button class="project-item ${index === activeIndex ? "active" : ""}" data-index="${index}">
            <strong>${h(project.name)}</strong>
            <span class="item-meta"><span>${h(statusLabels[project.status] || project.status)}</span><span>${percentage(project)}%</span></span>
          </button>`).join("")}
        <p class="updated">Última atualização: ${formatDateTime(active.updatedAt)}</p>
      </aside>
    </div>`;
}

function overviewCard(project) {
  const remaining = Math.max(0, project.target - project.completed);
  return `
    <article class="overview-card">
      <div class="overview-card-head">
        <div><h3>${h(project.name)}</h3><p>${h(project.location)}</p></div>
        <span class="status ${h(project.status)}">${h(statusLabels[project.status] || project.status)}</span>
      </div>
      <div class="overview-progress-head"><strong>${percentage(project)}%</strong><span>${formatNumber(project.completed)} de ${formatNumber(project.target)} ${h(project.unit)}</span></div>
      <div class="progress compact"><div class="progress-bar" style="width:${percentage(project)}%"></div></div>
      <div class="overview-numbers">
        <div><span>Meta</span><strong>${formatNumber(project.target)}</strong></div>
        <div><span>Realizado</span><strong>${formatNumber(project.completed)}</strong></div>
        <div><span>Restante</span><strong>${formatNumber(remaining)}</strong></div>
      </div>
      <div class="overview-details">
        <div><span>Prazo</span><strong>${formatDate(project.deadline)}</strong></div>
        <div><span>Executado</span><strong>${formatCurrency(project.spent)}</strong></div>
      </div>
      <p class="overview-updated">Atualizado em ${formatDateTime(project.updatedAt)}</p>
    </article>`;
}

function overviewView() {
  const totalPages = Math.max(1, Math.ceil(projects.length / OVERVIEW_PAGE_SIZE));
  if (overviewPage >= totalPages) overviewPage = 0;
  const start = overviewPage * OVERVIEW_PAGE_SIZE;
  const pageProjects = projects.slice(start, start + OVERVIEW_PAGE_SIZE);
  const end = Math.min(start + OVERVIEW_PAGE_SIZE, projects.length);
  const pageStatus = totalPages > 1
    ? `<span>Projetos ${start + 1}–${end} de ${projects.length} · próxima página em <b id="countdown">${secondsLeft}</b>s</span>`
    : `<span>Todos os ${projects.length} projetos em andamento</span>`;

  return `
    <section class="overview-section">
      <div class="overview-heading">
        <div><span class="section-label">Visão geral</span><h2>Consolidado dos projetos</h2></div>
        <div class="overview-page-status">${pageStatus}</div>
      </div>
      <div class="overview-grid">${pageProjects.map(overviewCard).join("")}</div>
    </section>`;
}

function bindDashboardControls() {
  document.querySelectorAll("[data-view-mode]").forEach(button => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.viewMode;
      if (nextMode === displayMode) return;
      displayMode = nextMode;
      savePreference(DISPLAY_MODE_KEY, displayMode);
      activeIndex = 0;
      overviewPage = 0;
      secondsLeft = rotationInterval;
      renderDashboard();
      startRotation();
    });
  });

  document.querySelector("#rotation-interval")?.addEventListener("change", event => {
    const nextInterval = Number(event.target.value);
    if (!ROTATION_INTERVALS.includes(nextInterval)) return;
    rotationInterval = nextInterval;
    secondsLeft = rotationInterval;
    savePreference(ROTATION_INTERVAL_KEY, String(rotationInterval));
    renderDashboard();
    startRotation();
  });
}

function renderDashboard() {
  if (!projects.length) {
    app.innerHTML = `${header(true, true)}<div class="message-screen"><h2>Nenhum projeto cadastrado</h2></div>`;
    return;
  }

  app.innerHTML = `
    <div class="shell">
      ${header(true, true)}
      <section class="dashboard">
        ${dashboardStats()}
        ${displayMode === "overview" ? overviewView() : automaticView()}
      </section>
    </div>`;

  bindDashboardControls();
  document.querySelectorAll(".project-item").forEach(button => {
    button.addEventListener("click", () => {
      activeIndex = Number(button.dataset.index);
      secondsLeft = rotationInterval;
      renderDashboard();
    });
  });
  updateClock();
}

function bindLogout() {
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await db.auth.signOut();
    currentSession = null;
    currentProfile = null;
    renderLogin();
  });
}

function renderLogin() {
  app.innerHTML = `
    <div class="shell">
      ${header(false)}
      <section class="login-wrap">
        <form class="login-card" id="login-form">
          <span class="section-label">Área restrita</span>
          <h2>Entrar para atualizar</h2>
          <p>Use o usuário autorizado da sua secretaria.</p>
          <div class="field"><label for="email">E-mail</label><input id="email" type="email" autocomplete="email" required /></div>
          <div class="field"><label for="password">Senha</label><input id="password" type="password" autocomplete="current-password" required /></div>
          <p class="form-error" id="login-error"></p>
          <button class="btn btn-primary btn-wide" type="submit">Entrar</button>
        </form>
      </section>
    </div>`;

  const form = document.querySelector("#login-form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector("button");
    const errorBox = document.querySelector("#login-error");
    button.disabled = true;
    button.textContent = "Entrando...";
    errorBox.textContent = "";

    const { data, error } = await db.auth.signInWithPassword({
      email: document.querySelector("#email").value.trim(),
      password: document.querySelector("#password").value
    });

    if (error) {
      errorBox.textContent = "E-mail ou senha incorretos.";
      button.disabled = false;
      button.textContent = "Entrar";
      return;
    }

    currentSession = data.session;
    await fetchProfile();
    await fetchProjects();
    renderAdmin();
  });
  updateClock();
}

function renderAdmin() {
  const isAdministrator = currentProfile?.role === "admin";
  const allowedDepartments = isAdministrator ? DEPARTMENTS : [currentProfile.department];
  const initialDepartment = allowedDepartments.includes(currentProfile?.department) ? currentProfile.department : allowedDepartments[0];
  app.innerHTML = `
    <div class="shell">
      ${header(false)}
      <section class="admin-wrap">
        <div class="admin-intro">
          <div><h2>Gerenciamento dos projetos</h2><p>${isAdministrator ? "Administração geral" : h(currentProfile.department)} · cadastre ou atualize projetos.</p></div>
          <span class="status no-prazo">Conectado ao Supabase</span>
        </div>
        ${isAdministrator ? `<nav class="management-menu"><button class="management-link active" type="button">Projetos</button><button class="management-link" id="users-menu" type="button">Usuários</button></nav>` : ""}
        <div class="admin-tabs" role="tablist" aria-label="Ação administrativa">
          <button class="admin-tab active" id="edit-mode" type="button">Atualizar projeto</button>
          <button class="admin-tab" id="create-mode" type="button">Novo projeto</button>
        </div>
        <form class="admin-card" id="project-form">
          <div class="form-grid">
            <div class="field"><label for="department-select">Secretaria</label><select id="department-select" ${isAdministrator ? "" : "disabled"}>${allowedDepartments.map(department => `<option value="${h(department)}" ${department === initialDepartment ? "selected" : ""}>${h(department)}</option>`).join("")}</select></div>
            <div class="field" id="project-select-field"><label for="project-select">Projeto</label><select id="project-select"></select></div>
            <div class="field full"><label for="name">Nome do projeto</label><input id="name" type="text" required /></div>
            <div class="field full"><label for="description">Descrição</label><textarea id="description"></textarea></div>
            <div class="field"><label for="location">Localização</label><input id="location" type="text" /></div>
            <div class="field"><label for="responsible">Responsável</label><input id="responsible" type="text" /></div>
            <div class="field"><label for="start-date">Data de início</label><input id="start-date" type="date" /></div>
            <div class="field"><label for="deadline">Prazo previsto</label><input id="deadline" type="date" /></div>
            <div class="field"><label for="unit">Unidade da meta</label><input id="unit" type="text" placeholder="Ex.: ruas, bairros, obras" required /></div>
            <div class="field"><label for="budget">Orçamento previsto (R$)</label><input id="budget" type="number" min="0" step="0.01" required /></div>
            <div class="field"><label for="completed">Quantidade realizada</label><input id="completed" type="number" min="0" step="1" required /></div>
            <div class="field"><label for="target">Meta</label><input id="target" type="number" min="1" step="1" required /></div>
            <div class="field"><label for="status">Situação</label><select id="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
            <div class="field"><label for="spent">Valor executado (R$)</label><input id="spent" type="number" min="0" step="0.01" required /></div>
            <div class="field full"><label for="next-step">Próxima etapa</label><textarea id="next-step"></textarea></div>
            <div class="field full"><label for="issue">Problema ou impedimento</label><textarea id="issue"></textarea></div>
          </div>
          <div class="form-summary">
            <div class="summary-box"><span>Progresso calculado</span><strong id="summary-progress">0%</strong></div>
            <div class="summary-box"><span>Quantidade restante</span><strong id="summary-remaining">0</strong></div>
            <div class="summary-box"><span>Atualização</span><strong>Agora</strong></div>
          </div>
          <div class="form-actions">
            <button class="btn btn-danger" id="delete-button" type="button">Excluir projeto</button>
            <button class="btn btn-primary" id="save-button" type="submit">Salvar atualização</button>
          </div>
        </form>
      </section>
    </div>`;

  bindLogout();
  document.querySelector("#users-menu")?.addEventListener("click", renderUserManagement);
  const departmentSelect = document.querySelector("#department-select");
  const select = document.querySelector("#project-select");
  const selectField = document.querySelector("#project-select-field");
  const form = document.querySelector("#project-form");
  const saveButton = document.querySelector("#save-button");
  const deleteButton = document.querySelector("#delete-button");
  const editModeButton = document.querySelector("#edit-mode");
  const createModeButton = document.querySelector("#create-mode");
  let isCreating = projects.length === 0;
  const fields = {
    name: document.querySelector("#name"),
    description: document.querySelector("#description"),
    location: document.querySelector("#location"),
    responsible: document.querySelector("#responsible"),
    startDate: document.querySelector("#start-date"),
    deadline: document.querySelector("#deadline"),
    unit: document.querySelector("#unit"),
    budget: document.querySelector("#budget"),
    completed: document.querySelector("#completed"),
    target: document.querySelector("#target"),
    status: document.querySelector("#status"),
    spent: document.querySelector("#spent"),
    nextStep: document.querySelector("#next-step"),
    issue: document.querySelector("#issue")
  };

  function departmentProjects() {
    return projects.filter(project => project.department === departmentSelect.value);
  }

  function refreshProjectOptions(preferredId) {
    const filtered = departmentProjects();
    select.innerHTML = filtered.length
      ? filtered.map(project => `<option value="${project.id}">${h(project.name)}</option>`).join("")
      : '<option value="">Nenhum projeto nesta secretaria</option>';
    if (preferredId && filtered.some(project => String(project.id) === String(preferredId))) select.value = String(preferredId);
    editModeButton.disabled = filtered.length === 0;
  }

  function fillForm() {
    const project = projects.find(item => String(item.id) === select.value);
    if (!project) return;
    Object.entries(fields).forEach(([key, field]) => {
      field.value = project[key] ?? "";
    });
    updateSummary();
  }

  function clearForm() {
    form.reset();
    fields.status.value = "nao-iniciado";
    fields.completed.value = 0;
    fields.target.value = 1;
    fields.budget.value = 0;
    fields.spent.value = 0;
    fields.responsible.value = departmentSelect.value;
    fields.issue.value = "Nenhum impedimento relevante.";
    updateSummary();
  }

  function setFormMode(nextMode) {
    isCreating = nextMode === "create";
    editModeButton.classList.toggle("active", !isCreating);
    createModeButton.classList.toggle("active", isCreating);
    selectField.hidden = isCreating;
    deleteButton.hidden = isCreating;
    saveButton.textContent = isCreating ? "Cadastrar projeto" : "Salvar atualização";
    if (isCreating) clearForm();
    else fillForm();
  }

  function updateSummary() {
    const target = Number(fields.target.value || 0);
    const completed = Number(fields.completed.value || 0);
    document.querySelector("#summary-progress").textContent = target
      ? `${Math.min(100, Math.round((completed / target) * 100))}%`
      : "0%";
    document.querySelector("#summary-remaining").textContent =
      formatNumber(Math.max(0, target - completed));
  }

  select.addEventListener("change", fillForm);
  departmentSelect.addEventListener("change", () => {
    refreshProjectOptions();
    setFormMode(departmentProjects().length ? "edit" : "create");
  });
  editModeButton.addEventListener("click", () => setFormMode("edit"));
  createModeButton.addEventListener("click", () => setFormMode("create"));
  fields.completed.addEventListener("input", updateSummary);
  fields.target.addEventListener("input", updateSummary);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const project = projects.find(item => String(item.id) === select.value);
    const values = {
      name: fields.name.value.trim(),
      description: fields.description.value.trim() || null,
      location: fields.location.value.trim() || null,
      responsible: fields.responsible.value.trim() || null,
      start_date: fields.startDate.value || null,
      deadline: fields.deadline.value || null,
      unit: fields.unit.value.trim(),
      budget: Number(fields.budget.value),
      completed: Number(fields.completed.value),
      target: Number(fields.target.value),
      status: fields.status.value,
      spent: Number(fields.spent.value),
      next_step: fields.nextStep.value.trim(),
      issue: fields.issue.value.trim(),
      updated_at: new Date().toISOString()
    };

    saveButton.disabled = true;
    saveButton.textContent = isCreating ? "Cadastrando..." : "Salvando...";
    const query = isCreating
      ? db.from("projects").insert({ ...values, slug: createUniqueSlug(values.name), department: departmentSelect.value })
      : db.from("projects").update(values).eq("id", project.id);
    const { data, error } = await query.select().single();

    if (error) {
      showToast(`Não foi possível salvar: ${error.message}`, true);
      saveButton.disabled = false;
      saveButton.textContent = isCreating ? "Cadastrar projeto" : "Salvar atualização";
      return;
    }

    if (!isCreating) {
      const historyResult = await db.from("project_updates").insert({
        project_id: project.id,
        completed: values.completed,
        spent: values.spent,
        status: values.status,
        next_step: values.next_step,
        issue: values.issue
      });
      if (historyResult.error) console.error("Histórico não registrado", historyResult.error);
    }

    await fetchProjects();
    const savedProject = projects.find(item => item.id === data.id);
    renderAdmin();
    const refreshedDepartment = document.querySelector("#department-select");
    const refreshedSelect = document.querySelector("#project-select");
    if (savedProject && refreshedDepartment && refreshedSelect) {
      refreshedDepartment.value = savedProject.department;
      refreshedDepartment.dispatchEvent(new Event("change"));
      refreshedSelect.value = String(savedProject.id);
      refreshedSelect.dispatchEvent(new Event("change"));
    }
    showToast(isCreating
      ? "Projeto cadastrado. Ele já aparece no painel da TV."
      : "Atualização salva. O painel da TV já recebeu os novos dados.");
  });

  deleteButton.addEventListener("click", async () => {
    const project = projects.find(item => String(item.id) === select.value);
    if (!project) return;
    const typedName = window.prompt(
      `Esta exclusão é permanente. Para excluir, digite exatamente o nome do projeto:\n\n${project.name}`
    );
    if (typedName === null) return;
    if (typedName.trim() !== project.name) {
      showToast("Exclusão cancelada: o nome digitado não corresponde ao projeto.", true);
      return;
    }

    deleteButton.disabled = true;
    deleteButton.textContent = "Excluindo...";
    const { error } = await db.from("projects").delete().eq("id", project.id);
    if (error) {
      showToast(`Não foi possível excluir: ${error.message}`, true);
      deleteButton.disabled = false;
      deleteButton.textContent = "Excluir projeto";
      return;
    }

    await fetchProjects();
    renderAdmin();
    showToast("Projeto excluído do painel.");
  });

  refreshProjectOptions();
  setFormMode(departmentProjects().length ? "edit" : "create");
  updateClock();
}

async function renderUserManagement() {
  if (currentProfile?.role !== "admin") return renderAdmin();
  app.innerHTML = `
    <div class="shell">${header(false)}<section class="admin-wrap">
      <div class="admin-intro"><div><h2>Usuários e acessos</h2><p>Somente administradores podem cadastrar acessos.</p></div><span class="status no-prazo">Administrador</span></div>
      <nav class="management-menu"><button class="management-link" id="projects-menu" type="button">Projetos</button><button class="management-link active" type="button">Usuários</button></nav>
      <div class="users-layout">
        <form class="admin-card" id="user-form"><h3>Novo usuário</h3>
          <div class="field"><label for="user-email">E-mail</label><input id="user-email" type="email" required /></div>
          <div class="field"><label for="user-password">Senha inicial</label><input id="user-password" type="password" minlength="8" required /></div>
          <div class="field"><label for="user-department">Secretaria</label><select id="user-department">${DEPARTMENTS.map(department => `<option value="${h(department)}">${h(department)}</option>`).join("")}</select></div>
          <div class="field"><label for="user-role">Permissão</label><select id="user-role"><option value="user">Usuário da secretaria</option><option value="admin">Administrador</option></select></div>
          <button class="btn btn-primary btn-wide" type="submit">Cadastrar usuário</button>
        </form>
        <section class="admin-card"><h3>Usuários cadastrados</h3><div id="users-list" class="users-list"><p>Carregando...</p></div></section>
      </div>
    </section></div>`;
  bindLogout();
  document.querySelector("#projects-menu").addEventListener("click", renderAdmin);

  async function loadUsers() {
    const response = await fetch("/api/admin-users", { headers: { Authorization: `Bearer ${currentSession.access_token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível consultar os usuários.");
    document.querySelector("#users-list").innerHTML = result.users.map(user => `<article class="user-row"><div><strong>${h(user.email)}</strong><span>${h(user.department || "Sem secretaria")}</span></div><span class="role-badge">${user.role === "admin" ? "Administrador" : "Secretaria"}</span></article>`).join("") || "<p>Nenhum usuário cadastrado.</p>";
  }

  document.querySelector("#user-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Cadastrando...";
    try {
      const response = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ email: document.querySelector("#user-email").value.trim(), password: document.querySelector("#user-password").value, department: document.querySelector("#user-department").value, role: document.querySelector("#user-role").value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível cadastrar o usuário.");
      event.currentTarget.reset();
      showToast("Usuário cadastrado com sucesso.");
      await loadUsers();
    } catch (error) { showToast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Cadastrar usuário"; }
  });
  loadUsers().catch(error => { document.querySelector("#users-list").innerHTML = `<p class="form-error">${h(error.message)}</p>`; });
  updateClock();
}

function showToast(message, isError = false) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " toast-error" : ""}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function startRotation() {
  clearInterval(rotationTimer);
  if (adminMode) return;
  rotationTimer = setInterval(() => {
    secondsLeft -= 1;
    const countdown = document.querySelector("#countdown");
    if (countdown) countdown.textContent = secondsLeft;
    if (secondsLeft <= 0 && projects.length) {
      if (displayMode === "overview") {
        const totalPages = Math.ceil(projects.length / OVERVIEW_PAGE_SIZE);
        if (totalPages > 1) overviewPage = (overviewPage + 1) % totalPages;
      } else {
        activeIndex = (activeIndex + 1) % projects.length;
      }
      secondsLeft = rotationInterval;
      renderDashboard();
    }
  }, 1000);
}

function subscribeToUpdates() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  realtimeChannel = db
    .channel("projects-live")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "projects"
    }, async () => {
      try {
        await fetchProjects();
        renderDashboard();
      } catch (error) {
        console.error("Erro ao atualizar dados em tempo real", error);
      }
    })
    .subscribe();
}

async function init() {
  renderLoading();
  try {
    const { data } = await db.auth.getSession();
    currentSession = data.session;

    if (adminMode && !currentSession) {
      renderLogin();
      return;
    }

    if (adminMode) await fetchProfile();

    await fetchProjects();
    if (adminMode) {
      renderAdmin();
    } else {
      renderDashboard();
      subscribeToUpdates();
      startRotation();
    }
  } catch (error) {
    renderError(error);
  }
}

setInterval(updateClock, 30000);
init();
