// ======================================
// QLP.JS
// Responsável por renderizar o efetivo da aba atual
// ======================================

const QLP = {

    // ======================================
    // Renderiza a seção QLP
    // ======================================
    render(aba, container) {

        if (!aba?.qlp) return;
        if (!container) return;

        const secao = this.criarSecao();

        const cardsContainer =
            secao.querySelector(".painel-grid");

        // Card Direto
        cardsContainer.appendChild(
            this.criarCard(
                "Mão de Obra Direta",
                aba.qlp.direto
            )
        );

        // Card Indireto
        cardsContainer.appendChild(
            this.criarCard(
                "Mão de Obra Indireta",
                aba.qlp.indireto
            )
        );

        // Total
        const total = this.calcularTotal(
            aba.qlp.direto,
            aba.qlp.indireto
        );

        const totalDiv = document.createElement("div");

        totalDiv.className = "painel-total";

        totalDiv.innerHTML =
            `👥 Total em área: <strong>${total}</strong> colaboradores`;

        secao.appendChild(totalDiv);

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
    // Cria a estrutura da seção
    // ======================================
    criarSecao() {

        const secao = document.createElement("section");

        secao.className = "bloco";

       secao.innerHTML = `

    <div class="bloco-header">

        <h2>
            ${Icons.qlp}
            Efetivo (QLP)
        </h2>

        <span class="bloco-toggle">
            ▼
        </span>

    </div>

    <div class="bloco-content">

        <div class="painel-grid"></div>

    </div>

`;

        return secao;

    },

    // ======================================
    // Cria um card
    // ======================================
    criarCard(titulo, dados) {

        const card = document.createElement("section");

        card.className = "painel-card";

        const header = document.createElement("div");

        header.className = "painel-header";

        header.textContent = titulo;

        card.appendChild(header);

        const lista = document.createElement("ul");

        lista.className = "painel-lista";

        Object.entries(dados).forEach(([funcao, quantidade]) => {

            const item = document.createElement("li");

            item.className = "painel-item";

            item.innerHTML = `
                <span>${funcao}</span>
                <span class="painel-valor">${quantidade}</span>
            `;

            lista.appendChild(item);

        });

        card.appendChild(lista);

        return card;

    },

    // ======================================
    // Calcula o total da aba
    // ======================================
    calcularTotal(...grupos) {

        let total = 0;

        grupos.forEach(grupo => {

            if (!grupo) return;

            Object.values(grupo).forEach(valor => {

                total += Number(valor) || 0;

            });

        });

        return total;

    }

};