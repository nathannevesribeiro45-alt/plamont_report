/* Ausências permanece um objeto plano: funções + dois números de resumo. */
window.EditorAusencias = Object.assign(Object.create(EditorQuantidades), {
    campo: "ausencias",
    titulo: "Ausências",
    grupos: Object.freeze({ funcoes: "Faltas por função" }),
    reservados: Object.freeze({ justificadas: "Justificadas", naoJustificadas: "Não justificadas" }),
    resumo: null,
    comparavel(ausencias) {
        const dados = this.objeto(ausencias);
        return { ...dados, justificadas: dados.justificadas ?? 0, naoJustificadas: dados.naoJustificadas ?? 0 };
    },
    iniciar(rascunho) {
        EditorQuantidades.iniciar.call(this, rascunho);
        this.resumo = Object.fromEntries(Object.keys(this.reservados).map(chave => [chave, String(rascunho.ausencias[chave])]));
    },
    encerrar() { EditorQuantidades.encerrar.call(this); this.resumo = null; },
    nomeReservado(nome) { return Object.keys(this.reservados).some(chave => this.normalizarNome(chave) === this.normalizarNome(nome)); },
    obterGrupo() {
        return Object.fromEntries(Object.entries(EditorRelatorio.rascunho.ausencias).filter(([chave]) => !Object.hasOwn(this.reservados, chave)));
    },
    definirGrupo(grupo, dados) {
        const atual = EditorRelatorio.rascunho.ausencias;
        EditorRelatorio.rascunho.ausencias = { ...dados, justificadas: atual.justificadas, naoJustificadas: atual.naoJustificadas };
    },
    calcularTotal(dados) { return Ausencias.calcularTotal(dados); },
    validar() {
        const erros = EditorQuantidades.validar.call(this);
        if (!this.linhas) return erros;
        for (const [chave, rotulo] of Object.entries(this.reservados)) {
            if (this.normalizarQuantidade(this.resumo?.[chave]) === null || this.normalizarQuantidade(EditorRelatorio.rascunho.ausencias[chave]) === null) {
                erros.push(`Ausências — ${rotulo}: use uma quantidade inteira, válida e maior ou igual a zero.`);
            }
        }
        return erros;
    },
    atualizarCampo(evento) {
        const campo = evento.target.closest("[data-ausencias-resumo]");
        if (!campo) { EditorQuantidades.atualizarCampo.call(this, evento); return; }
        if (!this.permitido() || !Object.hasOwn(this.reservados, campo.dataset.ausenciasResumo)) return;
        const chave = campo.dataset.ausenciasResumo;
        this.resumo[chave] = campo.value;
        const numero = this.normalizarQuantidade(campo.value);
        if (numero !== null) EditorRelatorio.rascunho.ausencias[chave] = numero;
        this.atualizarFeedback();
    },
    htmlComplementar() {
        return `<section class="editor-ausencias-resumo" aria-label="Resumo de ausências"><h3>Resumo</h3>
            <div class="editor-ausencias-resumo-campos">${Object.entries(this.reservados).map(([chave, rotulo]) => `<label>${rotulo}<input type="number" min="0" step="1" inputmode="numeric" value="${escaparHtml(this.resumo?.[chave] ?? 0)}" data-ausencias-resumo="${chave}" aria-describedby="ausencias-resumo-${chave}"><span class="editor-qlp-erro-linha" id="ausencias-resumo-${chave}" data-resumo-erro="${chave}" hidden></span></label>`).join("")}</div>
            <p class="editor-ajuda">O resumo é independente do total calculado pelas faltas por função.</p></section>`;
    },
    atualizarComplemento(secao) {
        for (const chave of Object.keys(this.reservados)) {
            const invalido = this.normalizarQuantidade(this.resumo?.[chave]) === null;
            secao.querySelector(`[data-ausencias-resumo="${chave}"]`).setAttribute("aria-invalid", String(invalido));
            const erro = secao.querySelector(`[data-resumo-erro="${chave}"]`);
            erro.hidden = !invalido;
            erro.textContent = invalido ? "Use um inteiro maior ou igual a zero." : "";
        }
    }
});
