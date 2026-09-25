/* Mobilização é um objeto plano, independente dos demais quantitativos. */
window.EditorMobilizacao = Object.assign(Object.create(EditorQuantidades), {
    campo: "mobilizacao",
    titulo: "Mobilização",
    cabecalho: "Efetivo em Mobilização",
    grupos: Object.freeze({ funcoes: "Funções em mobilização" }),
    comparavel(dados) { return { ...this.objeto(dados) }; },
    obterGrupo() { return EditorRelatorio.rascunho.mobilizacao; },
    definirGrupo(grupo, dados) { EditorRelatorio.rascunho.mobilizacao = dados; },
    calcularTotal(dados) { return Mobilizacao.calcularTotal(dados); }
});
