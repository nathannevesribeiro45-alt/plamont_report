// ======================================
// UTILITÁRIOS DO SISTEMA
// ======================================

/**
 * Atalho para document.querySelector()
 */
function $(seletor) {
    return document.querySelector(seletor);
}

/**
 * Atalho para document.querySelectorAll()
 */
function $$(seletor) {
    return document.querySelectorAll(seletor);
}

/**
 * Soma todos os valores numéricos encontrados
 * dentro das tags <strong> de uma lista.
 */
function somarLista(lista) {

    if (!lista) return 0;

    let total = 0;

    lista.querySelectorAll("strong").forEach(item => {

        const valor = parseInt(item.textContent.trim(), 10);

        if (!isNaN(valor)) {
            total += valor;
        }

    });

    return total;

}

/**
 * Mostra um elemento.
 */
function mostrarElemento(elemento) {

    if (elemento) {
        elemento.style.display = "";
    }

}

/**
 * Esconde um elemento.
 */
function esconderElemento(elemento) {

    if (elemento) {
        elemento.style.display = "none";
    }

}

/**
 * Atualiza o texto de um elemento.
 */
function atualizarTexto(elemento, texto) {

    if (elemento) {
        elemento.textContent = texto;
    }

}

/**
 * Limpa todo o conteúdo de um elemento.
 */
function limparElemento(elemento) {

    if (elemento) {
        elemento.innerHTML = "";
    }

}

/**
 * Normaliza o texto de status de uma OM para uma das
 * quatro chaves usadas em todo o sistema:
 * "planejada" | "andamento" | "concluida" | "atrasada".
 *
 * Fonte única desta regra — usada pelo Mapa e pelo
 * Resumo de Atividades, para que os dois módulos nunca
 * divirjam sobre o que significa cada status vindo do JSON.
 */
function normalizarStatusOM(status) {

    const s = (status || "").trim().toLowerCase();

    if (!s) return "planejada";
    if (s.includes("posterg") || s.includes("atras")) return "atrasada";
    if (s.includes("andamento")) return "andamento";
    if (s.includes("conclu")) return "concluida";

    return "planejada";

}

/**
 * Ordem de prioridade usada para escolher o status
 * "representativo" de uma Frente de Trabalho no mapa,
 * quando ela agrupa várias OMs com status diferentes.
 *
 * O status mais crítico/urgente vence — assim o marcador
 * sempre chama atenção para a situação que mais precisa
 * de acompanhamento naquela frente.
 */
const PRIORIDADE_STATUS_FRENTE = ["atrasada", "andamento", "planejada", "concluida"];

/**
 * Recebe a lista de status (já normalizados) de todas as
 * OMs de uma frente e devolve o status que deve representar
 * o marcador daquela frente no mapa.
 */
function statusRepresentativoFrente(statusList) {

    for (const chave of PRIORIDADE_STATUS_FRENTE) {
        if (statusList.includes(chave)) return chave;
    }

    return "planejada";

}

/**
 * Converte latitude/longitude vindas do JSON do contrato
 * (texto, formato BR com vírgula, ex: "-2,564037") para número.
 * Retorna null quando a OM não possui coordenada válida —
 * nunca inventa um valor.
 */
function parseCoordenadaOM(valor) {

    if (valor === null || valor === undefined) return null;

    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : null;
    }

    const texto = String(valor).trim();

    if (!texto || texto.toLowerCase() === "null") return null;

    const numero = Number(texto.replace(",", "."));

    return Number.isFinite(numero) ? numero : null;

}