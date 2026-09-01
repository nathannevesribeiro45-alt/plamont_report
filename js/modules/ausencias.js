// ======================================
// AUSENCIAS.JS
// Responsável por renderizar as ausências
// da aba atual
// ======================================

const Ausencias = {

    // ======================================
    // Renderiza a seção
    // ======================================
    render(aba, container) {

        if (!aba?.ausencias) return;
        if (!container) return;

        const secao = this.criarSecao();

        const listaContainer =
            secao.querySelector(".lista-card");

        const total = this.calcularTotal(
    aba.ausencias
);

if (total === 0) {

    listaContainer.innerHTML = `
        <div class="lista-vazia">
            <div class="lista-vazia-icone"></div>
            <h3>✅Nenhuma ausência registrada</h3>
            <p>Todos os colaboradores compareceram ao trabalho neste turno.</p>
        </div>
    `;

} else {

    this.criarLista(
        aba.ausencias,
        listaContainer
    );

}


const painelTotal = secao.querySelector(".painel-total");

painelTotal.innerHTML = `

    <span>📋 Justificadas: <strong>${aba.ausencias.justificadas}</strong></span>

    <span>❌ Não justificadas: <strong>${aba.ausencias.naoJustificadas}</strong></span>

    <span>👥 Total: <strong>${total}</strong></span>

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
criarSecao() {

    const secao = document.createElement("section");

    secao.className = "bloco card-ausencias";

    secao.innerHTML = `

        <div class="bloco-header">

            <h2>${Icons.ausencias} Ausências</h2>

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
    criarLista(ausencias, container) {

        Object.entries(ausencias).forEach(([funcao, quantidade]) => {

            if (
                funcao === "justificadas" ||
                funcao === "naoJustificadas"
            ) return;

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
    // Calcula o total de ausências
    // ======================================
    calcularTotal(ausencias) {

        let total = 0;

        Object.entries(ausencias).forEach(([funcao, quantidade]) => {

            if (
                funcao === "justificadas" ||
                funcao === "naoJustificadas"
            ) return;

            total += Number(quantidade) || 0;

        });

        return total;

    }

};