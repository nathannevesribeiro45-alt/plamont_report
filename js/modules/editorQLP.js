/* QLP mantém o mesmo estado e schema; reutiliza as operações extraídas. */
window.EditorQLP = Object.assign(Object.create(EditorQuantidades), {
    campo: "qlp",
    titulo: "QLP",
    cabecalho: "Efetivo (QLP)",
    acoesGlobais: true,
    calcularTotal(...grupos) { return QLP.calcularTotal(...grupos); }
});
