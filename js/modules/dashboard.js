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

    turno: "—",

    horario: "—",

    atualizacao: "Aguardando carregamento"

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

// Quantidades válidas, sem coerção de booleanos, objetos, vazios ou Infinity.
function quantidadesDashboard(grupo) {
    if (!grupo || typeof grupo !== "object" || Array.isArray(grupo)) return {};
    return Object.fromEntries(Object.entries(grupo || {}).filter(([, valor]) =>
        (typeof valor === "number" || (typeof valor === "string" && valor.trim() !== "")) &&
        Number.isFinite(Number(valor)) && Number(valor) >= 0
    ).map(([chave, valor]) => [chave, Number(valor)]));
}

function calcularResumoContrato(contrato) {
    const resumo = { efetivo: 0, ausencias: 0, oms: 0, recursos: 0 };
    for (const aba of contrato?.abas || []) {
        // Os cards anteriores de OS440/441/450 correspondem ao QLP.
        resumo.efetivo += QLP.calcularTotal(
            quantidadesDashboard(aba.qlp?.direto), quantidadesDashboard(aba.qlp?.indireto));
        // Regra oficial já existente: classificações não somam ao total.
        resumo.ausencias += Ausencias.calcularTotal(quantidadesDashboard(aba.ausencias));
        for (const grupo of aba.atividades || []) {
            for (const om of grupo.oms || []) {
                const numero = String(om?.numero ?? "").trim();
                // Preserva identificações alfanuméricas aceitas pelo editor.
                // Sem número, zero ou prefixo '--' são marcadores, não OMs.
                if (/^[\p{L}\p{N}]/u.test(numero) && /[1-9]/.test(numero)) resumo.oms++;
            }
        }
        for (const recurso of aba.recursos || []) {
            // A listagem atual exige tipo. '--' também é um placeholder.
            if (!recurso || !String(recurso.tipo ?? "").trim().replace(/[-–—\s]/g, "")) continue;
            if (Recursos.obterStatus({
                ...recurso, status: String(recurso.status ?? ""), placa: String(recurso.placa ?? "")
            }) === "disponivel") resumo.recursos++;
        }
    }
    return resumo;
}

function calcularResumoGeral(contratos, resumos = Object.values(contratos).filter(Boolean).map(calcularResumoContrato)) {
    return resumos.reduce((total, resumo) => {
        for (const campo of ["efetivo", "ausencias", "oms", "recursos"]) total[campo] += resumo[campo];
        total.contratos++;
        return total;
    }, { efetivo: 0, ausencias: 0, oms: 0, recursos: 0, contratos: 0 });
}

const DashboardResumo = {
    atualizar() {
        // Só resumos temporários: não mantém uma segunda cópia dos contratos.
        const resumos = new Map(Object.values(Dashboard.contratos).filter(Boolean)
            .map(contrato => [contrato.id, calcularResumoContrato(contrato)]));
        const geral = calcularResumoGeral(Dashboard.contratos, [...resumos.values()]);
        document.querySelectorAll("[data-dashboard-kpi]").forEach(elemento => {
            elemento.textContent = geral[elemento.dataset.dashboardKpi].toLocaleString("pt-BR");
        });
        document.querySelectorAll("[data-dashboard-contrato]").forEach(card => {
            const resumo = resumos.get(card.dataset.dashboardContrato);
            card.querySelectorAll("[data-dashboard-metrica]").forEach(elemento => {
                elemento.textContent = resumo ? resumo[elemento.dataset.dashboardMetrica].toLocaleString("pt-BR") : "—";
            });
            card.title = resumo ? "Recursos: somente disponíveis" : "Contrato não carregado";
        });
        const periodo = Dashboard.periodo;
        if (periodo) {
            document.querySelectorAll("[data-dashboard-periodo]").forEach(elemento => {
                elemento.textContent = periodo[elemento.dataset.dashboardPeriodo];
            });
            dashboardStatus.turno = periodo.turno;
            dashboardStatus.horario = periodo.horario;
            dashboardStatus.atualizacao = new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short"
            }).format(new Date());
            renderBanner();
        }
        return geral;
    }
};
window.DashboardResumo = DashboardResumo;


