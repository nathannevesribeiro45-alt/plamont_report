const paginas = document.querySelectorAll(".pagina");
const botoes = document.querySelectorAll(".menu-btn");

// ======================================
// NAVEGAÇÃO ENTRE PÁGINAS
// ======================================

function abrirPagina(idPagina, botao) {

    paginas.forEach(pagina => {
        pagina.classList.remove("ativa");
    });

    const paginaSelecionada = document.getElementById(idPagina);

    if (paginaSelecionada) {
        paginaSelecionada.classList.add("ativa");
    }

    botoes.forEach(btn => {
        btn.classList.remove("ativo");
    });

    if (botao) {
        botao.classList.add("ativo");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}

// ======================================
// SOMA DOS VALORES DAS LISTAS
// ======================================

function somarLista(lista) {

    let total = 0;

    if (!lista) return total;

    lista.querySelectorAll("strong").forEach(item => {

        const valor = parseInt(item.textContent);

        if (!isNaN(valor)) {
            total += valor;
        }

    });

    return total;

}

// ======================================
// TOTAL DO QLP
// ======================================

function atualizarTotalQLP() {

    document.querySelectorAll(".pagina").forEach(pagina => {

        const blocos = pagina.querySelectorAll(".bloco");

        if (blocos.length < 2) return;

        const blocoQLP = blocos[0];

        const listas = blocoQLP.querySelectorAll(".efetivo-coluna ul");

        if (listas.length === 0) return;

        let total = 0;

        listas.forEach(lista => {
            total += somarLista(lista);
        });

        const campoTotal = blocoQLP.querySelector(".efetivo-total");

        if (campoTotal) {

            campoTotal.innerHTML =
                `👥 Total em área: <strong>${total}</strong> colaboradores`;

        }

    });

}

// ======================================
// TOTAL DO HISTOGRAMA
// ======================================

function atualizarHistograma() {

    document.querySelectorAll(".pagina").forEach(pagina => {

        const blocos = pagina.querySelectorAll(".bloco");

        if (blocos.length < 2) return;

        const blocoHistograma = blocos[1];

        const listas = blocoHistograma.querySelectorAll(".efetivo-coluna ul");

        if (listas.length === 0) return;

        let total = 0;

        listas.forEach(lista => {
            total += somarLista(lista);
        });

        let campoTotal = blocoHistograma.querySelector(".hist-total");

        if (!campoTotal) {

            campoTotal = document.createElement("div");

            campoTotal.className = "efetivo-total hist-total";

            blocoHistograma.appendChild(campoTotal);

        }

        campoTotal.innerHTML =
            `👥 Total do Histograma: <strong>${total}</strong> colaboradores`;

    });

}

// ======================================
// SPLASH SCREEN
// ======================================

function iniciarSplash() {

    const splash = document.querySelector(".splash-screen");
    const barra = document.querySelector(".loading-fill");
    const texto = document.querySelector(".loading-text");

    if (!splash || !barra || !texto) return;

    const etapas = [
        {
            progresso: 20,
            texto: "Inicializando..."
        },
        {
            progresso: 45,
            texto: "Carregando contratos..."
        },
        {
            progresso: 70,
            texto: "Preparando Dashboard..."
        },
        {
            progresso: 100,
            texto: "Sistema pronto."
        }
    ];

    let indice = 0;

    function carregar() {

        if (indice >= etapas.length) {

            splash.style.transition = "opacity .8s ease";

            splash.style.opacity = "0";

            setTimeout(() => {

                splash.style.display = "none";

            }, 800);

            return;

        }

        barra.style.width = etapas[indice].progresso + "%";

        texto.textContent = etapas[indice].texto;

        indice++;

        setTimeout(carregar, 600);

    }

    setTimeout(carregar, 300);

}

// ======================================
// INICIALIZAÇÃO DO SISTEMA
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    const primeiroBotao = document.querySelector(".menu-btn");

    abrirPagina("dashboard", primeiroBotao);

    atualizarTotalQLP();

    atualizarHistograma();

    iniciarSplash();

});