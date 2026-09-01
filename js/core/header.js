// ==========================================
// HEADER.JS
// ==========================================

const Header = {

    render(contrato) {

        if (!contrato) {
            console.warn("Contrato não informado.");
            return;
        }

        const titulo = document.getElementById(
            `${contrato.id}-titulo`
        );

        const subtitulo = document.getElementById(
            `${contrato.id}-subtitulo`
        );

        const data = document.getElementById(
            `${contrato.id}-data`
        );

        const turno = document.getElementById(
            `${contrato.id}-turno`
        );

        const horario = document.getElementById(
            `${contrato.id}-horario`
        );

        if (
            !titulo ||
            !subtitulo ||
            !data ||
            !turno ||
            !horario
        ) {
            console.error("Elementos do cabeçalho não encontrados.");
            return;
        }

        // ===============================
        // Título
        // ===============================

        titulo.textContent = contrato.nome;

        // ===============================
        // Subtítulo
        // ===============================

        subtitulo.textContent =
            ``;

        // ===============================
        // Calendar Card
        // ===============================

        data.textContent = `📅 ${contrato.data}`;

        turno.textContent = contrato.turno;

        horario.textContent = contrato.horario;

    }

};