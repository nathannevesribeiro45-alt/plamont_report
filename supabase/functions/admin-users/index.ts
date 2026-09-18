import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
  Edge Function administrativa para Gestão de Usuários.
  A service_role permanece somente nos secrets da função. Nunca a exponha
  no navegador, em arquivos estáticos ou em logs.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const perfisPermitidos = new Set(["visualizador", "editor", "planejamento", "admin"]);
const dominioInterno = (Deno.env.get("AUTH_EMAIL_DOMAIN") || "auth.plamont.local").trim().toLowerCase();

function responder(corpo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function falha(code: string, message: string, status = 400) {
  return responder({ error: { code, message } }, status);
}

function texto(valor: unknown, maximo = 120) {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function matriculaValida(matricula: string) {
  return /^[a-z0-9._-]{1,80}$/i.test(matricula);
}

function idValido(id: unknown) {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function erroDuplicado(erro: { code?: string; message?: string } | null) {
  return erro?.code === "23505" || /already (been )?(registered|exists)|duplicate/i.test(erro?.message || "");
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (requisicao.method !== "POST") return falha("metodo_nao_permitido", "Use uma requisição POST.", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const chaveAnon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !chaveAnon || !chaveServico) {
    return falha("configuracao_invalida", "A função não está configurada corretamente.", 500);
  }

  const authorization = requisicao.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return falha("nao_autenticado", "Sessão de acesso não informada.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return falha("nao_autenticado", "Sessão de acesso inválida.", 401);

  const clienteSessao = createClient(supabaseUrl, chaveAnon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const clienteAdmin = createClient(supabaseUrl, chaveServico, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: autenticacao, error: erroAutenticacao } = await clienteSessao.auth.getUser(token);
  const solicitante = autenticacao?.user;

  if (erroAutenticacao || !solicitante) {
    return falha("nao_autenticado", "Sua sessão expirou. Entre novamente.", 401);
  }

  const { data: perfilSolicitante, error: erroPerfilSolicitante } = await clienteAdmin
    .from("usuarios")
    .select("id, perfil, ativo")
    .eq("id", solicitante.id)
    .maybeSingle();

  if (erroPerfilSolicitante || !perfilSolicitante?.ativo || perfilSolicitante.perfil !== "admin") {
    return falha("sem_permissao", "Esta ação é exclusiva de administradores ativos.", 403);
  }

  let corpo: { action?: unknown; data?: Record<string, unknown> };
  try {
    corpo = await requisicao.json();
  } catch (_) {
    return falha("requisicao_invalida", "Corpo da requisição inválido.");
  }

  const action = corpo?.action;
  const data = corpo?.data && typeof corpo.data === "object" && !Array.isArray(corpo.data)
    ? corpo.data
    : {};

  if (action === "list") {
    const { data: usuarios, error } = await clienteAdmin
      .from("usuarios")
      .select("id, matricula, nome, perfil, ativo, created_at, updated_at")
      .order("nome", { ascending: true });

    if (error) return falha("erro_servidor", "Não foi possível carregar os usuários.", 500);
    return responder({ usuarios: usuarios || [] });
  }

  if (action === "create") {
    const nome = texto(data.nome);
    const matricula = texto(data.matricula, 80).toLowerCase();
    const perfil = texto(data.perfil, 30);
    const senha = typeof data.senha === "string" ? data.senha : "";
    const ativo = data.ativo !== false;

    if (nome.length < 3) return falha("nome_invalido", "Informe o nome completo do usuário.");
    if (!matriculaValida(matricula)) return falha("matricula_invalida", "A matrícula informada não é válida.");
    if (!perfisPermitidos.has(perfil)) return falha("perfil_invalido", "O perfil informado não é válido.");
    if (senha.length < 8) return falha("senha_invalida", "A senha deve ter pelo menos 8 caracteres.");

    const { data: existente, error: erroExistente } = await clienteAdmin
      .from("usuarios")
      .select("id")
      .eq("matricula", matricula)
      .maybeSingle();

    if (erroExistente) return falha("erro_servidor", "Não foi possível validar a matrícula.", 500);
    if (existente) return falha("duplicado", "Já existe um usuário com esta matrícula.", 409);

    const email = `${matricula}@${dominioInterno}`;
    const { data: usuarioCriado, error: erroCriacao } = await clienteAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

    if (erroCriacao || !usuarioCriado.user) {
      if (erroDuplicado(erroCriacao)) return falha("duplicado", "Já existe um usuário com esta matrícula.", 409);
      return falha("erro_servidor", "Não foi possível criar a conta de acesso.", 500);
    }

    const { data: perfilCriado, error: erroInsercao } = await clienteAdmin
      .from("usuarios")
      .insert({
        id: usuarioCriado.user.id,
        matricula,
        nome,
        perfil,
        ativo,
      })
      .select("id, matricula, nome, perfil, ativo, created_at, updated_at")
      .single();

    if (erroInsercao) {
      await clienteAdmin.auth.admin.deleteUser(usuarioCriado.user.id);
      if (erroDuplicado(erroInsercao)) return falha("duplicado", "Já existe um usuário com esta matrícula.", 409);
      return falha("erro_servidor", "Não foi possível concluir o cadastro do usuário.", 500);
    }

    return responder({ usuario: perfilCriado }, 201);
  }

  if (action === "update") {
    const id = data.id;
    const nome = texto(data.nome);
    const perfil = texto(data.perfil, 30);

    if (!idValido(id)) return falha("usuario_nao_encontrado", "O usuário informado não é válido.");
    if (nome.length < 3) return falha("nome_invalido", "Informe o nome completo do usuário.");
    if (!perfisPermitidos.has(perfil)) return falha("perfil_invalido", "O perfil informado não é válido.");

    const { data: alvo, error: erroAlvo } = await clienteAdmin
      .from("usuarios")
      .select("id, perfil")
      .eq("id", id)
      .maybeSingle();

    if (erroAlvo || !alvo) return falha("usuario_nao_encontrado", "Usuário não encontrado.", 404);
    if (alvo.id === solicitante.id && perfil !== alvo.perfil) {
      return falha("auto_alteracao_bloqueada", "Você não pode alterar o perfil da própria conta.", 403);
    }

    const { data: usuarioAtualizado, error } = await clienteAdmin
      .from("usuarios")
      .update({ nome, perfil })
      .eq("id", id)
      .select("id, matricula, nome, perfil, ativo, created_at, updated_at")
      .single();

    if (error) return falha("erro_servidor", "Não foi possível atualizar o usuário.", 500);
    return responder({ usuario: usuarioAtualizado });
  }

  if (action === "toggle-active") {
    const id = data.id;
    const ativo = data.ativo;

    if (!idValido(id)) return falha("usuario_nao_encontrado", "O usuário informado não é válido.");
    if (typeof ativo !== "boolean") return falha("status_invalido", "O status informado não é válido.");
    if (id === solicitante.id) return falha("auto_alteracao_bloqueada", "Você não pode alterar o status da própria conta.", 403);

    const { data: usuarioAtualizado, error } = await clienteAdmin
      .from("usuarios")
      .update({ ativo })
      .eq("id", id)
      .select("id, matricula, nome, perfil, ativo, created_at, updated_at")
      .maybeSingle();

    if (error) return falha("erro_servidor", "Não foi possível atualizar o status do usuário.", 500);
    if (!usuarioAtualizado) return falha("usuario_nao_encontrado", "Usuário não encontrado.", 404);
    return responder({ usuario: usuarioAtualizado });
  }

  if (action === "reset-password") {
    const id = data.id;
    const senha = typeof data.senha === "string" ? data.senha : "";

    if (!idValido(id)) return falha("usuario_nao_encontrado", "O usuário informado não é válido.");
    if (senha.length < 8) return falha("senha_invalida", "A senha deve ter pelo menos 8 caracteres.");

    const { data: usuarioAtualizado, error } = await clienteAdmin.auth.admin.updateUserById(id, {
      password: senha,
    });

    if (error || !usuarioAtualizado.user) {
      return falha("erro_servidor", "Não foi possível redefinir a senha.", 500);
    }

    return responder({ ok: true });
  }

  return falha("acao_invalida", "A ação solicitada não é válida.");
});
