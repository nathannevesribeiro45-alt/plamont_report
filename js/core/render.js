// ==========================================
// RENDER.JS
// Orquestrador da interface
// ==========================================

const Render = {

    // ==========================================
    // Inicializa o contrato
    // ==========================================
    async inicializar() {

        if (!Dashboard.contratoAtual) {
            console.error("Nenhum contrato carregado.");
            return;
        }

        // Cabeçalho
        Header.render(Dashboard.contratoAtual);

        // Abas
        await Abas.render(Dashboard.contratoAtual.abas);

        // Primeira aba
     const abaInicial =
    Dashboard.abaAtual ??
    Dashboard.contratoAtual.abas[0];

if (abaInicial) {
    this.selecionarAba(abaInicial.id);
}

    },

    // ==========================================
    // Troca de aba
    // ==========================================
    selecionarAba(idAba) {

    const container = document.getElementById(
        `${Dashboard.contratoAtual.id}-content`
    );

    Dashboard.abaAtual = Dashboard.contratoAtual.abas.find(
        aba => aba.id === idAba
    );

    if (!Dashboard.abaAtual) {
        console.warn("Aba não encontrada.");
        return;
    }

    Abas.atualizarAtiva(idAba);

    // Primeira renderização (sem animação)
    if (!container.hasChildNodes()) {

        this.conteudo();

        return;

    }

    container.classList.add("aba-animando");
    container.classList.add("aba-slide-out");

    setTimeout(() => {

        this.conteudo();

        container.classList.remove("aba-slide-out");
        container.classList.add("aba-slide-in");

        requestAnimationFrame(() => {

            requestAnimationFrame(() => {

                container.classList.remove("aba-slide-in");

            });

        });

    },220);

},

    // ==========================================
    // Renderiza conteúdo da aba
    // ==========================================
    conteudo() {

        const container = document.getElementById(
            `${Dashboard.contratoAtual.id}-content`
        );

        if (!container) {
            console.error("Container de conteúdo não encontrado.");
            return;
        }

        container.innerHTML = "";

        QLP.render(Dashboard.abaAtual, container);

        Histograma.render(Dashboard.abaAtual, container);

// Grid para Ausências + Mobilização
const gridSecoes = document.createElement("div");
gridSecoes.className = "grid-secoes";

container.appendChild(gridSecoes);

Ausencias.render(Dashboard.abaAtual, gridSecoes);
Mobilizacao.render(Dashboard.abaAtual, gridSecoes);

Recursos.render(Dashboard.abaAtual, container);
Atividades.render(Dashboard.abaAtual, container);
    },

    // ==========================================
    // Atualiza somente o conteúdo
    // ==========================================
    atualizar() {

        this.conteudo();

    }

};