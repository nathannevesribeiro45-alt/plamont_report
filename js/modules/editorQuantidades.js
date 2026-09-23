/* Operações de Nome + Quantidade extraídas do EditorQLP.
   Cada módulo mantém sua UI, mas grava somente no seu campo do rascunho global. */
window.EditorQuantidades = {
    grupos: Object.freeze({ direto: "Mão de Obra Direta", indireto: "Mão de Obra Indireta" }),
    linhas: null,
    container: null,
    sequencia: 0,
    acoesGlobais: false,
    obterGrupo(grupo) { return EditorRelatorio.rascunho[this.campo][grupo]; },
    definirGrupo(grupo, dados) { EditorRelatorio.rascunho[this.campo][grupo] = dados; },
    nomeReservado() { return false; },
    htmlComplementar() { return ""; },
    atualizarComplemento() {},
    objeto(valor) { return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}; },
    comparavel(qlp) {
        const dados = this.objeto(qlp);
        return { ...dados, direto: this.objeto(dados.direto), indireto: this.objeto(dados.indireto) };
    },
    iniciar(rascunho) {
        this.encerrar();
        rascunho[this.campo] = this.comparavel(rascunho[this.campo]);
        this.linhas = Object.fromEntries(Object.keys(this.grupos).map(grupo => [grupo,
            Object.entries(this.obterGrupo(grupo)).map(([nome, quantidade]) => ({ id: ++this.sequencia, chave: nome, nome, quantidade: String(quantidade ?? ""), nova: false }))
        ]));
    },
    encerrar() { this.linhas = null; this.container = null; },
    permitido() { return !!(this.linhas && window.EditorRelatorio?.ativo && EditorRelatorio.podeEditar()); },
    normalizarNome(nome) { return String(nome ?? "").trim().toLocaleLowerCase("pt-BR"); },
    normalizarQuantidade(valor) {
        if (!["string", "number"].includes(typeof valor) || String(valor).trim() === "") return null;
        const numero = Number(valor);
        return Number.isSafeInteger(numero) && numero >= 0 ? numero : null;
    },
    errosLinha(grupo, linha) {
        const nome = this.normalizarNome(linha.nome);
        return {
            nome: !nome ? "Informe o nome da função." : this.nomeReservado(nome) ? "Esse nome é reservado ao resumo de ausências." : this.linhas[grupo].some(outra => outra !== linha && this.normalizarNome(outra.nome) === nome)
                ? "Já existe uma função com esse nome neste grupo." : "",
            quantidade: this.normalizarQuantidade(linha.quantidade) === null ? "Use uma quantidade inteira, válida e maior ou igual a zero." : ""
        };
    },
    validar() {
        if (!this.linhas) return [];
        const erros = [];
        for (const grupo of Object.keys(this.grupos)) {
            for (const [indice, linha] of this.linhas[grupo].entries()) {
                const erro = this.errosLinha(grupo, linha);
                if (erro.nome || erro.quantidade) erros.push(`${this.titulo} — ${this.grupos[grupo]}, linha ${indice + 1}: ${erro.nome || erro.quantidade}`);
            }
            // Confere também o objeto que será enviado, inclusive dados antigos.
            const dados = this.obterGrupo(grupo);
            const nomes = new Set();
            for (const [nome, valor] of Object.entries(dados)) {
                const normalizado = this.normalizarNome(nome);
                if (!normalizado || this.nomeReservado(normalizado) || nomes.has(normalizado) || this.normalizarQuantidade(valor) === null) {
                    erros.push(`${this.titulo} — ${this.grupos[grupo]}: revise o nome e a quantidade de ${nome || "função sem nome"}.`);
                }
                nomes.add(normalizado);
            }
        }
        return erros;
    },
    temPendencias() { return !!this.linhas && this.validar().length > 0; },
    sincronizarLinha(grupo, linha) {
        const dados = this.obterGrupo(grupo);
        const quantidade = this.normalizarQuantidade(linha.quantidade);
        const nome = linha.nome.trim();
        const erroNome = this.errosLinha(grupo, linha).nome;
        // A chave aceita continua identificando a linha durante nomes inválidos.
        // Nunca sobrescrever a função vizinha enquanto houver uma duplicidade.
        const conflito = Object.keys(dados).some(chave => chave !== linha.chave && this.normalizarNome(chave) === this.normalizarNome(nome));
        if (!erroNome && !conflito && quantidade !== null) {
            const entradas = Object.entries(dados).map(([chave, valor]) => chave === linha.chave ? [nome, quantidade] : [chave, valor]);
            if (linha.chave === null) entradas.push([nome, quantidade]);
            this.definirGrupo(grupo, Object.fromEntries(entradas));
            linha.chave = nome;
        } else if (linha.chave !== null && quantidade !== null) {
            // Quantidade válida atualiza imediatamente, mesmo durante uma
            // correção ainda incompleta do nome da mesma função.
            Object.defineProperty(dados, linha.chave, { value: quantidade, enumerable: true, configurable: true, writable: true });
            this.definirGrupo(grupo, dados);
        }
    },
    atualizarCampo(evento) {
        const campo = evento.target.closest(`[data-${this.campo}-campo]`);
        if (!campo || !this.permitido()) return;
        const grupo = campo.getAttribute(`data-${this.campo}-grupo`);
        const linha = this.linhas[grupo]?.find(item => item.id === Number(campo.getAttribute(`data-${this.campo}-id`)));
        const nomeCampo = campo.getAttribute(`data-${this.campo}-campo`);
        if (!linha || !["nome", "quantidade"].includes(nomeCampo)) return;
        linha[nomeCampo] = campo.value;
        this.sincronizarLinha(grupo, linha);
        // Uma correção pode liberar outra linha antes duplicada.
        this.sincronizarGrupo(grupo);
        this.atualizarFeedback();
    },
    sincronizarGrupo(grupo) {
        const linhas = this.linhas[grupo];
        linhas.forEach(item => this.sincronizarLinha(grupo, item));
        // Se duas funções trocarem de nome, nenhuma chave antiga deve impedir
        // a troca nem sobrescrever a outra. Confirma o conjunto válido de uma vez.
        if (linhas.every(item => !Object.values(this.errosLinha(grupo, item)).some(Boolean))) {
            this.definirGrupo(grupo, Object.fromEntries(linhas.map(item => [item.nome.trim(), this.normalizarQuantidade(item.quantidade)])));
            linhas.forEach(item => { item.chave = item.nome.trim(); });
        }
    },
    adicionar(grupo) {
        if (!this.permitido() || !Object.hasOwn(this.grupos, grupo)) return;
        const linha = { id: ++this.sequencia, chave: null, nome: "", quantidade: "0", nova: true };
        this.linhas[grupo].push(linha);
        this.render(Dashboard.abaAtual, this.container);
        this.container.querySelector(`[data-${this.campo}-campo="nome"][data-${this.campo}-id="${linha.id}"]`)?.focus();
    },
    async remover(grupo, id) {
        if (!this.permitido()) return;
        const lista = this.linhas[grupo], linha = lista?.find(item => item.id === id);
        if (!linha) return;
        // Mantém o padrão do editor: confirma registros existentes, mas não
        // exige confirmação para desfazer uma linha criada nesta sessão.
        if (!linha.nova && !await EditorRelatorio.confirmar(`Remover função — ${this.titulo}?`, `${linha.nome || linha.chave} será removida somente do rascunho. Cancelar a edição restaura os valores anteriores.`, "Remover função")) return;
        if (!this.permitido() || this.linhas[grupo] !== lista) return;
        if (linha.chave !== null) {
            const dados = this.obterGrupo(grupo);
            delete dados[linha.chave];
            this.definirGrupo(grupo, dados);
        }
        lista.splice(lista.indexOf(linha), 1);
        this.sincronizarGrupo(grupo);
        this.render(Dashboard.abaAtual, this.container);
        this.container.querySelector(`[data-${this.campo}-adicionar="${grupo}"]`)?.focus();
    },
    htmlLinha(grupo, linha) {
        const esc = escaparHtml, prefixo = this.campo, attrs = `data-${prefixo}-grupo="${grupo}" data-${prefixo}-id="${linha.id}"`;
        return `<div class="editor-qlp-linha" data-${prefixo}-linha="${linha.id}">
            <label class="editor-qlp-nome">Função<input type="text" value="${esc(linha.nome)}" data-${prefixo}-campo="nome" ${attrs} aria-describedby="${prefixo}-erro-${linha.id}" autocomplete="off"></label>
            <label>Quantidade<input type="number" min="0" step="1" inputmode="numeric" value="${esc(linha.quantidade)}" data-${prefixo}-campo="quantidade" ${attrs} aria-describedby="${prefixo}-erro-${linha.id}"></label>
            <button type="button" class="editor-remover" data-${prefixo}-remover ${attrs} aria-label="Remover função ${esc(linha.nome || "nova")} de ${esc(this.grupos[grupo])}">Remover</button>
            <p class="editor-qlp-erro-linha" id="${prefixo}-erro-${linha.id}" data-${prefixo}-erro-linha hidden></p></div>`;
    },
    render(aba, container) {
        if (!container || !EditorRelatorio.deveEditarAba(aba) || !this.linhas) return;
        this.container = container;
        const secao = document.createElement("section");
        secao.className = `bloco editor-relatorio editor-qlp editor-quantidades editor-${this.campo}`;
        secao.setAttribute(`data-editor-${this.campo}`, "");
        secao.innerHTML = `<header class="editor-cabecalho"><div><span class="editor-etiqueta">Modo de edição</span><h2>${escaparHtml(this.cabecalho || this.titulo)}</h2><p>Edite funções e quantidades. Use as ações globais para aplicar ou cancelar o relatório inteiro.</p></div>
            ${this.acoesGlobais ? '<div class="editor-acoes"><button type="button" data-acao-editor="cancelar">Cancelar</button><button type="button" class="editor-primario" data-acao-editor="aplicar">Aplicar alterações</button></div>' : ''}</header>
            <p class="editor-erro" data-${this.campo}-erro role="alert" hidden></p>
            <div class="editor-qlp-grupos">${Object.entries(this.grupos).map(([grupo, titulo]) => `<section class="editor-qlp-grupo" aria-label="${titulo}"><h3>${titulo}</h3>
                <div>${this.linhas[grupo].length ? this.linhas[grupo].map(linha => this.htmlLinha(grupo, linha)).join("") : '<p class="editor-vazio">Nenhuma função. Adicione a primeira abaixo.</p>'}</div>
                <button type="button" class="editor-adicionar" data-${this.campo}-adicionar="${grupo}">+ Adicionar função</button>
                ${Object.keys(this.grupos).length > 1 ? `<p class="editor-qlp-subtotal">Total ${grupo === "direto" ? "Direto" : "Indireto"}: <output data-${this.campo}-total="${grupo}" aria-live="polite"></output></p>` : ''}</section>`).join("")}</div>
            ${this.htmlComplementar()}
            <p class="editor-qlp-total">Total ${escaparHtml(this.titulo)}: <output data-${this.campo}-total="geral" aria-live="polite"></output></p>`;
        const anterior = container.querySelector(`[data-editor-${this.campo}]`);
        if (anterior) anterior.replaceWith(secao); else container.append(secao);
        secao.addEventListener("input", evento => this.atualizarCampo(evento));
        secao.addEventListener("change", evento => this.atualizarCampo(evento));
        secao.addEventListener("click", evento => {
            const botao = evento.target.closest("button");
            if (!botao || !this.permitido()) return;
            if (botao.hasAttribute(`data-${this.campo}-adicionar`)) this.adicionar(botao.getAttribute(`data-${this.campo}-adicionar`));
            else if (botao.hasAttribute(`data-${this.campo}-remover`)) this.remover(botao.getAttribute(`data-${this.campo}-grupo`), Number(botao.getAttribute(`data-${this.campo}-id`)));
            else EditorRelatorio.executarAcao(evento);
        });
        this.atualizarFeedback();
    },
    atualizarFeedback() {
        if (!this.container || !this.linhas) return;
        const secao = this.container.querySelector(`[data-editor-${this.campo}]`);
        if (!secao) return;
        for (const grupo of Object.keys(this.grupos)) {
            for (const linha of this.linhas[grupo]) {
                const elemento = secao.querySelector(`[data-${this.campo}-linha="${linha.id}"]`), erros = this.errosLinha(grupo, linha);
                if (!elemento) continue;
                for (const campo of ["nome", "quantidade"]) elemento.querySelector(`[data-${this.campo}-campo="${campo}"]`).setAttribute("aria-invalid", String(!!erros[campo]));
                const aviso = elemento.querySelector(`[data-${this.campo}-erro-linha]`);
                aviso.textContent = erros.nome || erros.quantidade;
                aviso.hidden = !aviso.textContent;
            }
            const subtotal = secao.querySelector(`[data-${this.campo}-total="${grupo}"]`);
            if (subtotal) subtotal.textContent = this.calcularTotal(this.obterGrupo(grupo));
        }
        secao.querySelector(`[data-${this.campo}-total="geral"]`).textContent = this.calcularTotal(...Object.keys(this.grupos).map(grupo => this.obterGrupo(grupo)));
        secao.querySelector(`[data-${this.campo}-erro]`).hidden = true;
        this.atualizarComplemento(secao);
    },
    mostrarMensagem(texto) {
        const aviso = this.container?.querySelector(`[data-${this.campo}-erro]`);
        if (!aviso) return;
        aviso.textContent = texto; aviso.hidden = false;
        aviso.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
};
