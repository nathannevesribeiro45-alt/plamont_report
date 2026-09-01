// ======================================
// MAPAPAINEL.JS
// Responsável por renderizar o painel
// lateral do mapa.
//
// Uma FRENTE gera um único marcador no mapa,
// mas pode ter N líderes trabalhando nela.
// Este módulo renderiza cada líder em seu
// próprio slide de um carrossel — nome,
// telefone, equipe e OMs nunca se misturam
// entre líderes diferentes.
// ======================================

const MapaPainel = {

    // Fotos carregadas para a tela atual.
    // O armazenamento compartilhado usa Supabase Storage quando configurado.
    // IndexedDB permanece como fallback local até a configuração do projeto.
    fotosCapturadas: new Map(),
    bancoFotos: null,
    LIMITE_FOTOS_POR_OM: 5,

    armazenamentoCompartilhadoAtivo() {
        return typeof FotosStorage !== "undefined" && FotosStorage.configurado();
    },

    render(dado, statusConfig) {

        const cfg = statusConfig[dado.status];

        // Compatibilidade: aceita tanto o novo formato
        // (dado.lideres — array, um marcador por frente)
        // quanto o formato antigo (dado.lider — objeto único),
        // caso algum outro ponto do sistema ainda o utilize.
        const lideres = Array.isArray(dado.lideres)
            ? dado.lideres
            : (dado.lider ? [dado.lider] : []);

        const contrato = dado.contrato;

        const aba = dado.aba;

        const tituloFrente = dado.frente || lideres[0]?.lider || "Sem frente";

        return `
        <div class="mapa-painel-topo">
                <div class="mapa-painel-titulo">
                    <span class="mapa-painel-pino ${cfg.classe}"></span>
                    <div>
                        <h2>${tituloFrente}</h2>
                        <div class="mapa-painel-categoria">${aba?.nome || ""}</div>
                    </div>
                </div>
                <span class="mapa-painel-badge ${cfg.classe}">${cfg.label}</span>
            </div>

            <p class="mapa-painel-local">📍 ${contrato?.nome || ""}</p>

            ${this.renderLideres(lideres, statusConfig, dado)}
    `;

    },

    // ======================================
    // Renderiza o bloco de líder(es).
    // - 1 líder  → card simples, sem controles.
    // - 2+ líderes → carrossel com setas/indicadores
    //   (desktop) e swipe nativo (mobile).
    // ======================================
    renderLideres(lideres, statusConfig, contexto = null) {

        if (!lideres.length) {

            return `
                <div class="mapa-painel-secao">
                    <div class="mapa-painel-secao-titulo">ℹ️ Situação</div>
                    <p class="mapa-painel-obs vazio">Nenhuma equipe lançada para esta frente hoje.</p>
                </div>
            `;

        }

        const multiplo = lideres.length > 1;

        return `
            <div class="mapa-painel-secao mapa-painel-secao-lideres">
                <div class="mapa-painel-secao-titulo mapa-painel-lideres-titulo">
                    <span>👷 Líder${multiplo ? "es responsáveis" : " responsável"}</span>
                    ${multiplo ? `<span class="mapa-painel-lideres-contador">1/${lideres.length}</span>` : ""}
                </div>

                <div class="mapa-painel-carrossel-wrap${multiplo ? "" : " unico"}">

                    ${multiplo ? `
                        <button type="button" class="mapa-painel-seta mapa-painel-seta-esq" aria-label="Líder anterior" onclick="MapaPainel.navegar(this, -1)">‹</button>
                    ` : ""}

                    <div class="mapa-painel-carrossel" onscroll="MapaPainel.aoRolar(this)">
                        <div class="mapa-painel-carrossel-track">
                            ${lideres.map((lider) => this.renderLiderSlide(lider, statusConfig, contexto)).join("")}
                        </div>
                    </div>

                    ${multiplo ? `
                        <button type="button" class="mapa-painel-seta mapa-painel-seta-dir" aria-label="Próximo líder" onclick="MapaPainel.navegar(this, 1)">›</button>
                    ` : ""}

                </div>

                ${multiplo ? `
                    <div class="mapa-painel-dots">
                        ${lideres.map((_, indice) => `
                            <span class="mapa-painel-dot${indice === 0 ? " ativo" : ""}" onclick="MapaPainel.irPara(this, ${indice})"></span>
                        `).join("")}
                    </div>
                ` : ""}

            </div>
        `;

    },

    // ======================================
    // Renderiza o slide de um único líder:
    // nome, telefone, equipe e OMs — todos
    // exclusivos deste líder.
    // ======================================
    renderLiderSlide(lider, statusConfig, contexto = null) {

        const equipe = this.parseEquipe(lider.equipe);
        const totalEquipe = equipe.reduce((soma, item) => soma + item.qtd, 0);
        const oms = lider.oms || [];

        return `
            <div class="mapa-painel-lider-slide">

                <div class="mapa-painel-lider-nome">${lider.lider}</div>
                ${lider.telefone ? `
                    <div class="mapa-painel-lider-linha">
                        <span class="mapa-painel-telefone">📞 ${lider.telefone}</span>
                        <a class="mapa-painel-whats" href="https://wa.me/55${lider.telefone.replace(/\D/g, "")}" target="_blank" rel="noopener" title="Chamar no WhatsApp">
                            <svg fill="currentColor" viewbox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4Z"></path><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.5-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z"></path></svg>
                        </a>
                    </div>
                ` : ""}

                ${equipe.length ? `
                    <div class="mapa-painel-lider-bloco">
                        <div class="mapa-painel-secao-titulo">👥 Equipe do dia</div>
                        <div class="mapa-painel-lista">
                            ${equipe.map(item => `
                                <div class="mapa-painel-lista-linha">
                                    <span>${item.cargo}</span>
                                    <span>${item.qtd}</span>
                                </div>
                            `).join("")}
                            <div class="mapa-painel-lista-linha total">
                                <span>Total</span>
                                <span>${totalEquipe}</span>
                            </div>
                        </div>
                    </div>
                ` : ""}

                ${oms.length ? `
                    <div class="mapa-painel-lider-bloco">
                        <div class="mapa-painel-secao-titulo">📋 Atividades (${oms.length})</div>
                        <div class="mapa-painel-atividades">
                            ${oms.map(om => {

                                const statusOm = normalizarStatusOM(om.status);
                                const cfgOm = statusConfig[statusOm];
                                return `
                                    <div class="mapa-painel-atividade" data-fotos-om="${this.chaveFoto(om, lider, contexto)}">
                                        <span class="mapa-painel-atividade-dot ${cfgOm.classe}"></span>
                                        <div class="mapa-painel-atividade-texto">
                                            <div class="mapa-painel-atividade-numero">OM ${om.numero || "—"}</div>
                                            <div class="mapa-painel-atividade-descricao">${om.descricao || ""}</div>

                                            <div class="mapa-painel-foto-acoes">
                                                <button type="button" class="mapa-painel-btn-foto" onclick="MapaPainel.abrirCamera(this)" title="Tirar foto desta atividade">
                                                    <span aria-hidden="true">📷</span> Tirar foto
                                                </button>
                                                <input class="mapa-painel-input-foto" type="file" accept="image/*" capture="environment" data-chave-foto="${this.chaveFoto(om, lider, contexto)}" onchange="MapaPainel.receberFoto(this)" aria-label="Tirar foto da OM ${om.numero || ""}">
                                            </div>

                                            <div class="mapa-painel-fotos" data-galeria-fotos="${this.chaveFoto(om, lider, contexto)}">
                                                ${this.renderFotos(om, lider, contexto)}
                                            </div>
                                        </div>
                                    </div>
                                `;

                            }).join("")}
                        </div>
                    </div>
                ` : `
                    <div class="mapa-painel-lider-bloco">
                        <p class="mapa-painel-obs vazio">Nenhuma OM lançada para este líder hoje.</p>
                    </div>
                `}

                ${this.renderObservacoes(lider, oms)}

                ${this.renderAnexos(lider, oms)}

            </div>
        `;

    },

    // ======================================
    // Observações do líder
    //
    // Fonte prioritária: lider.observacoes.
    // Também aceita observação/observacoes dentro da OM,
    // permitindo reaproveitar a mesma estrutura dos dados
    // sem criar uma segunda regra para o mapa.
    // ======================================
    renderObservacoes(lider, oms) {

        const observacoesLider = Array.isArray(lider.observacoes)
            ? lider.observacoes
            : (lider.observacoes ? [lider.observacoes] : []);

        const observacoesOms = (oms || []).flatMap(om => {
            if (Array.isArray(om.observacoes)) return om.observacoes;
            if (om.observacoes) return [om.observacoes];
            if (om.observacao) return [om.observacao];
            return [];
        });

        const observacoes = [...observacoesLider, ...observacoesOms]
            .map(obs => typeof obs === "string" ? obs.trim() : "")
            .filter(Boolean)
            .filter((obs, indice, lista) => lista.indexOf(obs) === indice);

        return `
            <div class="mapa-painel-lider-bloco">
                <div class="mapa-painel-secao-titulo">📝 Observações</div>
                ${observacoes.length ? `
                    <div class="mapa-painel-observacoes-lista">
                        ${observacoes.map(obs => `
                            <p class="mapa-painel-obs">${obs}</p>
                        `).join("")}
                    </div>
                ` : `
                    <p class="mapa-painel-obs vazio">Nenhuma observação registrada para este líder.</p>
                `}
            </div>
        `;

    },

    // ======================================
    // Anexos do líder
    //
    // Reaproveita os PDFs já usados pelas atividades:
    // om.arquivoPdf / om.pdf / om.laudo / om.arquivoLaudo.
    // Também aceita lider.anexos para documentos próprios
    // do líder, caso sejam adicionados ao JSON futuramente.
    // ======================================
    renderAnexos(lider, oms) {

        const anexos = [];

        (oms || []).forEach(om => {

            const arquivoPdf = om.arquivoPdf || om.pdf;
            const arquivoLaudo = om.laudo || om.arquivoLaudo;

            if (arquivoPdf) {
                anexos.push({
                    arquivo: arquivoPdf,
                    titulo: `PDF da OM ${om.numero || ""}`.trim(),
                    tipo: "pdf"
                });
            }

            if (arquivoLaudo) {
                anexos.push({
                    arquivo: arquivoLaudo,
                    titulo: `Laudo da OM ${om.numero || ""}`.trim(),
                    tipo: "pdf"
                });
            }

        });

        if (Array.isArray(lider.anexos)) {

            lider.anexos.forEach(anexo => {

                if (!anexo) return;

                if (typeof anexo === "string") {
                    anexos.push({
                        arquivo: anexo,
                        titulo: "Documento PDF",
                        tipo: "pdf"
                    });
                    return;
                }

                const arquivo = anexo.arquivo || anexo.url || anexo.pdf || anexo.arquivoPdf;
                if (!arquivo) return;

                anexos.push({
                    arquivo,
                    titulo: anexo.titulo || anexo.nome || "Documento PDF",
                    tipo: "pdf"
                });

            });

        }

        const unicos = anexos.filter((anexo, indice, lista) =>
            lista.findIndex(item => item.arquivo === anexo.arquivo) === indice
        );

        return `
            <div class="mapa-painel-lider-bloco">
                <div class="mapa-painel-secao-titulo">📎 Anexos</div>
                ${unicos.length ? `
                    <div class="mapa-painel-anexos">
                        ${unicos.map(anexo => `
                            <a class="mapa-painel-anexo pdf disponivel" href="${anexo.arquivo}" target="_blank" rel="noopener" title="Abrir ${anexo.titulo}">
                                <svg fill="none" viewbox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path><path d="M14 2v6h6" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path></svg>
                                ${anexo.titulo}
                            </a>
                        `).join("")}
                    </div>
                ` : `
                    <p class="mapa-painel-obs vazio">Nenhum documento anexado para este líder.</p>
                `}
            </div>
        `;

    },

    // ======================================
    // Câmera / fotos das atividades
    //
    // As fotos são persistidas no IndexedDB do navegador. Isso mantém as
    // imagens disponíveis após recarregar/fechar o site no mesmo dispositivo.
    // O limite atual é de 5 fotos por OM/líder.
    // ======================================
    async abrirBancoFotos() {

        if (this.bancoFotos) return this.bancoFotos;

        if (!window.indexedDB) {
            throw new Error("O navegador não oferece IndexedDB.");
        }

        this.bancoFotos = new Promise((resolve, reject) => {

            const request = indexedDB.open("ReportDiarioPlamont", 1);

            request.onupgradeneeded = () => {

                const db = request.result;

                if (!db.objectStoreNames.contains("fotos")) {
                    const store = db.createObjectStore("fotos", { keyPath: "id", autoIncrement: true });
                    store.createIndex("chave", "chave", { unique: false });
                }

            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento das fotos."));

        });

        return this.bancoFotos;

    },

    chaveFoto(om, lider = null, contexto = null) {

        const contratoId = String(
            contexto?.contrato?.id ||
            contexto?.contratoId ||
            "sem-contrato"
        );
        const abaId = String(
            contexto?.aba?.id ||
            contexto?.abaId ||
            "sem-aba"
        );
        const frente = String(
            contexto?.frente ||
            om?.frente ||
            "sem-frente"
        );
        const nomeLider = String(lider?.lider || "sem-lider");
        const numero = String(om?.numero || "sem-om");

        // A foto pertence à atividade exata.
        // Contrato + aba + frente + líder + OM impedem colisões mesmo quando:
        // - dois líderes trabalham na mesma frente;
        // - dois líderes possuem a mesma OM;
        // - um líder possui várias OMs;
        // - a mesma OM aparece em contratos/abas diferentes.
        return [contratoId, abaId, frente, nomeLider, numero].join("::");

    },

    async hidratarFotos(container) {

        try {

            const atividades = container?.querySelectorAll("[data-fotos-om]") || [];
            const chaves = [...new Set([...atividades].map(item => item.dataset.fotosOm).filter(Boolean))];

            if (!chaves.length) return;

            await Promise.all(chaves.map(async chave => {

                let fotos;

                if (this.armazenamentoCompartilhadoAtivo()) {
                    const registros = await FotosStorage.listar(chave);
                    fotos = (registros || []).map(registro => ({
                        ...registro,
                        arquivo: null
                    }));
                } else {
                    const db = await this.abrirBancoFotos();
                    const registros = await this.buscarFotosBanco(db, chave);
                    fotos = registros.map(registro => ({
                        id: registro.id,
                        arquivo: registro.blob,
                        url: URL.createObjectURL(registro.blob),
                        nome: registro.nome || `foto-${registro.id}.jpg`,
                        criadaEm: registro.criadaEm
                    }));
                }

                this.liberarUrlsDaChave(chave);
                this.fotosCapturadas.set(chave, fotos);

            }));

            atividades.forEach(atividade => {
                const chave = atividade.dataset.fotosOm;
                const galeria = atividade.querySelector("[data-galeria-fotos]");
                const botao = atividade.querySelector(".mapa-painel-btn-foto");

                if (galeria) galeria.innerHTML = this.renderFotosPorChave(chave);
                this.atualizarBotaoFoto(botao, chave);
            });

        } catch (erro) {
            console.error("Erro ao carregar fotos persistidas:", erro);
        }

    },

    buscarFotosBanco(db, chave) {

        return new Promise((resolve, reject) => {

            const transacao = db.transaction("fotos", "readonly");
            const index = transacao.objectStore("fotos").index("chave");
            const request = index.getAll(IDBKeyRange.only(chave));

            request.onsuccess = () => resolve(request.result.sort((a, b) => a.criadaEm - b.criadaEm));
            request.onerror = () => reject(request.error);

        });

    },

    salvarFotoBanco(db, registro) {

        return new Promise((resolve, reject) => {

            const transacao = db.transaction("fotos", "readwrite");
            const request = transacao.objectStore("fotos").add(registro);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

        });

    },

    apagarFotoBanco(db, id) {

        return new Promise((resolve, reject) => {

            const transacao = db.transaction("fotos", "readwrite");
            const request = transacao.objectStore("fotos").delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);

        });

    },

    liberarUrlsDaChave(chave) {

        const fotos = this.fotosCapturadas.get(chave) || [];
        fotos.forEach(foto => {
            if (foto.url) URL.revokeObjectURL(foto.url);
        });

    },

    atualizarBotaoFoto(botao, chave) {

        if (!botao) return;

        const quantidade = (this.fotosCapturadas.get(chave) || []).length;
        const limite = this.LIMITE_FOTOS_POR_OM;
        const atingiuLimite = quantidade >= limite;

        botao.disabled = atingiuLimite;
        botao.classList.toggle("limite", atingiuLimite);
        botao.innerHTML = atingiuLimite
            ? `<span aria-hidden="true">✓</span> Limite atingido (${limite}/${limite})`
            : `<span aria-hidden="true">📷</span> Tirar foto (${quantidade}/${limite})`;
        botao.title = atingiuLimite
            ? `Limite de ${limite} fotos atingido para esta atividade`
            : "Tirar foto desta atividade";

    },

    abrirCamera(botao) {

        const atividade = botao.closest(".mapa-painel-atividade");
        const input = atividade?.querySelector(".mapa-painel-input-foto");

        if (!input) return;

        const chave = input.dataset.chaveFoto;
        const quantidade = (this.fotosCapturadas.get(chave) || []).length;

        if (quantidade >= this.LIMITE_FOTOS_POR_OM) {
            alert(`Esta atividade já possui o limite de ${this.LIMITE_FOTOS_POR_OM} fotos.`);
            return;
        }

        input.value = "";
        input.click();

    },

    async receberFoto(input) {

        const arquivo = input?.files?.[0];
        const chave = input?.dataset?.chaveFoto;

        if (!arquivo || !chave) return;

        if (!arquivo.type.startsWith("image/")) {
            alert("Selecione uma imagem para anexar à atividade.");
            input.value = "";
            return;
        }

        const fotos = this.fotosCapturadas.get(chave) || [];

        if (fotos.length >= this.LIMITE_FOTOS_POR_OM) {
            alert(`Esta atividade já possui o limite de ${this.LIMITE_FOTOS_POR_OM} fotos.`);
            input.value = "";
            return;
        }

        try {

            const imagem = await this.prepararImagem(arquivo);
            const nome = arquivo.name || `foto-${Date.now()}.jpg`;
            let foto;

            if (this.armazenamentoCompartilhadoAtivo()) {
                foto = await FotosStorage.salvar(chave, imagem, nome);
                if (!foto) throw new Error("O armazenamento compartilhado não retornou a foto salva.");
            } else {
                const db = await this.abrirBancoFotos();
                const registro = {
                    chave,
                    blob: imagem,
                    nome,
                    criadaEm: Date.now()
                };

                const id = await this.salvarFotoBanco(db, registro);
                foto = {
                    id,
                    arquivo: imagem,
                    url: URL.createObjectURL(imagem),
                    nome: registro.nome,
                    criadaEm: registro.criadaEm
                };
            }

            fotos.push(foto);
            this.fotosCapturadas.set(chave, fotos);

            const galeria = input.closest(".mapa-painel-atividade")?.querySelector("[data-galeria-fotos]");
            const botao = input.closest(".mapa-painel-atividade")?.querySelector(".mapa-painel-btn-foto");

            if (galeria) galeria.innerHTML = this.renderFotosPorChave(chave);
            this.atualizarBotaoFoto(botao, chave);

        } catch (erro) {
            console.error("Erro ao salvar foto:", erro);
            alert("Não foi possível salvar a foto. Tente novamente.");
        } finally {
            input.value = "";
        }

    },

    prepararImagem(arquivo) {

        return new Promise((resolve, reject) => {

            const leitor = new FileReader();

            leitor.onload = () => {

                const imagem = new Image();

                imagem.onload = () => {

                    const maximo = 1600;
                    const escala = Math.min(1, maximo / Math.max(imagem.width, imagem.height));
                    const largura = Math.max(1, Math.round(imagem.width * escala));
                    const altura = Math.max(1, Math.round(imagem.height * escala));
                    const canvas = document.createElement("canvas");

                    canvas.width = largura;
                    canvas.height = altura;

                    const contexto = canvas.getContext("2d");
                    contexto.drawImage(imagem, 0, 0, largura, altura);

                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error("Não foi possível preparar a imagem."));
                    }, "image/jpeg", 0.82);

                };

                imagem.onerror = () => reject(new Error("Não foi possível ler a imagem."));
                imagem.src = leitor.result;

            };

            leitor.onerror = () => reject(leitor.error || new Error("Falha ao ler a foto."));
            leitor.readAsDataURL(arquivo);

        });

    },

    renderFotos(om, lider = null, contexto = null) {

        return this.renderFotosPorChave(this.chaveFoto(om, lider, contexto));

    },

    renderFotosPorChave(chave) {

        const fotos = this.fotosCapturadas.get(chave) || [];

        if (!fotos.length) return "";

        return fotos.map((foto, indice) => `
            <button type="button" class="mapa-painel-foto-thumb" onclick="MapaPainel.visualizarFoto('${chave.replace(/'/g, "\\'")}', ${indice})" title="Visualizar foto ${indice + 1}">
                <img src="${foto.url}" alt="Foto ${indice + 1} da atividade">
                <span class="mapa-painel-foto-thumb-numero">${indice + 1}</span>
            </button>
        `).join("");

    },

    visualizarFoto(chave, indice) {

        const fotos = this.fotosCapturadas.get(chave) || [];
        const foto = fotos[indice];

        if (!foto) return;

        const overlay = document.createElement("div");
        overlay.className = "mapa-painel-foto-overlay";
        overlay.innerHTML = `
            <button type="button" class="mapa-painel-foto-fechar" aria-label="Fechar foto">✕</button>
            <div class="mapa-painel-foto-modal">
                <img src="${foto.url}" alt="Foto da atividade">
                <div class="mapa-painel-foto-modal-acoes">
                    <span>Foto ${indice + 1} de ${fotos.length}</span>
                    <button type="button" class="mapa-painel-foto-apagar">🗑️ Apagar foto</button>
                </div>
            </div>
        `;

        const fechar = () => overlay.remove();
        overlay.querySelector(".mapa-painel-foto-fechar").addEventListener("click", fechar);
        overlay.addEventListener("click", evento => {
            if (evento.target === overlay) fechar();
        });

        overlay.querySelector(".mapa-painel-foto-apagar").addEventListener("click", async () => {

            if (!confirm("Apagar esta foto? Essa ação não poderá ser desfeita.")) return;

            try {

                if (this.armazenamentoCompartilhadoAtivo()) {
                    await FotosStorage.apagar(foto);
                } else {
                    const db = await this.abrirBancoFotos();
                    if (foto.id !== undefined) {
                        await this.apagarFotoBanco(db, foto.id);
                    }
                }

                if (foto.url) URL.revokeObjectURL(foto.url);

                fotos.splice(indice, 1);
                this.fotosCapturadas.set(chave, fotos);

                document.querySelectorAll(`[data-fotos-om="${CSS.escape(chave)}"]`).forEach(atividade => {
                    const galeria = atividade.querySelector("[data-galeria-fotos]");
                    const botao = atividade.querySelector(".mapa-painel-btn-foto");
                    if (galeria) galeria.innerHTML = this.renderFotosPorChave(chave);
                    this.atualizarBotaoFoto(botao, chave);
                });

                fechar();

            } catch (erro) {
                console.error("Erro ao apagar foto:", erro);
                alert("Não foi possível apagar a foto. Tente novamente.");
            }

        });

        document.body.appendChild(overlay);

    },

    // ======================================
    // Navegação do carrossel (setas)
    // ======================================
    navegar(botao, direcao) {

        const wrap = botao.closest(".mapa-painel-carrossel-wrap");
        const trilho = wrap?.querySelector(".mapa-painel-carrossel");

        if (!trilho) return;

        trilho.scrollTo({
            left: trilho.scrollLeft + (direcao * trilho.clientWidth),
            behavior: "smooth"
        });

    },

    // ======================================
    // Navegação do carrossel (indicadores)
    // ======================================
    irPara(bolinha, indice) {

        const secao = bolinha.closest(".mapa-painel-secao-lideres");
        const trilho = secao?.querySelector(".mapa-painel-carrossel");

        if (!trilho) return;

        trilho.scrollTo({
            left: indice * trilho.clientWidth,
            behavior: "smooth"
        });

    },

    // ======================================
    // Atualiza indicadores e contador
    // enquanto o usuário desliza (swipe)
    // ======================================
    aoRolar(trilho) {

        if (!trilho.clientWidth) return;

        const indiceAtual = Math.round(trilho.scrollLeft / trilho.clientWidth);
        const secao = trilho.closest(".mapa-painel-secao-lideres");

        if (!secao) return;

        secao.querySelectorAll(".mapa-painel-dot").forEach((bolinha, indice) => {
            bolinha.classList.toggle("ativo", indice === indiceAtual);
        });

        const contador = secao.querySelector(".mapa-painel-lideres-contador");
        const total = secao.querySelectorAll(".mapa-painel-dot").length;

        if (contador && total) {
            contador.textContent = `${indiceAtual + 1}/${total}`;
        }

    },

    parseEquipe(equipeTexto) {

        if (!equipeTexto) return [];

        return equipeTexto
            .split("+")
            .map(parte => parte.trim())
            .filter(Boolean)
            .map(parte => {

                const match = parte.match(/^(\d+)\s+(.+)$/);

                if (match) {
                    return {
                        qtd: parseInt(match[1], 10),
                        cargo: match[2]
                    };
                }

                return {
                    qtd: 1,
                    cargo: parte
                };

            });

    }

};