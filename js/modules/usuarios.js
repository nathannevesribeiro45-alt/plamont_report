/* ==========================================================
   GESTÃO DE USUÁRIOS — interface administrativa
   Toda alteração sensível é processada pela Edge Function.
   ========================================================== */

const Usuarios = {

    usuarios: [],
    eventosConfigurados: false,
    carregando: false,

    perfis: {
        visualizador: "Visualizador",
        editor: "Editor",
        planejamento: "Planejamento",
        admin: "Administrador"
    },

    iniciar() {

        document.addEventListener("plamont:auth-alterado", () => {

            if (!this.podeAdministrar() && document.getElementById("usuarios")?.classList.contains("ativa")) {
                abrirPagina("dashboard", document.querySelector('.menu-btn[data-pagina="dashboard"]'));
            }

        });

    },

    podeAdministrar() {
        return window.Auth?.pode?.("administrarUsuarios") === true;
    },

    configurarEventos() {

        if (this.eventosConfigurados) return;

        const busca = document.getElementById("usuarios-busca");
        const perfil = document.getElementById("usuarios-perfil");
        const status = document.getElementById("usuarios-status");
        const novo = document.getElementById("usuarios-novo");
        const lista = document.getElementById("usuarios-lista");

        busca?.addEventListener("input", () => this.renderizarLista());
        perfil?.addEventListener("change", () => this.renderizarLista());
        status?.addEventListener("change", () => this.renderizarLista());
        novo?.addEventListener("click", () => this.abrirModalNovo());

        lista?.addEventListener("click", evento => {

            const botao = evento.target.closest("button[data-acao][data-id]");
            if (!botao) return;

            const usuario = this.usuarios.find(item => item.id === botao.dataset.id);
            if (!usuario) return;

            if (botao.dataset.acao === "editar") this.abrirModalEdicao(usuario);
            if (botao.dataset.acao === "senha") this.abrirModalSenha(usuario);
            if (botao.dataset.acao === "status") this.confirmarStatus(usuario);

        });

        this.eventosConfigurados = true;

    },

    async render() {

        this.configurarEventos();

        if (!this.podeAdministrar()) {
            this.mostrarFeedback("Você não possui permissão para administrar usuários.", "erro");
            document.getElementById("usuarios-lista").replaceChildren();
            return;
        }

        await this.carregarUsuarios();

    },

    async carregarUsuarios() {

        if (this.carregando) return;

        this.carregando = true;
        this.mostrarFeedback("Carregando usuários…", "carregando");
        document.getElementById("usuarios-lista").innerHTML = this.esqueletoLista();

        try {

            const resultado = await this.chamarApi("list");
            this.usuarios = Array.isArray(resultado.usuarios) ? resultado.usuarios : [];
            this.esconderFeedback();
            this.renderizarLista();

        } catch (erro) {

            this.usuarios = [];
            this.mostrarFeedback(this.mensagemErro(erro), "erro");
            document.getElementById("usuarios-lista").replaceChildren();

        } finally {
            this.carregando = false;
        }

    },

    async chamarApi(action, dados = {}) {

        if (!this.podeAdministrar()) {
            const erro = new Error("Ação disponível somente para administradores.");
            erro.code = "sem_permissao";
            throw erro;
        }

        const auth = window.Auth;
        let sessao = auth?.sessao;

        if (!sessao?.access_token && auth?.supabase) {
            const { data, error } = await auth.supabase.auth.getSession();
            if (error) throw error;
            sessao = data?.session || null;
        }

        if (!sessao?.access_token) {
            const erro = new Error("Sua sessão expirou. Entre novamente para continuar.");
            erro.code = "sessao_expirada";
            throw erro;
        }

        const config = window.PlamontSupabaseConfig || {};
        const nomeFuncao = config.adminUsersFunction || "admin-users";

        const resposta = await fetch(`${config.url}/functions/v1/${encodeURIComponent(nomeFuncao)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${sessao.access_token}`,
                "apikey": config.anonKey
            },
            body: JSON.stringify({ action, data: dados })
        });

        let corpo = {};

        try {
            corpo = await resposta.json();
        } catch (_) {
            corpo = {};
        }

        if (!resposta.ok) {
            const erro = new Error(corpo?.error?.message || "Não foi possível concluir esta ação.");
            erro.code = corpo?.error?.code || "erro_servidor";
            throw erro;
        }

        return corpo;

    },

    usuariosFiltrados() {

        const termo = String(document.getElementById("usuarios-busca")?.value || "").trim().toLocaleLowerCase("pt-BR");
        const perfil = document.getElementById("usuarios-perfil")?.value || "";
        const status = document.getElementById("usuarios-status")?.value || "";

        return this.usuarios.filter(usuario => {

            const correspondeAoTermo = !termo || [usuario.nome, usuario.matricula]
                .some(valor => String(valor || "").toLocaleLowerCase("pt-BR").includes(termo));

            const correspondeAoPerfil = !perfil || usuario.perfil === perfil;
            const correspondeAoStatus = !status || (status === "ativo" ? usuario.ativo : !usuario.ativo);

            return correspondeAoTermo && correspondeAoPerfil && correspondeAoStatus;

        });

    },

    renderizarLista() {

        const lista = document.getElementById("usuarios-lista");
        if (!lista) return;

        const usuarios = this.usuariosFiltrados();

        if (!usuarios.length) {
            lista.innerHTML = `
                <div class="usuarios-vazio">
                    <span aria-hidden="true">⌕</span>
                    <strong>Nenhum usuário encontrado</strong>
                    <p>Ajuste os filtros ou crie um novo usuário.</p>
                </div>`;
            return;
        }

        lista.innerHTML = `
            <div class="usuarios-contagem">${usuarios.length} ${usuarios.length === 1 ? "usuário encontrado" : "usuários encontrados"}</div>
            <div class="usuarios-grade">
                ${usuarios.map(usuario => this.cartaoUsuario(usuario)).join("")}
            </div>`;

    },

    cartaoUsuario(usuario) {

        const proprioUsuario = usuario.id === window.Auth?.usuario?.id;
        const nome = this.escapar(usuario.nome || "Sem nome");
        const matricula = this.escapar(usuario.matricula || "—");
        const perfil = this.escapar(this.perfis[usuario.perfil] || usuario.perfil || "Não definido");
        const id = this.escaparAtributo(usuario.id);
        const iniciais = this.escapar(this.iniciais(usuario.nome || usuario.matricula));
        const ativo = Boolean(usuario.ativo);

        return `
            <article class="usuario-cartao ${ativo ? "" : "usuario-inativo"}">
                <div class="usuario-cartao-topo">
                    <div class="usuario-avatar" aria-hidden="true">${iniciais}</div>
                    <div class="usuario-identidade">
                        <h2>${nome}</h2>
                        <p>Matrícula <strong>${matricula}</strong></p>
                    </div>
                    <span class="usuario-status ${ativo ? "ativo" : "inativo"}">${ativo ? "Ativo" : "Inativo"}</span>
                </div>
                <div class="usuario-detalhes">
                    <span class="usuario-perfil">${perfil}</span>
                    ${proprioUsuario ? '<span class="usuario-proprio">Sua conta</span>' : ""}
                </div>
                <div class="usuario-acoes">
                    <button class="usuarios-btn usuarios-btn-secundario" type="button" data-acao="editar" data-id="${id}">Editar</button>
                    <button class="usuarios-btn usuarios-btn-secundario" type="button" data-acao="senha" data-id="${id}">Redefinir senha</button>
                    <button class="usuarios-btn ${ativo ? "usuarios-btn-perigo" : "usuarios-btn-sucesso"}" type="button" data-acao="status" data-id="${id}" ${proprioUsuario ? "disabled title=\"Você não pode alterar o status da própria conta.\"" : ""}>${ativo ? "Desativar" : "Ativar"}</button>
                </div>
            </article>`;

    },

    abrirModalNovo() {

        this.abrirModal({
            titulo: "Novo usuário",
            descricao: "Defina o acesso inicial. A matrícula não poderá ser alterada depois do cadastro.",
            conteudo: `
                <form class="usuarios-form" data-formulario="novo">
                    ${this.campoTexto("Nome completo", "nome", "Nome do usuário", true)}
                    ${this.campoTexto("Matrícula", "matricula", "Ex.: 137782", true, "text", "username")}
                    ${this.campoPerfil("perfil", "planejamento")}
                    ${this.campoSenha("Senha provisória", "senha", true, "new-password")}
                    ${this.campoSenha("Confirmar senha", "confirmarSenha", true, "new-password")}
                    <label class="usuarios-checkbox"><input name="ativo" type="checkbox" checked> <span>Usuário ativo ao concluir o cadastro</span></label>
                    <div class="usuarios-form-erro" role="alert" hidden></div>
                    <div class="usuarios-modal-acoes">
                        <button class="usuarios-btn usuarios-btn-secundario" type="button" data-fechar-modal>Cancelar</button>
                        <button class="usuarios-btn usuarios-btn-primario" type="submit">Criar usuário</button>
                    </div>
                </form>`
        });

    },

    abrirModalEdicao(usuario) {

        const propriaConta = usuario.id === window.Auth?.usuario?.id;

        this.abrirModal({
            titulo: "Editar usuário",
            descricao: "A matrícula é somente leitura nesta primeira versão.",
            conteudo: `
                <form class="usuarios-form" data-formulario="editar" data-id="${this.escaparAtributo(usuario.id)}">
                    ${this.campoTexto("Nome completo", "nome", "Nome do usuário", true, "text", "name", usuario.nome || "")}
                    ${this.campoTexto("Matrícula", "matricula", "", false, "text", "off", usuario.matricula || "", true)}
                    ${this.campoPerfil("perfil", usuario.perfil, propriaConta)}
                    ${propriaConta ? '<p class="usuarios-aviso">Para preservar a segurança, você não pode alterar o perfil da própria conta.</p>' : ""}
                    <div class="usuarios-form-erro" role="alert" hidden></div>
                    <div class="usuarios-modal-acoes">
                        <button class="usuarios-btn usuarios-btn-secundario" type="button" data-fechar-modal>Cancelar</button>
                        <button class="usuarios-btn usuarios-btn-primario" type="submit">Salvar alterações</button>
                    </div>
                </form>`
        });

    },

    abrirModalSenha(usuario) {

        this.abrirModal({
            titulo: "Redefinir senha",
            descricao: `Defina uma nova senha para ${this.escapar(usuario.nome || usuario.matricula)}. Ela nunca será exibida nem armazenada nesta tela.`,
            conteudo: `
                <form class="usuarios-form" data-formulario="senha" data-id="${this.escaparAtributo(usuario.id)}">
                    ${this.campoSenha("Nova senha", "senha", true, "new-password")}
                    ${this.campoSenha("Confirmar nova senha", "confirmarSenha", true, "new-password")}
                    <div class="usuarios-form-erro" role="alert" hidden></div>
                    <div class="usuarios-modal-acoes">
                        <button class="usuarios-btn usuarios-btn-secundario" type="button" data-fechar-modal>Cancelar</button>
                        <button class="usuarios-btn usuarios-btn-primario" type="submit">Redefinir senha</button>
                    </div>
                </form>`
        });

    },

    campoTexto(rotulo, nome, placeholder, obrigatorio, tipo = "text", autocomplete = "off", valor = "", somenteLeitura = false) {
        return `<label class="usuarios-campo"><span>${rotulo}</span><input type="${tipo}" name="${nome}" placeholder="${this.escaparAtributo(placeholder)}" value="${this.escaparAtributo(valor)}" autocomplete="${autocomplete}" ${obrigatorio ? "required" : ""} ${somenteLeitura ? "readonly" : ""}></label>`;
    },

    campoSenha(rotulo, nome, obrigatorio, autocomplete) {
        return `<label class="usuarios-campo"><span>${rotulo}</span><input type="password" name="${nome}" minlength="8" autocomplete="${autocomplete}" ${obrigatorio ? "required" : ""}><small>Mínimo de 8 caracteres.</small></label>`;
    },

    campoPerfil(nome, selecionado, desabilitado = false) {
        return `<label class="usuarios-campo"><span>Perfil de acesso</span><select name="${nome}" ${desabilitado ? "disabled" : ""}>${Object.entries(this.perfis).map(([valor, rotulo]) => `<option value="${valor}" ${valor === selecionado ? "selected" : ""}>${rotulo}</option>`).join("")}</select></label>`;
    },

    abrirModal({ titulo, descricao, conteudo }) {

        this.fecharModal();

        const modal = document.createElement("div");
        modal.className = "usuarios-modal-overlay";
        modal.id = "usuarios-modal";
        modal.innerHTML = `
            <div class="usuarios-modal" role="dialog" aria-modal="true" aria-labelledby="usuarios-modal-titulo">
                <div class="usuarios-modal-cabecalho">
                    <div><h2 id="usuarios-modal-titulo">${titulo}</h2><p>${descricao}</p></div>
                    <button class="usuarios-modal-fechar" type="button" aria-label="Fechar" data-fechar-modal>×</button>
                </div>
                ${conteudo}
            </div>`;

        modal.addEventListener("click", evento => {
            if (evento.target === modal || evento.target.closest("[data-fechar-modal]")) this.fecharModal();
        });

        modal.querySelector("form")?.addEventListener("submit", evento => this.enviarFormulario(evento));
        document.body.appendChild(modal);
        document.body.classList.add("usuarios-modal-aberto");

        requestAnimationFrame(() => modal.querySelector("input:not([readonly]), select")?.focus());

    },

    fecharModal() {
        document.getElementById("usuarios-modal")?.remove();
        document.body.classList.remove("usuarios-modal-aberto");
    },

    async enviarFormulario(evento) {

        evento.preventDefault();

        const form = evento.currentTarget;
        const tipo = form.dataset.formulario;
        const dados = Object.fromEntries(new FormData(form).entries());
        const erroEl = form.querySelector(".usuarios-form-erro");
        const submit = form.querySelector('button[type="submit"]');

        if (String(dados.senha || "") !== String(dados.confirmarSenha || "")) {
            this.exibirErroFormulario(erroEl, "As senhas informadas não coincidem.");
            return;
        }

        if (dados.senha && String(dados.senha).length < 8) {
            this.exibirErroFormulario(erroEl, "A senha deve ter pelo menos 8 caracteres.");
            return;
        }

        if (tipo === "novo" && !this.matriculaValida(dados.matricula)) {
            this.exibirErroFormulario(erroEl, "Use somente letras, números, ponto, hífen ou sublinhado na matrícula.");
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.dataset.textoOriginal = submit.textContent;
            submit.textContent = "Salvando…";
        }

        try {

            if (tipo === "novo") {
                await this.chamarApi("create", {
                    nome: dados.nome,
                    matricula: dados.matricula,
                    perfil: dados.perfil,
                    senha: dados.senha,
                    ativo: Boolean(form.querySelector('[name="ativo"]')?.checked)
                });
                this.mostrarFeedback("Usuário criado com sucesso.", "sucesso");
            }

            if (tipo === "editar") {
                const usuario = this.usuarios.find(item => item.id === form.dataset.id);
                await this.chamarApi("update", {
                    id: form.dataset.id,
                    nome: dados.nome,
                    perfil: dados.perfil || usuario?.perfil
                });
                this.mostrarFeedback("Dados do usuário atualizados.", "sucesso");
            }

            if (tipo === "senha") {
                await this.chamarApi("reset-password", { id: form.dataset.id, senha: dados.senha });
                this.mostrarFeedback("Senha redefinida com sucesso.", "sucesso");
            }

            this.fecharModal();
            await this.carregarUsuarios();

        } catch (erro) {
            this.exibirErroFormulario(erroEl, this.mensagemErro(erro));
        } finally {
            if (submit?.isConnected) {
                submit.disabled = false;
                submit.textContent = submit.dataset.textoOriginal || "Salvar";
            }
        }

    },

    async confirmarStatus(usuario) {

        if (usuario.id === window.Auth?.usuario?.id) return;

        const acao = usuario.ativo ? "desativar" : "ativar";
        const confirmado = window.confirm(`Deseja ${acao} o acesso de ${usuario.nome || usuario.matricula}?`);
        if (!confirmado) return;

        try {
            await this.chamarApi("toggle-active", { id: usuario.id, ativo: !usuario.ativo });
            this.mostrarFeedback(`Usuário ${usuario.ativo ? "desativado" : "ativado"} com sucesso.`, "sucesso");
            await this.carregarUsuarios();
        } catch (erro) {
            this.mostrarFeedback(this.mensagemErro(erro), "erro");
        }

    },

    matriculaValida(matricula) {
        return /^[a-zA-Z0-9._-]{1,80}$/.test(String(matricula || "").trim());
    },

    exibirErroFormulario(elemento, mensagem) {
        if (!elemento) return;
        elemento.textContent = mensagem;
        elemento.hidden = false;
    },

    mostrarFeedback(mensagem, tipo) {
        const feedback = document.getElementById("usuarios-feedback");
        if (!feedback) return;
        feedback.textContent = mensagem;
        feedback.className = `usuarios-feedback ${tipo || ""}`;
        feedback.hidden = false;
    },

    esconderFeedback() {
        const feedback = document.getElementById("usuarios-feedback");
        if (feedback) {
            feedback.hidden = true;
            feedback.textContent = "";
            feedback.className = "usuarios-feedback";
        }
    },

    mensagemErro(erro) {
        const mensagens = {
            sem_permissao: "Sua conta não tem permissão para esta ação.",
            sessao_expirada: "Sua sessão expirou. Entre novamente para continuar.",
            duplicado: "Já existe um usuário com esta matrícula.",
            matricula_invalida: "A matrícula informada não é válida.",
            senha_invalida: "A senha deve ter pelo menos 8 caracteres.",
            auto_alteracao_bloqueada: "Você não pode alterar o acesso da própria conta.",
            usuario_nao_encontrado: "O usuário não foi encontrado ou não está mais disponível."
        };

        return mensagens[erro?.code] || erro?.message || "Não foi possível concluir esta ação.";
    },

    iniciais(valor) {
        return String(valor || "U").trim().split(/\s+/).slice(0, 2).map(parte => parte.charAt(0)).join("").toUpperCase() || "U";
    },

    escapar(valor) {
        return String(valor ?? "").replace(/[&<>'"]/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[caractere]);
    },

    escaparAtributo(valor) {
        return this.escapar(valor).replace(/`/g, "&#96;");
    },

    esqueletoLista() {
        return '<div class="usuarios-carregando"><span></span><span></span><span></span></div>';
    }

};

window.Usuarios = Usuarios;
Usuarios.iniciar();
