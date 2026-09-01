// ======================================
// ATIVIDADES.JS
// Responsável por renderizar as
// atividades da aba atual
// ======================================

const Atividades = {

// ======================================
// Renderiza a seção
// ======================================
render(aba, container) {

    if (!aba || !aba.atividades) return;
    if (!container) return;

    const secao = this.criarSecao();

    const listaContainer = secao.querySelector(".atividades-lista");

    // O resumo responde "o que está acontecendo hoje?" — por isso
    // mostra toda atividade realmente executada (em andamento,
    // concluída ou atrasada), mesmo sem localização ainda, mas
    // nunca uma OM que ainda é apenas "Planejada".
    const atividadesDoResumo = this.filtrarAtividadesDoResumo(aba.atividades);

    this.criarLista(
        atividadesDoResumo,
        listaContainer
    );

    if (aba.observacoes && aba.observacoes.length > 0) {

        const containerObservacoes = secao.querySelector(
            ".atividade-observacoes-container"
        );

        containerObservacoes.appendChild(
            this.criarObservacoes(aba.observacoes)
        );

    }

    const painelTotal = secao.querySelector(".painel-total");

    const totalOms = atividadesDoResumo.reduce(
        (total, lider) => total + (lider.oms?.length || 0),
        0
    );

    painelTotal.innerHTML = `
        <strong>${totalOms}</strong>
        OM${totalOms !== 1 ? "'s" : ""}
    `;

    container.appendChild(secao);

    const header = secao.querySelector(".bloco-header");
    const content = secao.querySelector(".bloco-content");
    const toggle = secao.querySelector(".bloco-toggle");

    header.addEventListener("click", () => {
    content.classList.toggle("recolhido");
    toggle.classList.toggle("recolhido");
});

},

    // ======================================
    // Filtra as OMs "Planejada" de cada líder —
    // o resumo só mostra o que já está de fato em
    // execução (ou concluído/atrasado). Um líder cujas
    // OMs do dia são todas planejadas não aparece no
    // resumo, pois ainda não há nada "acontecendo hoje".
    // ======================================
    filtrarAtividadesDoResumo(atividades) {

        return (atividades || [])
            .map(lider => ({
                ...lider,
                oms: (lider.oms || []).filter(
                    om => normalizarStatusOM(om.status) !== "planejada"
                )
            }))
            .filter(lider => lider.oms.length > 0);

    },

    // ======================================
    // Cria a seção
    // ======================================
   criarSecao() {

    const secao = document.createElement("section");

    secao.className = "bloco card-atividades";

    secao.innerHTML = `

        <div class="bloco-header">

            <h2>${Icons.oms} OM's do Dia</h2>

            <span class="bloco-toggle">▼</span>

        </div>

        <div class="bloco-content">

            <div class="atividades-lista"></div>

            <div class="atividade-observacoes-container"></div>

        </div>

        <div class="painel-total"></div>

    `;

    return secao;

},

    // ======================================
    // Cria todos os cards dos líderes
    // ======================================
    criarLista(atividades, container) {

        if (!atividades.length) {

            container.innerHTML = `
                <div class="lista-vazia">
                    <div class="lista-vazia-icone"></div>
                    <h3>✅Nenhuma atividade cadastrada</h3>
                    <p>Não há atividades programadas para este turno.</p>
                </div>
            `;

            return;

        }

        atividades.forEach(lider => {

            container.appendChild(
                this.criarCardLider(lider)
            );

        });

    },

    // ======================================
    // Cria o card do líder
    // ======================================
    criarCardLider(lider) {

        const card = document.createElement("div");

        card.className = "atividade-card";

        card.dataset.busca = lider.lider;

        card.appendChild(
            this.criarCabecalho(lider)
        );

        card.appendChild(
            this.criarListaOMs(lider.oms)
        );

        return card;

    },

    // ======================================
    // Cabeçalho
    // ======================================
    criarCabecalho(lider) {

        const cabecalho = document.createElement("div");

        cabecalho.className = "atividade-cabecalho";

        cabecalho.innerHTML = `

            <div class="atividade-lider">

                <h3>👷 ${lider.lider}</h3>

                <span class="atividade-total">
                    ${(lider.oms || []).length} OMs
                </span>

            </div>

            <p class="atividade-telefone">
    📞 ${lider.telefone || "--"}
</p>

${lider.tecnicoSeguranca ? `
    <p class="atividade-tecnico">
        🦺 ${lider.tecnicoSeguranca}
    </p>
` : ""}

<p class="atividade-equipe">
    👥 ${lider.equipe || "--"}
</p>

        `;

        return cabecalho;

    },

    // ======================================
    // Lista de OMs
    // ======================================
    criarListaOMs(oms) {

        const lista = document.createElement("div");

        lista.className = "atividade-oms";

        if (!oms || oms.length === 0) {

            lista.innerHTML = `
                <p>Nenhuma atividade cadastrada.</p>
            `;

            return lista;

        }

        oms.forEach(om => {

            lista.appendChild(
                this.criarOM(om)
            );

        });

        return lista;

    },

    // ======================================
    // Card da OM
    // ======================================
    criarOM(om) {

        const card = document.createElement("div");

        card.className = "atividade-om";

        card.dataset.busca = (om.numero || "").toString();

        const arquivoOM = om.arquivoPdf || om.pdf;
        const arquivoLaudo = om.laudo || om.arquivoLaudo;

        const ariaOM = `Abrir documento da OM ${om.numero || ""}`.trim();
        const ariaLaudo = `Abrir laudo da OM ${om.numero || ""}`.trim();

        card.innerHTML = `

            <div class="om-topo">

                <div class="om-numero">

                    📋 OM ${om.numero || "--"}

                </div>

                ${om.status ? `
                    <div class="om-status ${this.classeStatus(om.status)}">
                        ${om.status}
                    </div>
                ` : ""}

            </div>

            <div class="om-descricao">

                ${om.descricao || "--"}

            </div>

            <div class="om-documentos">

                ${arquivoOM ? `
                    <a class="om-documento om-documento-disponivel" href="${arquivoOM}" target="_blank" rel="noopener" aria-label="${ariaOM}">
                        <span class="om-documento-icone">📄</span> OM
                    </a>
                ` : `
                    <span class="om-documento om-documento-indisponivel" aria-hidden="true">
                        <span class="om-documento-icone">📄</span> OM
                    </span>
                `}

                ${arquivoLaudo ? `
                    <a class="om-documento om-documento-disponivel" href="${arquivoLaudo}" target="_blank" rel="noopener" aria-label="${ariaLaudo}">
                        <span class="om-documento-icone">📑</span> Laudo
                    </a>
                ` : `
                    <span class="om-documento om-documento-indisponivel">--</span>
                `}

            </div>

        `;

        return card;

    },

   // ======================================
// Observações
// ======================================
criarObservacoes(observacoes) {

    const bloco = document.createElement("div");

    bloco.className = "atividade-observacoes";

    bloco.innerHTML = `

        <div class="observacoes-header">

            <div class="observacoes-titulo">

                📝

                <span>Observações Gerais</span>

            </div>

        </div>

        <div class="observacoes-body">

        </div>

    `;

    const body = bloco.querySelector(".observacoes-body");

    const lista = document.createElement("ul");

    observacoes.forEach(obs => {

        const item = document.createElement("li");

        item.textContent = obs;

        item.dataset.busca = obs;

        lista.appendChild(item);

    });

    body.appendChild(lista);

    return bloco;

},


    classeStatus(status){

    switch(status?.toLowerCase()){

        case "em andamento":
            return "status-andamento";

        case "concluída":
            return "status-concluida";

        case "concluída parcial":
            return "status-parcial";

        case "postergada":
            return "status-postergada";

        default:
            return "status-neutro";

    }

}

};
