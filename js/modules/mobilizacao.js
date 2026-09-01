// ======================================
// MOBILIZACAO.JS
// Responsável por renderizar o efetivo
// em mobilização da aba atual
// ======================================

const Mobilizacao = {

    // ======================================
    // Renderiza a seção
    // ======================================
    render(aba, container) {

        if (!aba?.mobilizacao) return;
        if (!container) return;

        const secao = this.criarSecao();

        const listaContainer =
            secao.querySelector(".lista-card");

        const total = this.calcularTotal(
    aba.mobilizacao
);

if (total === 0) {

    listaContainer.innerHTML = `
        <div class="lista-vazia">
            <div class="lista-vazia-icone"></div>
            <h3>✅Nenhum colaborador em mobilização</h3>
            <p>Todo o efetivo está alocado em área operacional neste turno.</p>
        </div>
    `;

} else {

    this.criarLista(
        aba.mobilizacao,
        listaContainer
    );

}

const painelTotal = secao.querySelector(".painel-total");

painelTotal.innerHTML = `
    <span>👥 Total em Mobilização:</span>
    <strong>${total}</strong>
`;

const header = secao.querySelector(".bloco-header");
const content = secao.querySelector(".bloco-content");
const toggle = secao.querySelector(".bloco-toggle");

header.addEventListener("click", () => {

    content.classList.toggle("recolhido");

    toggle.classList.toggle("recolhido");

});

        container.appendChild(secao);

    },

    // ======================================
    // Cria a seção
    // ======================================
    // ======================================
// Cria a seção
// ======================================
criarSecao() {

    const secao = document.createElement("section");

    secao.className = "bloco card-mobilizacao";

    secao.innerHTML = `

        <div class="bloco-header">

            <h2>${Icons.mobilizacao} Efetivo em Mobilização</h2>

            <span class="bloco-toggle">▼</span>

        </div>

        <div class="bloco-content">

            <div class="lista-card"></div>

        </div>

        <div class="painel-total"></div>

    `;

    return secao;

},

    // ======================================
    // Cria a lista
    // ======================================
    criarLista(mobilizacao, container) {

        Object.entries(mobilizacao).forEach(([funcao, quantidade]) => {

            const item = document.createElement("div");

            item.className = "lista-item";

            item.innerHTML = `
                <span class="lista-label">${funcao}</span>

                <span class="lista-valor">${quantidade}</span>
            `;

            container.appendChild(item);

        });

    },

    // ======================================
    // Calcula o total
    // ======================================
    calcularTotal(mobilizacao) {

        let total = 0;

        Object.values(mobilizacao).forEach(valor => {

            total += Number(valor) || 0;

        });

        return total;

    }

};