/* editorRelatorio.js */

window.EditorRelatorio = {

    ativo: false,

    contratoId: null,

    abaId: null,

    usuarioId: null,

    original: null,

    rascunho: null,

    container: null,

    novosGrupos: new WeakSet(),

    novasOms: new WeakSet(),

    confirmacao: null,

    salvando:false,

    edicao: null,

    retomarAplicacao: null,

    controlesOriginais: new WeakMap(),

    get arquivosPendentes() { return AnexosOM.arquivosPendentes; },

    get editoresQuantidades() { return [EditorQLP, EditorHistograma, EditorAusencias, EditorMobilizacao]; },

    get editoresBlocos() { return [...this.editoresQuantidades, EditorRecursos]; },



    clonar(dados) {

        return typeof structuredClone === "function" ? structuredClone(dados) : JSON.parse(JSON.stringify(dados));

    },

    podeEditar() { return window.Auth?.pode?.("editar") === true; },

    sessaoDaEdicao() { return this.podeEditar() && this.usuarioId === window.Auth.usuario?.id; },

    podeAlterarRascunho() { return this.ativo && this.sessaoDaEdicao() && !this.salvando && !this.retomarAplicacao; },

    obterOriginal() { return this.original ? this.clonar(this.original) : null; },

    obterRascunho() { return this.rascunho ? this.clonar(this.rascunho) : null; },

    gerarPayload() {

        return this.ativo ? AnexosOM.garantirPayloadSerializavel({ contratoId: this.contratoId, abaId: this.abaId, dados: this.obterRascunho() }) : null;

    },

    deveEditarAba(aba) {

        return this.ativo && this.sessaoDaEdicao() && aba?.id === this.abaId && Dashboard.contratoAtual?.id === this.contratoId;

    },

    iniciar(aba = Dashboard.abaAtual) {

        if (!this.podeEditar() || !aba || this.ativo || this.salvando || Dashboard.carregando || !Dashboard.contratoAtual) return false;

        AnexosOM.iniciarSessao();

        this.ativo = true;

        this.contratoId = Dashboard.contratoAtual.id;

        this.abaId = aba.id;

        this.usuarioId = window.Auth.usuario?.id || null;

        // Snapshot do relatório carregado, não do relógio ou dos ponteiros da tela.

        const contrato = this.clonar(Dashboard.contratoAtual);

        const identidade = RelatoriosStorage.identidade(contrato);

        this.edicao = {

            contrato,

            contexto: RelatoriosStorage.contexto(),

            chave: identidade.chave,

            abaId: String(aba.id),

            versao: RelatoriosStorage.obterEstado(contrato)?.versoesAbas.get(String(aba.id)),

            destino: { contratoId: identidade.contratoId, dataRelatorio: identidade.data, turno: identidade.turno, abaId: String(aba.id) }

        };

        this.retomarAplicacao = null;

        this.original = this.clonar(aba);

        this.rascunho = this.clonar(aba);

        if (!Array.isArray(this.rascunho.atividades)) this.rascunho.atividades = [];

        this.editoresBlocos.forEach(editor => editor.iniciar(this.rascunho));

        this.novosGrupos = new WeakSet();

        this.novasOms = new WeakSet();

        Render.atualizar();

        this.container?.querySelector("[data-editor-qlp]")?.scrollIntoView({ block: "start", behavior: "smooth" });

        return true;

    },

    descartar() {

        this.editoresBlocos.forEach(editor => editor.encerrar());

        AnexosOM.cancelarExclusoesPendentes();

        AnexosOM.encerrarSessao();

        if (typeof Mapa !== "undefined") Mapa.cancelarSelecaoLocalizacao?.();

        this.confirmacao?.fechar(false);

        this.ativo = false;

        this.contratoId = this.abaId = this.usuarioId = null;

        this.original = this.rascunho = this.container = null;

        this.edicao = this.retomarAplicacao = null;

        this.controlesOriginais = new WeakMap();

        this.novosGrupos = new WeakSet();

        this.novasOms = new WeakSet();

    },

    cancelar() {

        if (this.salvando) return false;

        if (this.retomarAplicacao) { this.mostrarMensagem("Há uma tentativa pendente de confirmação ou limpeza. Clique em Aplicar alterações para verificar novamente antes de sair."); return false; }

        this.descartar();

        Render.atualizar();

    },

    temAlteracoes() {

        if (!this.ativo) return false;

        const editaveis = dados => ({ atividades: dados.atividades || [], ...Object.fromEntries(this.editoresBlocos.map(editor => [editor.campo, editor.comparavel(dados[editor.campo])])) });

        return this.editoresBlocos.some(editor => editor.temPendencias()) || JSON.stringify(editaveis(this.original)) !== JSON.stringify(editaveis(this.rascunho));

    },

    deveConfirmarNavegacao(pagina, aba) {

        return this.ativo && (pagina !== this.contratoId || (aba && aba !== this.abaId));

    },

    async confirmarSaida({ mudancaPeriodo = false } = {}) {

        if (this.salvando) { this.mostrarMensagem("Aguarde a confirmação do salvamento."); return false; }

        if (this.retomarAplicacao) { this.mostrarMensagem("Verifique a tentativa pendente em Aplicar alterações antes de sair. Nenhum arquivo será excluído sem confirmação."); return false; }

        if ((mudancaPeriodo || this.temAlteracoes()) && !await this.confirmar(

            mudancaPeriodo ? "O período operacional mudou." : "Existem alterações não aplicadas.",

            mudancaPeriodo ? "Carregar o novo turno descarta o rascunho atual. Se continuar editando, o salvamento permanecerá na data e no turno anteriores." : "Deseja descartá-las e sair do editor?",

            mudancaPeriodo ? "Descartar e carregar novo turno" : "Descartar alterações", "Continuar editando")) return false;

        this.descartar();

        return true;

    },

    confirmar(titulo, mensagem, aceitar, recusar = "Cancelar") {

        if (this.confirmacao) return this.confirmacao.promessa;

        const dialog = document.createElement("dialog");

        dialog.className = "editor-confirmacao";

        dialog.setAttribute("aria-labelledby", "editor-confirmacao-titulo");

        dialog.innerHTML = `<h2 id="editor-confirmacao-titulo">${this.escapar(titulo)}</h2><p>${this.escapar(mensagem)}</p>

            <div class="editor-acoes"><button type="button" data-recusar autofocus>${this.escapar(recusar)}</button><button type="button" class="editor-perigo" data-aceitar>${this.escapar(aceitar)}</button></div>`;

        const foco = document.activeElement;

        let resolver;

        const promessa = new Promise(resolve => { resolver = resolve; });

        const fechar = resultado => {

            dialog.close(); dialog.remove(); this.confirmacao = null;

            if (foco?.isConnected) foco.focus({ preventScroll: true });

            resolver(resultado);

        };

        this.confirmacao = { promessa, fechar };

        dialog.querySelector("[data-recusar]").onclick = () => fechar(false);

        dialog.querySelector("[data-aceitar]").onclick = () => fechar(true);

        dialog.addEventListener("cancel", evento => { evento.preventDefault(); fechar(false); });

        document.body.append(dialog); dialog.showModal();

        return promessa;

    },

    async aplicar() {

        if (!this.ativo || !this.sessaoDaEdicao() || this.salvando || this.confirmacao) return false;

        let executar = this.retomarAplicacao;

        if (!executar) {

            const erros = this.validar();

            if (erros.length) { this.mostrarMensagem(erros[0]); return false; }

            let payload, novos;

            try {

                AnexosOM.garantirPayloadSerializavel(this.rascunho);

                payload = this.gerarPayload();

                novos = AnexosOM.novosParaUpload(payload);

            } catch {

                this.mostrarMensagem("Não foi possível preparar os dados. Revise os anexos e os campos do relatório.");

                return false;

            }

            const edicao = this.edicao, rascunho = this.rascunho, usuarioId = this.usuarioId;

            // Somente esta tentativa possui estas listas; nunca vão ao JSON operacional.

            const uploadsDaTentativa = [];

            const exclusoesDaTentativa = AnexosOM.listarExclusoesPendentes().map(item => ({ ...item, removido: false }));

            const mesmaSessao = () => this.ativo && this.rascunho === rascunho &&

                this.usuarioId === usuarioId && this.sessaoDaEdicao();

            const conferirEdicao = () => {

                if (!mesmaSessao()) throw new Error("Sessão de edição alterada.");

                RelatoriosStorage.conferirContexto(edicao.contexto, { exigirLogin: true });

            };

            const compensar = async () => {

                let completo = true;

                for (const upload of uploadsDaTentativa) {

                    if (upload.removido) continue;

                    if (!mesmaSessao()) { completo = false; continue; }

                    try {

                        await AnexosStorage.removerUploadProprioSemReferencia(upload.storagePath);

                        upload.removido = true;

                        // Apenas a cópia enviada recebeu caminhos; o rascunho/File original

                        // permanece intacto. Nunca limpar metadados de anexos anteriores.

                        upload.metadado.storagePath = null;

                    } catch { completo = false; }

                }

                return completo;

            };

            const limparExclusoesPersistidas = async () => {

                let completo = true;

                for (const exclusao of exclusoesDaTentativa) {

                    if (exclusao.removido) continue;

                    if (!mesmaSessao()) { completo = false; continue; }

                    try {

                        await AnexosStorage.removerUploadProprioSemReferencia(exclusao.storagePath);

                        exclusao.removido = true;

                        AnexosOM.confirmarExclusao(exclusao.id);

                    } catch (erro) {

                        completo = false;

                        console.error("[EditorRelatorio] Não foi possível remover anexo persistido após salvar o relatório:", {

                            id: exclusao.id,

                            storagePath: exclusao.storagePath,

                            code: erro?.code ?? null,

                            message: erro?.message ?? String(erro)

                        });

                    }

                }

                return completo;

            };

            const concluir = async resultado => {

                if (!mesmaSessao()) return false;

                RelatoriosStorage.validarRegistro(resultado.registro, edicao.contrato);

                RelatoriosStorage.registrarEstadoPersistido(resultado.dados, resultado.registro);

                this.retomarAplicacao = null;

                if (!await limparExclusoesPersistidas()) {

                    this.retomarAplicacao = async () => {

                        if (!mesmaSessao()) return false;

                        if (!await limparExclusoesPersistidas()) {

                            this.mostrarMensagem("O relatório já foi salvo sem o anexo, mas a exclusão do arquivo no Storage ainda não foi confirmada. Clique em Aplicar alterações para tentar somente a limpeza novamente.");

                            return false;

                        }

                        this.retomarAplicacao = null;

                        this.finalizarAplicacao(payload, resultado);

                        return true;

                    };

                    this.mostrarMensagem("O relatório foi salvo sem o anexo, mas a exclusão do arquivo no Storage ainda não foi confirmada. O arquivo não será referenciado pelo relatório. Clique em Aplicar alterações para tentar somente a limpeza novamente.");

                    return false;

                }

                this.finalizarAplicacao(payload, resultado);

                return true;

            };

            const reconciliar = async () => {

                this.mostrarMensagem("Não foi possível confirmar o salvamento. Verificando o relatório antes de qualquer limpeza.");

                try {

                    if (!mesmaSessao()) throw new Error("Sessão alterada.");

                    // Não altera a versão-base enquanto o resultado estiver indefinido.

                    const resultado = await RelatoriosStorage.carregar(edicao.contrato, { registrarEstado: false });

                    const aba = resultado.dados?.abas?.find(item => item.id === payload.abaId);

                    const anexos = (aba?.atividades || []).flatMap(g => (g.oms || []).flatMap(om => AnexosOM.listar(om)));

                    const vinculado = uploadsDaTentativa.length

                        ? uploadsDaTentativa.every(upload => anexos.some(a => a.id === upload.anexoId && a.storagePath === upload.storagePath))

                        : JSON.stringify(aba) === JSON.stringify(payload.dados);

                    if (mesmaSessao() && resultado.persistido && vinculado &&

                        resultado.registro.versoes_abas[payload.abaId] > edicao.versao) {

                        return concluir(resultado);

                    }

                } catch { /* Sem prova de commit ou rollback: preservar objetos. */ }

                this.mostrarMensagem("O salvamento ainda não pôde ser confirmado. Os arquivos foram preservados. Clique em Aplicar alterações para verificar novamente, sem reenviar; se persistir, recarregue e confira o relatório antes de editar.");

                return false;

            };

            const limparRejeicao = async () => {

                if (!await compensar()) {

                    this.retomarAplicacao = limparRejeicao;

                    this.mostrarMensagem("O relatório não foi salvo, mas a limpeza de alguns arquivos não foi confirmada. O rascunho e os PDFs foram preservados. Clique em Aplicar alterações para tentar somente a limpeza novamente.");

                    return false;

                }

                this.retomarAplicacao = null;

                this.mostrarMensagem("Limpeza confirmada. O rascunho e os PDFs foram preservados; revise a mensagem anterior e aplique novamente quando estiver pronto.");

                return false;

            };

            executar = async () => {

                let rpcIniciada = false, confirmado = false, uploadIndefinido = false;

                try {

                    conferirEdicao();

                    for (const { metadado, arquivo } of novos) {

                        conferirEdicao();

                        const destino = AnexosStorage.criarDestino(edicao.destino, usuarioId);

                        let enviado;

                        try { enviado = await AnexosStorage.enviar(arquivo, destino); }

                        catch (erro) {

                            if (erro?.uploadConfirmado && erro.storagePath === destino.storagePath) {

                                uploadsDaTentativa.push({ anexoId: metadado.id, storagePath: erro.storagePath, metadado });

                            } else if (erro?.resultadoIncerto) { uploadIndefinido = true; }

                            throw erro;

                        }

                        if (!enviado?.storagePath || enviado.storagePath !== destino.storagePath) {

                            uploadIndefinido = true;

                            throw new Error("Resposta do upload inválida.");

                        }

                        uploadsDaTentativa.push({ anexoId: metadado.id, storagePath: enviado.storagePath, metadado });

                        Object.assign(metadado, { storagePath: enviado.storagePath, mimeType: enviado.mimeType, tamanho: enviado.tamanho });

                        conferirEdicao();

                    }

                    AnexosOM.garantirPayloadSerializavel(payload);

                    conferirEdicao();

                    rpcIniciada = true;

                    const resultado = await RelatoriosStorage.salvarAba({ contrato: edicao.contrato, aba: payload.dados, edicao });

                    // A partir daqui, falhas de renderização NUNCA justificam compensação.

                    confirmado = true;

                    if (!mesmaSessao()) {

                        this.retomarAplicacao = reconciliar;

                        return false;

                    }

                    return concluir(resultado);

                } catch (erro) {

                    if (confirmado) {

                        if (this.ativo) this.retomarAplicacao = reconciliar;

                        this.mostrarMensagem("O servidor confirmou o salvamento, mas a tela não pôde ser atualizada. Recarregue o relatório. Os arquivos não foram removidos.");

                        return false;

                    }

                    const rejeitado = ["rejeitado", "nao_enviado"].includes(erro?.resultadoSalvamento);

                    if (rpcIniciada && !rejeitado) {

                        this.retomarAplicacao = reconciliar;

                        return reconciliar();

                    }

                    const limpo = await compensar();

                    if (!limpo) this.retomarAplicacao = limparRejeicao;

                    if (uploadIndefinido) {

                        // Nenhuma RPC foi chamada, mas o próprio upload pode estar em voo.

                        // Não apagar nem iniciar tentativas adicionais sobre um envio incerto.

                        this.retomarAplicacao = async () => {

                            await compensar();

                            this.mostrarMensagem("O envio de um PDF ficou sem confirmação; nenhuma alteração do relatório foi enviada. Recarregue e confira o relatório antes de tentar novamente. Os arquivos não confirmados não foram excluídos.");

                            return false;

                        };

                    }

                    const mensagens = {

                        conflito: "Esta aba foi atualizada por outro usuário enquanto você estava editando. Recarregue e revise o conflito antes de salvar.",

                        sem_permissao: "Sua sessão não possui permissão para salvar este relatório.",

                        dados_invalidos: "O servidor rejeitou os dados do relatório. Revise os campos.",

                        sessao_alterada: "A sessão mudou. Recarregue o relatório antes de continuar.",

                        base_inexistente: "A versão-base deste relatório não está mais disponível. Recarregue os dados.",

                        concorrencia: "O relatório foi atualizado por outra sessão. Tente novamente após recarregar os dados."

                    };

                    const mensagem = rpcIniciada

                        ? (mensagens[erro.tipo] || "O servidor não aceitou o salvamento. Recarregue e revise o relatório.")

                        : "Não foi possível enviar os anexos ou validar a sessão. Nenhuma alteração do relatório foi salva.";

                    this.mostrarMensagem(mensagem + " O rascunho e os PDFs continuam no editor." +

                        (this.retomarAplicacao ? " Há uma verificação pendente; clique em Aplicar alterações para conferir, sem reenviar." : ""));

                    return false;

                }

            };

        }

        this.salvando = true;

        if (typeof Mapa !== "undefined") Mapa.cancelarSelecaoLocalizacao?.();

        AnexosOM.fecharDialogo();

        const controles = [...(this.container?.querySelectorAll("input, select, textarea, button") || [])]

            .map(elemento => {

                if (!this.controlesOriginais.has(elemento)) this.controlesOriginais.set(elemento, elemento.disabled);

                return { elemento, disabled: this.controlesOriginais.get(elemento) };

            });

        controles.forEach(({ elemento }) => { elemento.disabled = true; });

        const botoes = [...(this.container?.querySelectorAll('[data-acao-editor="aplicar"]') || [])];

        botoes.forEach(botao => { botao.textContent = "Salvando..."; });

        try { return await executar(); }

        finally {

            this.salvando = false;

            controles.forEach(({ elemento, disabled }) => {

                elemento.disabled = this.ativo && (!this.sessaoDaEdicao() || !!this.retomarAplicacao)

                    ? !(this.sessaoDaEdicao() && elemento.dataset.acaoEditor === "aplicar")

                    : disabled;

                if (!this.retomarAplicacao) this.controlesOriginais.delete(elemento);

            });

            botoes.forEach(botao => { botao.textContent = "Aplicar alterações"; });

        }

    },

    finalizarAplicacao(payload, resultado) {

        Dashboard.contratos[payload.contratoId] = resultado.dados;

        Dashboard.contratoAtual = resultado.dados;

        Dashboard.abaAtual = resultado.dados.abas.find(aba => aba.id === payload.abaId);

        window.DashboardResumo?.atualizar();

        AnexosOM.aplicar(Dashboard.contratos);

        this.descartar();

        Render.atualizar();

        if (typeof Busca !== "undefined") Busca.construirIndice();

        if (typeof Mapa !== "undefined" && Mapa.map && Mapa.markersLayer) Mapa.renderFrentes(false);

        const aviso = document.createElement("p");

        aviso.className = "editor-aviso-aplicado"; aviso.setAttribute("role", "status");

        aviso.textContent = "Alterações salvas com sucesso.";

        document.getElementById(`${payload.contratoId}-content`)?.prepend(aviso);

    },

    renderAtividades(aba, container) {

        if (!this.deveEditarAba(aba)) return;

        this.container = container;

        const secao = document.createElement("section");

        secao.className = "bloco editor-relatorio";

        secao.dataset.editor = "atividades";

        secao.innerHTML = `<header class="editor-cabecalho"><div><span class="editor-etiqueta">Modo de edição</span><h2>Atividades do relatório</h2>

            <p>As alterações e os PDFs novos serão enviados ao clicar em Aplicar alterações. PDFs persistidos podem ser visualizados diretamente pelo relatório.</p></div>

            <div class="editor-acoes"><button type="button" data-acao-editor="cancelar">Cancelar</button><button type="button" class="editor-primario" data-acao-editor="aplicar">Aplicar alterações</button></div></header>

            <p data-editor-erro class="editor-erro" role="alert" hidden></p>

            <div class="editor-grupos">${this.rascunho.atividades.length ? this.rascunho.atividades.map((g, i) => this.htmlGrupo(g, i)).join("") : '<p class="editor-vazio">Nenhuma equipe cadastrada. Adicione uma equipe ou líder para começar.</p>'}</div>

            <button type="button" class="editor-adicionar" data-acao-editor="adicionar-grupo">+ Adicionar equipe / líder</button>`;

        const anterior = container.querySelector("[data-editor]");

        if (anterior) anterior.replaceWith(secao); else container.append(secao);

        secao.addEventListener("input", e => this.atualizarCampo(e));

        secao.addEventListener("change", e => this.atualizarCampo(e));

        secao.addEventListener("click", e => this.executarAcao(e));

        if (this.salvando || this.retomarAplicacao) {

            container.querySelectorAll("input, select, textarea, button").forEach(elemento => {

                if (!this.controlesOriginais.has(elemento)) this.controlesOriginais.set(elemento, elemento.disabled);

                elemento.disabled = this.salvando || elemento.dataset.acaoEditor !== "aplicar";

            });

        }

    },

    renderizarSomenteAtividades() {

        if (this.container && this.ativo) this.renderAtividades(Dashboard.abaAtual, this.container);

    },

    htmlGrupo(grupo, g) {

        const oms = Array.isArray(grupo.oms) ? grupo.oms : [];

        return `<article class="editor-grupo"><header class="editor-grupo-titulo"><h3>${this.escapar(grupo.lider || "Líder não informado")}</h3>

            <button type="button" class="editor-remover" data-acao-editor="remover-grupo" data-grupo="${g}">Remover equipe</button></header>

            <div class="editor-campos-grupo">

                ${this.campo("Líder", "lider", grupo.lider, g, null, !this.novosGrupos.has(grupo))}

                ${this.campo("Telefone", "telefone", grupo.telefone, g)}

                ${this.campo("Equipe", "equipe", grupo.equipe, g)}

                ${this.campo("Técnico de Segurança", "tecnicoSeguranca", grupo.tecnicoSeguranca, g)}

            </div><div class="editor-oms">${oms.map((om, o) => this.htmlOM(om, g, o)).join("")}

                <button type="button" class="editor-adicionar" data-acao-editor="adicionar-om" data-grupo="${g}">+ Adicionar OM</button>

            </div></article>`;

    },

    htmlOM(om, g, o) {

        const nova = this.novasOms.has(om);

        const status = om.status || "";

        // Reutiliza as categorias do mapa e mantém o valor original, inclusive

        // variantes reconhecidas pela função normalizarStatusOM.

        const opcoes = [...new Set([status, ...Object.values(Mapa.statusConfig).map(item => item.label), "Postergada"])];

        return `<section class="editor-om" data-editor-om="${g}-${o}"><header class="editor-om-titulo"><h4>OM ${this.escapar(om.numero || "nova")}</h4>

            <button type="button" class="editor-remover" data-acao-editor="remover-om" data-grupo="${g}" data-om="${o}">Remover atividade</button></header>

            <div class="editor-campos-om">

                ${this.campo("Número" + (nova ? " *" : ""), "numero", om.numero, g, o, !nova)}

                ${this.campo("Frente" + (nova ? " *" : ""), "frente", om.frente, g, o, !nova)}

                <label>Status<select data-campo="status" data-grupo="${g}" data-om="${o}">${opcoes.map(valor => `<option value="${this.escapar(valor)}" ${valor === status ? "selected" : ""}>${this.escapar(valor || "Sem status (planejada)")}</option>`).join("")}</select></label>

                <label class="editor-descricao">Descrição${nova ? " *" : ""}<textarea rows="3" data-campo="descricao" data-grupo="${g}" data-om="${o}">${this.escapar(om.descricao)}</textarea></label>

            </div><div class="editor-localizacao">

                <div class="editor-coordenadas">${this.campo("Latitude", "latitude", om.latitude, g, o)}${this.campo("Longitude", "longitude", om.longitude, g, o)}</div>

                <div class="editor-acoes-localizacao"><button type="button" data-acao-editor="selecionar-localizacao" data-grupo="${g}" data-om="${o}">Selecionar no mapa</button>

                <button type="button" data-acao-editor="limpar-localizacao" data-grupo="${g}" data-om="${o}">Limpar localização</button></div>

                <p class="editor-ajuda">Use ponto ou vírgula decimal. As duas coordenadas podem ficar vazias.</p>

            </div><p class="editor-ajuda">${nova ? "* Número, frente e descrição são obrigatórios." : "Líder, número e frente protegidos para preservar fotos e referências."}</p>

            ${AnexosOM.render(om, { editavel: true, grupo: g, indice: o })}</section>`;

    },

    campo(rotulo, nome, valor, grupo, om = null, readonly = false) {

        const tipo = nome === "telefone" ? "tel" : "text";

        const decimal = nome === "latitude" || nome === "longitude";

        return `<label>${rotulo}<input type="${tipo}" ${decimal ? 'inputmode="decimal"' : ""} data-campo="${nome}" data-grupo="${grupo}" ${om === null ? "" : `data-om="${om}"`} value="${this.escapar(valor)}" ${readonly ? "readonly" : ""}></label>`;

    },

    atualizarCampo(evento) {

        if (!this.podeAlterarRascunho()) return;

        const campo = evento.target.closest("[data-campo]");

        if (!campo || campo.readOnly) return;

        const grupo = this.rascunho.atividades[Number(campo.dataset.grupo)];

        const om = campo.dataset.om === undefined ? null : grupo?.oms?.[Number(campo.dataset.om)];

        const nome = campo.dataset.campo;

        const permitidos = om ? ["descricao", "status", "latitude", "longitude", ...(this.novasOms.has(om) ? ["numero", "frente"] : [])]

            : ["telefone", "equipe", "tecnicoSeguranca", ...(this.novosGrupos.has(grupo) ? ["lider"] : [])];

        if (!permitidos.includes(nome)) return;

        const alvo = om || grupo;

        if (!alvo) return;

        alvo[nome] = campo.value;

        const mensagem = this.container.querySelector("[data-editor-erro]");

        if (mensagem) mensagem.hidden = true;

    },

    executarAcao(evento) {

        const botao = evento.target.closest("[data-acao-editor]");

        if (!botao || !this.ativo || !this.sessaoDaEdicao() || this.salvando) return;

        if (this.retomarAplicacao && !["aplicar", "cancelar"].includes(botao.dataset.acaoEditor)) return;

        const g = Number(botao.dataset.grupo), o = Number(botao.dataset.om);

        const acoes = {

            cancelar: () => this.cancelar(), aplicar: () => this.aplicar(),

            "adicionar-grupo": () => this.adicionarGrupo(), "remover-grupo": () => this.removerGrupo(g),

            "adicionar-om": () => this.adicionarOM(g), "remover-om": () => this.removerOM(g, o),

            "selecionar-localizacao": () => this.iniciarSelecaoLocalizacao(g, o),

            "limpar-localizacao": () => this.limparLocalizacao(g, o)

        };

        acoes[botao.dataset.acaoEditor]?.();

    },

    adicionarGrupo() {

        if (!this.podeAlterarRascunho()) return;

        const grupo = { lider: "", telefone: "", equipe: "", tecnicoSeguranca: "", oms: [] };

        this.novosGrupos.add(grupo); this.rascunho.atividades.push(grupo);

        this.renderizarSomenteAtividades();

        this.container?.querySelector(`[data-campo="lider"][data-grupo="${this.rascunho.atividades.length - 1}"]`)?.focus();

    },

    adicionarOM(g) {

        const grupo = this.rascunho?.atividades[g];

        if (!grupo || !this.podeAlterarRascunho()) return;

        const om = { numero: "", frente: "", descricao: "", status: "Em andamento", latitude: "", longitude: "" };

        if (!Array.isArray(grupo.oms)) grupo.oms = [];

        this.novasOms.add(om); grupo.oms.push(om);

        this.renderizarSomenteAtividades();

        this.container?.querySelector(`[data-campo="numero"][data-grupo="${g}"][data-om="${grupo.oms.length - 1}"]`)?.focus();

    },

    async removerOM(g, o) {

        const grupo = this.rascunho?.atividades[g], om = grupo?.oms?.[o];

        if (!om || !this.podeAlterarRascunho()) return;

        if (!this.novasOms.has(om) && !await this.confirmar("Remover esta atividade do relatório?", "A remoção afeta somente o rascunho. As fotos e os arquivos são preservados.", "Remover atividade")) return;

        if (!this.podeAlterarRascunho()) return;

        grupo.oms.splice(grupo.oms.indexOf(om), 1);

        AnexosOM.reconciliarRascunho(this.rascunho);

        this.renderizarSomenteAtividades();

    },

    async removerGrupo(g) {

        const grupo = this.rascunho?.atividades[g];

        if (!grupo || !this.podeAlterarRascunho()) return;

        if (!await this.confirmar("Remover equipe / líder?", `Este grupo e suas ${grupo.oms?.length || 0} OMs sairão somente do rascunho.`, "Remover equipe")) return;

        if (!this.podeAlterarRascunho()) return;

        this.rascunho.atividades.splice(this.rascunho.atividades.indexOf(grupo), 1);

        AnexosOM.reconciliarRascunho(this.rascunho);

        this.renderizarSomenteAtividades();

    },

    iniciarSelecaoLocalizacao(g, o) {

        const om = this.rascunho?.atividades[g]?.oms?.[o];

        if (!om || !this.podeAlterarRascunho()) return;

        try {

            Mapa.iniciarSelecaoLocalizacao({

                contratoId: this.contratoId, titulo: `Localização da OM ${om.numero || "nova"}`,

                latitudeAtual: om.latitude, longitudeAtual: om.longitude, status: normalizarStatusOM(om.status),

                aoSelecionar: (lat, lng) => {

                    if (this.rascunho?.atividades[g]?.oms?.[o] === om) this.definirLocalizacao(g, o, lat, lng);

                }

            });

        } catch (erro) { this.mostrarMensagem("Não foi possível abrir o mapa. Verifique sua conexão ou preencha as coordenadas manualmente."); }

    },

    definirLocalizacao(g, o, latitude, longitude) {

        const om = this.rascunho?.atividades[g]?.oms?.[o];

        if (!om || !this.podeAlterarRascunho()) return false;

        const ponto = validarCoordenadasOM(latitude, longitude);

        if (!ponto.valida) return false;



        om.latitude = ponto.vazia ? "" : String(ponto.lat);

        om.longitude = ponto.vazia ? "" : String(ponto.lng);

        // Mantém foco/rolagem e o restante do formulário intacto.

        for (const nome of ["latitude", "longitude"]) {

            const input = this.container?.querySelector(`[data-campo="${nome}"][data-grupo="${g}"][data-om="${o}"]`);

            if (input) input.value = om[nome];

        }

        return true;

    },

    limparLocalizacao(g, o) { this.definirLocalizacao(g, o, "", ""); },

    validar() {

        const erros = this.editoresBlocos.flatMap(editor => editor.validar()), chaves = new Map();

        for (const [g, grupo] of (this.rascunho?.atividades || []).entries()) {

            for (const om of grupo.oms || []) {

                const nova = this.novasOms.has(om);

                if (nova && [om.numero, om.frente, om.descricao].some(v => !String(v ?? "").trim())) erros.push(`Grupo ${g + 1}: preencha número, frente e descrição da nova OM.`);

                const coordenadas = validarCoordenadasOM(om.latitude, om.longitude);

                if (!coordenadas.valida) erros.push(`OM ${om.numero || "nova"}: ${coordenadas.mensagem}`);

                const chave = JSON.stringify([grupo.lider || "", om.frente || "", om.numero || ""]);

                if (chaves.has(chave) && (nova || this.novasOms.has(chaves.get(chave)))) erros.push(`A OM ${om.numero || "nova"} repete a identificação de outra atividade deste líder e frente.`);

                chaves.set(chave, om);

            }

        }

        return erros;

    },

    mostrarMensagem(texto) {

        const editor = this.editoresBlocos.find(item => texto.startsWith(`${item.titulo} —`));

        if (editor) { editor.mostrarMensagem(texto); return; }

        const aviso = this.container?.querySelector("[data-editor-erro]");

        if (!aviso) return;

        aviso.textContent = texto; aviso.hidden = false;

        aviso.scrollIntoView({ block: "nearest", behavior: "smooth" });

    },

    escapar(valor) {

        return escaparHtml(valor);

    }

};



document.addEventListener("plamont:auth-alterado", () => {

    const editor = window.EditorRelatorio;

    if (editor.ativo && (!editor.podeEditar() || editor.usuarioId !== (window.Auth.usuario?.id || null))) {

        // Preservar a tentativa em voo; jamais compensar com a identidade de outro

        // usuário. A tela não renderiza o rascunho para uma sessão diferente.

        if (editor.salvando || editor.retomarAplicacao) return;

        editor.descartar();

        if (Dashboard.abaAtual) Render.atualizar();

    }

});

window.addEventListener("beforeunload", evento => {

    if (window.EditorRelatorio.temAlteracoes() || window.EditorRelatorio.retomarAplicacao) {

        evento.preventDefault();

        evento.returnValue = "";

    }

});