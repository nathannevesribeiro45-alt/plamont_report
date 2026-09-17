/* ==========================================================
   PLAMONT AUTH — Sessão, perfil corporativo e permissões
   Senhas e tokens são administrados exclusivamente pelo
   Supabase Auth. O perfil público não armazena credenciais.
   ========================================================== */

window.PlamontAuth = {

    supabase: null,
    sessao: null,
    usuario: null,
    inicializado: false,
    pronto: null,
    carregandoPerfil: null,
    carregandoPerfilPara: null,

    iniciar() {
        return this.inicializar();
    },

    inicializar() {

        if (this.pronto) return this.pronto;

        this.pronto = (async () => {

            try {

                const config = window.PlamontSupabaseConfig;

                if (!config?.url || !config?.anonKey) {
                    throw new Error("Configuração do Supabase não encontrada.");
                }

                if (!window.supabase?.createClient) {
                    throw new Error("Biblioteca do Supabase não carregada.");
                }

                this.supabase = window.supabase.createClient(
                    config.url,
                    config.anonKey,
                    {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    }
                );

                const { data, error } = await this.supabase.auth.getSession();

                if (error) throw error;

                this.sessao = data?.session || null;

                if (this.sessao?.user) {
                    try {
                        await this.carregarPerfil(this.sessao.user);
                    } catch (erroPerfil) {
                        console.warn("Sessão corporativa não disponível:", erroPerfil);
                    }
                }

                this.supabase.auth.onAuthStateChange((evento, sessao) => {
                    this.sessao = sessao || null;

                    if (!sessao?.user) {
                        this.limparUsuario();
                        return;
                    }

                    if (this.usuario?.id === sessao.user.id && this.usuario.ativo) {
                        this.atualizarInterface();
                        return;
                    }

                    window.setTimeout(() => {
                        this.carregarPerfil(sessao.user).catch(erroPerfil => {
                            console.warn("Perfil corporativo não carregado:", erroPerfil);
                        });
                    }, 0);
                });

                this.inicializado = true;
                this.configurarInterface();
                this.atualizarInterface();

                return true;

            } catch (erro) {

                console.error("Erro ao inicializar autenticação:", erro);
                this.inicializado = false;
                this.mostrarErroInicializacao(erro);
                return false;

            }

        })();

        return this.pronto;

    },

    estaLogado() {
        return Boolean(this.sessao?.user && this.usuario?.ativo);
    },

    estaAutenticado() {
        return this.estaLogado();
    },

    pode(permissao) {
        if (!this.estaLogado()) return false;

        const permissoes = window.PlamontPermissoes || {};
        return permissoes[this.usuario.perfil]?.[permissao] === true;
    },

    normalizarMatricula(matricula) {
        return String(matricula || "").trim();
    },

    emailParaMatricula(matricula) {

        const matriculaNormalizada = this.normalizarMatricula(matricula).toLowerCase();
        const dominio = String(window.PlamontSupabaseConfig?.authEmailDomain || "").trim().toLowerCase();

        if (!matriculaNormalizada || !/^[a-z0-9._-]+$/.test(matriculaNormalizada)) {
            const erro = new Error("Matrícula inválida.");
            erro.code = "matricula_invalida";
            throw erro;
        }

        if (!dominio) {
            const erro = new Error("Domínio interno de autenticação não configurado.");
            erro.code = "configuracao_invalida";
            throw erro;
        }

        return `${matriculaNormalizada}@${dominio}`;

    },

    async entrar(matricula, senha) {

        await this.pronto;

        if (!this.supabase) {
            throw new Error("Autenticação indisponível.");
        }

        const matriculaNormalizada = this.normalizarMatricula(matricula);

        if (!matriculaNormalizada || !senha) {
            const erro = new Error("Informe sua matrícula e sua senha.");
            erro.code = "credenciais_incompletas";
            throw erro;
        }

        const emailInterno = this.emailParaMatricula(matriculaNormalizada);

        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: emailInterno,
            password: senha
        });

        if (error) throw error;

        this.sessao = data?.session || null;
        await this.carregarPerfil(this.sessao?.user || data?.user);

        return data;

    },

    async carregarPerfil(usuarioAuth) {

        const id = usuarioAuth?.id;

        if (!id || !this.supabase) {
            const erro = new Error("Sessão inválida.");
            erro.code = "sessao_expirada";
            throw erro;
        }

        if (this.usuario?.id === id && this.usuario.ativo) {
            return this.usuario;
        }

        if (this.carregandoPerfil && this.carregandoPerfilPara === id) {
            return this.carregandoPerfil;
        }

        this.carregandoPerfilPara = id;
        this.carregandoPerfil = (async () => {

            const { data, error } = await this.supabase
                .from("usuarios")
                .select("id, matricula, nome, perfil, ativo")
                .eq("id", id)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                await this.encerrarSessaoInvalida("perfil_nao_encontrado");
            }

            if (!data.ativo) {
                await this.encerrarSessaoInvalida("usuario_inativo");
            }

            if (!window.PlamontPermissoes?.[data.perfil]) {
                await this.encerrarSessaoInvalida("perfil_invalido");
            }

            this.usuario = {
                id: data.id,
                matricula: data.matricula,
                nome: data.nome,
                perfil: data.perfil,
                ativo: data.ativo
            };

            this.atualizarInterface();

            return this.usuario;

        })();

        try {
            return await this.carregandoPerfil;
        } finally {
            this.carregandoPerfil = null;
            this.carregandoPerfilPara = null;
        }

    },

    async encerrarSessaoInvalida(codigo) {

        this.limparUsuario();

        try {
            await this.supabase?.auth.signOut();
        } catch (erroLogout) {
            console.warn("Não foi possível encerrar a sessão inválida:", erroLogout);
        }

        const erro = new Error(codigo);
        erro.code = codigo;
        throw erro;

    },

    async sair() {

        if (!this.supabase) return;

        const { error } = await this.supabase.auth.signOut();

        if (error) {
            console.error("Erro ao sair:", error);
            throw error;
        }

        this.limparUsuario();
        this.abrirLogin();

    },

    limparUsuario() {
        this.sessao = null;
        this.usuario = null;
        this.atualizarInterface();
    },

    abrirLogin() {

        const modal = document.getElementById("plamont-login-modal");
        if (!modal) return;

        modal.hidden = false;

        const erro = document.getElementById("plamont-login-error");
        if (erro) {
            erro.hidden = true;
            erro.textContent = "";
        }

        requestAnimationFrame(() => {
            document.getElementById("plamont-login-matricula")?.focus();
        });

    },

    fecharLogin() {
        const modal = document.getElementById("plamont-login-modal");
        if (modal) modal.hidden = true;
    },

    configurarInterface() {

        const abrir = document.getElementById("plamont-auth-open");
        const fechar = document.getElementById("plamont-login-close");
        const modal = document.getElementById("plamont-login-modal");
        const form = document.getElementById("plamont-login-form");
        const sair = document.getElementById("plamont-auth-logout");

        abrir?.addEventListener("click", () => {

            if (this.estaLogado()) {
                const menu = document.getElementById("plamont-user-menu");
                if (menu) menu.hidden = !menu.hidden;
                return;
            }

            this.abrirLogin();

        });

        fechar?.addEventListener("click", () => this.fecharLogin());

        modal?.addEventListener("click", evento => {
            if (evento.target === modal) this.fecharLogin();
        });

        document.addEventListener("keydown", evento => {
            if (evento.key === "Escape" && modal && !modal.hidden) {
                this.fecharLogin();
            }
        });

        form?.addEventListener("submit", async evento => {

            evento.preventDefault();

            const matricula = document.getElementById("plamont-login-matricula")?.value;
            const senha = document.getElementById("plamont-login-password")?.value;
            const botao = document.getElementById("plamont-login-submit");
            const erro = document.getElementById("plamont-login-error");

            if (erro) {
                erro.hidden = true;
                erro.textContent = "";
            }

            if (botao) {
                botao.disabled = true;
                botao.dataset.textoOriginal = botao.textContent;
                botao.textContent = "Entrando...";
            }

            try {

                await this.entrar(matricula, senha);
                this.fecharLogin();

                const senhaInput = document.getElementById("plamont-login-password");
                if (senhaInput) senhaInput.value = "";

            } catch (erroLogin) {

                console.error("Falha no login:", erroLogin);

                if (erro) {
                    erro.textContent = this.mensagemErro(erroLogin);
                    erro.hidden = false;
                }

            } finally {

                if (botao) {
                    botao.disabled = false;
                    botao.textContent = botao.dataset.textoOriginal || "Entrar";
                }

            }

        });

        sair?.addEventListener("click", async () => {

            sair.disabled = true;
            sair.textContent = "Saindo...";

            try {
                await this.sair();
            } catch (erro) {
                console.error(erro);
                alert("Não foi possível encerrar a sessão. Tente novamente.");
            } finally {
                sair.disabled = false;
                sair.textContent = "Sair";
                const menu = document.getElementById("plamont-user-menu");
                if (menu) menu.hidden = true;
            }

        });

    },

    atualizarInterface() {

        const entrar = document.getElementById("plamont-auth-open");
        const menu = document.getElementById("plamont-user-menu");
        const nome = document.getElementById("plamont-user-name");
        const perfil = document.getElementById("plamont-user-profile");
        const logado = this.estaLogado();

        document.documentElement.dataset.plamontPerfil = logado ? this.usuario.perfil : "";
        document.documentElement.dataset.plamontAutenticado = String(logado);

        if (logado) {

            if (entrar) {
                entrar.classList.add("autenticado");
                entrar.querySelector("span:last-child")?.replaceChildren(
                    document.createTextNode("Minha conta")
                );
            }

            if (nome) nome.textContent = this.usuario.nome;
            if (perfil) perfil.textContent = `${this.usuario.matricula} · ${this.usuario.perfil}`;

            this.atualizarAcessoCamera(this.pode("visualizar"));

        } else {

            if (entrar) {
                entrar.classList.remove("autenticado");
                entrar.querySelector("span:last-child")?.replaceChildren(
                    document.createTextNode("Entrar")
                );
            }

            if (menu) menu.hidden = true;
            if (nome) nome.textContent = "";
            if (perfil) perfil.textContent = "";

            this.atualizarAcessoCamera(false);

        }

        document.dispatchEvent(new CustomEvent("plamont:auth-alterado", {
            detail: {
                logado,
                usuario: this.usuario,
                permissoes: logado ? window.PlamontPermissoes[this.usuario.perfil] : null
            }
        }));

    },

    atualizarAcessoCamera(autenticado) {

        document.querySelectorAll(".mapa-painel-btn-foto").forEach(botao => {

            const atividade = botao.closest(".mapa-painel-atividade");
            const input = atividade?.querySelector(".mapa-painel-input-foto");
            const chave = input?.dataset?.chaveFoto;

            if (window.MapaPainel?.atualizarBotaoFoto && chave) {
                window.MapaPainel.atualizarBotaoFoto(botao, chave);
                return;
            }

            botao.classList.toggle("camera-bloqueada", !autenticado);
            botao.title = autenticado
                ? "Tirar foto desta atividade"
                : "Entre para utilizar a câmera";

        });

    },

    mensagemErro(erro) {

        const codigo = String(erro?.code || "").toLowerCase();
        const mensagem = String(erro?.message || "").toLowerCase();

        if (codigo === "matricula_invalida") {
            return "Informe uma matrícula válida.";
        }

        if (codigo === "credenciais_incompletas") {
            return "Informe sua matrícula e sua senha.";
        }

        if (codigo === "usuario_inativo") {
            return "Este usuário está inativo. Procure a administração.";
        }

        if (codigo === "perfil_nao_encontrado") {
            return "Seu perfil corporativo não foi encontrado. Procure a administração.";
        }

        if (codigo === "perfil_invalido") {
            return "Seu perfil corporativo é inválido. Procure a administração.";
        }

        if (codigo === "sessao_expirada") {
            return "Sua sessão expirou. Entre novamente.";
        }

        if (mensagem.includes("invalid login credentials")) {
            return "Matrícula ou senha incorreta.";
        }

        if (mensagem.includes("too many requests")) {
            return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
        }

        if (mensagem.includes("network") || mensagem.includes("fetch")) {
            return "Não foi possível conectar ao serviço de autenticação.";
        }

        return "Não foi possível realizar o login. Tente novamente.";

    },

    mostrarErroInicializacao(erro) {
        console.error("Autenticação indisponível:", erro);
    }

};

// Alias curto para os módulos futuros consultarem Auth.pode("editar").
window.Auth = window.PlamontAuth;

document.addEventListener("DOMContentLoaded", () => {
    window.PlamontAuth.iniciar();
});
