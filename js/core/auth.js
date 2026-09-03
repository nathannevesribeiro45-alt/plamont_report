/* ==========================================================
   PLAMONT AUTH — Autenticação básica via Supabase Auth
   Fase 1: login/logout/sessão. Perfis e permissões entram depois.
   ========================================================== */

window.PlamontAuth = {

    supabase: null,
    sessao: null,
    inicializado: false,
    pronto: null,

    inicializar() {

        if (this.pronto) return this.pronto;

        this.pronto = new Promise(async (resolve) => {

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
                this.inicializado = true;

                this.atualizarInterface();

                this.supabase.auth.onAuthStateChange((evento, sessao) => {
                    this.sessao = sessao || null;
                    this.atualizarInterface();
                });

                this.configurarInterface();

                resolve(true);

            } catch (erro) {

                console.error("Erro ao inicializar autenticação:", erro);
                this.inicializado = false;
                this.mostrarErroInicializacao(erro);
                resolve(false);

            }

        });

        return this.pronto;

    },

    estaAutenticado() {
        return Boolean(this.sessao?.user);
    },

    async entrar(email, senha) {

        await this.pronto;

        if (!this.supabase) {
            throw new Error("Autenticação indisponível.");
        }

        const emailNormalizado = String(email || "").trim();

        if (!emailNormalizado || !senha) {
            throw new Error("Informe seu e-mail e sua senha.");
        }

        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: emailNormalizado,
            password: senha
        });

        if (error) throw error;

        this.sessao = data?.session || null;
        this.atualizarInterface();

        return data;

    },

    async sair() {

        if (!this.supabase) return;

        const { error } = await this.supabase.auth.signOut();

        if (error) {
            console.error("Erro ao sair:", error);
            throw error;
        }

        this.sessao = null;
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
            document.getElementById("plamont-login-email")?.focus();
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

            if (this.estaAutenticado()) {
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

            const email = document.getElementById("plamont-login-email")?.value;
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

                await this.entrar(email, senha);
                this.fecharLogin();

                const senhaInput = document.getElementById("plamont-login-password");
                if (senhaInput) senhaInput.value = "";

            } catch (erroLogin) {

                console.error("Falha no login:", erroLogin);

                const mensagem = this.mensagemErro(erroLogin);

                if (erro) {
                    erro.textContent = mensagem;
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
        const email = document.getElementById("plamont-user-email");

        if (this.estaAutenticado()) {

            if (entrar) {
                entrar.classList.add("autenticado");
                entrar.querySelector("span:last-child")?.replaceChildren(
                    document.createTextNode("Minha conta")
                );
            }

            if (email) {
                email.textContent = this.sessao.user.email || "Usuário autenticado";
            }

            this.atualizarAcessoCamera(true);

        } else {

            if (entrar) {
                entrar.classList.remove("autenticado");
                entrar.querySelector("span:last-child")?.replaceChildren(
                    document.createTextNode("Entrar")
                );
            }

            if (menu) menu.hidden = true;

            this.atualizarAcessoCamera(false);

        }

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

        const mensagem = String(erro?.message || "").toLowerCase();

        if (mensagem.includes("invalid login credentials")) {
            return "E-mail ou senha incorretos.";
        }

        if (mensagem.includes("email not confirmed")) {
            return "Este e-mail ainda não foi confirmado.";
        }

        if (mensagem.includes("too many requests")) {
            return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
        }

        if (mensagem.includes("network") || mensagem.includes("fetch")) {
            return "Não foi possível conectar ao serviço de autenticação.";
        }

        return erro?.message || "Não foi possível realizar o login.";

    },

    mostrarErroInicializacao(erro) {
        console.error("Autenticação indisponível:", erro);
    }

};

document.addEventListener("DOMContentLoaded", () => {
    window.PlamontAuth.inicializar();
});
