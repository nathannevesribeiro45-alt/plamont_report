// ==========================================
// ESTADO DO DASHBOARD
// ==========================================

const dashboardStatus = {

    status: "normal",

    titulo: "Operação Normal",

    mensagens: [
        "Todas as operações estão dentro da normalidade.",
        "Nenhuma ocorrência crítica registrada neste turno."
    ],

    turno: "Dia A",

    horario: "07:00 às 19:00",

    atualizacao: "31/08/2026 às 07:00"

};


// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    inicializarDashboard();

});

function inicializarDashboard() {

    calcularStatusOperacao();

    renderDashboard();

}


// ==========================================
// RENDER
// ==========================================

function renderDashboard() {

    renderBanner();

}

function renderBanner() {

    // ==========================================
    // ELEMENTOS
    // ==========================================

    const banner = document.getElementById("banner-status");

    const icone = document.getElementById("status-icone");

    const titulo = document.getElementById("status-titulo");

    const mensagem1 = document.getElementById("status-mensagem-1");

    const mensagem2 = document.getElementById("status-mensagem-2");

    const turno = document.getElementById("status-turno");

    const horario = document.getElementById("status-horario");

    const atualizacao = document.getElementById("status-atualizacao");


    // ==========================================
    // PREENCHE AS INFORMAÇÕES
    // ==========================================

    titulo.textContent = dashboardStatus.titulo;

    mensagem1.textContent = dashboardStatus.mensagens[0];

    mensagem2.textContent = dashboardStatus.mensagens[1];

    turno.textContent = dashboardStatus.turno;

    horario.textContent = `(${dashboardStatus.horario})`;

    atualizacao.textContent = dashboardStatus.atualizacao;


    // ==========================================
    // REMOVE CLASSES ANTIGAS
    // ==========================================

    banner.classList.remove(
        "status-normal",
        "status-alerta",
        "status-critico"
    );


    // ==========================================
    // DEFINE O STATUS
    // ==========================================

    switch (dashboardStatus.status) {

        case "normal":

            banner.classList.add("status-normal");

            icone.textContent = "✔";

            break;


        case "alerta":

            banner.classList.add("status-alerta");

            icone.textContent = "⚠";

            break;


        case "critico":

            banner.classList.add("status-critico");

            icone.textContent = "✖";

            break;

    }

}


// ==========================================
// LÓGICA
// ==========================================

function calcularStatusOperacao() {

    dashboardStatus.status = "normal";

    dashboardStatus.titulo = "Operação Normal";

    dashboardStatus.mensagens = [
        "Todas as operações estão dentro da normalidade.",
        "Nenhuma ocorrência crítica registrada neste turno."
    ];

}


