/* Documentos das OMs: metadados no relatório, binários somente nesta página.
   Não conhece Supabase e não utiliza Storage, IndexedDB ou localStorage. */
window.AnexosOM = {
    MAX_ANEXO_BYTES: 20 * 1024 * 1024,
    // null = sem restrição de extensão. Configurável antes da etapa de Storage.
    EXTENSOES_PERMITIDAS: null,
    categorias: Object.freeze({ om: "OM", laudo: "Laudo", relatorio: "Relatório", desenho: "Desenho", procedimento: "Procedimento", evidencia: "Evidência", outro: "Outro" }),
    arquivosPendentes: new Map(),
    arquivosAplicados: new Map(),
    urlsTemporarias: new Map(),
    dialogo: null,
    sequencia: 0,

    listar(om) { return Array.isArray(om?.anexos) ? om.anexos.filter(a => a && typeof a === "object") : []; },
    ids(aba) { return new Set((aba?.atividades || []).flatMap(g => (g.oms || []).flatMap(om => this.listar(om).map(a => a.id)))); },
    arquivo(id) { return this.arquivosPendentes.get(id) || this.arquivosAplicados.get(id); },
    omEditavel(om) {
        const editor = window.EditorRelatorio;
        return window.Auth?.pode?.("editar") === true && editor?.ativo &&
            editor.rascunho.atividades.some(g => (g.oms || []).includes(om));
    },
    novoId() {
        return window.crypto?.randomUUID?.() || `anexo-${Date.now().toString(36)}-${++this.sequencia}-${Math.random().toString(36).slice(2)}`;
    },
    formatarTamanho(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return "Tamanho não informado";
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / (bytes < 1024 * 1024 ? 1024 : 1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${bytes < 1024 * 1024 ? "KB" : "MB"}`;
    },
    validarArquivo(arquivo) {
        if (!(arquivo instanceof File)) return "Selecione um arquivo válido.";
        if (!arquivo.size) return "O arquivo está vazio. Selecione outro documento.";
        if (arquivo.size > this.MAX_ANEXO_BYTES) return `O limite por anexo é ${this.formatarTamanho(this.MAX_ANEXO_BYTES)}.`;
        const extensao = arquivo.name.split(".").pop().toLowerCase();
        if (this.EXTENSOES_PERMITIDAS && !this.EXTENSOES_PERMITIDAS.includes(extensao)) return "Este tipo de arquivo não está permitido na configuração atual.";
        return null;
    },
    adicionar(om, arquivo, categoria) {
        if (!this.omEditavel(om)) throw new Error("Edição não permitida.");
        const erro = this.validarArquivo(arquivo);
        if (erro) throw new Error(erro);
        if (!Object.hasOwn(this.categorias, categoria)) throw new Error("Selecione uma categoria válida.");
        let id;
        const existentes = this.ids(window.EditorRelatorio.rascunho);
        do { id = this.novoId(); } while (existentes.has(id) || this.arquivo(id));
        const metadado = { id, nome: arquivo.name, categoria, mimeType: arquivo.type || "application/octet-stream", tamanho: arquivo.size, storagePath: null };
        if (!Array.isArray(om.anexos)) om.anexos = [];
        om.anexos.push(metadado);
        this.arquivosPendentes.set(id, arquivo);
        return metadado;
    },
    remover(om, id) {
        if (!this.omEditavel(om)) return false;
        const anexo = this.listar(om).find(a => a.id === id);
        // Persistidos e legados não são excluídos por esta camada.
        if (!anexo || anexo.storagePath || !this.arquivo(id)) return false;
        om.anexos.splice(om.anexos.indexOf(anexo), 1);
        this.revogarUrl(id);
        this.arquivosPendentes.delete(id);
        // Um binário aplicado antes desta edição é preservado até Aplicar,
        // permitindo Cancelar restaurar o documento da sessão anterior.
        return true;
    },
    iniciarSessao() { this.encerrarSessao(); },
    reconciliarRascunho(aba) {
        const manter = this.ids(aba);
        for (const id of this.arquivosPendentes.keys()) {
            if (!manter.has(id)) { this.revogarUrl(id); this.arquivosPendentes.delete(id); }
        }
        for (const id of this.urlsTemporarias.keys()) if (!manter.has(id)) this.revogarUrl(id);
    },
    aplicar(contratos) {
        const manter = new Set(Object.values(contratos).flatMap(c => (c.abas || []).flatMap(aba => [...this.ids(aba)])));
        for (const [id, arquivo] of this.arquivosPendentes) if (manter.has(id)) this.arquivosAplicados.set(id, arquivo);
        for (const id of this.arquivosAplicados.keys()) if (!manter.has(id)) this.arquivosAplicados.delete(id);
        this.encerrarSessao();
    },
    encerrarSessao() {
        this.fecharDialogo();
        this.revogarTodasUrls();
        this.arquivosPendentes.clear();
    },
    destruir() { this.encerrarSessao(); this.arquivosAplicados.clear(); },
    obterArquivosParaPayload(payload) {
        return new Map([...this.ids(payload?.dados)].filter(id => this.arquivo(id)).map(id => [id, this.arquivo(id)]));
    },
    garantirPayloadSerializavel(payload) {
        const visitar = valor => {
            if (valor instanceof Blob || valor instanceof Map || valor instanceof Set) throw new Error("O relatório deve conter apenas dados serializáveis, sem arquivos binários.");
            if (typeof valor === "string" && valor.startsWith("blob:")) throw new Error("URLs temporárias não podem fazer parte do relatório.");
            if (valor && typeof valor === "object") Object.values(valor).forEach(visitar);
        };
        visitar(payload);
        JSON.stringify(payload);
        return payload;
    },
    urlDocumento(valor) {
        if (typeof valor !== "string" || !valor.trim()) return null;
        try {
            const url = new URL(valor, document.baseURI);
            return ["https:", "http:"].includes(url.protocol) ? url.href : null;
        } catch { return null; }
    },
    documentosLegados(om) {
        return [
            { nome: "OM original", categoria: "om", caminho: om?.arquivoPdf || om?.pdf },
            { nome: "Laudo", categoria: "laudo", caminho: om?.laudo || om?.arquivoLaudo }
        ].filter(a => a.caminho).map(a => ({ ...a, url: this.urlDocumento(a.caminho) }));
    },
    render(om, { editavel = false, grupo = 0, indice = 0, legados = true, compacto = false } = {}) {
        const documentos = legados ? this.documentosLegados(om) : [];
        const anexos = this.listar(om);
        if (!editavel && !documentos.length && !anexos.length) return "";
        const esc = escaparHtml;
        // Apenas a leitura das atividades usa chips. O editor e as demais
        // áreas mantêm os detalhes e o mesmo ciclo de vida dos documentos.
        if (compacto && !editavel) {
            const chips = [...documentos, ...anexos].map((a, i) => {
                const categoria = this.categorias[a.categoria] || "Outro";
                const contexto = `${categoria} da OM ${om.numero || "não informada"}, documento ${i + 1}`;
                const titulo = esc(a.nome || categoria);
                const atributos = `class="om-anexo-chip" title="${titulo}"`;
                if (i < documentos.length && a.url) {
                    return `<a ${atributos} href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(`Abrir documento ${contexto} (nova aba)`)}">${esc(categoria)}</a>`;
                }
                if (i >= documentos.length && !a.storagePath && this.arquivo(a.id)) {
                    return `<button type="button" ${atributos} data-anexo-visualizar="${esc(a.id)}" aria-label="${esc(`Abrir documento ${contexto}: ${a.nome || categoria}`)}">${esc(categoria)}</button>`;
                }
                // Sem URL ou binário disponível, conserva a indisponibilidade
                // existente; não inventa resolução de Storage nesta etapa.
                return `<button type="button" class="om-anexo-chip" disabled title="${titulo} — Documento indisponível nesta página" aria-label="${esc(`Documento ${contexto} indisponível nesta página`)}">${esc(categoria)}</button>`;
            });
            return `<section class="om-anexos om-anexos--compactos" aria-label="Anexos da OM ${esc(om.numero || "não informada")}">
                <h5><span aria-hidden="true">${Icons.oms}</span> Anexos (${chips.length})</h5>
                <div class="om-anexos-lista">${chips.join("")}</div></section>`;
        }
        return `<section class="om-anexos" aria-label="Anexos da OM ${esc(om.numero || "nova")}">
            <h5><span aria-hidden="true">${Icons.oms}</span> Anexos</h5>
            <div class="om-anexos-lista">${documentos.map(a => `<article class="om-anexo-card"><div class="om-anexo-info"><strong>${esc(a.nome)}</strong><small>${esc(this.categorias[a.categoria])} · Documento existente</small></div><div class="om-anexo-acoes">${a.url ? `<a class="om-anexo-acao" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Visualizar</a>` : '<span class="om-anexo-indisponivel">Caminho indisponível</span>'}</div></article>`).join("")}
            ${anexos.map(a => {
                const local = !a.storagePath && !!this.arquivo(a.id);
                return `<article class="om-anexo-card" data-anexo-card="${esc(a.id)}"><div class="om-anexo-info"><strong>${esc(a.nome || "Documento")}</strong><small>${esc(this.categorias[a.categoria] || a.categoria || "Outro")} · ${esc(this.formatarTamanho(a.tamanho))}</small><span class="om-anexo-etiqueta">${a.storagePath ? "Documento persistido" : local ? "Somente nesta página" : "Arquivo local indisponível"}</span></div><div class="om-anexo-acoes">
                ${local ? `<button type="button" class="om-anexo-acao" data-anexo-visualizar="${esc(a.id)}">Visualizar</button>` : '<span class="om-anexo-indisponivel">' + (a.storagePath ? "Acesso ao Storage disponível em uma próxima etapa" : "Selecione o arquivo novamente em um novo anexo") + '</span>'}
                ${editavel && local ? `<button type="button" class="om-anexo-acao om-anexo-remover" data-anexo-remover="${esc(a.id)}" data-grupo="${grupo}" data-om="${indice}">Remover</button>` : ""}</div></article>`;
            }).join("")}${!documentos.length && !anexos.length ? '<p class="om-anexos-vazio">Nenhum documento nesta OM.</p>' : ""}</div>
            ${editavel ? `<button type="button" class="om-anexo-adicionar" data-anexo-adicionar data-grupo="${grupo}" data-om="${indice}"><span aria-hidden="true">${Icons.mais}</span> Adicionar anexo</button>
            <input type="file" hidden data-anexo-input data-grupo="${grupo}" data-om="${indice}" aria-label="Selecionar anexo da OM ${esc(om.numero || "nova")}">
            <p class="om-anexos-ajuda">Até ${this.formatarTamanho(this.MAX_ANEXO_BYTES)} por arquivo. Sem envio ao servidor. F5 descarta os anexos locais.</p>` : ""}</section>`;
    },
    atualizarArea(om, g, o) {
        const secao = window.EditorRelatorio.container?.querySelector(`[data-editor-om="${g}-${o}"] .om-anexos`);
        if (secao) secao.outerHTML = this.render(om, { editavel: true, grupo: g, indice: o });
    },
    criarDialogo(titulo, classe = "") {
        this.fecharDialogo();
        const elemento = document.createElement("dialog");
        elemento.className = `editor-confirmacao anexo-dialog ${classe}`;
        elemento.setAttribute("aria-labelledby", "anexo-dialog-titulo");
        elemento.innerHTML = `<header class="anexo-dialog-cabecalho"><h2 id="anexo-dialog-titulo"></h2><button type="button" data-anexo-fechar aria-label="Fechar documento">${Icons.fechar}</button></header><div class="anexo-dialog-corpo"></div>`;
        elemento.querySelector("h2").textContent = titulo;
        const estado = { elemento, foco: document.activeElement, limpar: null };
        this.dialogo = estado;
        elemento.querySelector("[data-anexo-fechar]").onclick = () => this.fecharDialogo();
        elemento.addEventListener("cancel", evento => { evento.preventDefault(); this.fecharDialogo(); });
        elemento.addEventListener("close", () => { if (this.dialogo === estado) this.fecharDialogo(); });
        document.body.append(elemento);
        elemento.showModal();
        return estado;
    },
    fecharDialogo() {
        const estado = this.dialogo;
        if (!estado) return;
        this.dialogo = null;
        estado.elemento.close(); estado.elemento.remove();
        estado.limpar?.();
        if (estado.foco?.isConnected) estado.foco.focus({ preventScroll: true });
    },
    abrirInclusao(om, arquivo, g, o) {
        if (!this.omEditavel(om)) return;
        const erro = this.validarArquivo(arquivo);
        if (erro) { window.EditorRelatorio.mostrarMensagem(erro); return; }
        const estado = this.criarDialogo("Adicionar anexo");
        estado.elemento.querySelector(".anexo-dialog-corpo").innerHTML = `<p class="anexo-nome-escolhido">${escaparHtml(arquivo.name)}</p><p class="om-anexos-ajuda">${this.formatarTamanho(arquivo.size)} · Somente nesta página</p>
            <label>Categoria<select data-anexo-categoria>${Object.entries(this.categorias).map(([chave,nome]) => `<option value="${chave}">${nome}</option>`).join("")}</select></label>
            <p data-anexo-erro role="alert" hidden></p><div class="editor-acoes"><button type="button" data-anexo-cancelar>Cancelar</button><button type="button" data-anexo-confirmar>Adicionar</button></div>`;
        estado.elemento.querySelector("[data-anexo-cancelar]").onclick = () => this.fecharDialogo();
        estado.elemento.querySelector("[data-anexo-confirmar]").onclick = () => {
            try {
                this.adicionar(om, arquivo, estado.elemento.querySelector("select").value);
                this.fecharDialogo(); this.atualizarArea(om, g, o);
                window.EditorRelatorio.container?.querySelector(`[data-editor-om="${g}-${o}"] [data-anexo-adicionar]`)?.focus({ preventScroll: true });
            } catch (erro) {
                const mensagem = estado.elemento.querySelector("[data-anexo-erro]");
                mensagem.hidden = false; mensagem.textContent = erro.message;
            }
        };
        estado.elemento.querySelector("select").focus();
    },
    revogarUrl(id) {
        const url = this.urlsTemporarias.get(id);
        if (url) URL.revokeObjectURL(url);
        this.urlsTemporarias.delete(id);
    },
    revogarTodasUrls() { for (const id of this.urlsTemporarias.keys()) this.revogarUrl(id); },
    async visualizar(id) {
        const arquivo = this.arquivo(id);
        if (!arquivo) return;
        const estado = this.criarDialogo(arquivo.name, "anexo-preview");
        const corpo = estado.elemento.querySelector(".anexo-dialog-corpo");
        const extensao = arquivo.name.split(".").pop().toLowerCase();
        const candidatoPdf = extensao === "pdf" && ["application/pdf", "", "application/octet-stream"].includes(arquivo.type);
        // Confere o cabeçalho antes de entregar um PDF ao visualizador nativo.
        let pdf = false;
        if (candidatoPdf) {
            try { pdf = (await arquivo.slice(0, 5).text()) === "%PDF-"; } catch { /* download continua disponível */ }
            if (this.dialogo !== estado) return;
        }
        const imagem = /^(png|jpe?g|gif|webp)$/.test(extensao) && /^image\/(png|jpeg|gif|webp)$/.test(arquivo.type);
        const texto = /^(txt|csv|json|log)$/.test(extensao);
        // Não executar HTML, SVG ou scripts anexados na origem do sistema.
        const url = URL.createObjectURL(new Blob([arquivo], { type: pdf ? "application/pdf" : imagem ? arquivo.type : "application/octet-stream" }));
        this.urlsTemporarias.set(id, url);
        estado.limpar = () => this.revogarUrl(id);
        const link = document.createElement("a"); link.href = url; link.download = arquivo.name;
        link.className = "om-anexo-acao"; link.textContent = "Baixar arquivo";
        corpo.append(link);
        if (pdf && navigator.pdfViewerEnabled !== false) {
            const frame = document.createElement("iframe"); frame.title = "Prévia do documento PDF";
            // O sandbox de iframe bloqueia o plugin PDF dos navegadores. Somente
            // bytes com cabeçalho PDF, servidos como application/pdf, chegam aqui.
            frame.src = url;
            corpo.append(frame);
            const dica = document.createElement("p"); dica.className = "om-anexos-ajuda";
            dica.textContent = "Se o navegador não exibir o PDF, use Baixar arquivo."; corpo.append(dica);
        } else if (pdf) {
            const aviso = document.createElement("p");
            aviso.textContent = "Este navegador não oferece visualização de PDF. Use Baixar arquivo para abrir o documento no leitor do dispositivo.";
            corpo.append(aviso);
        } else if (imagem) {
            const img = document.createElement("img"); img.src = url; img.alt = arquivo.name; corpo.append(img);
        } else if (texto) {
            const pre = document.createElement("pre"); corpo.append(pre);
            try {
                const conteudo = await arquivo.slice(0, 1024 * 1024).text();
                if (this.dialogo === estado) pre.textContent = conteudo + (arquivo.size > 1024 * 1024 ? "\n[Prévia limitada ao primeiro MB. Baixe para ver o arquivo completo.]" : "");
            } catch { if (this.dialogo === estado) pre.textContent = "Não foi possível ler a prévia. Use Baixar arquivo."; }
        } else {
            const aviso = document.createElement("p"); aviso.textContent = "Este formato não possui prévia local. Baixe o arquivo para abri-lo em um aplicativo compatível."; corpo.append(aviso);
        }
    }
};

// Eventos delegados: continuam válidos após Render atualizar cards ou mapa.
document.addEventListener("click", evento => {
    const botao = evento.target.closest("[data-anexo-adicionar], [data-anexo-remover], [data-anexo-visualizar]");
    if (!botao) return;
    evento.stopPropagation();
    if (botao.hasAttribute("data-anexo-visualizar")) { AnexosOM.visualizar(botao.dataset.anexoVisualizar); return; }
    const g = Number(botao.dataset.grupo), o = Number(botao.dataset.om);
    const om = window.EditorRelatorio?.rascunho?.atividades[g]?.oms?.[o];
    if (!AnexosOM.omEditavel(om)) return;
    if (botao.hasAttribute("data-anexo-adicionar")) botao.closest(".om-anexos").querySelector("input[type=file]").click();
    else if (AnexosOM.remover(om, botao.dataset.anexoRemover)) {
        AnexosOM.atualizarArea(om, g, o);
        window.EditorRelatorio.container?.querySelector(`[data-editor-om="${g}-${o}"] [data-anexo-adicionar]`)?.focus({ preventScroll: true });
    }
});
document.addEventListener("change", evento => {
    const input = evento.target.closest("[data-anexo-input]");
    if (!input) return;
    const arquivo = input.files?.[0]; input.value = "";
    if (!arquivo) return;
    const g = Number(input.dataset.grupo), o = Number(input.dataset.om);
    const om = window.EditorRelatorio?.rascunho?.atividades[g]?.oms?.[o];
    AnexosOM.abrirInclusao(om, arquivo, g, o);
});
document.addEventListener("plamont:auth-alterado", () => { AnexosOM.fecharDialogo(); AnexosOM.revogarTodasUrls(); });
window.addEventListener("pagehide", () => AnexosOM.destruir());
