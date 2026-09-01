// ======================================
// ABAS.JS
// Gerencia as abas do contrato
// ======================================

const Abas = {

    // ======================================
    // Renderiza todas as abas
    // ======================================
    async render(abas) {

        if (!abas || abas.length === 0) {
            console.warn("Nenhuma aba encontrada.");
            return;
        }

        const container = document.getElementById(
            `${Dashboard.contratoAtual.id}-tabs`
        );

        if (!container) {
            console.warn("Container das abas não encontrado.");
            return;
        }

        container.innerHTML = "";

        // Cria o slider animado das abas
         const slider = document.createElement("div");
        slider.className = "tab-slider";
        container.appendChild(slider);

        for (const aba of abas) {
            const botao = await this.criarBotao(aba);
            container.appendChild(botao);
        }

    },

    // ======================================
    // Cria um botão de aba
    // ======================================
    async criarBotao(aba) {

        const botao = document.createElement("button");

        botao.className = "tab-btn";
        botao.dataset.id = aba.id;

        let svg = "";

        try {

            const resposta = await fetch(aba.icone);

            if (!resposta.ok) {
                throw new Error("SVG não encontrado.");
            }

            svg = await resposta.text();

        } catch (erro) {

            console.error(`Erro ao carregar ícone: ${aba.icone}`, erro);

        }

        botao.innerHTML = `
            <span class="tab-icon">
                ${svg}
            </span>

            <span class="tab-text">
                ${aba.nome}
            </span>
        `;

        botao.addEventListener("click", () => {
            Render.selecionarAba(aba.id);
        });

        return botao;

    },

    // ======================================
// Atualiza a aba ativa
// ======================================
atualizarAtiva(idAba) {

    const container = document.getElementById(
        `${Dashboard.contratoAtual.id}-tabs`
    );

    const slider = container.querySelector(".tab-slider");

    const botoes = container.querySelectorAll(".tab-btn");

    botoes.forEach(botao => {

        const ativa = botao.dataset.id === idAba;

        botao.classList.toggle("ativa", ativa);

        if (ativa && slider) {

            slider.style.width = `${botao.offsetWidth}px`;

            slider.style.height = `${botao.offsetHeight}px`;

            slider.style.left = `${botao.offsetLeft}px`;

            slider.style.top = `${botao.offsetTop}px`;

        }

    });

}

};