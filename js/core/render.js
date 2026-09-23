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
    await this.selecionarAba(abaInicial.id);
}

    },

    // ==========================================
    // Troca de aba
    // ==========================================
    async selecionarAba(idAba) {

    if (window.EditorRelatorio?.deveConfirmarNavegacao(Dashboard.contratoAtual.id, idAba)) {
        if (!await window.EditorRelatorio.confirmarSaida()) return false;
    }

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

    const contratoRenderizado = Dashboard.contratoAtual;
    setTimeout(() => {

        if (Dashboard.contratoAtual !== contratoRenderizado || Dashboard.abaAtual?.id !== idAba) {
            container.classList.remove("aba-animando", "aba-slide-out", "aba-slide-in");
            return;
        }

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

container.innerHTML = "";

// ==========================================
// Ações globais do relatório
// ==========================================
const containerAcoes = document.getElementById(
    `${Dashboard.contratoAtual.id}-acoes`
);

// Como a área de ações fica fora do <main>,
// precisamos limpá-la a cada nova renderização.
if (containerAcoes) {
    containerAcoes.innerHTML = "";
}

if (!window.EditorRelatorio?.deveEditarAba(Dashboard.abaAtual)) {

    const acoesRelatorio = document.createElement("div");
    acoesRelatorio.className = "relatorio-acoes";

    acoesRelatorio.innerHTML = `
        <button
            type="button"
            class="atividade-editar-btn relatorio-editar-btn"
            data-abrir-editor
            ${window.Auth?.pode?.("editar") === true ? "" : "hidden disabled"}
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
            >
                <path d="M12 20h9M16 3l5 5L7 22l-5 1 1-5Z"/>
            </svg>

            Editar relatório
        </button>
    `;

    const botaoEditar = acoesRelatorio.querySelector("[data-abrir-editor]");

    botaoEditar.addEventListener("click", evento => {
        evento.stopPropagation();
        window.EditorRelatorio?.iniciar(Dashboard.abaAtual);
    });

    // OS 440 já possui a nova área ao lado das abas.
    // Os outros contratos continuam usando o local antigo
    // até fazermos a mesma alteração neles.
    (containerAcoes || container).appendChild(acoesRelatorio);
}
//Fim 

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
