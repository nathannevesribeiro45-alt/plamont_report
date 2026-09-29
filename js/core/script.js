// ======================================
// STATE
// ======================================

const Dashboard = {
    contratos: {},
    contratoAtual: null,
    abaAtual: null
};


// ======================================
// CONTRATOS DISPONÍVEIS
// ======================================

const ARQUIVOS_CONTRATOS = [
    "os440.json",
    "os441.json",
    "os442.json",
    "os450.json",
    "os456.json"
];


// ======================================
// CONTROLE DE CARREGAMENTO
// ======================================

let sistemaInicializado = false;

let geracaoCarregamento = 0;

let identidadeSessaoAtual = null;


// ======================================
// IDENTIDADE DA SESSÃO
// ======================================

function obterIdentidadeSessao() {

    if (!window.Auth?.estaLogado?.()) {
        return null;
    }

    return window.Auth.usuario?.id || null;

}


// ======================================
// CARREGAR UM CONTRATO
// ======================================

async function carregarContrato(nomeArquivo) {

    try {

        // ==================================
        // 1. GARANTIR AUTH RESOLVIDO
        // ==================================

        if (window.Auth?.inicializar) {
            await window.Auth.inicializar();
        }


        // ==================================
        // 2. CARREGAR JSON BASE
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
        // 3. USUÁRIO NÃO AUTENTICADO
        //
        // Visualização pública continua
        // utilizando somente o JSON.
        // ==================================

        if (!window.Auth?.estaLogado?.()) {

            return contratoBase;

        }


        // ==================================
        // 4. USUÁRIO AUTENTICADO
        //
        // Consulta a versão persistida.
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
        // 5. SERVIDOR É A FONTE DE VERDADE
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
// CARREGAR TODOS OS CONTRATOS
// ======================================

async function carregarTodosContratos({
    preservarNavegacao = false
} = {}) {

    const minhaGeracao =
        ++geracaoCarregamento;


    // ==================================
    // GUARDAR NAVEGAÇÃO ATUAL
    // ==================================

    const contratoAnteriorId =
        preservarNavegacao
            ? Dashboard.contratoAtual?.id
            : null;

    const abaAnteriorId =
        preservarNavegacao
            ? Dashboard.abaAtual?.id
            : null;


    // ==================================
    // NOVO ESTADO
    //
    // Não reutilizamos os contratos
    // anteriores para evitar manter
    // dados públicos após login ou
    // persistidos após logout.
    // ==================================

    const novosContratos = {};


    for (const arquivo of ARQUIVOS_CONTRATOS) {

        const contrato =
            await carregarContrato(
                arquivo
            );


        // Outro carregamento começou.
        // Este resultado ficou obsoleto.
        if (
            minhaGeracao !==
            geracaoCarregamento
        ) {

            return false;

        }


        if (!contrato) {

            console.error(
                `Contrato ${arquivo} não foi incluído no Dashboard.`
            );

            continue;

        }


        novosContratos[contrato.id] =
            contrato;

    }


    // ==================================
    // CONFIRMAR QUE AINDA É A CARGA ATUAL
    // ==================================

    if (
        minhaGeracao !==
        geracaoCarregamento
    ) {

        return false;

    }


    // ==================================
    // SUBSTITUIR ESTADO DO DASHBOARD
    // ==================================

    Dashboard.contratos =
        novosContratos;


    // ==================================
    // RESTAURAR CONTRATO ATUAL
    // ==================================

    const contratoRestaurado =
        contratoAnteriorId
            ? novosContratos[contratoAnteriorId]
            : null;


    Dashboard.contratoAtual =
        contratoRestaurado ||
        novosContratos.os440 ||
        Object.values(novosContratos)[0] ||
        null;


    // ==================================
    // RESTAURAR ABA ATUAL
    // ==================================

    if (
        Dashboard.contratoAtual &&
        abaAnteriorId
    ) {

        Dashboard.abaAtual =
            Dashboard.contratoAtual.abas
                ?.find(
                    aba =>
                        aba.id === abaAnteriorId
                ) ||
            null;

    } else {

        Dashboard.abaAtual = null;

    }


    return true;

}


// ======================================
// ATUALIZAR INTERFACE APÓS TROCA
// DE SESSÃO
// ======================================

async function atualizarContratosPorSessao() {

    // ==================================
    // INVALIDAR ESTADO TÉCNICO
    // ==================================

    window.RelatoriosStorage
        ?.limparEstados?.();


    const carregado =
        await carregarTodosContratos({
            preservarNavegacao: true
        });


    if (!carregado) {
        return;
    }


    // ==================================
    // RECONSTRUIR ÍNDICE DA BUSCA
    // ==================================

    if (
        typeof Busca !== "undefined"
    ) {

        Busca.construirIndice?.();

    }


    // ==================================
    // ATUALIZAR PÁGINA ATUAL
    // ==================================

    if (
        typeof Render !== "undefined"
    ) {

        Render.atualizar?.();

    }


    // ==================================
    // ATUALIZAR MAPA SE JÁ EXISTIR
    // ==================================

    if (
        typeof Mapa !== "undefined" &&
        Mapa.map &&
        Mapa.markersLayer
    ) {

        Mapa.renderFrentes(false);

    }

}


// ======================================
// OBSERVAR LOGIN / LOGOUT
// ======================================

function configurarMudancaDeSessao() {

    identidadeSessaoAtual =
        obterIdentidadeSessao();


    document.addEventListener(
        "plamont:auth-alterado",
        async evento => {

            if (!sistemaInicializado) {
                return;
            }


            const novaIdentidade =
                evento.detail?.logado
                    ? evento.detail?.usuario?.id || null
                    : null;


            // ==================================
            // IGNORAR EVENTOS DUPLICADOS
            //
            // Auth pode atualizar a interface
            // mais de uma vez para a mesma
            // sessão.
            // ==================================

            if (
                novaIdentidade ===
                identidadeSessaoAtual
            ) {

                return;

            }


            identidadeSessaoAtual =
                novaIdentidade;


            try {

                await atualizarContratosPorSessao();

            } catch (erro) {

                console.error(
                    "Erro ao atualizar contratos após mudança de sessão:",
                    erro
                );

            }

        }
    );

}


// ======================================
// INICIALIZAÇÃO DO SISTEMA
// ======================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        // ==================================
        // 1. PÁGINA INICIAL
        // ==================================

        const primeiroBotao =
            document.querySelector(
                ".menu-btn"
            );

        abrirPagina(
            "dashboard",
            primeiroBotao
        );


        // ==================================
        // 2. AGUARDAR AUTH
        // ==================================

        if (window.Auth?.inicializar) {

            await window.Auth.inicializar();

        }


        // ==================================
        // 3. LIMPAR ESTADO TÉCNICO
        // ==================================

        window.RelatoriosStorage
            ?.limparEstados?.();


        // ==================================
        // 4. CARREGAR CONTRATOS
        // ==================================

        await carregarTodosContratos();


        console.log(
            "Dashboard:",
            Dashboard
        );


        // ==================================
        // 5. SPLASH
        // ==================================

        inicializarSplash();


        // ==================================
        // 6. SIDEBAR
        // ==================================

        Sidebar.init();


        // ==================================
        // 7. BUSCA
        // ==================================

        Busca.init();


        // ==================================
        // 8. INTERFACE
        // ==================================

        Render.inicializar();


        // ==================================
        // 9. SISTEMA PRONTO
        // ==================================

        sistemaInicializado = true;


        // ==================================
        // 10. ESCUTAR LOGIN / LOGOUT
        // ==================================

        configurarMudancaDeSessao();

    }
);