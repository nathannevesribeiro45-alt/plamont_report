/* Registros compostos no rascunho global; IDs existem somente nesta interface. */
window.EditorRecursos = {
    campo: "recursos",
    titulo: "Recursos",
    campos: Object.freeze({ tipo: "Tipo", placa: "Placa", operador: "Operador", contato: "Contato do operador", status: "Status" }),
    linhas: null,
    container: null,
    sequencia: 0,
    comparavel(dados) { return Array.isArray(dados) ? dados : []; },
    iniciar(rascunho) {
        this.encerrar();
        rascunho.recursos = this.comparavel(rascunho.recursos);
        this.linhas = rascunho.recursos.map(recurso => this.criarLinha(recurso, false));
    },
    criarLinha(recurso, nova) {
        return { id: ++this.sequencia, recurso, nova, statusOriginal: recurso?.status, statusEditado: false };
    },
    encerrar() { this.linhas = null; this.container = null; },
    permitido() { return !!(this.linhas && EditorRelatorio.ativo && EditorRelatorio.podeEditar()); },
    registroValido(recurso) { return !!recurso && typeof recurso === "object" && !Array.isArray(recurso); },
    errosRecurso(recurso, linha) {
        if (!this.registroValido(recurso)) return { tipo: "Revise este recurso ou remova o registro inválido." };
        const erros = {};
        for (const campo of ["tipo", "placa"]) {
            if (typeof recurso[campo] !== "string" || !recurso[campo].trim()) erros[campo] = `Informe ${campo === "tipo" ? "o tipo" : "a placa"} do recurso.`;
        }
        for (const campo of ["operador", "contato"]) {
            if (recurso[campo] != null && typeof recurso[campo] !== "string") erros[campo] = "Use texto ou deixe este campo vazio.";
        }
        // Variantes legadas permanecem intactas até o usuário escolher um status.
        // Toda seleção e todo registro novo exigem uma das opções canônicas.
        const statusLegado = typeof recurso.status === "string" ? recurso.status.trim().toLowerCase() : "";
        const varianteReconhecida = /^dispon[ií]vel$/.test(statusLegado) || /atend|prevent|manuten|quebrad|inoperante/.test(statusLegado);
        const legadoIntacto = linha && !linha.nova && !linha.statusEditado && recurso.status === linha.statusOriginal && varianteReconhecida;
        if (!Object.hasOwn(Recursos.statusConfig, recurso.status) && !legadoIntacto) erros.status = "Selecione um status válido.";
        return erros;
    },
    validar() {
        if (!this.linhas) return [];
        const recursos = EditorRelatorio.rascunho.recursos;
        if (!Array.isArray(recursos)) return ["Recursos — a lista de recursos é inválida."];
        return recursos.flatMap((recurso, indice) => {
            const linha = this.linhas.find(item => item.recurso === recurso);
            return Object.values(this.errosRecurso(recurso, linha)).map(erro => `Recursos — recurso ${indice + 1}: ${erro}`);
        });
    },
    temPendencias() { return this.validar().length > 0; },
    atualizarCampo(evento) {
        const campo = evento.target.closest("[data-recurso-campo]");
        if (!campo || !this.permitido()) return;
        const linha = this.linhas.find(item => item.id === Number(campo.dataset.recursoId));
        const nome = campo.dataset.recursoCampo;
        if (!linha || !Object.hasOwn(this.campos, nome)) return;
        const indice = EditorRelatorio.rascunho.recursos.indexOf(linha.recurso);
        if (indice < 0) return;
        if (!this.registroValido(linha.recurso)) EditorRelatorio.rascunho.recursos[indice] = linha.recurso = {};
        linha.recurso[nome] = campo.value.trim();
        if (nome === "status") linha.statusEditado = true;
        this.atualizarFeedback();
    },
    adicionar() {
        if (!this.permitido()) return;
        const recurso = { tipo: "", placa: "", operador: "", contato: "", status: Recursos.obterStatus({}) };
        const linha = this.criarLinha(recurso, true);
        EditorRelatorio.rascunho.recursos.push(recurso);
        this.linhas.push(linha);
        this.render(Dashboard.abaAtual, this.container);
        this.container.querySelector(`[data-recurso-id="${linha.id}"][data-recurso-campo="tipo"]`)?.focus();
    },
    async remover(id) {
        if (!this.permitido()) return;
        const lista = this.linhas, linha = lista.find(item => item.id === id);
        if (!linha) return;
        if (!linha.nova && !await EditorRelatorio.confirmar("Remover recurso?", `${linha.recurso?.tipo || "Recurso"} — ${linha.recurso?.placa || "sem placa"} será removido somente do rascunho. Cancelar a edição restaura o registro.`, "Remover recurso")) return;
        if (!this.permitido() || this.linhas !== lista || !lista.includes(linha)) return;
        const recursos = EditorRelatorio.rascunho.recursos, indice = recursos.indexOf(linha.recurso);
        if (indice < 0) return;
        recursos.splice(indice, 1);
        lista.splice(lista.indexOf(linha), 1);
        this.render(Dashboard.abaAtual, this.container);
        this.container.querySelector("[data-recurso-adicionar]")?.focus();
    },
    htmlLinha(linha, indice) {
        const esc = escaparHtml, recurso = linha.recurso || {};
        return `<article class="editor-recurso" data-recurso-linha="${linha.id}" aria-label="Recurso ${indice + 1}">
            <header class="editor-grupo-titulo"><h3>Recurso ${indice + 1}</h3><button type="button" class="editor-remover" data-recurso-remover="${linha.id}" aria-label="Remover recurso ${indice + 1}">Remover</button></header>
            <div class="editor-recurso-campos">${Object.entries(this.campos).map(([campo, rotulo]) => {
                const attrs = `data-recurso-campo="${campo}" data-recurso-id="${linha.id}" aria-describedby="recurso-${linha.id}-${campo}-erro"`;
                const erro = `<span class="editor-recurso-erro" id="recurso-${linha.id}-${campo}-erro" data-recurso-erro="${campo}" hidden></span>`;
                if (campo === "status") {
                    const status = Recursos.obterStatus(recurso);
                    return `<label>${rotulo}<select ${attrs}>${Object.entries(Recursos.statusConfig).map(([valor, config]) => `<option value="${valor}" ${valor === status ? "selected" : ""}>${esc(config.rotulo)}</option>`).join("")}</select>${erro}</label>`;
                }
                return `<label>${rotulo}${["tipo", "placa"].includes(campo) ? " *" : ""}<input type="${campo === "contato" ? "tel" : "text"}" ${attrs} value="${esc(recurso[campo] ?? "")}" autocomplete="off">${erro}</label>`;
            }).join("")}</div></article>`;
    },
    render(aba, container) {
        if (!container || !EditorRelatorio.deveEditarAba(aba) || !this.linhas) return;
        this.container = container;
        const secao = document.createElement("section");
        secao.className = "bloco editor-relatorio editor-recursos";
        secao.setAttribute("data-editor-recursos", "");
        secao.innerHTML = `<header class="editor-cabecalho"><div><span class="editor-etiqueta">Modo de edição</span><h2>Recursos</h2><p>Edite os recursos deste relatório. Use as ações globais para aplicar ou cancelar todas as alterações.</p></div></header>
            <p class="editor-erro" data-recursos-erro role="alert" hidden></p>
            <div class="editor-recursos-lista">${this.linhas.length ? this.linhas.map((linha, i) => this.htmlLinha(linha, i)).join("") : '<p class="editor-vazio">Nenhum recurso. Adicione o primeiro abaixo.</p>'}</div>
            <p class="editor-ajuda">* Tipo e placa são obrigatórios. Operador e contato podem ficar vazios.</p>
            <button type="button" class="editor-adicionar" data-recurso-adicionar>+ Adicionar recurso</button>`;
        const anterior = container.querySelector("[data-editor-recursos]");
        if (anterior) anterior.replaceWith(secao); else container.append(secao);
        secao.addEventListener("input", evento => this.atualizarCampo(evento));
        secao.addEventListener("change", evento => this.atualizarCampo(evento));
        secao.addEventListener("click", evento => {
            const botao = evento.target.closest("button");
            if (!botao) return;
            if (botao.hasAttribute("data-recurso-adicionar")) this.adicionar();
            else if (botao.hasAttribute("data-recurso-remover")) this.remover(Number(botao.dataset.recursoRemover));
        });
        this.atualizarFeedback();
    },
    atualizarFeedback() {
        const secao = this.container?.querySelector("[data-editor-recursos]");
        if (!secao || !this.linhas) return;
        for (const linha of this.linhas) {
            const elemento = secao.querySelector(`[data-recurso-linha="${linha.id}"]`);
            if (!elemento) continue;
            const erros = this.errosRecurso(linha.recurso, linha);
            for (const campo of Object.keys(this.campos)) {
                elemento.querySelector(`[data-recurso-campo="${campo}"]`).setAttribute("aria-invalid", String(!!erros[campo]));
                const aviso = elemento.querySelector(`[data-recurso-erro="${campo}"]`);
                aviso.textContent = erros[campo] || "";
                aviso.hidden = !erros[campo];
            }
        }
        secao.querySelector("[data-recursos-erro]").hidden = true;
    },
    mostrarMensagem(texto) {
        const aviso = this.container?.querySelector("[data-recursos-erro]");
        if (!aviso) return;
        aviso.textContent = texto; aviso.hidden = false;
        aviso.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
};
