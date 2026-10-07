/* ==========================================
   PLAMONT REPORT CENTER
   Splash Screen v2.0
========================================== */

document.addEventListener("DOMContentLoaded", () => {

    const splash = document.querySelector(".splash-screen");
    const container = document.querySelector(".splash-container");
    const barra = document.querySelector(".loading-fill");
    const texto = document.querySelector(".loading-text");

    if (!splash || !barra || !texto) {
        return;
    }

    /* ======================================
       CONFIGURAÇÃO
    ====================================== */

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
        ? 180
        : 430;

    const tempoSaida = reduzirMovimento
        ? 150
        : 550;

    let indice = 0;
    let encerrada = false;


    /* ======================================
       ALTERAR TEXTO
    ====================================== */

    function atualizarTexto(novoTexto) {

        if (reduzirMovimento) {
            texto.textContent = novoTexto;
            return;
        }

        texto.style.opacity = "0";

        setTimeout(() => {

            texto.textContent = novoTexto;
            texto.style.opacity = "1";

        }, 120);

    }


    /* ======================================
       FINALIZAR SPLASH
    ====================================== */

    async function finalizarSplash() {

        if (encerrada) {
            return;
        }

        encerrada = true;

        /* Sem animação longa para usuários
           que preferem movimento reduzido */

        if (reduzirMovimento) {

            splash.style.display = "none";
            document.body.style.overflow = "";

            return;

        }

        const animacaoSplash = splash.animate(
            [
                {
                    opacity: 1
                },
                {
                    opacity: 0
                }
            ],
            {
                duration: tempoSaida,
                easing: "ease",
                fill: "forwards"
            }
        );


        /* Movimento extremamente sutil
           do conteúdo durante a saída */

        if (container) {

            container.animate(
                [
                    {
                        opacity: 1,
                        transform: "translateY(0) scale(1)"
                    },
                    {
                        opacity: 0,
                        transform: "translateY(-6px) scale(1.01)"
                    }
                ],
                {
                    duration: tempoSaida,
                    easing: "cubic-bezier(.22,.61,.36,1)",
                    fill: "forwards"
                }
            );

        }


        try {

            await animacaoSplash.finished;

        } catch {

            /* Se a animação for interrompida,
               a splash ainda precisa desaparecer */

        }


        splash.style.display = "none";

        /* O CSS bloqueia o scroll enquanto
           a splash está aberta */

        document.body.style.overflow = "";

    }


    /* ======================================
       CARREGAMENTO VISUAL
    ====================================== */

    function carregarEtapa() {

        if (indice >= etapas.length) {

            setTimeout(
                finalizarSplash,
                reduzirMovimento ? 80 : 260
            );

            return;
        }


        const etapa = etapas[indice];


        /* Atualiza progresso */

        barra.style.width =
            `${etapa.progresso}%`;


        /* Atualiza mensagem */

        atualizarTexto(
            etapa.texto
        );


        indice++;


        setTimeout(
            carregarEtapa,
            tempoEntreEtapas
        );

    }


    /* ======================================
       INICIALIZAÇÃO
    ====================================== */

    barra.style.width = "0%";

    texto.textContent =
        etapas[0].texto;


    setTimeout(
        carregarEtapa,
        reduzirMovimento ? 50 : 250
    );

});