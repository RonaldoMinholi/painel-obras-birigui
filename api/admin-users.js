const DEPARTMENTS = [
  "Secretaria da Casa Civil", "Secretaria de Administração", "Secretaria de Assistência Social",
  "Secretaria de Cultura e Turismo", "Secretaria de Desenvolvimento Econômico", "Secretaria de Educação",
  "Secretaria de Esportes", "Secretaria de Governo", "Secretaria de Meio Ambiente",
  "Secretaria de Mobilidade Urbana", "Secretaria de Negócios Jurídicos", "Secretaria de Obras",
  "Secretaria de Planejamento e Finanças", "Secretaria de Saúde", "Secretaria de Segurança Pública",
  "Secretaria de Serviços Públicos", "Secretaria de Tributação e Fiscalização"
];

function send(res, status, body) {
  res.status(status).json(body);
}

async function supabase(path, options = {}, useServiceRole = true) {
  const key = useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
}

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY) {
    return send(res, 500, { error: "Variáveis do Supabase não configuradas na Vercel." });
  }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return send(res, 401, { error: "Sessão inválida." });

  const userResponse = await supabase("/auth/v1/user", { headers: { Authorization: `Bearer ${token}` } }, false);
  if (!userResponse.ok) return send(res, 401, { error: "Sessão expirada." });
  const requester = await userResponse.json();

  const profileResponse = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(requester.id)}&select=role`);
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || profiles[0]?.role !== "admin") return send(res, 403, { error: "Acesso permitido somente ao administrador." });

  if (req.method === "GET") {
    const [authResponse, profileListResponse] = await Promise.all([
      supabase("/auth/v1/admin/users?per_page=1000"),
      supabase("/rest/v1/profiles?select=id,department,role")
    ]);
    const authData = await authResponse.json();
    const profileList = await profileListResponse.json();
    if (!authResponse.ok || !profileListResponse.ok) return send(res, 500, { error: "Não foi possível listar os usuários." });
    const byId = new Map(profileList.map(profile => [profile.id, profile]));
    return send(res, 200, { users: (authData.users || []).map(user => ({ id: user.id, email: user.email, ...(byId.get(user.id) || {}) })) });
  }

  if (req.method === "POST") {
    const { email, password, department, role = "user" } = req.body || {};
    if (!email || !password || password.length < 8) return send(res, 400, { error: "Informe e-mail e senha com pelo menos 8 caracteres." });
    if (!DEPARTMENTS.includes(department)) return send(res, 400, { error: "Secretaria inválida." });
    if (!['user', 'admin'].includes(role)) return send(res, 400, { error: "Permissão inválida." });
    const createResponse = await supabase("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { department, role } })
    });
    const created = await createResponse.json();
    if (!createResponse.ok) return send(res, createResponse.status, { error: created.msg || created.message || "Não foi possível cadastrar o usuário." });
    return send(res, 201, { id: created.id, email: created.email });
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { error: "Método não permitido." });
};
