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

    atualizacao: "15/09/2026 às 07:00"

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

    const iconesStatus = {
        normal: `<svg class="icon-svg" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
        alerta: `<svg class="icon-svg" aria-hidden="true" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>`,
        critico: `<svg class="icon-svg" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/></svg>`
    };

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

            icone.innerHTML = iconesStatus.normal;

            break;


        case "alerta":

            banner.classList.add("status-alerta");

            icone.innerHTML = iconesStatus.alerta;

            break;


        case "critico":

            banner.classList.add("status-critico");

            icone.innerHTML = iconesStatus.critico;

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


