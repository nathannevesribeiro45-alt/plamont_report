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

        // ==================================
        // 1. CARREGAR JSON BASE
        // ==================================

        const resposta =
            await fetch(
                `contratos/${nomeArquivo}`
            );

        if (!resposta.ok) {

            throw new Error(
                `Erro ao carregar ${nomeArquivo}`
            );

        }

        const contratoBase =
            await resposta.json();


        // ==================================
        // 2. USUÁRIO NÃO AUTENTICADO
        //
        // O site continua público para
        // visualização através dos JSONs.
        // ==================================

        const usuarioAutenticado =
            !!window.Auth?.usuario?.id;


        if (!usuarioAutenticado) {

            return contratoBase;

        }


        // ==================================
        // 3. USUÁRIO AUTENTICADO
        //
        // Busca uma versão persistida.
        // ==================================

        if (!window.RelatoriosStorage) {

            throw new Error(
                "RelatoriosStorage não foi carregado."
            );

        }


        const resultado =
            await RelatoriosStorage.carregar(
                contratoBase
            );


        // ==================================
        // 4. RETORNAR ESTADO ATUAL
        //
        // Sem registro:
        // → JSON seed
        //
        // Com registro:
        // → JSONB do Supabase
        // ==================================

        return resultado.dados;


    } catch (erro) {

        console.error(
            `Erro ao carregar ${nomeArquivo}:`,
            erro
        );

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
        "os450.json",
        "os456.json"
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