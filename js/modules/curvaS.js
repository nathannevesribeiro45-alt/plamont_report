// ======================================
// CURVA S.JS
// Página "Grandes Paradas — Curva S"
// Acompanhamento físico do progresso (Previsto x Realizado)
//
// Observações de arquitetura:
// - Módulo independente. NÃO reutiliza dados de QLP/Recursos/OMs.
// - Dados carregados de contratos/curvaS.json (estrutura local/JSON).
// - Preparado para, no futuro, trocar a fonte de dados por Supabase
//   sem precisar reconstruir o componente (ver CurvaS.carregarDados).
// - Preparado para futuras permissões "curva_s:view" / "curva_s:edit"
//   (ainda não implementadas — página é somente visualização).
// ======================================

const CurvaS = {

    dados: null,
    paradaAtual: null,
    carregando: null,
    modalAberto: null,
    aoTeclaEscModal: null,

    // ======================================
    // Carregamento dos dados
    // ======================================
    // Ponto único de acesso aos dados da Curva S. Futuramente, basta
    // trocar o corpo desta função por uma consulta ao Supabase mantendo
    // o mesmo formato de retorno.
    // ======================================
    async carregarDados() {

        if (this.dados) return this.dados;

        if (this.carregando) return this.carregando;

        this.carregando = (async () => {

            try {

                const resposta = await fetch("contratos/curvaS.json");

                if (!resposta.ok) {
                    throw new Error("Erro ao carregar curvaS.json");
                }

                this.dados = await resposta.json();

            } catch (erro) {

                console.error("CurvaS: falha ao carregar dados.", erro);

                this.dados = { dadosDeTeste: true, horasPorDiaUtil: 12, paradas: [] };

            }

            return this.dados;

        })();

        return this.carregando;

    },

    // ======================================
    // Renderização principal da página
    // ======================================
    async render() {

        const pagina = document.getElementById("curvaS");

        if (!pagina) return;

        const dados = await this.carregarDados();

        const paradas = dados.paradas || [];

        if (!this.paradaAtual && paradas.length) {
            this.paradaAtual = paradas[0];
        }

        this.renderSeletor(paradas);

        this.renderBadgeTeste(dados.dadosDeTeste);

        if (!this.paradaAtual) {
            this.renderVazio();
            return;
        }

        const parada = this.paradaAtual;

        const metrics = this.calcularMetricas(parada, dados.horasPorDiaUtil || 12);

        this.renderCabecalho(parada, metrics);

        this.renderKpis(parada, metrics);

        this.renderGrafico(parada, metrics);

        this.renderLegenda();

        this.renderInterpretacao(metrics);

        this.renderMarcos(parada, metrics);

        this.renderObservacoes(parada);

        this.renderResumoTurno(parada);

    },

    // ======================================
    // Estado vazio (sem grandes paradas cadastradas)
    // ======================================
    renderVazio() {

        const kpis = document.getElementById("curvaS-kpis");
        const layout = document.getElementById("curvaS-layout");

        if (kpis) kpis.innerHTML = "";

        if (layout) {
            layout.innerHTML = `
                <div class="curvaS-vazio">
                    <h3>Nenhuma grande parada cadastrada</h3>
                    <p>Assim que uma grande parada for cadastrada, o acompanhamento da Curva S aparecerá aqui.</p>
                </div>
            `;
        }

    },

    // ======================================
    // Seletor de grande parada (aparece somente
    // se houver mais de uma parada cadastrada)
    // ======================================
    renderSeletor(paradas) {

        const container = document.getElementById("curvaS-seletor");

        if (!container) return;

        if (!paradas || paradas.length <= 1) {
            container.innerHTML = "";
            container.style.display = "none";
            return;
        }

        container.style.display = "flex";

        container.innerHTML = `
            <label for="curvaS-select">Grande parada:</label>
            <select id="curvaS-select"></select>
        `;

        const select = container.querySelector("#curvaS-select");

        paradas.forEach(parada => {

            const opcao = document.createElement("option");

            opcao.value = parada.id;
            opcao.textContent = parada.nome;

            if (this.paradaAtual && this.paradaAtual.id === parada.id) {
                opcao.selected = true;
            }

            select.appendChild(opcao);

        });

        select.addEventListener("change", () => {

            this.paradaAtual = paradas.find(p => p.id === select.value) || paradas[0];

            this.render();

        });

    },

    renderBadgeTeste(dadosDeTeste) {

        const badge = document.getElementById("curvaS-badge-teste");

        if (!badge) return;

        badge.style.display = dadosDeTeste ? "flex" : "none";

    },

    // ======================================
    // Cabeçalho (nome da parada + data de status)
    // ======================================
    renderCabecalho(parada, metrics) {

        const nome = document.getElementById("curvaS-parada-nome");
        const data = document.getElementById("curvaS-parada-data");
        const periodo = document.getElementById("curvaS-parada-periodo");

        if (nome) nome.textContent = parada.nome || "—";

        if (data) {
            data.textContent = parada.status?.hora
                ? `${metrics.dataStatusFormatada} às ${parada.status.hora}h`
                : metrics.dataStatusFormatada;
        }

        if (periodo) {
            periodo.textContent =
                `${parada.periodo?.inicio || "—"} → ${parada.periodo?.fim || "—"}`;
        }

    },

    // ======================================
    // KPIs
    // ======================================
    renderKpis(parada, metrics) {

        const container = document.getElementById("curvaS-kpis");

        if (!container) return;

        container.innerHTML = "";

        const periodo = parada.periodo || {};

        // Desvio: exibido sempre como valor absoluto (nunca com sinal de
        // menos) — a cor do card e o texto de apoio já comunicam se o
        // realizado está acima ou abaixo do planejado. A lógica matemática
        // (metrics.desvio) permanece com sinal internamente.
        const desvioAbsoluto = metrics.desvio === null ? null : Math.abs(metrics.desvio);

        const kpis = [
            {
                titulo: "PREVISTO",
                icone: Icons.calendario,
                valor: this.formatarPercentual(metrics.previstoAtual),
                sub: `Início: ${periodo.inicio || "—"} ${periodo.inicioHora || ""}`.trim(),
                subExtra: `Térm.: ${periodo.previstoFim || "—"} ${periodo.previstoFimHora || ""}`.trim()
            },
            {
                titulo: "REALIZADO",
                icone: Icons.check,
                valor: this.formatarPercentual(metrics.realizadoAtual),
                sub: `Início: ${periodo.inicio || "—"} ${periodo.inicioHora || ""}`.trim(),
                subExtra: `Térm.: ${periodo.realizadoFim || "—"} ${periodo.realizadoFimHora || ""}`.trim(),
                clicavel: true
            },
            {
                titulo: "DESVIO",
                icone: Icons.alvo,
                valor: this.formatarPercentual(desvioAbsoluto, metrics.desvio > 0),
                sub: metrics.desvio >= 0 ? "Acima do planejado" : "Abaixo do planejado",
                classe: metrics.desvio >= 0 ? "curvaS-kpi-positivo" : "curvaS-kpi-negativo"
            },
            {
                titulo: metrics.atrasoHoras >= 0 ? "ATRASADO" : "AVANÇO",
                icone: Icons.relogio,
                valor: metrics.atrasoHoras === null
                    ? "—"
                    : `${Math.abs(Math.round(metrics.atrasoHoras))}h`,
                sub: "Atraso acumulado em relação ao planejado",
                classe: metrics.atrasoHoras > 0 ? "curvaS-kpi-negativo" : "curvaS-kpi-positivo"
            },
            {
                titulo: "TENDÊNCIA",
                icone: Icons.tendencia,
                valor: metrics.tendencia,
                sub: "Últimos apontamentos",
                especial: "tendencia",
                classe:
                    metrics.tendencia === "Avanço" ? "curvaS-kpi-positivo" :
                    metrics.tendencia === "Atrasado" ? "curvaS-kpi-negativo" : "curvaS-kpi-neutro"
            }
        ];

        kpis.forEach(kpi => {

            const card = document.createElement("article");

            card.className = `curvaS-kpi-card ${kpi.classe || ""} ${kpi.clicavel ? "curvaS-kpi-clicavel" : ""}`.trim();

            if (kpi.especial === "tendencia") {

                // Card Tendência: ícone circular com seta no lugar do
                // valor numérico — apenas apresentação, o valor calculado
                // (Estável/Adiantado/Atrasado) continua o mesmo.
                card.innerHTML = `
                    <div class="curvaS-kpi-topo">
                        <span class="curvaS-kpi-titulo">${kpi.titulo}</span>
                    </div>
                    <span class="curvaS-kpi-tendencia-icone" aria-hidden="true">${kpi.icone || ""}</span>
                    <div class="curvaS-kpi-rodape">
                        <span class="curvaS-kpi-tendencia-legenda">${kpi.valor}</span>
                        <span class="curvaS-kpi-sub">${kpi.sub}</span>
                    </div>
                `;

                container.appendChild(card);
                return;

            }

            card.innerHTML = `
                <div class="curvaS-kpi-topo">
                    <span class="curvaS-kpi-titulo">${kpi.titulo}</span>
                    <span class="curvaS-kpi-icone" aria-hidden="true">${kpi.icone || ""}</span>
                </div>
                <strong class="curvaS-kpi-valor">${kpi.valor}</strong>
                <div class="curvaS-kpi-rodape">
                    <span class="curvaS-kpi-sub">${kpi.sub}</span>
                    ${kpi.subExtra ? `<span class="curvaS-kpi-sub">${kpi.subExtra}</span>` : ""}
                    ${kpi.clicavel ? `<span class="curvaS-kpi-link">Ver atividades do turno →</span>` : ""}
                </div>
            `;

            if (kpi.clicavel) {

                card.setAttribute("role", "button");
                card.setAttribute("tabindex", "0");
                card.setAttribute("aria-label", "Ver atividades do turno");

                card.addEventListener("click", () => this.abrirModalAtividades(parada));

                card.addEventListener("keydown", evento => {
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        this.abrirModalAtividades(parada);
                    }
                });

            }

            container.appendChild(card);

        });

    },

    // ======================================
    // Legenda
    // ======================================
    renderLegenda() {

        const container = document.getElementById("curvaS-legenda");

        if (!container) return;

        container.innerHTML = `
            <div class="curvaS-legenda-item">
                <span class="curvaS-legenda-cor curvaS-cor-previsto"></span>
                <div>
                    <strong>Previsto</strong>
                    <small>Avanço planejado</small>
                </div>
            </div>
            <div class="curvaS-legenda-item">
                <span class="curvaS-legenda-cor curvaS-cor-realizado"></span>
                <div>
                    <strong>Realizado</strong>
                    <small>Avanço executado</small>
                </div>
            </div>
        `;

    },

    // ======================================
    // Interpretação (texto simples explicando o desvio)
    // ======================================
    renderInterpretacao(metrics) {

        const container = document.getElementById("curvaS-interpretacao");

        if (!container) return;

        let texto;

        if (metrics.desvio === null) {

            texto = "Ainda não há dados suficientes para comparar o previsto com o realizado.";

        } else if (Math.abs(metrics.desvio) < 1) {

            texto = `O avanço realizado (${this.formatarPercentual(metrics.realizadoAtual)}) está praticamente alinhado ao planejado (${this.formatarPercentual(metrics.previstoAtual)}) na data de status.`;

        } else if (metrics.desvio < 0) {

            texto = `O avanço realizado (${this.formatarPercentual(metrics.realizadoAtual)}) está ${this.formatarPercentual(Math.abs(metrics.desvio))} abaixo do planejado (${this.formatarPercentual(metrics.previstoAtual)}) na data de status, indicando atraso físico na grande parada.`;

        } else {

            texto = `O avanço realizado (${this.formatarPercentual(metrics.realizadoAtual)}) está ${this.formatarPercentual(metrics.desvio)} acima do planejado (${this.formatarPercentual(metrics.previstoAtual)}) na data de status, indicando adiantamento físico na grande parada.`;

        }

        container.innerHTML = `<p>${texto}</p>`;

    },

    // ======================================
    // Próximos marcos
    // ======================================
    renderMarcos(parada, metrics) {

        const container = document.getElementById("curvaS-marcos");

        if (!container) return;

        const marcos = (parada.marcos || [])
            .map(marco => ({ ...marco, dataObj: this.parseData(marco.data) }))
            .filter(marco => marco.dataObj && marco.dataObj >= metrics.dataStatusObj)
            .sort((a, b) => a.dataObj - b.dataObj);

        if (!marcos.length) {

            container.innerHTML = `<p class="curvaS-marcos-vazio">Nenhum marco futuro cadastrado.</p>`;

            return;

        }

        const lista = document.createElement("ul");

        lista.className = "curvaS-marcos-lista";

        marcos.forEach(marco => {

            const item = document.createElement("li");

            const ehConclusao = Number(marco.previsto) >= 100;

            item.innerHTML = `
                <span class="curvaS-marco-data">${marco.data}</span>
                <span class="curvaS-marco-seta">→</span>
                <span class="curvaS-marco-valor">
                    ${this.formatarPercentual(marco.previsto)}
                    ${ehConclusao ? "conclusão prevista" : "previsto"}
                </span>
                ${marco.descricao ? `<span class="curvaS-marco-desc">${marco.descricao}</span>` : ""}
            `;

            lista.appendChild(item);

        });

        container.innerHTML = "";

        container.appendChild(lista);

    },

    // ======================================
    // Observações
    // ======================================
    renderObservacoes(parada) {

        const container = document.getElementById("curvaS-observacoes");

        if (!container) return;

        const texto = (parada.observacoes || "").trim();

        container.innerHTML = texto
            ? `<p>${texto}</p>`
            : `<p class="curvaS-observacoes-vazio">Nenhuma observação registrada para esta grande parada.</p>`;

    },

    // ======================================
    // Resumo do turno atual (atalhos para o modal de atividades)
    // ======================================
    renderResumoTurno(parada) {

        const container = document.getElementById("curvaS-resumo-turno");
        const titulo = document.getElementById("curvaS-resumo-titulo");

        if (!container) return;

        const turno = parada.turno || {};
        const atividades = parada.atividades || {};

        const realizadas = atividades.realizadas || [];
        const proximas = atividades.proximas || [];

        if (titulo) {
            titulo.textContent = `Resumo do turno atual — ${parada.status?.data || parada.dataStatus || "—"}`;
        }

        container.innerHTML = "";

        const cards = [
            {
                titulo: "Principais atividades realizadas",
                horario: turno.realizado
                    ? `${turno.realizado.inicio}h às ${turno.realizado.fim}h`
                    : "—",
                contagem: realizadas.length
            },
            {
                titulo: "Principais atividades a serem realizadas",
                horario: turno.proximo
                    ? `${turno.proximo.inicio}h às ${turno.proximo.fim}h`
                    : "—",
                contagem: proximas.length
            }
        ];

        cards.forEach(info => {

            const card = document.createElement("article");

            card.className = "curvaS-resumo-card";
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            card.setAttribute("aria-label", `${info.titulo} — ver detalhes`);

            card.innerHTML = `
                <strong>${info.titulo}</strong>
                <span class="curvaS-resumo-horario">${info.horario}</span>
                <span class="curvaS-resumo-contagem">${info.contagem} ${info.contagem === 1 ? "item" : "itens"}</span>
            `;

            card.addEventListener("click", () => this.abrirModalAtividades(parada));

            card.addEventListener("keydown", evento => {
                if (evento.key === "Enter" || evento.key === " ") {
                    evento.preventDefault();
                    this.abrirModalAtividades(parada);
                }
            });

            container.appendChild(card);

        });

    },

    // ======================================
    // Modal de atividades do turno
    // Acessado ao clicar no card REALIZADO ou nos cards
    // de Resumo do Turno. O card REALIZADO funciona como
    // ponto de acesso às informações operacionais — a Curva S
    // mostra o desempenho macro, o modal explica o que está
    // sendo feito para chegar naquele número.
    // ======================================
    abrirModalAtividades(parada) {

        this.fecharModalAtividades();

        const turno = parada.turno || {};
        const atividades = parada.atividades || {};

        const realizadas = atividades.realizadas || [];
        const proximas = atividades.proximas || [];

        const overlay = document.createElement("div");

        overlay.className = "curvaS-modal-overlay";

        overlay.innerHTML = `
            <div class="curvaS-modal" role="dialog" aria-modal="true" aria-label="Atividades do turno">
                <div class="curvaS-modal-header">
                    <h3>Atividades — ${parada.status?.data || parada.dataStatus || "—"}</h3>
                    <button type="button" class="curvaS-modal-fechar" aria-label="Fechar">✕</button>
                </div>
                <div class="curvaS-modal-body">

                    <div class="curvaS-modal-secao">
                        <div class="curvaS-modal-secao-header curvaS-modal-secao-realizadas">
                            <span class="curvaS-modal-dot"></span>
                            <strong>Realizadas</strong>
                            <span class="curvaS-modal-turno-horario">
                                ${turno.realizado ? `${turno.realizado.inicio}h às ${turno.realizado.fim}h` : ""}
                            </span>
                        </div>
                        <ul class="curvaS-modal-lista">
                            ${this.renderItensAtividade(realizadas)}
                        </ul>
                    </div>

                    <div class="curvaS-modal-secao">
                        <div class="curvaS-modal-secao-header curvaS-modal-secao-proximas">
                            <span class="curvaS-modal-dot"></span>
                            <strong>A serem realizadas</strong>
                            <span class="curvaS-modal-turno-horario">
                                ${turno.proximo ? `${turno.proximo.inicio}h às ${turno.proximo.fim}h` : ""}
                            </span>
                        </div>
                        <ul class="curvaS-modal-lista">
                            ${this.renderItensAtividade(proximas)}
                        </ul>
                    </div>

                </div>
            </div>
        `;

        overlay.querySelector(".curvaS-modal-fechar").addEventListener("click", () => this.fecharModalAtividades());

        overlay.addEventListener("click", evento => {
            if (evento.target === overlay) this.fecharModalAtividades();
        });

        this.aoTeclaEscModal = evento => {
            if (evento.key === "Escape") this.fecharModalAtividades();
        };

        document.addEventListener("keydown", this.aoTeclaEscModal);

        document.body.appendChild(overlay);

        this.modalAberto = overlay;

    },

    fecharModalAtividades() {

        if (this.aoTeclaEscModal) {
            document.removeEventListener("keydown", this.aoTeclaEscModal);
            this.aoTeclaEscModal = null;
        }

        if (this.modalAberto) {
            this.modalAberto.remove();
            this.modalAberto = null;
        }

    },

    // Gera os <li> de uma lista de atividades (realizadas ou próximas),
    // mostrando OM (quando existir), área e descrição.
    renderItensAtividade(itens) {

        if (!itens || !itens.length) {
            return `<li class="curvaS-modal-vazio">Nenhuma atividade registrada.</li>`;
        }

        return itens.map(item => `
            <li class="curvaS-modal-item">
                <div class="curvaS-modal-item-topo">
                    ${item.area ? `<span class="curvaS-modal-item-area">${item.area}</span>` : ""}
                    ${item.om ? `<span class="curvaS-modal-item-om">OM ${item.om}</span>` : ""}
                </div>
                <p class="curvaS-modal-item-desc">${item.descricao || "—"}</p>
                ${item.status ? `<span class="curvaS-modal-item-status">${item.status}</span>` : ""}
            </li>
        `).join("");

    },

    // ======================================
    // Gráfico — Curva S real (SVG gerado a partir dos dados)
    // ======================================
    renderGrafico(parada, metrics) {

        const container = document.getElementById("curvaS-chart");

        if (!container) return;

        const inicio = this.parseData(parada.periodo?.inicio);
        const fim = this.parseData(parada.periodo?.fim);

        if (!inicio || !fim || fim <= inicio) {
            container.innerHTML = `<p class="curvaS-marcos-vazio">Período da grande parada inválido.</p>`;
            return;
        }

        const largura = 860;
        const altura = 400;

        const margem = { topo: 20, direita: 24, baixo: 44, esquerda: 58 };

        const areaLargura = largura - margem.esquerda - margem.direita;
        const areaAltura = altura - margem.topo - margem.baixo;

        const escalaX = (data) => {
            const total = fim - inicio;
            const decorrido = data - inicio;
            const fracao = total === 0 ? 0 : decorrido / total;
            return margem.esquerda + Math.min(Math.max(fracao, 0), 1) * areaLargura;
        };

        const escalaY = (valor) => {
            const v = Math.min(Math.max(Number(valor) || 0, 0), 100);
            return margem.topo + (1 - v / 100) * areaAltura;
        };

        const pontos = (parada.pontos || [])
            .map(p => ({ ...p, dataObj: this.parseData(p.data) }))
            .filter(p => p.dataObj)
            .sort((a, b) => a.dataObj - b.dataObj);

        // Regra obrigatória: o REALIZADO nunca é desenhado além da data de
        // status, mesmo que o JSON já contenha valores futuros lançados
        // com antecedência. O PREVISTO não sofre esse filtro — continua
        // sendo desenhado até o fim do cronograma.
        const dentroDoStatus = (p) =>
            p.dataObj.getTime() <= metrics.dataStatusObj.getTime();

        const caminho = (campo) => {

            let d = "";

            pontos.forEach(p => {

                const valor = p[campo];

                if (valor === null || valor === undefined) return;

                if (campo === "realizado" && !dentroDoStatus(p)) return;

                const x = escalaX(p.dataObj);
                const y = escalaY(valor);

                d += (d === "" ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";

            });

            return d.trim();

        };

        const circulos = (campo, classe) => {

            return pontos
                .filter(p => p[campo] !== null && p[campo] !== undefined)
                .filter(p => campo !== "realizado" || dentroDoStatus(p))
                .map(p => {

                    const x = escalaX(p.dataObj).toFixed(1);
                    const y = escalaY(p[campo]).toFixed(1);

                    return `<circle class="${classe}" cx="${x}" cy="${y}" r="4.5">` +
                        `<title>${p.data} — ${this.formatarPercentual(p[campo])}</title>` +
                        `</circle>`;

                })
                .join("");

        };

        // Badge (pill) com o valor destacado próximo ao ponto de status,
        // evitando sobreposição com o eixo do gráfico.
        const pill = (texto, cx, cy, classeTexto) => {

            const largura2 = Math.round(texto.length * 7.6 + 24);
            const altura2 = 24;
            const x = Math.min(
                Math.max(cx - largura2 / 2, margem.esquerda),
                largura - margem.direita - largura2
            );

            return `
                <g>
                    <rect class="curvaS-status-pill" x="${x.toFixed(1)}" y="${(cy - altura2 / 2).toFixed(1)}"
                          width="${largura2}" height="${altura2}" rx="12"></rect>
                    <text class="curvaS-status-valor ${classeTexto}" x="${(x + largura2 / 2).toFixed(1)}"
                          y="${(cy + 4).toFixed(1)}" text-anchor="middle">${texto}</text>
                </g>
            `;

        };

        // Linhas de grade horizontais (0/25/50/75/100%)
        let grade = "";

        [0, 25, 50, 75, 100].forEach(valor => {

            const y = escalaY(valor);

            grade += `
                <line class="curvaS-grade" x1="${margem.esquerda}" y1="${y}" x2="${largura - margem.direita}" y2="${y}" />
                <text class="curvaS-eixo-texto" x="${margem.esquerda - 10}" y="${y + 4}" text-anchor="end">${valor}%</text>
            `;

        });

        // Rótulos do eixo X (início, data de status, fim)
        const rotulosX = [
            { data: inicio, texto: parada.periodo.inicio },
            { data: metrics.dataStatusObj, texto: metrics.dataStatusFormatada, status: true },
            { data: fim, texto: parada.periodo.fim }
        ];

        let eixoX = "";

        rotulosX.forEach(r => {

            if (!r.data) return;

            const x = escalaX(r.data);

            eixoX += `
                <text class="curvaS-eixo-texto ${r.status ? "curvaS-eixo-status" : ""}"
                      x="${x}" y="${altura - margem.baixo + 22}" text-anchor="middle">
                    ${r.texto}
                </text>
            `;

        });

        // Títulos dos eixos (apenas apresentação — não altera os dados)
        const centroAreaX = margem.esquerda + areaLargura / 2;
        const centroAreaY = margem.topo + areaAltura / 2;

        const titulosEixos = `
            <text class="curvaS-eixo-titulo" x="${centroAreaX}" y="${altura - 4}" text-anchor="middle">DATA</text>
            <text class="curvaS-eixo-titulo" x="12" y="${centroAreaY}" text-anchor="middle"
                  transform="rotate(-90 12 ${centroAreaY})">PERCENTUAL ACUMULADO (%)</text>
        `;

        // Linha vertical da data de status
        const xStatus = escalaX(metrics.dataStatusObj);

        const linhaStatus = `
            <line class="curvaS-linha-status" x1="${xStatus.toFixed(1)}" y1="${margem.topo}"
                  x2="${xStatus.toFixed(1)}" y2="${altura - margem.baixo}" />
        `;

        // Rótulos dos valores no ponto de status
        let rotulosStatus = "";

        if (metrics.previstoAtual !== null) {

            const y = escalaY(metrics.previstoAtual);

            rotulosStatus += `
                <circle class="curvaS-ponto-status curvaS-cor-previsto-fill" cx="${xStatus.toFixed(1)}" cy="${y.toFixed(1)}" r="6"></circle>
                ${pill(this.formatarPercentual(metrics.previstoAtual), xStatus, y - 24, "curvaS-status-previsto")}
            `;

        }

        if (metrics.realizadoAtual !== null) {

            const y = escalaY(metrics.realizadoAtual);

            rotulosStatus += `
                <circle class="curvaS-ponto-status curvaS-cor-realizado-fill" cx="${xStatus.toFixed(1)}" cy="${y.toFixed(1)}" r="6"></circle>
                ${pill(this.formatarPercentual(metrics.realizadoAtual), xStatus, y + 24, "curvaS-status-realizado")}
            `;

        }

        const svg = `
            <svg viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="xMidYMid meet"
                 class="curvaS-svg" role="img" aria-label="Curva S — previsto versus realizado">

                ${grade}

                <line class="curvaS-eixo" x1="${margem.esquerda}" y1="${altura - margem.baixo}"
                      x2="${largura - margem.direita}" y2="${altura - margem.baixo}" />

                ${linhaStatus}

                <path class="curvaS-linha curvaS-cor-previsto-linha" d="${caminho("previsto")}" fill="none"></path>
                <path class="curvaS-linha curvaS-cor-realizado-linha" d="${caminho("realizado")}" fill="none"></path>

                ${circulos("previsto", "curvaS-ponto curvaS-cor-previsto-fill")}
                ${circulos("realizado", "curvaS-ponto curvaS-cor-realizado-fill")}

                ${rotulosStatus}

                ${eixoX}

                ${titulosEixos}

            </svg>
        `;

        container.innerHTML = svg;

    },

    // ======================================
    // CÁLCULOS
    // ======================================
    calcularMetricas(parada, horasPorDiaUtil) {

        const pontos = (parada.pontos || [])
            .map(p => ({ ...p, dataObj: this.parseData(p.data) }))
            .filter(p => p.dataObj)
            .sort((a, b) => a.dataObj - b.dataObj);

        const dataStatusObj = this.parseData(parada.dataStatus) || new Date();

        const previstoAtual = this.interpolarValor(pontos, "previsto", dataStatusObj);
        const realizadoAtual = this.interpolarValor(pontos, "realizado", dataStatusObj);

        const desvio =
            (previstoAtual !== null && realizadoAtual !== null)
                ? Math.round((realizadoAtual - previstoAtual) * 100) / 100
                : null;

        const atrasoHoras = this.calcularAtrasoHoras(
            pontos,
            previstoAtual,
            realizadoAtual,
            dataStatusObj,
            horasPorDiaUtil
        );

        const tendencia = this.calcularTendencia(pontos, dataStatusObj);

        return {
            dataStatusObj,
            dataStatusFormatada: parada.dataStatus,
            previstoAtual,
            realizadoAtual,
            desvio,
            atrasoHoras,
            tendencia
        };

    },

    // Interpola (ou usa exatamente) o valor acumulado de um campo
    // ("previsto" ou "realizado") em uma data específica.
    interpolarValor(pontos, campo, data) {

        const validos = pontos.filter(p => p[campo] !== null && p[campo] !== undefined);

        if (!validos.length) return null;

        // Ponto exato
        const exato = validos.find(p => p.dataObj.getTime() === data.getTime());

        if (exato) return Number(exato[campo]);

        // Antes do primeiro ponto conhecido
        if (data <= validos[0].dataObj) return Number(validos[0][campo]);

        // Depois do último ponto conhecido (não extrapola — mantém o último valor)
        if (data >= validos[validos.length - 1].dataObj) {
            return Number(validos[validos.length - 1][campo]);
        }

        // Interpolação linear entre os dois pontos vizinhos
        for (let i = 0; i < validos.length - 1; i++) {

            const a = validos[i];
            const b = validos[i + 1];

            if (data >= a.dataObj && data <= b.dataObj) {

                const totalDias = (b.dataObj - a.dataObj) / 86400000;
                const decorridoDias = (data - a.dataObj) / 86400000;

                const fracao = totalDias === 0 ? 0 : decorridoDias / totalDias;

                return Number(a[campo]) + (Number(b[campo]) - Number(a[campo])) * fracao;

            }

        }

        return null;

    },

    // Encontra a data (interpolada) em que a curva de "previsto"
    // atinge um determinado valor.
    dataParaValorPrevisto(pontos, valor) {

        const previstos = pontos.filter(p => p.previsto !== null && p.previsto !== undefined);

        if (!previstos.length) return null;

        if (valor <= previstos[0].previsto) return previstos[0].dataObj;

        if (valor >= previstos[previstos.length - 1].previsto) {
            return previstos[previstos.length - 1].dataObj;
        }

        for (let i = 0; i < previstos.length - 1; i++) {

            const a = previstos[i];
            const b = previstos[i + 1];

            if (valor >= a.previsto && valor <= b.previsto) {

                const totalValor = b.previsto - a.previsto;
                const fracao = totalValor === 0 ? 0 : (valor - a.previsto) / totalValor;

                return new Date(a.dataObj.getTime() + fracao * (b.dataObj - a.dataObj));

            }

        }

        return null;

    },

    // Atraso/adiantamento: diferença entre a data em que o planejado
    // atingiria o valor hoje realizado e a data de status atual,
    // convertida em horas usando a jornada útil do contrato.
    calcularAtrasoHoras(pontos, previstoAtual, realizadoAtual, dataStatus, horasPorDiaUtil) {

        if (realizadoAtual === null || previstoAtual === null) return null;

        const dataProjetada = this.dataParaValorPrevisto(pontos, realizadoAtual);

        if (!dataProjetada) return null;

        const diasDiferenca = (dataStatus - dataProjetada) / 86400000;

        return diasDiferenca * (horasPorDiaUtil || 12);

    },

    // Tendência: compara o ritmo (inclinação) do realizado com o do
    // previsto no último intervalo com dados conhecidos.
    calcularTendencia(pontos, dataStatus) {

        const comDados = pontos.filter(
            p => p.realizado !== null && p.realizado !== undefined && p.dataObj <= dataStatus
        );

        if (comDados.length < 2) return "Estável";

        const atual = comDados[comDados.length - 1];
        const anterior = comDados[comDados.length - 2];

        const dias = (atual.dataObj - anterior.dataObj) / 86400000;

        if (dias <= 0) return "Estável";

        const ritmoRealizado = (atual.realizado - anterior.realizado) / dias;

        const previstoAtualPeriodo = this.interpolarValor(pontos, "previsto", atual.dataObj);
        const previstoAnteriorPeriodo = this.interpolarValor(pontos, "previsto", anterior.dataObj);

        const ritmoPrevisto =
            (previstoAtualPeriodo !== null && previstoAnteriorPeriodo !== null)
                ? (previstoAtualPeriodo - previstoAnteriorPeriodo) / dias
                : ritmoRealizado;

        if (ritmoPrevisto <= 0) return "Estável";

        const razao = ritmoRealizado / ritmoPrevisto;

        if (razao >= 1.05) return "Avanço";

        if (razao <= 0.85) return "Atrasado";

        return "Estável";

    },

    // ======================================
    // Utilitários
    // ======================================
    parseData(str) {

        if (!str || typeof str !== "string") return null;

        const partes = str.split("/");

        if (partes.length !== 3) return null;

        const [dia, mes, ano] = partes.map(Number);

        if (!dia || !mes || !ano) return null;

        return new Date(ano, mes - 1, dia);

    },

    formatarPercentual(valor, comSinal = false) {

        if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";

        const numero = Math.round(valor * 100) / 100;

        const sinal = comSinal && numero > 0 ? "+" : "";

        return `${sinal}${numero.toFixed(2).replace(".", ",")}%`;

    }

};