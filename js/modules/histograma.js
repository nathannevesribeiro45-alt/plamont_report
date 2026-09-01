// ======================================
// HISTOGRAMA.JS
// Responsável por renderizar o histograma
// da aba atual
// ======================================

const Histograma = {

    // ======================================
    // Renderiza a seção
    // ======================================
    render(aba, container) {

        if (!aba?.histograma) return;
        if (!container) return;

        const secao = this.criarSecao();

        const cardsContainer =
            secao.querySelector(".painel-grid");

        this.criarCards(
            aba.histograma,
            cardsContainer
        );

        const total = this.calcularTotal(
            aba.histograma.direto,
            aba.histograma.indireto
        );

        const painelTotal = secao.querySelector(".painel-total");

        painelTotal.innerHTML =
        `👥 Total do Histograma: <strong>${total}</strong> colaboradores`;


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

    secao.className = "bloco card-histograma";

    secao.innerHTML = `

        <div class="bloco-header">

            <h2>${Icons.histograma} Histograma</h2>

            <span class="bloco-toggle">▼</span>

        </div>

        <div class="bloco-content">

            <div class="painel-grid"></div>

        </div>

        <div class="painel-total"></div>

    `;

    return secao;

},

    // ======================================
    // Cria os cards
    // ======================================
    criarCards(histograma, container) {

        container.appendChild(
            this.criarCard(
                "Mão de Obra Direta",
                histograma.direto
            )
        );

        container.appendChild(
            this.criarCard(
                "Mão de Obra Indireta",
                histograma.indireto
            )
        );

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
    // Calcula o total
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