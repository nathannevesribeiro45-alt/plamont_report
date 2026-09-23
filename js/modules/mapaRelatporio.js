/* Editor de atividades: original + rascunho. Sem armazenamento ou rede. */

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

    arquivosPendentes: new Map(),

    previewsAnexos: new Map(),



    clonar(dados) {

        return typeof structuredClone === "function" ? structuredClone(dados) : JSON.parse(JSON.stringify(dados));

    },

    podeEditar() { return window.Auth?.pode?.("editar") === true; },

    obterOriginal() { return this.original ? this.clonar(this.original) : null; },

    obterRascunho() { return this.rascunho ? this.clonar(this.rascunho) : null; },

    gerarPayload() {

        return this.ativo ? { contratoId: this.contratoId, abaId: this.abaId, dados: this.obterRascunho() } : null;

    },

    deveEditarAba(aba) {

        return this.ativo && this.podeEditar() && aba?.id === this.abaId && Dashboard.contratoAtual?.id === this.contratoId;

    },

    iniciar(aba = Dashboard.abaAtual) {

        if (!this.podeEditar() || !aba || this.ativo || !Dashboard.contratoAtual) return false;

        this.ativo = true;

        this.contratoId = Dashboard.contratoAtual.id;

        this.abaId = aba.id;

        this.usuarioId = window.Auth.usuario?.id || null;

        this.original = this.clonar(aba);

        this.rascunho = this.clonar(aba);

        if (!Array.isArray(this.rascunho.atividades)) this.rascunho.atividades = [];

        this.novosGrupos = new WeakSet();

        this.novasOms = new WeakSet();



        this.limparArquivosTemporarios();

        this.arquivosPendentes = new Map();

        this.previewsAnexos = new Map();



        Render.atualizar();

        this.container?.querySelector("[data-editor]")?.scrollIntoView({ block: "start", behavior: "smooth" });

        return true;

    },

    descartar() {

        if (typeof Mapa !== "undefined") Mapa.cancelarSelecaoLocalizacao?.();

        this.confirmacao?.fechar(false);

        this.ativo = false;

        this.contratoId = this.abaId = this.usuarioId = null;

        this.original = this.rascunho = this.container = null;

        this.novosGrupos = new WeakSet();

        this.novasOms = new WeakSet();

        this.limparArquivosTemporarios();

    },



    limparArquivoTemporario(id) {

    if (!id) return;



    const url = this.previewsAnexos.get(id);



    if (url) {

        try {

            URL.revokeObjectURL(url);

        } catch (_) {}

    }



    this.previewsAnexos.delete(id);

    this.arquivosPendentes.delete(id);

},



limparAnexosTemporariosOM(om) {

    if (!Array.isArray(om?.anexos)) return;



    for (const anexo of om.anexos) {

        if (!anexo?.id) continue;



        if (

            this.arquivosPendentes.has(anexo.id) ||

            this.previewsAnexos.has(anexo.id)

        ) {

            this.limparArquivoTemporario(anexo.id);

        }

    }

},



            limparArquivosTemporarios() {

            for (const url of this.previewsAnexos.values()) {

                try {

                    URL.revokeObjectURL(url);

                } catch (_) {}

            }



            this.previewsAnexos.clear();

            this.arquivosPendentes.clear();

        },



        gerarIdAnexo() {

            if (window.crypto?.randomUUID) {

                return crypto.randomUUID();

            }



            return `anexo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        },



        formatarTamanhoArquivo(bytes) {

            const tamanho = Number(bytes) || 0;



            if (tamanho < 1024) {

                return `${tamanho} B`;

            }



            if (tamanho < 1024 * 1024) {

                return `${(tamanho / 1024).toFixed(1)} KB`;

            }



            return `${(tamanho / (1024 * 1024)).toFixed(1)} MB`;

        },









    cancelar() {

        this.descartar();

        Render.atualizar();

    },

    temAlteracoes() {

        return this.ativo && JSON.stringify(this.original.atividades || []) !== JSON.stringify(this.rascunho.atividades);

    },

    deveConfirmarNavegacao(pagina, aba) {

        return this.ativo && (pagina !== this.contratoId || (aba && aba !== this.abaId));

    },

    async confirmarSaida() {

        if (this.temAlteracoes() && !await this.confirmar("Existem alterações não aplicadas.", "Deseja descartá-las e sair do editor?", "Descartar alterações", "Continuar editando")) return false;

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

    aplicar() {

        if (!this.ativo || !this.podeEditar()) return false;

        const erros = this.validar();

        if (erros.length) { this.mostrarMensagem(erros[0]); return false; }

        const payload = this.gerarPayload();

        const aba = Dashboard.contratos[payload.contratoId]?.abas?.find(item => item.id === payload.abaId);

        if (!aba) { this.mostrarMensagem("A aba em edição não está disponível."); return false; }

        Object.assign(aba, this.clonar(payload.dados));

        Dashboard.abaAtual = aba;

        this.descartar();

        Render.atualizar();

        if (typeof Mapa !== "undefined" && Mapa.map && Mapa.markersLayer) Mapa.renderFrentes(false);

        const aviso = document.createElement("p");

        aviso.className = "editor-aviso-aplicado";

        aviso.setAttribute("role", "status");

        aviso.textContent = "Alterações aplicadas nesta página. Ao recarregar, o relatório original será restaurado.";

        document.getElementById(`${Dashboard.contratoAtual.id}-content`)?.querySelector(".card-atividades")?.prepend(aviso);

        return true;

    },

    renderAtividades(aba, container) {

        if (!this.deveEditarAba(aba)) return;

        this.container = container;

        const secao = document.createElement("section");

        secao.className = "bloco editor-relatorio";

        secao.dataset.editor = "atividades";

        secao.innerHTML = `<header class="editor-cabecalho"><div><span class="editor-etiqueta">Modo de edição</span><h2>Atividades do relatório</h2>

            <p>Aplicação temporária nesta página. Recarregar restaura o relatório original.</p></div>

            <div class="editor-acoes"><button type="button" data-acao-editor="cancelar">Cancelar</button><button type="button" class="editor-primario" data-acao-editor="aplicar">Aplicar alterações</button></div></header>

            <p data-editor-erro class="editor-erro" role="alert" hidden></p>

            <div class="editor-grupos">${this.rascunho.atividades.length ? this.rascunho.atividades.map((g, i) => this.htmlGrupo(g, i)).join("") : '<p class="editor-vazio">Nenhuma equipe cadastrada. Adicione uma equipe ou líder para começar.</p>'}</div>

            <button type="button" class="editor-adicionar" data-acao-editor="adicionar-grupo">+ Adicionar equipe / líder</button>`;

        const anterior = container.querySelector("[data-editor]");

        if (anterior) anterior.replaceWith(secao); else container.append(secao);

        secao.addEventListener("input", e => {

            this.atualizarCampo(e);

        });



        secao.addEventListener("change", e => {

            if (e.target.matches("[data-anexo-arquivo]")) {

                this.selecionarArquivoAnexo(e);

                return;

            }



            if (e.target.matches("[data-anexo-categoria]")) {

                this.alterarCategoriaAnexo(e);

                return;

            }



            this.atualizarCampo(e);

        });



        secao.addEventListener("click", e => {

            this.executarAcao(e);

        });

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

      htmlAnexos(om, g, o) {

    const anexos = Array.isArray(om.anexos) ? om.anexos : [];



    const legado = [];



    if (om.arquivoPdf) {

        legado.push({

            categoria: "OM",

            nome: "Documento da OM",

            caminho: om.arquivoPdf

        });

    }



    if (om.arquivoLaudo || om.laudo) {

        legado.push({

            categoria: "Laudo",

            nome: "Laudo",

            caminho: om.arquivoLaudo || om.laudo

        });

    }



    return `

        <div class="editor-anexos">

            <div class="editor-anexos-cabecalho">

                <div>

                    <strong>Anexos</strong>

                    <p class="editor-ajuda">Documentos vinculados exclusivamente a esta OM.</p>

                </div>



                <button

                    type="button"

                    class="editor-adicionar"

                    data-acao-editor="adicionar-anexo"

                    data-grupo="${g}"

                    data-om="${o}">

                    + Adicionar anexo

                </button>

            </div>



            <input

                type="file"

                hidden

                data-anexo-arquivo

                data-grupo="${g}"

                data-om="${o}"

                accept=".pdf,application/pdf">



            <div class="editor-lista-anexos">



                ${legado.map(anexo => `

                    <div class="editor-anexo editor-anexo-legado">

                        <div class="editor-anexo-info">

                            <strong>${this.escapar(anexo.nome)}</strong>

                            <span>${this.escapar(anexo.categoria)} · Documento existente</span>

                        </div>



                        <div class="editor-anexo-acoes">

                            <a

                                href="${this.escapar(anexo.caminho)}"

                                target="_blank"

                                rel="noopener noreferrer">

                                Visualizar

                            </a>

                        </div>

                    </div>

                `).join("")}



                ${anexos.map(anexo => `

                    <div class="editor-anexo">

                        <div class="editor-anexo-info">

                            <strong>${this.escapar(anexo.nome)}</strong>



                            <span>

                                ${this.escapar(this.rotuloCategoriaAnexo(anexo.categoria))}

                                ·

                                ${this.formatarTamanhoArquivo(anexo.tamanho)}

                            </span>

                        </div>



                        <label class="editor-anexo-categoria">

                            Tipo



                            <select

                                data-anexo-categoria="${this.escapar(anexo.id)}"

                                data-grupo="${g}"

                                data-om="${o}">

                                ${this.opcoesCategoriaAnexo(anexo.categoria)}

                            </select>

                        </label>



                        <div class="editor-anexo-acoes">

                            ${this.previewsAnexos.has(anexo.id) ? `

                                <button

                                    type="button"

                                    data-acao-editor="visualizar-anexo"

                                    data-anexo-id="${this.escapar(anexo.id)}">

                                    Visualizar

                                </button>

                            ` : ""}



                            <button

                                type="button"

                                class="editor-remover"

                                data-acao-editor="remover-anexo"

                                data-grupo="${g}"

                                data-om="${o}"

                                data-anexo-id="${this.escapar(anexo.id)}">

                                Remover

                            </button>

                        </div>

                    </div>

                `).join("")}



                ${!legado.length && !anexos.length

                    ? `<p class="editor-anexos-vazio">Nenhum documento anexado.</p>`

                    : ""}

            </div>

        </div>

    `;

},

         rotuloCategoriaAnexo(categoria) {

    const categorias = {

        om: "OM",

        laudo: "Laudo",

        relatorio: "Relatório",

        desenho: "Desenho",

        procedimento: "Procedimento",

        outro: "Outro"

    };



    return categorias[categoria] || "Outro";

},



opcoesCategoriaAnexo(atual = "om") {

    const categorias = [

        ["om", "OM"],

        ["laudo", "Laudo"],

        ["relatorio", "Relatório"],

        ["desenho", "Desenho"],

        ["procedimento", "Procedimento"],

        ["outro", "Outro"]

    ];



    return categorias

        .map(([valor, rotulo]) => `

            <option

                value="${valor}"

                ${valor === atual ? "selected" : ""}>

                ${rotulo}

            </option>

        `)

        .join("");

},





        htmlOM(om, g, o) {

            const nova = this.novasOms.has(om);

            const status = om.status || "";



            const opcoes = [

                ...new Set([

                    status,

                    ...Object.values(Mapa.statusConfig).map(item => item.label),

                    "Postergada"

                ])

            ];



            return `

                <section class="editor-om" data-editor-om="${g}-${o}">

                    <header class="editor-om-titulo">

                        <h4>OM ${this.escapar(om.numero || "nova")}</h4>



                        <button

                            type="button"

                            class="editor-remover"

                            data-acao-editor="remover-om"

                            data-grupo="${g}"

                            data-om="${o}">

                            Remover atividade

                        </button>

                    </header>



                    <div class="editor-campos-om">



                        ${this.campo(

                            "Número" + (nova ? " *" : ""),

                            "numero",

                            om.numero,

                            g,

                            o,

                            !nova

                        )}



                        ${this.campo(

                            "Frente" + (nova ? " *" : ""),

                            "frente",

                            om.frente,

                            g,

                            o,

                            !nova

                        )}



                        <label>

                            Status



                            <select

                                data-campo="status"

                                data-grupo="${g}"

                                data-om="${o}">



                                ${opcoes.map(valor => `

                                    <option

                                        value="${this.escapar(valor)}"

                                        ${valor === status ? "selected" : ""}>

                                        ${this.escapar(valor || "Sem status (planejada)")}

                                    </option>

                                `).join("")}



                            </select>

                        </label>



                        <label class="editor-descricao">

                            Descrição${nova ? " *" : ""}



                            <textarea

                                rows="3"

                                data-campo="descricao"

                                data-grupo="${g}"

                                data-om="${o}">${this.escapar(om.descricao)}</textarea>

                        </label>



                    </div>



                    <div class="editor-localizacao">



                        <div class="editor-coordenadas">

                            ${this.campo("Latitude", "latitude", om.latitude, g, o)}

                            ${this.campo("Longitude", "longitude", om.longitude, g, o)}

                        </div>



                        <div class="editor-acoes-localizacao">



                            <button

                                type="button"

                                data-acao-editor="selecionar-localizacao"

                                data-grupo="${g}"

                                data-om="${o}">

                                Selecionar no mapa

                            </button>



                            <button

                                type="button"

                                data-acao-editor="limpar-localizacao"

                                data-grupo="${g}"

                                data-om="${o}">

                                Limpar localização

                            </button>



                        </div>



                        <p class="editor-ajuda">

                            Use ponto ou vírgula decimal. As duas coordenadas podem ficar vazias.

                        </p>



                    </div>



                    ${this.htmlAnexos(om, g, o)}



                    <p class="editor-ajuda">

                        ${

                            nova

                                ? "* Número, frente e descrição são obrigatórios."

                                : "Líder, número e frente protegidos para preservar fotos e referências."

                        }

                    </p>



                </section>

            `;

        },

    campo(rotulo, nome, valor, grupo, om = null, readonly = false) {

        const tipo = nome === "telefone" ? "tel" : "text";

        const decimal = nome === "latitude" || nome === "longitude";

        return `<label>${rotulo}<input type="${tipo}" ${decimal ? 'inputmode="decimal"' : ""} data-campo="${nome}" data-grupo="${grupo}" ${om === null ? "" : `data-om="${om}"`} value="${this.escapar(valor)}" ${readonly ? "readonly" : ""}></label>`;

    },

    atualizarCampo(evento) {

        if (!this.ativo || !this.podeEditar()) return;

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



    if (!botao || !this.ativo || !this.podeEditar()) return;



    const g = Number(botao.dataset.grupo);

    const o = Number(botao.dataset.om);

    const anexoId = botao.dataset.anexoId || null;



    const acoes = {

        cancelar: () => this.cancelar(),



        aplicar: () => this.aplicar(),



        "adicionar-grupo": () =>

            this.adicionarGrupo(),



        "remover-grupo": () =>

            this.removerGrupo(g),



        "adicionar-om": () =>

            this.adicionarOM(g),



        "remover-om": () =>

            this.removerOM(g, o),



        "selecionar-localizacao": () =>

            this.iniciarSelecaoLocalizacao(g, o),



        "limpar-localizacao": () =>

            this.limparLocalizacao(g, o),



        "adicionar-anexo": () =>

            this.abrirSeletorAnexo(g, o),



        "visualizar-anexo": () =>

            this.visualizarAnexo(anexoId),



        "remover-anexo": () =>

            this.removerAnexo(g, o, anexoId)

    };



    acoes[botao.dataset.acaoEditor]?.();

},



abrirSeletorAnexo(g, o) {

    const om =

        this.rascunho?.atividades?.[g]?.oms?.[o];



    if (!om || !this.podeEditar()) return;



    const input = this.container?.querySelector(

        `[data-anexo-arquivo][data-grupo="${g}"][data-om="${o}"]`

    );



    if (!input) return;



    // Permite selecionar novamente o mesmo arquivo.

    input.value = "";

    input.click();

},



selecionarArquivoAnexo(evento) {

    if (!this.ativo || !this.podeEditar()) return;



    const input = evento.target;



    const g = Number(input.dataset.grupo);

    const o = Number(input.dataset.om);



    const om =

        this.rascunho?.atividades?.[g]?.oms?.[o];



    const arquivo = input.files?.[0];



    if (!om || !arquivo) return;



    const nomeMinusculo =

        arquivo.name.toLowerCase();



    const ehPdf =

        arquivo.type === "application/pdf" ||

        nomeMinusculo.endsWith(".pdf");



    if (!ehPdf) {

        this.mostrarMensagem(

            "Nesta etapa, selecione um arquivo PDF."

        );



        input.value = "";

        return;

    }



    if (!Array.isArray(om.anexos)) {

        om.anexos = [];

    }



    const id = this.gerarIdAnexo();



    const anexo = {

        id,

        nome: arquivo.name,

        categoria: "om",

        mimeType:

            arquivo.type || "application/pdf",

        tamanho: arquivo.size,

        storagePath: null

    };



    // Metadados serializáveis ficam na OM.

    om.anexos.push(anexo);



    // O File real permanece separado.

    this.arquivosPendentes.set(

        id,

        arquivo

    );



    // Preview local.

    const url =

        URL.createObjectURL(arquivo);



    this.previewsAnexos.set(

        id,

        url

    );



    input.value = "";



    this.renderizarSomenteAtividades();

},



alterarCategoriaAnexo(evento) {

    if (!this.ativo || !this.podeEditar()) return;



    const select = evento.target;



    const g = Number(select.dataset.grupo);

    const o = Number(select.dataset.om);

    const id =

        select.dataset.anexoCategoria;



    const om =

        this.rascunho?.atividades?.[g]?.oms?.[o];



    if (!om || !Array.isArray(om.anexos)) {

        return;

    }



    const anexo = om.anexos.find(

        item =>

            String(item.id) === String(id)

    );



    if (!anexo) return;



    anexo.categoria = select.value;

},



visualizarAnexo(id) {

    if (!id) return;



    const url =

        this.previewsAnexos.get(id);



    if (!url) {

        this.mostrarMensagem(

            "Este anexo não possui visualização local disponível."

        );

        return;

    }



    const janela =

        window.open(url, "_blank");



    if (janela) {

        janela.opener = null;

    }

},



removerAnexo(g, o, id) {

    if (

        !this.ativo ||

        !this.podeEditar() ||

        !id

    ) {

        return;

    }



    const om =

        this.rascunho?.atividades?.[g]?.oms?.[o];



    if (!om || !Array.isArray(om.anexos)) {

        return;

    }



    const indice =

        om.anexos.findIndex(

            item =>

                String(item.id) ===

                String(id)

        );



    if (indice === -1) return;



    const [anexo] =

        om.anexos.splice(indice, 1);



    if (anexo?.id) {

        this.limparArquivoTemporario(

            anexo.id

        );

    }



    this.renderizarSomenteAtividades();

},

    adicionarGrupo() {

        if (!this.ativo || !this.podeEditar()) return;

        const grupo = { lider: "", telefone: "", equipe: "", tecnicoSeguranca: "", oms: [] };

        this.novosGrupos.add(grupo); this.rascunho.atividades.push(grupo);

        this.renderizarSomenteAtividades();

        this.container?.querySelector(`[data-campo="lider"][data-grupo="${this.rascunho.atividades.length - 1}"]`)?.focus();

    },

    adicionarOM(g) {

        const grupo = this.rascunho?.atividades[g];

        if (!grupo || !this.podeEditar()) return;

        const om = { numero: "", frente: "", descricao: "", status: "Em andamento", latitude: "", longitude: "", anexos:[] };

        if (!Array.isArray(grupo.oms)) grupo.oms = [];

        this.novasOms.add(om); grupo.oms.push(om);

        this.renderizarSomenteAtividades();

        this.container?.querySelector(`[data-campo="numero"][data-grupo="${g}"][data-om="${grupo.oms.length - 1}"]`)?.focus();

    },

    async removerOM(g, o) {
        const grupo = this.rascunho?.atividades[g];
        const om = grupo?.oms?.[o];

        if (!om || !this.podeEditar()) return;

        if (
            !this.novasOms.has(om) &&
            !await this.confirmar(
                "Remover esta atividade do relatório?",
                "A remoção afeta somente o rascunho. As fotos e os arquivos são preservados.",
                "Remover atividade"
            )
        ) {
            return;
        }

        if (!this.ativo || !this.podeEditar()) return;

        this.limparAnexosTemporariosOM(om);

        grupo.oms.splice(
            grupo.oms.indexOf(om),
            1
        );

        this.renderizarSomenteAtividades();
    },

    async removerGrupo(g) {
        const grupo = this.rascunho?.atividades[g];

        if (!grupo || !this.podeEditar()) return;

        if (
            !await this.confirmar(
                "Remover equipe / líder?",
                `Este grupo e suas ${grupo.oms?.length || 0} OMs sairão somente do rascunho.`,
                "Remover equipe"
            )
        ) {
            return;
        }

        if (!this.ativo || !this.podeEditar()) return;

        for (const om of grupo.oms || []) {
            this.limparAnexosTemporariosOM(om);
        }

        this.rascunho.atividades.splice(
            this.rascunho.atividades.indexOf(grupo),
            1
        );

        this.renderizarSomenteAtividades();
    },

    iniciarSelecaoLocalizacao(g, o) {

        const om = this.rascunho?.atividades[g]?.oms?.[o];

        if (!om || !this.podeEditar()) return;

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

        if (!om || !this.podeEditar()) return false;

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

        const erros = [], chaves = new Map();

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

        const aviso = this.container?.querySelector("[data-editor-erro]");

        if (!aviso) return;

        aviso.textContent = texto; aviso.hidden = false;

        aviso.scrollIntoView({ block: "nearest", behavior: "smooth" });

    },

    escapar(valor) {

        return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    }

};



document.addEventListener("plamont:auth-alterado", () => {

    const editor = window.EditorRelatorio;

    if (editor.ativo && (!editor.podeEditar() || editor.usuarioId !== (window.Auth.usuario?.id || null))) editor.cancelar();

});

window.addEventListener("beforeunload", evento => {

    if (window.EditorRelatorio.temAlteracoes()) { evento.preventDefault(); evento.returnValue = ""; }

});