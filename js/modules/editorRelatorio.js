/* ==========================================================
   EDITOR DE RELATÓRIO — V1 (atividades em memória)
   Mantém original e rascunho separados para viabilizar
   rascunhos persistidos, publicação e histórico no futuro.
   ========================================================== */

const EditorRelatorio = {

    ativo: false,
    contratoId: null,
    abaId: null,
    original: null,
    rascunho: null,
    sujo: false,
    container: null,
    novosGrupos: null,
    novasOms: null,
    escutandoAuth: false,

    iniciarSistema() {

        if (this.escutandoAuth) return;

        document.addEventListener("plamont:auth-alterado", () => {
            if (this.ativo && !this.podeEditar()) {
                this.descartar({ renderizar: true });
            }
        });

        this.escutandoAuth = true;

    },

    podeEditar() {
        return window.Auth?.pode?.("editar") === true;
    },

    deveEditarAba(aba) {
        return Boolean(
            this.ativo &&
            this.podeEditar() &&
            aba?.id === this.abaId &&
            Dashboard?.contratoAtual?.id === this.contratoId
        );
    },

    iniciar(aba = Dashboard?.abaAtual) {

        if (!this.podeEditar() || !aba || !Dashboard?.contratoAtual) return false;

        this.ativo = true;
        this.contratoId = Dashboard.contratoAtual.id;
        this.abaId = aba.id;
        this.original = this.clonar(aba);
        this.rascunho = this.clonar(aba);
        this.rascunho.atividades = Array.isArray(this.rascunho.atividades)
            ? this.rascunho.atividades
            : [];
        this.sujo = false;
        this.novosGrupos = new WeakSet();
        this.novasOms = new WeakSet();

        Render.atualizar();
        return true;

    },

    cancelar() {
        if (!this.ativo) return;
        this.descartar({ renderizar: true });
    },

    descartar({ renderizar = false } = {}) {

        this.ativo = false;
        this.contratoId = null;
        this.abaId = null;
        this.original = null;
        this.rascunho = null;
        this.sujo = false;
        this.container = null;
        this.novosGrupos = null;
        this.novasOms = null;

        if (renderizar && Dashboard?.abaAtual) {
            Render.atualizar();
        }

    },

    confirmarTrocaAba(idAba) {
        if (!this.ativo || idAba === this.abaId) return false;
        return this.confirmarDescarte();
    },

    confirmarSaidaDePagina(idPagina) {
        if (!this.ativo || idPagina === this.contratoId) return false;
        return this.confirmarDescarte();
    },

    confirmarDescarte() {

        if (!this.sujo) {
            this.descartar();
            return false;
        }

        const descartar = window.confirm(
            "Existem alterações não aplicadas.\n\n" +
            "OK: descartar alterações\n" +
            "Cancelar: continuar editando"
        );

        if (!descartar) return true;

        this.descartar();
        return false;

    },

    obterOriginal() {
        return this.original ? this.clonar(this.original) : null;
    },

    obterRascunho() {
        return this.rascunho ? this.clonar(this.rascunho) : null;
    },

    gerarPayload() {

        if (!this.ativo || !this.rascunho) return null;

        return {
            contratoId: this.contratoId,
            abaId: this.abaId,
            dados: this.clonar(this.rascunho)
        };

    },

    aplicar() {

        if (!this.ativo || !this.podeEditar()) {
            this.descartar({ renderizar: true });
            return false;
        }

        const erros = this.validar();

        if (erros.length) {
            this.mostrarMensagem(erros[0], "erro");
            return false;
        }

        const payload = this.gerarPayload();
        const contrato = Dashboard?.contratos?.[payload?.contratoId];
        const abaAtual = contrato?.abas?.find(aba => aba.id === payload?.abaId);

        if (!abaAtual) {
            this.mostrarMensagem("A aba em edição não está mais disponível.", "erro");
            return false;
        }

        // Atualiza a referência em memória mantendo campos desconhecidos
        // presentes no JSON. Nenhum arquivo JSON é escrito nesta V1.
        Object.assign(abaAtual, this.clonar(payload.dados));
        Dashboard.abaAtual = abaAtual;

        this.descartar();
        Render.atualizar();
        this.atualizarMapa();

        return true;

    },

    atualizarMapa() {

        if (
            typeof Mapa !== "undefined" &&
            Mapa.contratoAtivo === Dashboard?.contratoAtual?.id &&
            Mapa.map &&
            Mapa.markersLayer
        ) {
            Mapa.renderFrentes(false);
        }

    },

    renderizarAtividades(aba, container) {

        if (!this.deveEditarAba(aba) || !container || !this.rascunho) return;

        this.container = container;

        const secao = document.createElement("section");
        secao.className = "bloco card-atividades editor-relatorio-atividades";
        secao.dataset.editorRelatorio = "atividades";
        secao.innerHTML = `
            <div class="editor-relatorio-cabecalho">
                <div>
                    <span class="editor-relatorio-etiqueta">Modo de edição</span>
                    <h2>Atividades do relatório</h2>
                    <p>As alterações ficam neste rascunho até você aplicá-las.</p>
                </div>
                <div class="editor-relatorio-acoes">
                    <button class="editor-relatorio-btn editor-relatorio-btn-secundario" type="button" data-editor-acao="cancelar">Cancelar</button>
                    <button class="editor-relatorio-btn editor-relatorio-btn-primario" type="button" data-editor-acao="aplicar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
                        Aplicar alterações
                    </button>
                </div>
            </div>
            <div class="editor-relatorio-mensagem" data-editor-mensagem hidden role="alert"></div>
            <div class="editor-relatorio-grupos">${this.htmlGrupos()}</div>
            <button class="editor-relatorio-adicionar-grupo" type="button" data-editor-acao="adicionar-grupo">
                <span aria-hidden="true">+</span> Adicionar equipe / líder
            </button>
        `;

        const anterior = container.querySelector("[data-editor-relatorio='atividades']");

        if (anterior) {
            anterior.replaceWith(secao);
        } else {
            container.appendChild(secao);
        }

        secao.addEventListener("input", evento => this.atualizarCampo(evento));
        secao.addEventListener("change", evento => this.atualizarCampo(evento));
        secao.addEventListener("click", evento => this.executarAcao(evento));

    },

    htmlGrupos() {

        const grupos = this.rascunho?.atividades || [];

        if (!grupos.length) {
            return `<div class="editor-relatorio-vazio">Nenhuma equipe cadastrada neste rascunho. Adicione uma equipe ou líder para começar.</div>`;
        }

        return grupos.map((grupo, indiceGrupo) => this.htmlGrupo(grupo, indiceGrupo)).join("");

    },

    htmlGrupo(grupo, indiceGrupo) {

        const grupoNovo = this.ehNovoGrupo(grupo);
        const oms = Array.isArray(grupo.oms) ? grupo.oms : [];
        const lider = grupo.lider || "";

        return `
            <article class="editor-relatorio-grupo" data-editor-grupo="${indiceGrupo}">
                <div class="editor-relatorio-grupo-topo">
                    <div>
                        <span>Equipe / líder</span>
                        <strong>${this.escapar(lider || "Líder não informado")}</strong>
                    </div>
                    <button class="editor-relatorio-link-perigo" type="button" data-editor-acao="remover-grupo" data-grupo="${indiceGrupo}">Remover equipe</button>
                </div>
                <div class="editor-relatorio-campos-grupo">
                    ${this.campoTexto("Líder", "lider", lider, { grupo: indiceGrupo, somenteLeitura: !grupoNovo })}
                    ${this.campoTexto("Telefone", "telefone", grupo.telefone || "", { grupo: indiceGrupo, tipo: "tel" })}
                    ${this.campoTexto("Equipe", "equipe", grupo.equipe || "", { grupo: indiceGrupo })}
                    ${this.campoTexto("Técnico de Segurança", "tecnicoSeguranca", grupo.tecnicoSeguranca || "", { grupo: indiceGrupo })}
                </div>
                <div class="editor-relatorio-oms">
                    <div class="editor-relatorio-subtitulo"><strong>Atividades / OMs</strong><span>${oms.length} ${oms.length === 1 ? "OM" : "OMs"}</span></div>
                    ${oms.length ? oms.map((om, indiceOm) => this.htmlOm(om, indiceGrupo, indiceOm)).join("") : '<div class="editor-relatorio-sem-om">Nenhuma OM cadastrada para esta equipe.</div>'}
                    <button class="editor-relatorio-adicionar-om" type="button" data-editor-acao="adicionar-om" data-grupo="${indiceGrupo}"><span aria-hidden="true">+</span> Adicionar OM</button>
                </div>
            </article>
        `;

    },

    htmlOm(om, indiceGrupo, indiceOm) {

        const omNova = this.ehNovaOm(om);

        return `
            <section class="editor-relatorio-om" data-editor-om="${indiceOm}">
                <div class="editor-relatorio-om-topo">
                    <strong>OM ${this.escapar(om.numero || "nova")}</strong>
                    <button class="editor-relatorio-link-perigo" type="button" data-editor-acao="remover-om" data-grupo="${indiceGrupo}" data-om="${indiceOm}">Remover atividade</button>
                </div>
                <div class="editor-relatorio-campos-om">
                    ${this.campoTexto("Número", "numero", om.numero || "", { grupo: indiceGrupo, om: indiceOm, somenteLeitura: !omNova, obrigatorio: omNova })}
                    ${this.campoTexto("Frente", "frente", om.frente || "", { grupo: indiceGrupo, om: indiceOm, somenteLeitura: !omNova, obrigatorio: omNova })}
                    ${this.campoStatus(om, indiceGrupo, indiceOm)}
                    ${this.campoDescricao(om, indiceGrupo, indiceOm)}
                </div>
                ${omNova ? '<p class="editor-relatorio-ajuda">Número, frente e descrição são obrigatórios para uma nova OM.</p>' : '<p class="editor-relatorio-ajuda">Número e frente desta OM existente permanecem protegidos para preservar fotos e referências.</p>'}
            </section>
        `;

    },

    campoTexto(rotulo, campo, valor, { grupo, om = null, tipo = "text", somenteLeitura = false, obrigatorio = false } = {}) {

        const escopo = om === null ? "grupo" : "om";
        const dados = `data-editor-campo="${campo}" data-editor-escopo="${escopo}" data-grupo="${grupo}"${om === null ? "" : ` data-om="${om}"`}`;

        return `
            <label class="editor-relatorio-campo">
                <span>${rotulo}${obrigatorio ? " *" : ""}</span>
                <input type="${tipo}" value="${this.escaparAtributo(valor)}" ${dados} ${somenteLeitura ? "readonly" : ""}>
            </label>
        `;

    },

    campoStatus(om, indiceGrupo, indiceOm) {

        const statusAtual = om.status || this.statusPadrao();
        const opcoes = this.opcoesStatus(statusAtual);

        return `
            <label class="editor-relatorio-campo">
                <span>Status</span>
                <select data-editor-campo="status" data-editor-escopo="om" data-grupo="${indiceGrupo}" data-om="${indiceOm}">
                    ${opcoes.map(status => `<option value="${this.escaparAtributo(status)}" ${status === statusAtual ? "selected" : ""}>${this.escapar(status)}</option>`).join("")}
                </select>
            </label>
        `;

    },

    campoDescricao(om, indiceGrupo, indiceOm) {
        return `
            <label class="editor-relatorio-campo editor-relatorio-campo-descricao">
                <span>Descrição${this.ehNovaOm(om) ? " *" : ""}</span>
                <textarea rows="3" data-editor-campo="descricao" data-editor-escopo="om" data-grupo="${indiceGrupo}" data-om="${indiceOm}">${this.escapar(om.descricao || "")}</textarea>
            </label>
        `;
    },

    atualizarCampo(evento) {

        const campo = evento.target.closest("[data-editor-campo]");
        if (!campo || !this.ativo) return;

        const alvo = this.obterAlvo(campo.dataset);
        if (!alvo) return;

        alvo[campo.dataset.editorCampo] = campo.value;
        this.sujo = true;
        this.esconderMensagem();

    },

    executarAcao(evento) {

        const botao = evento.target.closest("button[data-editor-acao]");
        if (!botao) return;

        const acao = botao.dataset.editorAcao;
        const grupo = Number(botao.dataset.grupo);
        const om = Number(botao.dataset.om);

        if (acao === "cancelar") this.cancelar();
        if (acao === "aplicar") this.aplicar();
        if (acao === "adicionar-grupo") this.adicionarGrupo();
        if (acao === "adicionar-om") this.adicionarOm(grupo);
        if (acao === "remover-grupo") this.removerGrupo(grupo);
        if (acao === "remover-om") this.removerOm(grupo, om);

    },

    obterAlvo(dados) {

        const grupo = this.rascunho?.atividades?.[Number(dados.grupo)];
        if (!grupo) return null;

        if (dados.editorEscopo === "grupo") return grupo;
        return grupo.oms?.[Number(dados.om)] || null;

    },

    adicionarGrupo() {

        const grupo = {
            lider: "",
            telefone: "",
            equipe: "",
            tecnicoSeguranca: "",
            oms: []
        };

        this.rascunho.atividades.push(grupo);
        this.novosGrupos.add(grupo);
        this.sujo = true;
        this.renderizarSomenteAtividades();

    },

    adicionarOm(indiceGrupo) {

        const grupo = this.rascunho?.atividades?.[indiceGrupo];
        if (!grupo) return;

        if (!Array.isArray(grupo.oms)) grupo.oms = [];

        const om = {
            numero: "",
            frente: "",
            descricao: "",
            status: this.statusPadrao()
        };

        grupo.oms.push(om);
        this.novasOms.add(om);
        this.sujo = true;
        this.renderizarSomenteAtividades();

    },

    removerOm(indiceGrupo, indiceOm) {

        const grupo = this.rascunho?.atividades?.[indiceGrupo];
        const om = grupo?.oms?.[indiceOm];
        if (!om) return;

        if (!this.ehNovaOm(om) && !window.confirm("Remover esta atividade do relatório? Esta ação afeta somente o rascunho.")) {
            return;
        }

        grupo.oms.splice(indiceOm, 1);
        this.sujo = true;
        this.renderizarSomenteAtividades();

    },

    removerGrupo(indiceGrupo) {

        const grupo = this.rascunho?.atividades?.[indiceGrupo];
        if (!grupo) return;

        const quantidade = grupo.oms?.length || 0;
        const mensagem = quantidade
            ? `Remover esta equipe e suas ${quantidade} ${quantidade === 1 ? "atividade" : "atividades"} do rascunho?`
            : "Remover esta equipe do rascunho?";

        if (!window.confirm(mensagem)) return;

        this.rascunho.atividades.splice(indiceGrupo, 1);
        this.sujo = true;
        this.renderizarSomenteAtividades();

    },

    renderizarSomenteAtividades() {
        if (this.container && Dashboard?.abaAtual) {
            this.renderizarAtividades(Dashboard.abaAtual, this.container);
        }
    },

    validar() {

        const erros = [];
        const chaves = new Map();

        (this.rascunho?.atividades || []).forEach((grupo, indiceGrupo) => {
            (grupo.oms || []).forEach((om, indiceOm) => {

                const nova = this.ehNovaOm(om);
                const numero = String(om.numero || "").trim();
                const frente = String(om.frente || "").trim();
                const descricao = String(om.descricao || "").trim();

                if (nova && (!numero || !frente || !descricao)) {
                    erros.push(`Preencha número, frente e descrição da nova OM no grupo ${indiceGrupo + 1}.`);
                }

                if (!numero || !frente) return;

                const chave = [grupo.lider || "", frente, numero].join("::").toLocaleLowerCase("pt-BR");

                if (chaves.has(chave) && (nova || this.ehNovaOm(chaves.get(chave).om))) {
                    erros.push(`A nova OM ${numero} repete a mesma identificação de uma atividade já existente.`);
                } else {
                    chaves.set(chave, { om, indiceOm });
                }

            });
        });

        return erros;

    },

    opcoesStatus(statusAtual) {

        const encontrados = [];

        (this.rascunho?.atividades || []).forEach(grupo => {
            (grupo.oms || []).forEach(om => {
                if (om.status && !encontrados.includes(om.status)) encontrados.push(om.status);
            });
        });

        const reconhecidos = ["Planejada", "Em andamento", "Concluída", "Atrasada", "Postergada"];
        const todos = [...encontrados, ...reconhecidos];

        if (statusAtual && !todos.includes(statusAtual)) todos.unshift(statusAtual);

        return [...new Set(todos)];

    },

    statusPadrao() {
        const chave = typeof normalizarStatusOM === "function"
            ? normalizarStatusOM("Em andamento")
            : "andamento";

        return {
            planejada: "Planejada",
            andamento: "Em andamento",
            concluida: "Concluída",
            atrasada: "Atrasada"
        }[chave] || "Em andamento";
    },

    ehNovoGrupo(grupo) {
        return Boolean(this.novosGrupos?.has(grupo));
    },

    ehNovaOm(om) {
        return Boolean(this.novasOms?.has(om));
    },

    mostrarMensagem(mensagem, tipo) {
        const elemento = this.container?.querySelector("[data-editor-mensagem]");
        if (!elemento) return;
        elemento.textContent = mensagem;
        elemento.className = `editor-relatorio-mensagem ${tipo || ""}`;
        elemento.hidden = false;
    },

    esconderMensagem() {
        const elemento = this.container?.querySelector("[data-editor-mensagem]");
        if (!elemento) return;
        elemento.hidden = true;
        elemento.textContent = "";
        elemento.className = "editor-relatorio-mensagem";
    },

    clonar(dados) {
        if (typeof structuredClone === "function") return structuredClone(dados);
        return JSON.parse(JSON.stringify(dados));
    },

    escapar(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caractere]);
    },

    escaparAtributo(valor) {
        return this.escapar(valor).replace(/`/g, "&#96;");
    }

};

window.EditorRelatorio = EditorRelatorio;
EditorRelatorio.iniciarSistema();
