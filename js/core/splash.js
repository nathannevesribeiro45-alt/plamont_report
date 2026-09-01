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
// INICIALIZAÇÃO
// ======================================

function inicializarSplash() {
    iniciarSplash();
}