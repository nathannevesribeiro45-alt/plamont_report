// ======================================
// STATE
// ======================================

const Dashboard = {
    contratos: {},
    contratoAtual: null,
    abaAtual: null,
    periodo: null,
    carregando: false
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

let carregamentoEmCurso = null;
let recargaEmCurso = null;
let recargaPendente = false;

// Um único verificador, inclusive após suspensão da aba/computador.
const PeriodoOperacional = {
    timer: null,
    verificacao: null,
    rascunhoAdiado: null,
    chave(periodo) { return periodo ? `${periodo.dataISO}|${periodo.turno}` : ""; },
    verificar(instante = new Date()) {
        if (this.verificacao) return this.verificacao;
        this.verificacao = this.conferir(instante).finally(() => { this.verificacao = null; });
        return this.verificacao;
    },
    async conferir(instante) {
        if (!sistemaInicializado || Dashboard.carregando || recargaEmCurso) return false;
        const periodo = obterPeriodoOperacional(instante);
        if (this.chave(periodo) === this.chave(Dashboard.periodo)) return false;
        const editor = window.EditorRelatorio;
        if (editor?.salvando || editor?.confirmacao) return false;
        if (editor?.ativo) {
            // Uma recusa não gera um novo diálogo a cada verificação.
            if (this.rascunhoAdiado === editor.rascunho) return false;
            if (!await editor.confirmarSaida({ mudancaPeriodo: true })) {
                this.rascunhoAdiado = editor.rascunho;
                return false;
            }
        }
        this.rascunhoAdiado = null;
        await atualizarContratosPorSessao(periodo);
        return true;
    },
    iniciar() {
        if (this.timer !== null) return;
        const conferir = () => this.verificar().catch(erro => console.error("Falha na passagem de turno:", erro));
        this.timer = setInterval(conferir, 30000);
        window.addEventListener("focus", conferir);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) conferir(); });
        conferir();
    }
};
window.PeriodoOperacional = PeriodoOperacional;


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
    nomeArquivo,
    periodo = obterPeriodoOperacional()
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

        // Identidade aplicada ANTES da consulta, sem modificar o arquivo seed.
        contratoBase.data = periodo.data;
        contratoBase.turno = periodo.turno;
        contratoBase.horario = periodo.horario;


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

function carregarTodosContratos(opcoes = {}) {
    if (carregamentoEmCurso) return carregamentoEmCurso;
    Dashboard.carregando = true;
    carregamentoEmCurso = Promise.resolve().then(() => carregarLoteContratos(opcoes)).finally(() => {
        Dashboard.carregando = false;
        carregamentoEmCurso = null;
    });
    return carregamentoEmCurso;
}

async function carregarLoteContratos({
    preservarNavegacao = false,
    periodo = obterPeriodoOperacional()
} = {}) {

    // Cada carregamento recebe uma geração.
    //
    // Se outro carregamento começar antes
    // deste terminar, os resultados antigos
    // serão descartados.
    const minhaGeracao =
        ++geracaoCarregamento;

    const sessaoDaCarga = obterIdentidadeSessao();


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
                arquivo,
                periodo
            );


        // ==================================
        // ESTA CARGA FICOU OBSOLETA
        // ==================================

        if (
            minhaGeracao !==
            geracaoCarregamento || sessaoDaCarga !== obterIdentidadeSessao()
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
        geracaoCarregamento || sessaoDaCarga !== obterIdentidadeSessao()
    ) {

        return false;

    }


    // ==================================
    // SUBSTITUIR ESTADO DO DASHBOARD
    // ==================================

    Dashboard.contratos =
        novosContratos;

    Dashboard.periodo = periodo;

    // Uma falha de leitura não pode deixar visível um relatório do turno antigo.
    for (const arquivo of ARQUIVOS_CONTRATOS) {
        const id = arquivo.replace(".json", "");
        if (novosContratos[id]) continue;
        const container = document.getElementById(`${id}-content`);
        if (container) container.textContent = "Não foi possível carregar este relatório. Recarregue a página para tentar novamente.";
        document.getElementById(`${id}-acoes`)?.replaceChildren();
        for (const campo of ["data", "turno", "horario"]) {
            const elemento = document.getElementById(`${id}-${campo}`);
            if (elemento) elemento.textContent = "—";
        }
    }


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


    window.DashboardResumo?.atualizar();
    return true;

}


// ======================================
// ATUALIZAR CONTRATOS APÓS
// LOGIN / LOGOUT / TROCA DE USUÁRIO
// ======================================

function atualizarContratosPorSessao(periodo) {
    recargaPendente = true;
    // Invalida imediatamente uma resposta antiga, mesmo se a sessão mudar
    // no meio de um lote. O próximo lote só começa quando o anterior acabar.
    geracaoCarregamento++;
    window.RelatoriosStorage?.limparEstados?.();
    if (recargaEmCurso) return recargaEmCurso;
    recargaEmCurso = (async () => {
        do {
            recargaPendente = false;
            if (carregamentoEmCurso) await carregamentoEmCurso;
            await recarregarInterface(periodo);
            periodo = undefined;
        } while (recargaPendente);
    })().finally(() => { recargaEmCurso = null; });
    return recargaEmCurso;
}

async function recarregarInterface(periodo) {

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
            preservarNavegacao: true,
            periodo
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

        await Render.inicializar?.();

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
                if (obterIdentidadeSessao() !== identidadeSessaoAtual) {
                    identidadeSessaoAtual = obterIdentidadeSessao();
                    recargaPendente = true;
                    geracaoCarregamento++;
                    window.RelatoriosStorage?.limparEstados?.();
                }
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

        configurarMudancaDeSessao();
        do {
            recargaPendente = false;
            window.RelatoriosStorage?.limparEstados?.();
            await carregarTodosContratos();
        } while (recargaPendente);


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

        await Render.inicializar();


        // ==================================
        // 9. SISTEMA PRONTO
        // ==================================

        sistemaInicializado =
            true;


        // ==================================
        // 10. ESCUTAR LOGIN / LOGOUT
        // ==================================

        if (recargaPendente) await atualizarContratosPorSessao();
        PeriodoOperacional.iniciar();

    }
);
