// ======================================
// RECURSOS.JS
// Responsável por renderizar os recursos
// disponíveis da aba atual
// ======================================

const Recursos = {

    // ======================================
    // Renderiza a seção
    // ======================================
    render(aba, container) {

        if (!aba || !aba.recursos) return;
        if (!container) return;

        const secao = this.criarSecao();

       const lista = secao.querySelector(".recursos-grid");

const recursos = aba.recursos.filter(recurso =>
    recurso?.tipo?.trim()
);

this.criarLista(
    recursos,
    lista
);

// Total de recursos
const total = recursos.length;

const painelTotal = secao.querySelector(".painel-total");

painelTotal.innerHTML = `
    ${total}
    recurso${total !== 1 ? "s" : ""}
    ${total !== 1 ? "listados" : "listado"}
`;

const header = secao.querySelector(".bloco-header");

const content = secao.querySelector(".bloco-content");

const toggle = secao.querySelector(".bloco-toggle");

header.addEventListener("click", () => {

    content.classList.toggle("recolhido");

    toggle.classList.toggle("recolhido");

});

container.appendChild(secao);

    },

    // ======================================
    // Cria a seção
    // ======================================
 criarSecao() {

    const secao = document.createElement("section");

    secao.className = "bloco card-recursos";

    secao.innerHTML = `

        <div class="bloco-header">

            <h2>

                ${Icons.carro}

                Recursos listados

            </h2>

            <span class="bloco-toggle">

                ▼

            </span>

        </div>

        <div class="bloco-content">

            <div class="recursos-grid"></div>

        </div>

        <div class="painel-total">

        </div>

    `;

    return secao;

},

// ======================================
// Cria a lista
// ======================================
criarLista(recursos, container) {

    if (!recursos.length) {

        container.innerHTML = `
            <div class="lista-vazia">
                <div class="lista-vazia-icone"></div>
                <h3>✅Nenhum recurso informado</h3>
                <p>Não há equipamentos cadastrados para este turno.</p>
            </div>
        `;

        return;

    }

    const grupos = {};

    recursos.forEach(recurso => {

        if (!recurso.tipo) return;

        if (!grupos[recurso.tipo]) {

            grupos[recurso.tipo] = [];

        }

        grupos[recurso.tipo].push(recurso);

    });

    Object.keys(grupos).forEach(tipo => {

        container.appendChild(

            this.criarItem(
                tipo,
                grupos[tipo]
            )

        );

    });

},

// ======================================
// Cria um card de recurso
// ======================================
criarItem(tipo, recursos) {

    const item = document.createElement("div");

    item.className = "recurso-card";

    let linhas = "";

    recursos.forEach(recurso => {

        const identificacao = this.obterIdentificacao(recurso);
        const status = this.obterStatus(recurso);

        linhas += `

            <div class="recurso-linha">

                <div class="recurso-identificacao">
                    <span class="recurso-linha-icone" aria-hidden="true">&#128663;</span>
                    <span class="recurso-placa-texto">${identificacao}</span>
                    ${this.criarStatus(status)}
                </div>

                <div class="recurso-operador">
                    ${this.formatarOperador(recurso)}
                </div>

            </div>

        `;

    });

    item.innerHTML = `

        <div class="recurso-header" role="button" tabindex="0" aria-expanded="false">

    <span class="recurso-icone">

        ${this.icone(tipo)}

    </span>

    <div class="recurso-titulo">

        <span class="recurso-nome">

            ${tipo}

        </span>

        <span class="recurso-quantidade">

            ${recursos.length}
            recurso${recursos.length > 1 ? "s" : ""}

        </span>

    </div>

    <span class="recurso-toggle" aria-hidden="true">&#9660;</span>

</div>

        <div class="recurso-info">

            ${linhas}

        </div>

    `;

    const header = item.querySelector(".recurso-header");

    const alternarDetalhes = () => {

        const aberto = item.classList.toggle("aberto");

        header.setAttribute("aria-expanded", String(aberto));

    };

    header.addEventListener("click", alternarDetalhes);

    header.addEventListener("keydown", evento => {

        if (evento.key === "Enter" || evento.key === " ") {

            evento.preventDefault();
            alternarDetalhes();

        }

    });

    return item;

},

formatarOperador(recurso) {

    const contatoInformado = (recurso.contato || "").trim();
    const operadorOriginal = (recurso.operador || "").trim();
    const contatoEncontrado = operadorOriginal.match(
        /\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/
    );
    const contato = contatoInformado || contatoEncontrado?.[0] || "";
    const nome = contato
        ? operadorOriginal.replace(contato, "").replace(/[\s()\-]+$/, "").trim()
        : operadorOriginal;

    return `
        <span class="recurso-operador-icone" aria-hidden="true">&#128119;</span>
        <span class="recurso-operador-dados">
            <span class="recurso-operador-nome">${nome || "--"}</span>
            ${contato ? `<span class="recurso-operador-contato">${contato}</span>` : ""}
        </span>
    `;

},

    obterIdentificacao(recurso) {

        return (recurso.placa || "--")
            .replace(/\s*\((?:preventiva|manuten[çc][ãa]o|problema[^)]*|quebrad[oa]|inoperante)\)\s*/gi, " ")
            .trim();

    },

    obterStatus(recurso) {

        const valorInformado = (recurso.status || "").trim().toLowerCase();
        const textoLegado = `${recurso.placa || ""} ${valorInformado}`.toLowerCase();

        if (valorInformado.includes("atend")) return "atendendo";
        if (valorInformado.includes("prevent")) return "preventiva";
        if (
           valorInformado.includes("manuten") ||
           valorInformado.includes("quebrad") ||
           valorInformado.includes("inoperante") ||
           textoLegado.includes("problema")
             ) return "manutencao";

          return "disponivel";

    },

    criarStatus(status) {

        const configuracoes = {
         disponivel: { rotulo: "Disponível", classe: "disponivel" },
         atendendo: { rotulo: "Atendendo", classe: "atendendo" },
         preventiva: { rotulo: "Preventiva", classe: "preventiva" },
         manutencao: { rotulo: "Manutenção", classe: "manutencao" }
};

        const configuracao = configuracoes[status] || configuracoes.disponivel;

        return `
            <span class="recurso-status recurso-status-${configuracao.classe}">
                <span class="recurso-status-ponto" aria-hidden="true"></span>
                ${configuracao.rotulo}
            </span>
        `;

    },
    // ======================================
    // Retorna o ícone
    // ======================================
    icone(tipo) {

        switch (tipo.toLowerCase()) {

            case "munck":
                return "🚛";

            case "pick-up":
                return "🚗";

            case "veículo leve":
                return "🚗";

            case "caminhão comboio":
                return "⛽";

            case "guindaste":
                return "🏗️";

            case "compressor":
                return "🛠️";

            case "torre de iluminação":
                return "💡";

            default:
                return "📦";

        }

    }

};
