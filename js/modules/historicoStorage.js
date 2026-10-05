/* Histórico Operacional — consultas isoladas, sem cache ou escrita.
 * Carregar este arquivo após auth.js e aguardar PlamontAuth.pronto.
 * Não inicializa autenticação nem integra a interface nesta etapa.
 */
window.HistoricoStorage = (() => {
    "use strict";

    const TABELA = "relatorios_turnos";
    const COLUNAS = "id, contrato_id, data_relatorio, turno, atualizado_em, versao, status, schema_version";
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const objeto = valor => valor !== null && typeof valor === "object" && !Array.isArray(valor);

    class ErroHistorico extends Error {
        constructor(tipo, mensagem) {
            super(mensagem);
            this.name = "ErroHistorico";
            this.tipo = tipo;
            this.code = tipo;
        }
    }

    function falhar(tipo, mensagem) {
        throw new ErroHistorico(tipo, mensagem);
    }

    function tratarErro(erro) {
        if (erro instanceof ErroHistorico) return erro;
        const codigo = String(erro?.code || "");
        if (codigo === "42501" || erro?.status === 403) {
            return new ErroHistorico("sem_permissao", "Você não possui acesso ao histórico operacional.");
        }
        if (["PGRST301", "PGRST303", "sessao_expirada"].includes(codigo) || erro?.status === 401) {
            return new ErroHistorico("sessao_expirada", "Sua sessão expirou. Entre novamente para consultar o histórico.");
        }
        // Não propagar detalhes internos, contatos ou mensagens brutas do serviço.
        return new ErroHistorico("erro_consulta", "Não foi possível consultar o histórico. Tente novamente.");
    }

    function texto(valor) {
        if (typeof valor !== "string" || !valor.trim()) {
            falhar("parametros_invalidos", "Informe uma identidade ou filtro válido para o histórico.");
        }
        return valor.trim();
    }

    function dataISO(valor) {
        const entrada = texto(valor);
        const iso = entrada.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$2-$1");
        const instante = new Date(`${iso}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(instante.getTime()) ||
            instante.toISOString().slice(0, 10) !== iso) {
            falhar("parametros_invalidos", "Informe uma data operacional válida (DD/MM/AAAA ou AAAA-MM-DD).");
        }
        return iso;
    }

    function filtros(parametros) {
        if (!objeto(parametros)) falhar("parametros_invalidos", "Informe os filtros do histórico em um objeto.");
        const resultado = {};
        if (parametros.contratoId !== undefined) resultado.contratoId = texto(parametros.contratoId);
        if (parametros.data !== undefined) resultado.data = dataISO(parametros.data);
        if (parametros.turno !== undefined) resultado.turno = texto(parametros.turno);
        return resultado;
    }

    function conferirAcesso(auth) {
        if (!auth?.sessao?.user?.id || auth.usuario?.id !== auth.sessao.user.id ||
            !auth.estaLogado?.()) {
            falhar("sessao_expirada", "Entre na plataforma para consultar o histórico operacional.");
        }
        if (!auth.pode?.("visualizar")) {
            falhar("sem_permissao", "Você não possui acesso ao histórico operacional.");
        }
        if (!auth.supabase?.from) {
            falhar("servico_indisponivel", "O serviço de histórico ainda não está disponível.");
        }
    }

    async function contexto() {
        const auth = window.PlamontAuth;
        if (!auth) falhar("servico_indisponivel", "A autenticação da plataforma ainda não está disponível.");
        // Reutilizar a inicialização existente, sem criar cliente/sessão paralelos.
        await auth.pronto;
        conferirAcesso(auth);
        return { auth, cliente: auth.supabase, usuario: auth.usuario, id: auth.usuario.id };
    }

    function conferirContexto(ctx) {
        conferirAcesso(window.PlamontAuth);
        if (window.PlamontAuth !== ctx.auth || ctx.auth.supabase !== ctx.cliente ||
            ctx.auth.usuario !== ctx.usuario || ctx.auth.usuario.id !== ctx.id) {
            falhar("sessao_alterada", "A sessão mudou durante a consulta. Consulte o histórico novamente.");
        }
    }

    function aplicarFiltros(consulta, identidade) {
        if (identidade.id !== undefined) consulta = consulta.eq("id", identidade.id);
        if (identidade.contratoId !== undefined) consulta = consulta.eq("contrato_id", identidade.contratoId);
        if (identidade.data !== undefined) consulta = consulta.eq("data_relatorio", identidade.data);
        if (identidade.turno !== undefined) consulta = consulta.eq("turno", identidade.turno);
        return consulta;
    }

    function validarMetadados(registro, esperado) {
        const invalido = () => falhar("dados_invalidos", "O histórico retornou um registro inconsistente.");
        if (!objeto(registro) || !UUID.test(registro.id) ||
            typeof registro.contrato_id !== "string" || !registro.contrato_id.trim() ||
            registro.contrato_id !== registro.contrato_id.trim() ||
            typeof registro.turno !== "string" || !registro.turno.trim() || registro.turno !== registro.turno.trim() ||
            !Number.isInteger(registro.versao) || registro.versao < 1 ||
            !Number.isInteger(registro.schema_version) || registro.schema_version < 1 ||
            !["aberto", "fechado"].includes(registro.status) ||
            typeof registro.atualizado_em !== "string" || !Number.isFinite(Date.parse(registro.atualizado_em))) invalido();
        try {
            if (dataISO(registro.data_relatorio) !== registro.data_relatorio) invalido();
        } catch (_) { invalido(); }
        if ((esperado.id !== undefined && registro.id.toLowerCase() !== esperado.id) ||
            (esperado.contratoId !== undefined && registro.contrato_id !== esperado.contratoId) ||
            (esperado.data !== undefined && registro.data_relatorio !== esperado.data) ||
            (esperado.turno !== undefined && registro.turno !== esperado.turno)) invalido();
        return {
            id: registro.id,
            contratoId: registro.contrato_id,
            data: registro.data_relatorio, // ISO; não depende do período operacional atual.
            turno: registro.turno, // Texto completo: por exemplo, "Dia A", não apenas "A".
            atualizadoEm: registro.atualizado_em,
            versao: registro.versao, // Contador de gravações, NÃO identificador de snapshot.
            status: registro.status,
            schemaVersion: registro.schema_version
        };
    }

    function validarDados(registro) {
        const invalido = () => falhar("dados_invalidos", "O relatório histórico possui estrutura inválida.");
        const dados = registro.dados;
        if (!objeto(dados) || dados.id !== registro.contrato_id || dados.turno !== registro.turno ||
            !Array.isArray(dados.abas) || !dados.abas.length || !objeto(registro.versoes_abas)) invalido();
        try { if (dataISO(dados.data) !== registro.data_relatorio) invalido(); } catch (_) { invalido(); }
        const ids = new Set();
        for (const aba of dados.abas) {
            if (!objeto(aba) || typeof aba.id !== "string" || !aba.id.trim() || ids.has(aba.id) ||
                !Object.hasOwn(registro.versoes_abas, aba.id) ||
                !Number.isInteger(registro.versoes_abas[aba.id]) || registro.versoes_abas[aba.id] < 0 ||
                registro.versoes_abas[aba.id] > registro.versao) invalido();
            ids.add(aba.id);
            for (const campo of ["qlp", "histograma", "ausencias", "mobilizacao"]) {
                if (aba[campo] !== undefined && !objeto(aba[campo])) invalido();
            }
            for (const campo of ["recursos", "atividades"]) {
                if (aba[campo] !== undefined && (!Array.isArray(aba[campo]) || !aba[campo].every(objeto))) invalido();
            }
            for (const atividade of aba.atividades || []) {
                if (atividade.oms !== undefined && (!Array.isArray(atividade.oms) || !atividade.oms.every(objeto))) invalido();
            }
        }
        // Preservar campos legados e futuros sem normalizar/mudar o JSON original.
        // A cópia JSON não compartilha objetos com o SDK nem com o estado atual.
        try {
            return JSON.parse(JSON.stringify({ dados, versoesAbas: registro.versoes_abas }));
        } catch (_) { invalido(); }
    }

    /** Lista uma página de metadados; sem filtros lista todos os contratos autorizados.
     * limite: 1..100 (padrão 50); deslocamento: inteiro >= 0 (padrão 0).
     * Retorna [] quando não há linhas. Não busca JSONs nem faz fallback ao seed.
     */
    async function listar(parametros = {}) {
        try {
            const identidade = filtros(parametros);
            const limite = parametros.limite === undefined ? 50 : parametros.limite;
            const deslocamento = parametros.deslocamento === undefined ? 0 : parametros.deslocamento;
            if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100 ||
                !Number.isSafeInteger(deslocamento) || deslocamento < 0 ||
                !Number.isSafeInteger(deslocamento + limite)) {
                falhar("parametros_invalidos", "Informe uma página válida do histórico (1 a 100 registros).");
            }
            const ctx = await contexto();
            conferirContexto(ctx);
            const consulta = aplicarFiltros(ctx.cliente.from(TABELA).select(COLUNAS), identidade)
                .order("data_relatorio", { ascending: false })
                .order("contrato_id", { ascending: true })
                .order("turno", { ascending: true })
                .order("id", { ascending: true })
                .range(deslocamento, deslocamento + limite - 1);
            const { data, error } = await consulta;
            conferirContexto(ctx);
            if (error) throw error;
            if (!Array.isArray(data)) falhar("dados_invalidos", "O histórico retornou uma lista inválida.");
            return data.map(registro => validarMetadados(registro, identidade));
        } catch (erro) { throw tratarErro(erro); }
    }

    /** Carrega por UUID ou pela combinação completa contratoId + data + turno.
     * Aceita também o metadado retornado por listar (confere UUID e combinação).
     * Retorna { ...metadados, dados, versoesAbas } ou null se não encontrado.
     * Não consulta uma versão anterior da mesma linha: não existem snapshots.
     */
    async function carregar(parametros) {
        try {
            const identidade = filtros(parametros);
            if (parametros.id !== undefined) {
                const id = texto(parametros.id);
                if (!UUID.test(id)) falhar("parametros_invalidos", "Informe um identificador válido do relatório histórico.");
                identidade.id = id.toLowerCase();
            }
            const quantidade = [identidade.contratoId, identidade.data, identidade.turno].filter(valor => valor !== undefined).length;
            if ((quantidade !== 0 && quantidade !== 3) || (identidade.id === undefined && quantidade !== 3)) {
                falhar("parametros_invalidos", "Informe o ID ou a combinação completa de contrato, data e turno.");
            }
            const ctx = await contexto();
            conferirContexto(ctx);
            const { data, error } = await aplicarFiltros(
                ctx.cliente.from(TABELA).select(`${COLUNAS}, dados, versoes_abas`), identidade
            ).maybeSingle();
            conferirContexto(ctx);
            if (error) throw error;
            if (data === null) return null;
            const metadados = validarMetadados(data, identidade);
            if (data.schema_version !== 1) {
                falhar("schema_nao_suportado", "Este relatório usa um formato ainda não suportado pelo histórico.");
            }
            return { ...metadados, ...validarDados(data) };
        } catch (erro) { throw tratarErro(erro); }
    }

    return Object.freeze({ listar, carregar });
})();
