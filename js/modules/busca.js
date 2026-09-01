// ==========================================
// BUSCA.JS
// Busca inteligente da sidebar (estilo YouTube):
// resultado aparece conforme o usuário digita,
// sem precisar escrever o termo completo.
//
// Indexa: Dashboard, Contratos, Abas, Líderes de
// equipe, OM's e Recursos — a partir dos dados já
// carregados em Dashboard.contratos.
// ==========================================

const Busca = {

    input: null,
    dropdown: null,
    iconBtn: null,

    indice: [],
    resultadosAtuais: [],
    indiceSelecionado: -1,

    // ==========================================
    // Inicialização
    // ==========================================
    init() {

        this.input = document.getElementById("sidebar-search-input");
        this.dropdown = document.getElementById("sidebar-search-resultados");
        this.iconBtn = document.getElementById("sidebar-search-icon");

        if (!this.input || !this.dropdown) {
            console.error("Busca: elementos da sidebar não encontrados.");
            return;
        }

        this.construirIndice();

        let temporizador = null;

        this.input.addEventListener("input", () => {

            clearTimeout(temporizador);

            temporizador = setTimeout(() => {
                this.pesquisar(this.input.value);
            }, 120);

        });

        this.input.addEventListener("keydown", (e) => this.navegarTeclado(e));

        this.input.addEventListener("focus", () => {
            if (this.input.value.trim()) this.abrirDropdown();
        });

        // Fecha o dropdown ao clicar fora
        document.addEventListener("click", (e) => {
            if (!e.target.closest("#sidebar-search")) {
                this.fecharDropdown();
            }
        });

        // No modo recolhido (desktop), o clique no ícone
        // expande a sidebar e foca o campo
        if (this.iconBtn) {

            this.iconBtn.addEventListener("click", (e) => {

                e.stopPropagation();

                if (typeof Sidebar !== "undefined") {
                    Sidebar.abrirSidebar();
                }

                setTimeout(() => this.input.focus(), 300);

            });

        }

    },

    // ==========================================
    // Reconstrói o índice de busca.
    // Chamar de novo se os dados dos contratos
    // mudarem (novo JSON carregado, edição, etc.)
    // ==========================================
    construirIndice() {

        this.indice = [];

        if (typeof Dashboard === "undefined" || !Dashboard.contratos) return;

        this.indice.push({
            tipo: "Página",
            icone: "🏠",
            titulo: "Dashboard",
            subtitulo: "Painel geral · Página inicial",
            contratoId: "dashboard",
            abaId: null
        });

        Object.values(Dashboard.contratos).forEach(contrato => {

            const abas = contrato.abas || [];
            const primeiraAba = abas[0] ? abas[0].id : null;

            this.indice.push({
                tipo: "Contrato",
                icone: "🏗️",
                titulo: contrato.nome,
                subtitulo: "Ir para o contrato",
                contratoId: contrato.id,
                abaId: primeiraAba
            });

            abas.forEach(aba => {

                this.indice.push({
                    tipo: "Aba",
                    icone: "📁",
                    titulo: aba.nome,
                    subtitulo: contrato.nome,
                    contratoId: contrato.id,
                    abaId: aba.id
                });

                (aba.atividades || []).forEach(lider => {

                    if (lider.lider) {

                        this.indice.push({
                            tipo: "Líder de equipe",
                            icone: "👷",
                            titulo: lider.lider,
                            subtitulo: `${aba.nome} · ${contrato.nome}`,
                            contratoId: contrato.id,
                            abaId: aba.id,
                            termoAlvo: lider.lider
                        });

                    }

                    (lider.oms || []).forEach(om => {

                        this.indice.push({
                            tipo: "OM",
                            icone: "📋",
                            titulo: `OM ${om.numero}`,
                            subtitulo: om.descricao || `${aba.nome} · ${contrato.nome}`,
                            contratoId: contrato.id,
                            abaId: aba.id,
                            termoAlvo: om.numero
                        });

                    });

                });

                (aba.recursos || []).forEach(recurso => {

                    const titulo = [recurso.tipo, recurso.placa]
                        .filter(Boolean)
                        .join(" · ");

                    this.indice.push({
                        tipo: "Recurso",
                        icone: "🚚",
                        titulo: titulo || "Recurso",
                        subtitulo: `${aba.nome} · ${contrato.nome}`,
                        contratoId: contrato.id,
                        abaId: aba.id,
                        termoAlvo: recurso.placa || recurso.tipo
                    });

                });

            });

        });

    },

    // ==========================================
    // Normaliza texto: minúsculo e sem acento,
    // pra busca não ser sensível a maiúscula/acento
    // ==========================================
    normalizar(texto) {

        return (texto || "")
            .toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

    },

    // ==========================================
    // Busca incremental (tipo YouTube):
    // não precisa digitar a palavra inteira
    // ==========================================
    pesquisar(termoOriginal) {

        const termo = this.normalizar(termoOriginal);

        if (!termo) {
            this.fecharDropdown();
            return;
        }

        const resultados = this.indice
            .map(item => {

                const alvo = this.normalizar(`${item.titulo} ${item.subtitulo}`);
                const posicao = alvo.indexOf(termo);

                return { item, posicao };

            })
            .filter(r => r.posicao !== -1)
            .sort((a, b) => a.posicao - b.posicao)
            .slice(0, 8)
            .map(r => r.item);

        this.resultadosAtuais = resultados;
        this.indiceSelecionado = -1;

        this.renderResultados(resultados, termoOriginal.trim());

    },

    // ==========================================
    // Desenha a lista de resultados
    // ==========================================
    renderResultados(resultados, termo) {

        this.dropdown.innerHTML = "";

        if (resultados.length === 0) {

            this.dropdown.innerHTML = `
                <div class="search-vazio">
                    Nenhum resultado para "${this.escapeHtml(termo)}"
                </div>
            `;

            this.abrirDropdown();
            return;

        }

        resultados.forEach(item => {

            const el = document.createElement("button");
            el.type = "button";
            el.className = "search-resultado-item";

            el.innerHTML = `
                <span class="search-resultado-icone">${item.icone}</span>
                <span class="search-resultado-texto">
                    <strong>${this.destacar(item.titulo, termo)}</strong>
                    <small>${this.escapeHtml(item.tipo)} · ${this.escapeHtml(item.subtitulo)}</small>
                </span>
            `;

            el.addEventListener("click", () => this.selecionar(item));

            this.dropdown.appendChild(el);

        });

        this.abrirDropdown();

    },

    // ==========================================
    // Realça o trecho que bateu com a busca
    // ==========================================
    destacar(texto, termo) {

        const seguro = this.escapeHtml(texto);
        if (!termo) return seguro;

        const idx = this.normalizar(texto).indexOf(this.normalizar(termo));
        if (idx === -1) return seguro;

        const antes = seguro.slice(0, idx);
        const meio = seguro.slice(idx, idx + termo.length);
        const depois = seguro.slice(idx + termo.length);

        return `${antes}<mark>${meio}</mark>${depois}`;

    },

    escapeHtml(texto) {

        const div = document.createElement("div");
        div.textContent = texto || "";
        return div.innerHTML;

    },

    // ==========================================
    // Navegação por teclado (setas + enter + esc)
    // ==========================================
    navegarTeclado(e) {

        const itens = this.dropdown.querySelectorAll(".search-resultado-item");
        if (itens.length === 0) return;

        if (e.key === "ArrowDown") {

            e.preventDefault();
            this.indiceSelecionado = Math.min(this.indiceSelecionado + 1, itens.length - 1);
            this.atualizarSelecaoVisual(itens);

        } else if (e.key === "ArrowUp") {

            e.preventDefault();
            this.indiceSelecionado = Math.max(this.indiceSelecionado - 1, 0);
            this.atualizarSelecaoVisual(itens);

        } else if (e.key === "Enter") {

            e.preventDefault();

            const alvo = this.resultadosAtuais[this.indiceSelecionado] || this.resultadosAtuais[0];
            if (alvo) this.selecionar(alvo);

        } else if (e.key === "Escape") {

            this.fecharDropdown();
            this.input.blur();

        }

    },

    atualizarSelecaoVisual(itens) {

        itens.forEach((el, i) => {
            el.classList.toggle("selecionado", i === this.indiceSelecionado);
        });

        const ativo = itens[this.indiceSelecionado];
        if (ativo) ativo.scrollIntoView({ block: "nearest" });

    },

    // ==========================================
    // Vai até o resultado escolhido
    // ==========================================
    selecionar(item) {

        let botaoAlvo = null;

        if (item.contratoId === "dashboard") {

            botaoAlvo = document.querySelector('.menu-btn[data-pagina="dashboard"]');

        } else if (item.abaId) {

            // Expande o submenu certo, como se o usuário
            // tivesse clicado no contrato manualmente
            const botaoContrato = document.querySelector(
                `.menu-btn[data-contrato="${item.contratoId}"]`
            );

            const submenu = botaoContrato
                ? botaoContrato.closest(".menu-item").querySelector(".submenu")
                : null;

           if (botaoContrato) {

           if (!submenu.classList.contains("aberto")) {

           botaoContrato.click();

         }

    }

            botaoAlvo = submenu
                ? submenu.querySelector(`.submenu-btn[data-aba="${item.abaId}"]`)
                : null;

        }

        abrirPagina(item.contratoId, botaoAlvo, item.abaId);

        this.input.value = "";
        this.fecharDropdown();

        if (typeof Sidebar !== "undefined") {
            Sidebar.fecharSidebar();
        }

        if (item.termoAlvo) {
            setTimeout(() => this.destacarNoConteudo(item.termoAlvo), 250);
        }

    },

// ==========================================
// Localiza e destaca um item na página
// ==========================================
destacarNoConteudo(termo) {

    const termoNormalizado = this.normalizar(termo);

    let tentativas = 0;
    const maxTentativas = 20;

    const intervalo = setInterval(() => {

        tentativas++;

        const pagina = document.querySelector(".pagina.ativa");

        if (!pagina) {

            if (tentativas >= maxTentativas) {
                clearInterval(intervalo);
            }

            return;

        }

        // Procura primeiro pelos elementos marcados
        const alvo = [...pagina.querySelectorAll("[data-busca]")].find(el => {

            return this.normalizar(el.dataset.busca) === termoNormalizado;

        });

        if (alvo) {

            clearInterval(intervalo);

            alvo.scrollIntoView({

                behavior: "smooth",
                block: "center"

            });

            alvo.classList.remove("busca-destaque");

            // Reinicia a animação
            void alvo.offsetWidth;

            alvo.classList.add("busca-destaque");

            setTimeout(() => {

                alvo.classList.remove("busca-destaque");

            }, 2400);

            return;

        }

        // Fallback para busca textual
        const candidatos = pagina.querySelectorAll(
            "td, li, .item, .painel-item, .recurso-item, .om-item, p, span, strong"
        );

        for (const el of candidatos) {

            if (el.children.length > 1) continue;

            if (!this.normalizar(el.textContent).includes(termoNormalizado))
                continue;

            clearInterval(intervalo);

            el.scrollIntoView({

                behavior: "smooth",
                block: "center"

            });

            el.classList.remove("busca-destaque");

            void el.offsetWidth;

            el.classList.add("busca-destaque");

            setTimeout(() => {

                el.classList.remove("busca-destaque");

            }, 2400);

            return;

        }

        if (tentativas >= maxTentativas) {

            clearInterval(intervalo);

        }

    }, 100);

},

abrirDropdown() {

    this.dropdown.classList.add("aberto");

},

fecharDropdown() {

    this.dropdown.classList.remove("aberto");

    this.indiceSelecionado = -1;

}

};