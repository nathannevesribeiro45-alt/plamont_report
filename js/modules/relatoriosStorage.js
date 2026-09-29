/* =========================================================
   RELATÓRIOS STORAGE
   Persistência de relatórios por contrato + data + turno
========================================================= */

const RelatoriosStorage = {

    tabela: "relatorios_turnos",
    rpcSalvar: "salvar_aba_relatorio",

    // Estado técnico somente em memória.
    // NÃO faz parte do JSON operacional.
    estados: new Map(),


    /* =====================================================
       CLIENTE SUPABASE
    ===================================================== */

    cliente() {

        const cliente =
            window.Auth?.supabase ??
            window.supabaseClient ??
            null;

        if (!cliente) {
            throw new Error(
                "Cliente Supabase não disponível."
            );
        }

        return cliente;

    },


    /* =====================================================
       UTILITÁRIOS
    ===================================================== */

    clonar(valor) {

        if (valor === undefined) {
            return undefined;
        }

        if (typeof structuredClone === "function") {
            return structuredClone(valor);
        }

        return JSON.parse(
            JSON.stringify(valor)
        );

    },


    dataParaISO(valor) {

        const data =
            String(valor ?? "").trim();

        // Já está no padrão ISO
        if (
            /^\d{4}-\d{2}-\d{2}$/.test(data)
        ) {
            return data;
        }

        // Converte DD/MM/YYYY para YYYY-MM-DD
        const resultado =
            /^(\d{2})\/(\d{2})\/(\d{4})$/
                .exec(data);

        if (!resultado) {
            throw new Error(
                `Data de relatório inválida: ${data}`
            );
        }

        const [, dia, mes, ano] =
            resultado;

        return `${ano}-${mes}-${dia}`;

    },


    turnoNormalizado(valor) {

        const turno =
            String(valor ?? "").trim();

        if (!turno) {
            throw new Error(
                "Turno do relatório não informado."
            );
        }

        return turno;

    },


    identidade(contrato) {

        if (!contrato?.id) {
            throw new Error(
                "Contrato sem identificador."
            );
        }

        const data =
            this.dataParaISO(
                contrato.data
            );

        const turno =
            this.turnoNormalizado(
                contrato.turno
            );

        return {

            contratoId:
                String(contrato.id),

            data,

            turno,

            chave:
                `${contrato.id}` +
                `|${data}` +
                `|${turno}`

        };

    },


    obterEstado(contrato) {

        const { chave } =
            this.identidade(contrato);

        return (
            this.estados.get(chave) ??
            null
        );

    },


    /* =====================================================
       ESTADO INICIAL DO JSON SEED
    ===================================================== */

    criarEstadoSeed(contrato) {

        const identidade =
            this.identidade(contrato);

        const versoesAbas =
            new Map();

        for (
            const aba
            of contrato.abas ?? []
        ) {

            if (!aba?.id) {
                continue;
            }

            versoesAbas.set(
                String(aba.id),
                0
            );

        }

        const estado = {

            chave:
                identidade.chave,

            contratoId:
                identidade.contratoId,

            data:
                identidade.data,

            turno:
                identidade.turno,

            persistido: false,

            versaoGlobal: 0,

            versoesAbas

        };

        this.estados.set(
            identidade.chave,
            estado
        );

        return estado;

    },


    /* =====================================================
       REGISTRAR ESTADO VINDO DO SERVIDOR
    ===================================================== */

    registrarEstadoPersistido(
        contrato,
        registro
    ) {

        const identidade =
            this.identidade(contrato);

        const versaoGlobal =
            Number(
                registro?.versao ?? 0
            );

        const versoesServidor =
            registro?.versoes_abas &&
            typeof registro.versoes_abas === "object"
                ? registro.versoes_abas
                : {};

        const versoesAbas =
            new Map();

        for (
            const aba
            of contrato?.abas ?? []
        ) {

            if (!aba?.id) {
                continue;
            }

            const abaId =
                String(aba.id);

            const versaoAba =
                Number(
                    versoesServidor[abaId] ?? 0
                );

            versoesAbas.set(
                abaId,
                versaoAba
            );

        }

        const estado = {

            chave:
                identidade.chave,

            contratoId:
                identidade.contratoId,

            data:
                identidade.data,

            turno:
                identidade.turno,

            persistido: true,

            versaoGlobal,

            versoesAbas

        };

        this.estados.set(
            identidade.chave,
            estado
        );

        return estado;

    },


    /* =====================================================
       CARREGAMENTO
    ===================================================== */

    async carregar(contratoBase) {

        const identidade =
            this.identidade(
                contratoBase
            );

        const cliente =
            this.cliente();

        const {
            data,
            error
        } = await cliente
            .from(this.tabela)
            .select(`
                id,
                contrato_id,
                data_relatorio,
                turno,
                status,
                dados,
                schema_version,
                versao,
                versoes_abas,
                criado_por,
                criado_em,
                atualizado_por,
                atualizado_em,
                fechado_por,
                fechado_em
            `)
            .eq(
                "contrato_id",
                identidade.contratoId
            )
            .eq(
                "data_relatorio",
                identidade.data
            )
            .eq(
                "turno",
                identidade.turno
            )
            .maybeSingle();


        /* =================================================
           ERRO REAL DE CARREGAMENTO
        ================================================= */

        if (error) {

            const erro =
                new Error(
                    "Não foi possível carregar " +
                    "o relatório persistido."
                );

            erro.causa = error;

            erro.tipo =
                "erro_carregamento";

            throw erro;

        }


        /* =================================================
           NÃO EXISTE NO BANCO

           Continua utilizando o JSON original como seed.
        ================================================= */

        if (!data) {

            this.criarEstadoSeed(
                contratoBase
            );

            return {

                persistido: false,

                dados:
                    this.clonar(
                        contratoBase
                    ),

                versao: 0,

                registro: null

            };

        }


        /* =================================================
           VALIDAÇÃO DOS DADOS PERSISTIDOS
        ================================================= */

        if (
            !data.dados ||
            typeof data.dados !== "object" ||
            Array.isArray(data.dados)
        ) {

            throw new Error(
                "O relatório persistido " +
                "possui dados inválidos."
            );

        }


        /* =================================================
           REGISTRA VERSÕES E ESTADO DO SERVIDOR
        ================================================= */

        this.registrarEstadoPersistido(
            data.dados,
            data
        );


        return {

            persistido: true,

            dados:
                this.clonar(
                    data.dados
                ),

            versao:
                Number(
                    data.versao
                ),

            registro: data

        };

    },


    /* =====================================================
       SALVAMENTO DE UMA ABA
    ===================================================== */

    async salvarAba({
        contrato,
        aba
    }) {

        if (!contrato) {
            throw new Error(
                "Contrato não informado."
            );
        }

        if (!aba?.id) {
            throw new Error(
                "Aba não informada."
            );
        }


        const identidade =
            this.identidade(
                contrato
            );


        let estado =
            this.estados.get(
                identidade.chave
            );


        /* =================================================
           Se ainda não houver estado técnico registrado,
           considera o contrato atual como seed.
        ================================================= */

        if (!estado) {

            estado =
                this.criarEstadoSeed(
                    contrato
                );

        }


        const abaId =
            String(
                aba.id
            );


        /* =================================================
           A aba precisa possuir uma versão-base conhecida.
        ================================================= */

        if (
            !estado.versoesAbas.has(
                abaId
            )
        ) {

            throw new Error(
                `A aba "${abaId}" não possui ` +
                "versão-base conhecida."
            );

        }


        /* =================================================
           VERSÃO-BASE DA ABA

           IMPORTANTE:

           Não usar simplesmente a última versão global.

           Cada aba possui sua própria versão-base para que
           alterações em abas diferentes não criem conflitos
           desnecessários.
        ================================================= */

        const versaoBase =
            Number(
                estado
                    .versoesAbas
                    .get(abaId)
            );


        /* =================================================
           PARÂMETROS DA RPC
        ================================================= */

        const parametros = {

            p_contrato_id:
                identidade.contratoId,

            p_data_relatorio:
                identidade.data,

            p_turno:
                identidade.turno,

            p_aba_id:
                abaId,

            p_dados_aba:
                this.clonar(
                    aba
                ),

            /*
             * Primeiro salvamento:
             *
             * envia o contrato completo para criar
             * o relatório no banco.
             *
             * Salvamentos seguintes:
             *
             * contrato_base = null.
             */
            p_contrato_base:
                estado.persistido
                    ? null
                    : this.clonar(
                        contrato
                    ),

            p_versao_base:
                versaoBase

        };


        const cliente =
            this.cliente();


        /* =================================================
           CHAMADA DA RPC
        ================================================= */

        const {
            data,
            error
        } = await cliente.rpc(
            this.rpcSalvar,
            parametros
        );


        /* =================================================
           ERRO NO SERVIDOR
        ================================================= */

        if (error) {

            throw this.tratarErroSalvar(
                error
            );

        }


        /* =================================================
           A RPC pode retornar objeto ou array dependendo
           da serialização utilizada pelo PostgREST.
        ================================================= */

        const registro =
            Array.isArray(data)
                ? data[0]
                : data;


        if (
            !registro ||
            !registro.dados
        ) {

            throw new Error(
                "O servidor não retornou " +
                "o relatório salvo."
            );

        }


        const novaVersao =
            Number(
                registro.versao
            );


        /* =================================================
           O SERVIDOR É A FONTE DE VERDADE

           Atualizamos o estado técnico utilizando:

           - dados
           - versao
           - versoes_abas

           retornados pela RPC.
        ================================================= */

        this.registrarEstadoPersistido(
            registro.dados,
            registro
        );


        return {

            dados:
                this.clonar(
                    registro.dados
                ),

            versao:
                novaVersao,

            registro

        };

    },


    /* =====================================================
       TRATAMENTO DE ERROS
    ===================================================== */

    tratarErroSalvar(error) {

        const codigo =
            String(
                error?.code ?? ""
            );

        const mensagem =
            String(
                error?.message ?? ""
            );

        const detalhes =
            String(
                error?.details ?? ""
            );

        const hint =
            String(
                error?.hint ?? ""
            );

        const texto =
            `${mensagem} ${detalhes} ${hint}`;


        const erro =
            new Error(
                "Não foi possível salvar " +
                "as alterações."
            );

        erro.causa = error;
        erro.codigo = codigo;


        /* =================================================
           SEM PERMISSÃO
        ================================================= */

        if (
            codigo === "42501"
        ) {

            erro.tipo =
                "sem_permissao";

            erro.message =
                "Você não possui permissão " +
                "para salvar este relatório.";

            return erro;

        }


        /* =================================================
           CONFLITO NA MESMA ABA
        ================================================= */

        if (
            codigo === "40001" &&
            texto.includes(
                "relatorio_conflito_aba"
            )
        ) {

            erro.tipo =
                "conflito";

            erro.message =
                "Esta aba foi atualizada por " +
                "outro usuário enquanto você " +
                "estava editando.";

            return erro;

        }


        /* =================================================
           BASE NÃO EXISTE MAIS
        ================================================= */

        if (
            codigo === "40001" &&
            texto.includes(
                "relatorio_base_inexistente"
            )
        ) {

            erro.tipo =
                "base_inexistente";

            erro.message =
                "A versão-base deste relatório " +
                "não está mais disponível. " +
                "Recarregue os dados.";

            return erro;

        }


        /* =================================================
           PARÂMETROS / JSON INVÁLIDOS
        ================================================= */

        if (
            codigo === "22023"
        ) {

            erro.tipo =
                "dados_invalidos";

            erro.message =
                "O servidor recusou os dados " +
                "do relatório por inconsistência.";

            return erro;

        }


        /* =================================================
           CONCORRÊNCIA / SERIALIZAÇÃO / LOCK
        ================================================= */

        if (
            [
                "40001",
                "55P03",
                "40P01"
            ].includes(codigo)
        ) {

            erro.tipo =
                "concorrencia";

            erro.message =
                "O relatório foi atualizado " +
                "por outra sessão. " +
                "Tente novamente após " +
                "recarregar os dados.";

            return erro;

        }


        /* =================================================
           ERRO GENÉRICO
        ================================================= */

        erro.tipo =
            "erro_servidor";

        return erro;

    }

};


window.RelatoriosStorage =
    RelatoriosStorage;