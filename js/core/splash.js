// ======================================
// SPLASH SCREEN V2.0
// ======================================

function iniciarSplash() {

    const splash = document.querySelector(".splash-screen");
    const barra = document.querySelector(".loading-fill");
    const texto = document.querySelector(".loading-text");

    if (!splash || !barra || !texto) {
        return;
    }

    const reduzirMovimento = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    const etapas = [
        {
            progresso: 20,
            texto: "Inicializando..."
        },
        {
            progresso: 48,
            texto: "Carregando contratos..."
        },
        {
            progresso: 78,
            texto: "Preparando dashboard..."
        },
        {
            progresso: 100,
            texto: "Sistema pronto."
        }
    ];

    const tempoEntreEtapas = reduzirMovimento
        ? 140
        : 430;

    const tempoFinal = reduzirMovimento
        ? 80
        : 260;

    const tempoSaida = reduzirMovimento
        ? 100
        : 550;

    let indice = 0;
    let encerrada = false;
    let timerTexto = null;


    // ======================================
    // ATUALIZAR TEXTO
    // ======================================

    function atualizarTexto(novoTexto) {

        if (reduzirMovimento) {

            texto.textContent = novoTexto;

            return;
        }

        if (timerTexto) {

            clearTimeout(timerTexto);
        }

        texto.style.opacity = "0";

        timerTexto = setTimeout(() => {

            texto.textContent = novoTexto;

            texto.style.opacity = "1";

            timerTexto = null;

        }, 110);
    }


    // ======================================
    // FINALIZAR SPLASH
    // ======================================

    function finalizarSplash() {

        if (encerrada) {
            return;
        }

        encerrada = true;

        if (timerTexto) {

            clearTimeout(timerTexto);

            timerTexto = null;
        }

        if (reduzirMovimento) {

            splash.style.display = "none";

            return;
        }

        splash.classList.add("splash-saindo");

        setTimeout(() => {

            splash.style.display = "none";

        }, tempoSaida);
    }


    // ======================================
    // ETAPAS DE CARREGAMENTO
    // ======================================

    function carregar() {

        if (indice >= etapas.length) {

            setTimeout(
                finalizarSplash,
                tempoFinal
            );

            return;
        }

        const etapa = etapas[indice];

        barra.style.width =
            etapa.progresso + "%";

        atualizarTexto(
            etapa.texto
        );

        indice++;

        setTimeout(
            carregar,
            tempoEntreEtapas
        );
    }


    // ======================================
    // ESTADO INICIAL
    // ======================================

    barra.style.width = "0%";

    texto.textContent =
        etapas[0].texto;

    setTimeout(
        carregar,
        reduzirMovimento ? 40 : 250
    );
}


// ======================================
// INTERFACE USADA PELO SISTEMA PRINCIPAL
// NÃO REMOVER
// ======================================

function inicializarSplash() {

    iniciarSplash();
}