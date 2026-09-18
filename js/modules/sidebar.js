const Sidebar = {

    menu: null,
    sidebar: null,
    toggle: null,
    overlay: null,

    // ==========================
    // Estado da Sidebar
    // ==========================

    mobile: false,
    aberta: false,
    escutandoAuth: false,

    // ==========================
    // Inicialização
    // ==========================

    init() {

        this.menu = document.getElementById("sidebar-menu");
        this.sidebar = document.getElementById("sidebar");
        this.desktopToggle = document.getElementById("sidebar-toggle");
        this.mobileToggle = document.getElementById("mobile-menu-btn");
        this.overlay = document.getElementById("sidebar-overlay");

      if (
    !this.menu ||
    !this.sidebar ||
    !this.overlay
) {

    console.error("Sidebar ou Overlay não encontrados.");

    return;

}

        // Detecta Desktop/Mobile
        this.atualizarEstado();

        let ultimaLargura = window.innerWidth;

window.addEventListener("resize", () => {

    if (window.innerWidth === ultimaLargura) {
        return;
    }

    ultimaLargura = window.innerWidth;

    this.atualizarEstado();

});


// ==========================
// Botão Desktop
// ==========================

if (this.desktopToggle) {

    this.desktopToggle.addEventListener("click", (e) => {

        e.stopPropagation();

        this.alternar();

    });

}

// ==========================
// Botão Mobile
// ==========================

if (this.mobileToggle) {

    this.mobileToggle.addEventListener("click", (e) => {

        e.stopPropagation();

        this.alternar();

    });

}

        // Overlay
        this.overlay.addEventListener("click", () => {

            this.fecharSidebar();

        });

        // Inicia recolhida
        if (!this.mobile) {

            this.sidebar.classList.add("recolhida");

            document.body.classList.add("sidebar-recolhida");

        }

        if (!this.escutandoAuth) {

            document.addEventListener("plamont:auth-alterado", () => {
                this.render();
            });

            this.escutandoAuth = true;

        }

        // A primeira montagem pode ocorrer enquanto o Supabase ainda está
        // restaurando a sessão. O evento acima cobre login/logout; esta
        // reconciliação cobre especificamente a sessão persistida no F5.
        const autenticacaoPronta = window.Auth?.pronto;

        if (autenticacaoPronta && typeof autenticacaoPronta.then === "function") {
            Promise.resolve(autenticacaoPronta).then(
                () => this.render(),
                () => this.render()
            );
        }

        this.render();

    },

    // ==========================
    // Renderização
    // ==========================

    render() {

        if (!this.menu) return;

        this.menu.innerHTML = "";

        this.renderDashboard();

        this.renderMapa();

        this.renderCurvaS();

        this.renderUsuarios();

        this.renderContratos();

        const paginaAtiva = document.querySelector(".pagina.ativa")?.id;

        this.menu.querySelectorAll(".menu-btn[data-pagina]").forEach(item => {
            item.classList.toggle("ativo", item.dataset.pagina === paginaAtiva);
        });

    },

    // ==========================
    // Dashboard
    // ==========================

    renderDashboard() {

        const item = document.createElement("button");

        item.className = "menu-btn ativo";
        item.dataset.pagina = "dashboard";

        item.innerHTML = `
            <span class="icone">
                <img src="assets/icons/home.svg" alt="Dashboard">
            </span>

            <span class="menu-texto">
                <strong>Dashboard</strong>
                <small>Página Inicial</small>
            </span>
        `;

        item.addEventListener("click", () => {

            abrirPagina("dashboard", item);

            this.fecharSidebar();

        });

        this.menu.appendChild(item);

    },

    // ==========================
    // Mapa de Atividades
    // ==========================

    renderMapa() {

        const item = document.createElement("button");

        item.className = "menu-btn";
        item.dataset.pagina = "mapa";

        item.innerHTML = `
            <span class="icone">
                <img src="assets/icons/mapa.svg" alt="Mapa">
            </span>

            <span class="menu-texto">
                <strong>Mapa</strong>
                <small>Atividades do Dia</small>
            </span>
        `;

        item.addEventListener("click", () => {

            abrirPagina("mapa", item);

            if (typeof Mapa !== "undefined") {
                Mapa.render();
            }

            this.fecharSidebar();

        });

        this.menu.appendChild(item);

    },

    // ==========================
    // Grandes Paradas — Curva S
    // ==========================

    renderCurvaS() {

        const item = document.createElement("button");

        item.className = "menu-btn";
        item.dataset.pagina = "curvaS";

        item.innerHTML = `
            <span class="icone">
                <img src="assets/icons/curvas.svg" alt="Grandes Paradas — Curva S">
            </span>

            <span class="menu-texto">
                <strong>Grandes Paradas</strong>
                <small>Curva S</small>
            </span>
        `;

        item.addEventListener("click", () => {

            abrirPagina("curvaS", item);

            if (typeof CurvaS !== "undefined") {
                CurvaS.render();
            }

            this.fecharSidebar();

        });

        this.menu.appendChild(item);

    },

    // ==========================
    // Gestão de Usuários (admin)
    // ==========================

    renderUsuarios() {

        if (!window.Auth?.pode?.("administrarUsuarios")) return;

        const item = document.createElement("button");

        item.className = "menu-btn";
        item.dataset.pagina = "usuarios";

        item.innerHTML = `
            <span class="icone" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M19 8v6M22 11h-6"></path>
                </svg>
            </span>

            <span class="menu-texto">
                <strong>Gestão de Usuários</strong>
                <small>Administração</small>
            </span>
        `;

        item.addEventListener("click", () => {

            abrirPagina("usuarios", item);

            if (typeof Usuarios !== "undefined") {
                Usuarios.render();
            }

            this.fecharSidebar();

        });

        this.menu.appendChild(item);

    },

    // ==========================
    // Contratos
    // ==========================

    renderContratos() {

    const grupo = document.createElement("div");

    grupo.className = "menu-item contratos-grupo";

    grupo.classList.add("grupo-contratos");

    // Botão principal
    const botao = document.createElement("button");

    botao.className = "menu-btn";

    botao.innerHTML = `
        <span class="menu-icon">
            <img src="assets/icons/clipboard.svg" alt="Contratos">
        </span>

        <span class="menu-title">
            Contratos
        </span>

        <span class="seta">▶</span>
    `;

    // Container dos contratos
    const lista = document.createElement("div");

    lista.className = "submenu contratos-lista";

    botao.addEventListener("click", () => {

        const aberto = lista.classList.contains("aberto");

        lista.classList.toggle("aberto", !aberto);

        botao
            .querySelector(".seta")
            .classList.toggle("aberta", !aberto);

    });

    grupo.appendChild(botao);

    grupo.appendChild(lista);

    Object.values(Dashboard.contratos).forEach(contrato => {

        lista.appendChild(
            this.criarContrato(contrato)
        );

    });

    this.menu.appendChild(grupo);

},
    // ==========================
// Alterna Sidebar
// ==========================

alternar() {

    if (this.aberta) {

        this.fecharSidebar();

    } else {

        this.abrirSidebar();

    }

},

// ==========================
// Desktop
// ==========================

alternarDesktop() {

    this.alternar();

},

// ==========================
// Abre Sidebar
// ==========================

abrirSidebar() {

    this.aberta = true;

    if (this.mobile) {

        this.sidebar.classList.add("aberta");

        this.overlay.classList.add("ativo");

        return;

    }

    this.sidebar.classList.remove("recolhida");

    document.body.classList.remove("sidebar-recolhida");

    this.overlay.classList.add("ativo");

},

// ==========================
// Fecha Sidebar
// ==========================

fecharSidebar() {

    this.aberta = false;

    // Mobile
    if (this.mobile) {

        this.sidebar.classList.remove("aberta");

        this.overlay.classList.remove("ativo");

        return;

    }

    // Desktop
    this.sidebar.classList.add("recolhida");

    document.body.classList.add("sidebar-recolhida");

    this.overlay.classList.remove("ativo");

},

// ==========================
// Mobile
// ==========================

alternarMobile() {

    this.alternar();

},

// ==========================
// Atualiza Estado
// ==========================

atualizarEstado() {

    const estadoAnterior = this.aberta;

    this.mobile = window.innerWidth <= 900;

    // ==========================
    // Mobile
    // ==========================

    if (this.mobile) {

        // Remove o estado visual de desktop
        this.sidebar.classList.remove("recolhida");
        document.body.classList.remove("sidebar-recolhida");

        // Mantém o estado anterior
        if (estadoAnterior) {

            this.sidebar.classList.add("aberta");

        } else {

            this.sidebar.classList.remove("aberta");
            this.overlay.classList.remove("ativo");

        }

        return;
    }

    // ==========================
    // Desktop
    // ==========================

    this.sidebar.classList.remove("aberta");

    if (estadoAnterior) {

        // Sidebar estava aberta → continua aberta
        this.sidebar.classList.remove("recolhida");
        document.body.classList.remove("sidebar-recolhida");
        this.overlay.classList.add("ativo");

    } else {

        // Sidebar estava fechada → continua fechada
        this.sidebar.classList.add("recolhida");
        document.body.classList.add("sidebar-recolhida");
        this.overlay.classList.remove("ativo");

    }

},
    // ==========================
    // Fecha todos os submenus
    // ==========================

    fecharContratos(containerAtual) {

    this.menu
        .querySelectorAll(".contratos-lista > .menu-item")
        .forEach(item => {

            if (item === containerAtual) return;

            const submenu = item.querySelector(":scope > .submenu");

            const seta = item.querySelector(":scope > .menu-btn .seta");

            submenu?.classList.remove("aberto");
            seta?.classList.remove("aberta");

        });

},

    // ==========================
    // Cria um contrato
    // ==========================

    criarContrato(contrato) {

        const container = document.createElement("div");

        container.className = "menu-item";

        const botao = document.createElement("button");

        botao.className = "menu-btn";
        botao.dataset.contrato = contrato.id;

        botao.innerHTML = `
            <span class="menu-icon">
                <img src="assets/icons/clipboard.svg" alt="${contrato.nome}">
            </span>

            <span class="menu-title">
                ${contrato.nome.replace("Contrato ", "")}
            </span>

            <span class="seta">▶</span>
        `;

        const submenu = this.criarSubmenu(contrato);

    botao.addEventListener("click", (e) => {

    e.stopPropagation();

    const aberto = submenu.classList.contains("aberto");

    if (aberto) {

        submenu.classList.remove("aberto");

        botao.querySelector(".seta").classList.remove("aberta");

        return;

    }

    this.fecharContratos(container);

    submenu.classList.add("aberto");

    botao.querySelector(".seta").classList.add("aberta");

});

        container.appendChild(botao);

        container.appendChild(submenu);

        return container;

    },

    // ==========================
    // Cria o submenu
    // ==========================

    criarSubmenu(contrato) {

        const submenu = document.createElement("div");

        submenu.className = "submenu";

        contrato.abas.forEach(aba => {

            const item = document.createElement("button");

            item.className = "submenu-btn";
            item.dataset.contrato = contrato.id;
            item.dataset.aba = aba.id;

            item.innerHTML = `
                <span class="submenu-texto">
                    ${aba.nome}
                </span>
            `;

            item.addEventListener("click", () => {

                abrirPagina(
                    contrato.id,
                    item,
                    aba.id
                );


                    this.fecharSidebar();

                

            });

            submenu.appendChild(item);

        });

        return submenu;

    }

};

// ==========================
// Inicialização
// ==========================

// A inicialização é realizada pelo script.js
