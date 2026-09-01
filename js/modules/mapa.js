// ======================================
// MAPA.JS
// ======================================

const Mapa = {

    contratoAtivo: null,
    tabsRenderizadas: false,

    // Instância do Leaflet e camadas
    map: null,
    tileSatelite: null,
    tileRuas: null,
    camadaAtual: "satelite",
    markersLayer: null,

    // Estado da UI
    marcadorSelecionado: null,
    filtrosAtivos: new Set(["concluida", "andamento", "atrasada", "planejada"]),

    // Ponto central de referência (Porto do Itaqui — São Luís/MA)
    // Usado apenas como posição inicial/central da câmera do mapa
    // (botão "Localizar" e primeiro carregamento). Nunca é usado
    // para posicionar um marcador — marcadores só existem a
    // partir de coordenadas reais de uma OM.
    centroReferencia: { lat: -2.5716, lng: -44.3696 },

    statusConfig: {
        concluida: { label: "Concluída", classe: "status-concluida" },
        andamento: { label: "Em andamento", classe: "status-andamento" },
        atrasada: { label: "Atrasada", classe: "status-atrasada" },
        planejada: { label: "Planejada", classe: "status-planejada" }
    },

    // ======================================
    // Ponto de entrada — chamado ao abrir
    // a página pela sidebar
    // ======================================
    render() {

        const tabsContainer = document.getElementById("mapa-tabs");
        const area = document.getElementById("mapa-area");
        const vazio = document.getElementById("mapa-vazio");

        if (!tabsContainer || !area) {
            console.error("Estrutura da página Mapa não encontrada.");
            return;
        }

        if (!Dashboard || !Dashboard.contratos || !Object.keys(Dashboard.contratos).length) {

            if (vazio) vazio.style.display = "flex";
            return;

        }

        if (vazio) vazio.style.display = "none";

        // Define contrato inicial (primeiro disponível)
        if (!this.contratoAtivo) {

            const primeiro = Object.values(Dashboard.contratos)[0];
            this.contratoAtivo = primeiro ? primeiro.id : null;

        }

        if (!this.tabsRenderizadas) {

            this.renderTabs(tabsContainer);
            this.tabsRenderizadas = true;

        }

        this.atualizarTabAtiva(tabsContainer);

        this.iniciarMapa();
        this.renderFrentes();

        // Garante que o Leaflet recalcule o tamanho do container
        // (a página pode ter estado com display:none até agora)
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 150);

    },

    // ======================================
    // Cria as abas de contrato (topo da página)
    // ======================================
    renderTabs(container) {

        container.innerHTML = "";

        const slider = document.createElement("div");
        slider.className = "tab-slider";
        container.appendChild(slider);

        Object.values(Dashboard.contratos).forEach(contrato => {

            const botao = document.createElement("button");

            botao.className = "tab-btn";
            botao.dataset.id = contrato.id;

            botao.innerHTML = `
                <span class="tab-text">
                    ${contrato.nome.replace("Contrato ", "")}
                </span>
            `;

            botao.addEventListener("click", () => {

                this.contratoAtivo = contrato.id;
                this.fecharPainel();

                this.atualizarTabAtiva(container);
                this.renderFrentes();

            });

            container.appendChild(botao);

        });

    },

    // ======================================
    // Marca a aba ativa e move o slider
    // ======================================
    atualizarTabAtiva(container) {

        const slider = container.querySelector(".tab-slider");
        const botoes = container.querySelectorAll(".tab-btn");

        botoes.forEach(botao => {

            const ativa = botao.dataset.id === this.contratoAtivo;

            botao.classList.toggle("ativa", ativa);

            if (ativa && slider) {

                slider.style.width = `${botao.offsetWidth}px`;
                slider.style.height = `${botao.offsetHeight}px`;
                slider.style.left = `${botao.offsetLeft}px`;
                slider.style.top = `${botao.offsetTop}px`;

            }

        });

    },

    // ======================================
    // Inicializa o mapa Leaflet (uma única vez)
    // e os controles customizados
    // ======================================
    iniciarMapa() {

        if (this.map) return;

        const canvas = document.getElementById("mapa-canvas");
        if (!canvas) return;

        this.map = L.map(canvas, {
            zoomControl: false,
            attributionControl: true
        }).setView([this.centroReferencia.lat, this.centroReferencia.lng], 15);

        // Camada satélite (visão aérea — padrão)
        this.tileSatelite = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
                maxZoom: 19,
                attribution: "Tiles &copy; Esri"
            }
        ).addTo(this.map);

        // Camada de ruas (alternativa via botão de camadas)
        this.tileRuas = L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap"
            }
        );

        this.markersLayer = L.layerGroup().addTo(this.map);

        this.iniciarControles();
        this.iniciarLegenda();
        this.iniciarPainel();

    },

    // ======================================
    // Botões customizados: zoom, localizar, camadas
    // ======================================
    iniciarControles() {

        const controles = document.getElementById("mapa-controles");
        if (!controles) return;

        controles.querySelector('[data-acao="zoom-in"]')
            ?.addEventListener("click", () => this.map.zoomIn());

        controles.querySelector('[data-acao="zoom-out"]')
            ?.addEventListener("click", () => this.map.zoomOut());

        controles.querySelector('[data-acao="localizar"]')
            ?.addEventListener("click", () => {
                this.map.setView([this.centroReferencia.lat, this.centroReferencia.lng], 15);
            });

        controles.querySelector('[data-acao="camadas"]')
            ?.addEventListener("click", () => this.alternarCamada());

    },

    // ======================================
    // Alterna entre satélite e ruas
    // ======================================
    alternarCamada() {

        if (this.camadaAtual === "satelite") {

            this.map.removeLayer(this.tileSatelite);
            this.map.addLayer(this.tileRuas);
            this.camadaAtual = "ruas";

        } else {

            this.map.removeLayer(this.tileRuas);
            this.map.addLayer(this.tileSatelite);
            this.camadaAtual = "satelite";

        }

    },

    // ======================================
    // Painel lateral: liga o botão de fechar
    // ======================================
    iniciarPainel() {

        document.getElementById("mapa-painel-fechar")
            ?.addEventListener("click", () => this.fecharPainel());

    },

    // ======================================
    // Legenda: cria os itens de status (uma vez)
    // e liga o filtro de visibilidade
    // ======================================
    iniciarLegenda() {

        const legenda = document.getElementById("mapa-legenda");
        if (!legenda || legenda.dataset.pronta) return;

        legenda.innerHTML = "";

        Object.entries(this.statusConfig).forEach(([chave, cfg]) => {

            const item = document.createElement("button");

            item.type = "button";
            item.className = "mapa-legenda-item";
            item.dataset.status = chave;

            item.innerHTML = `
                <span class="mapa-legenda-dot ${cfg.classe}"></span>
                <span class="mapa-legenda-texto">${cfg.label}</span>
                <span class="mapa-legenda-contagem">(0)</span>
            `;

            item.addEventListener("click", () => {

                if (this.filtrosAtivos.has(chave)) {
                    this.filtrosAtivos.delete(chave);
                } else {
                    this.filtrosAtivos.add(chave);
                }

                item.classList.toggle("inativo", !this.filtrosAtivos.has(chave));

                this.renderFrentes(false);

            });

            legenda.appendChild(item);

        });

        legenda.dataset.pronta = "1";

    },

    // ======================================
    // Atualiza a contagem de cada item da legenda
    // ======================================
    atualizarLegenda(marcadores) {

        const legenda = document.getElementById("mapa-legenda");
        if (!legenda) return;

        const contagens = { concluida: 0, andamento: 0, atrasada: 0, planejada: 0 };

        marcadores.forEach(m => contagens[m.status]++);

        Object.entries(contagens).forEach(([chave, total]) => {

            const item = legenda.querySelector(`[data-status="${chave}"] .mapa-legenda-contagem`);
            if (item) item.textContent = `(${total})`;

        });

    },

    // ======================================
    // Monta as frentes (pinos) do contrato ativo
    // ======================================
    renderFrentes(recentralizar = true) {

        const contrato = Dashboard.contratos[this.contratoAtivo];

        this.markersLayer.clearLayers();
        this.fecharPainel();

        if (!contrato) return;

        const marcadores = this.montarMarcadores(contrato);

        this.atualizarLegenda(marcadores);

        const pontos = [];

        marcadores.forEach(dado => {

            if (!this.filtrosAtivos.has(dado.status)) return;

            const marker = L.marker([dado.lat, dado.lng], {
                icon: this.criarIcone(dado)
            });

            marker.on("click", () => this.abrirPainel(dado, marker));

            marker.addTo(this.markersLayer);
            pontos.push([dado.lat, dado.lng]);

        });

        if (recentralizar && pontos.length) {

            this.map.fitBounds(pontos, { padding: [60, 60], maxZoom: 16 });

        }

    },

    // ======================================
    // Constrói a lista de marcadores a partir do JSON
    // do contrato.
    //
    // A entidade espacial do mapa é a FRENTE (propriedade
    // "frente" da OM) dentro de cada aba — não mais a
    // combinação líder+frente. Uma frente com vários líderes
    // trabalhando nela gera um ÚNICO marcador, que carrega a
    // lista de todos os líderes daquela frente (dado.lideres).
    // Cada líder mantém, dentro do marcador, apenas as suas
    // próprias OMs — elas nunca são misturadas entre líderes.
    //
    // A localização do marcador ainda vem exclusivamente
    // de uma OM real (a primeira do grupo que tiver
    // latitude/longitude válidas). O mapa NUNCA inventa
    // coordenadas: uma frente sem nenhuma OM com coordenada
    // válida simplesmente não gera marcador (mas continua
    // existindo no restante do sistema, como o resumo de
    // atividades).
    // ======================================
    montarMarcadores(contrato) {

        const grupos = new Map();

        (contrato.abas || []).forEach(aba => {

            (aba.atividades || []).forEach(lider => {

                (lider.oms || []).forEach(om => {

                    const frente = om.frente || "Sem frente";
                    const chave = `${aba.id}::${frente}`;

                    if (!grupos.has(chave)) {

                        grupos.set(chave, {
                            id: chave,
                            contrato,
                            aba,
                            frente,
                            oms: [],
                            lideresMap: new Map(),
                            lat: null,
                            lng: null
                        });

                    }

                    const grupo = grupos.get(chave);
                    grupo.oms.push(om);

                    // Cada líder aparece uma única vez dentro da
                    // frente, com a lista das OMs que são dele.
                    if (!grupo.lideresMap.has(lider.lider)) {

                        grupo.lideresMap.set(lider.lider, {
                            lider: lider.lider,
                            telefone: lider.telefone,
                            tecnicoSeguranca: lider.tecnicoSeguranca,
                            equipe: lider.equipe,
                            observacoes: lider.observacoes,
                            anexos: lider.anexos,
                            contratoId: contrato.id,
                            abaId: aba.id,
                            frente,
                            oms: []
                        });

                    }

                    grupo.lideresMap.get(lider.lider).oms.push(om);

                    // A primeira OM do grupo com coordenada válida
                    // define a posição do marcador da frente.
                    if (grupo.lat === null || grupo.lng === null) {

                        const lat = parseCoordenadaOM(om.latitude);
                        const lng = parseCoordenadaOM(om.longitude);

                        if (lat !== null && lng !== null) {
                            grupo.lat = lat;
                            grupo.lng = lng;
                        }

                    }

                });

            });

        });

        const marcadores = [];

        grupos.forEach(grupo => {

            // Frente sem nenhuma coordenada conhecida: não renderiza.
            if (grupo.lat === null || grupo.lng === null) return;

            // O status do marcador considera as OMs de TODOS os
            // líderes da frente — continua sendo único por frente.
            const statusDasOms = grupo.oms.map(om => normalizarStatusOM(om.status));

            marcadores.push({

                id: grupo.id,

                lat: grupo.lat,
                lng: grupo.lng,

                status: statusRepresentativoFrente(statusDasOms),

                // Contexto completo do marcador — exatamente
                // o que o painel precisa para se renderizar.
                contrato: grupo.contrato,
                aba: grupo.aba,
                frente: grupo.frente,
                lideres: Array.from(grupo.lideresMap.values()),
                oms: grupo.oms

            });

        });

        return marcadores;

    },

    // ======================================
    // Cria o ícone (pino) do marcador
    // ======================================
    criarIcone(dado) {

        const cfg = this.statusConfig[dado.status];

        return L.divIcon({
            className: "mapa-marker-divicon",
            html: `
                <div class="mapa-marker-wrap">
                    <div class="mapa-marker ${cfg.classe}"></div>
                    <div class="mapa-marker-label">
                        <span class="mapa-marker-tag ${cfg.classe}">${cfg.label}</span>
                        <strong>${dado.frente}</strong>
                    </div>
                </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 34]
        });

    },

    // ======================================
    // Abre o painel lateral com os detalhes
    // da frente/líder selecionada
    // ======================================
    abrirPainel(dado) {

        const painel = document.getElementById("mapa-painel");
        const conteudo = document.getElementById("mapa-painel-conteudo");

        if (!painel || !conteudo) return;

        this.marcadorSelecionado = dado.id;

        conteudo.innerHTML = MapaPainel.render(
            dado,
            this.statusConfig
        );

        painel.classList.add("aberto");

        // As fotos são persistidas no IndexedDB. A renderização do painel
        // continua síncrona, e a galeria é hidratada assim que os blobs
        // persistidos terminam de ser carregados.
        MapaPainel.hidratarFotos(conteudo);

    },

    // ======================================
    // Fecha o painel lateral
    // ======================================
    fecharPainel() {

        document.getElementById("mapa-painel")?.classList.remove("aberto");
        this.marcadorSelecionado = null;

    },

};