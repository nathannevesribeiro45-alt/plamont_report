/* Histograma tem os mesmos grupos do QLP, sem compartilhar seus dados. */
window.EditorHistograma = Object.assign(Object.create(EditorQuantidades), {
    campo: "histograma",
    titulo: "Histograma",
    calcularTotal(...grupos) { return Histograma.calcularTotal(...grupos); }
});
