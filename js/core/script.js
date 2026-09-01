// ======================================
// STATE
// ======================================

const Dashboard = {
    contratos: {},
    contratoAtual: null,
    abaAtual: null
};

// ======================================
// CARREGAR CONTRATOS
// ======================================

async function carregarContrato(nomeArquivo) {

    try {

        const resposta = await fetch(`contratos/${nomeArquivo}`);

        if (!resposta.ok) {
            throw new Error(`Erro ao carregar ${nomeArquivo}`);
        }

        return await resposta.json();

    } catch (erro) {

        console.error(`Erro ao carregar ${nomeArquivo}:`, erro);
        return null;

    }

}

// ======================================
// INICIALIZAÇÃO DO SISTEMA
// ======================================

document.addEventListener("DOMContentLoaded", async () => {

    // Página inicial
    const primeiroBotao = document.querySelector(".menu-btn");
    abrirPagina("dashboard", primeiroBotao);

    // Lista de contratos
    const arquivos = [
        "os440.json",
        "os441.json",
        "os442.json",
        "os450.json"
    ];

    // Carrega todos os contratos
    for (const arquivo of arquivos) {

        const contrato = await carregarContrato(arquivo);

        if (!contrato) continue;

        Dashboard.contratos[contrato.id] = contrato;

    }

    // Contrato inicial
    Dashboard.contratoAtual = Dashboard.contratos.os440;

    console.log("Dashboard:", Dashboard);

    // Splash
    inicializarSplash();

    //Sidebar
    Sidebar.init();

    // Busca inteligente da sidebar
    Busca.init();

    // Interface
    Render.inicializar();

    

});