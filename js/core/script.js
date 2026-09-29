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

    return (
        window.Auth.usuario?.id ||
        null
    );

}


// ======================================
// CARREGAR UM CONTRATO
// ======================================

async function carregarContrato(
    nomeArquivo
) {

    try {

        // ==================================
        // 1. GARANTIR CLIENTE SUPABASE
        //
        // Auth.inicializar() também cria
        // o cliente usado pelo
        // RelatoriosStorage.
        //
        // Não significa exigir login.
        // ==================================

        if (
            window.Auth?.inicializar
        ) {

            await window.Auth.inicializar();

        }


        // ==================================
        // 2. CARREGAR JSON BASE
        //
        // O JSON agora funciona somente
        // como seed inicial.
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
        // 3. RELATÓRIOS STORAGE
        //
        // A versão persistida é pública.
        // Portanto esta consulta acontece
        // com ou sem login.
        // ==================================

        if (
            !window.RelatoriosStorage
        ) {

            throw new Error(
                "RelatoriosStorage não foi carregado."
            );

        }


        const resultado =
            await RelatoriosStorage.carregar(
                contratoBase
            );


        // ==================================
        // 4. FONTE DE VERDADE
        //
        // Se existe no Supabase:
        // → versão persistida
        //
        // Se não existe:
        // → JSON seed
        //
        // Essa decisão é feita dentro do
        // RelatoriosStorage.
        // ==================================

        return resultado.dados;


    } catch (erro) {

        console.error(
            `Erro ao carregar ${nomeArquivo}:`,
            erro
        );


        // IMPORTANTE:
        //
        // Não retornamos automaticamente o
        // JSON em caso de falha no Supabase.
        //
        // Se o banco estiver indisponível,
        // não sabemos se existe uma versão
        // persistida mais recente.
        return null;

    }

}


// ======================================
// CARREGAR TODOS OS CONTRATOS
// ======================================

async function carregarTodosContratos({
    preservarNavegacao = false
} = {}) {

    // Cada carregamento recebe uma geração.
    //
    // Se outro carregamento começar antes
    // deste terminar, os resultados antigos
    // serão descartados.
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
    // ==================================

    const novosContratos = {};


    for (
        const arquivo
        of ARQUIVOS_CONTRATOS
    ) {

        const contrato =
            await carregarContrato(
                arquivo
            );


        // ==================================
        // ESTA CARGA FICOU OBSOLETA
        // ==================================

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


        novosContratos[
            contrato.id
        ] = contrato;

    }


    // ==================================
    // CONFIRMAR GERAÇÃO
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
            ? novosContratos[
                contratoAnteriorId
            ]
            : null;


    Dashboard.contratoAtual =
        contratoRestaurado ||
        novosContratos.os440 ||
        Object.values(
            novosContratos
        )[0] ||
        null;


    // ==================================
    // RESTAURAR ABA ATUAL
    // ==================================

    if (
        Dashboard.contratoAtual &&
        abaAnteriorId
    ) {

        Dashboard.abaAtual =
            Dashboard.contratoAtual
                .abas
                ?.find(
                    aba =>
                        aba.id ===
                        abaAnteriorId
                ) ||
            null;

    } else {

        Dashboard.abaAtual =
            null;

    }


    return true;

}


// ======================================
// ATUALIZAR CONTRATOS APÓS
// LOGIN / LOGOUT / TROCA DE USUÁRIO
// ======================================

async function atualizarContratosPorSessao() {

    // ==================================
    // INVALIDAR ESTADO TÉCNICO
    //
    // Os dados continuam compartilhados,
    // mas uma nova sessão deve trabalhar
    // sobre versões-base recém-carregadas.
    // ==================================

    window.RelatoriosStorage
        ?.limparEstados?.();


    // ==================================
    // RECARREGAR FONTE PERSISTIDA
    // ==================================

    const carregado =
        await carregarTodosContratos({
            preservarNavegacao: true
        });


    if (!carregado) {
        return;
    }


    // ==================================
    // RECONSTRUIR BUSCA
    // ==================================

    if (
        typeof Busca !== "undefined"
    ) {

        Busca.construirIndice?.();

    }


    // ==================================
    // ATUALIZAR INTERFACE
    // ==================================

    if (
        typeof Render !== "undefined"
    ) {

        Render.atualizar?.();

    }


    // ==================================
    // ATUALIZAR MAPA
    // ==================================

    if (
        typeof Mapa !== "undefined" &&
        Mapa.map &&
        Mapa.markersLayer
    ) {

        Mapa.renderFrentes(
            false
        );

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

            // Durante a inicialização,
            // o Auth também dispara eventos.
            //
            // A primeira carga já está cuidando
            // deles, então ignoramos enquanto
            // o sistema não estiver pronto.
            if (
                !sistemaInicializado
            ) {

                return;

            }


            const novaIdentidade =
                evento.detail?.logado
                    ? (
                        evento.detail
                            ?.usuario
                            ?.id ||
                        null
                    )
                    : null;


            // ==================================
            // IGNORAR EVENTOS DUPLICADOS
            //
            // O Auth pode atualizar a interface
            // mais de uma vez durante a mesma
            // transição.
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
        // 2. INICIALIZAR AUTH / SUPABASE
        //
        // Mesmo visitante anônimo precisa
        // do cliente Supabase para ler os
        // relatórios persistidos.
        // ==================================

        if (
            window.Auth?.inicializar
        ) {

            await window.Auth.inicializar();

        }


        // ==================================
        // 3. LIMPAR ESTADO TÉCNICO
        // ==================================

        window.RelatoriosStorage
            ?.limparEstados?.();


        // ==================================
        // 4. CARREGAR CONTRATOS
        //
        // Sempre consulta o Supabase.
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

        sistemaInicializado =
            true;


        // ==================================
        // 10. ESCUTAR LOGIN / LOGOUT
        // ==================================

        configurarMudancaDeSessao();

    }
);