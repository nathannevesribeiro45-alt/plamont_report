/* Histórico visual. Toda consulta passa por HistoricoStorage.
 * Não chama renderizadores operacionais, Supabase, Editor ou salvamento.
 */
window.Historico = (() => {
    "use strict";
    const tamanhoPagina = 50;
    const objeto = valor => valor && typeof valor === "object" && !Array.isArray(valor);
    const texto = valor => typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
    const textoLinhas = valor => Array.isArray(valor) ? valor.map(texto).filter(Boolean).join("\n") : texto(valor);
    const normalizar = valor => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const copiar = valor => JSON.parse(JSON.stringify(valor));
    const el = (tag, classe, conteudo) => {
        const node = document.createElement(tag);
        if (classe) node.className = classe;
        if (conteudo !== undefined) node.textContent = conteudo;
        return node;
    };
    const porId = id => document.getElementById(`historico-${id}`);
    const dataFormatada = data => /^\d{4}-\d{2}-\d{2}$/.test(texto(data)) ? data.split("-").reverse().join("/") : texto(data);
    const contratoRotulo = id => /^os\d+$/i.test(texto(id)) ? `OS ${id.slice(2)}` : texto(id);
    const nomesContratos = Object.freeze({
        os440: "Integridade Estrutural",
        os441: "Manutenção de Desgaste",
        os442: "Utilidades",
        os450: "Manutenção de Ativos",
        os456: "Cobre"
    });
    const nomesFrentes = Object.freeze({
        os440: Object.freeze({ integridade: "Integridade Estrutural", telhado: "Telhado" })
    });
    const nomeContrato = id => nomesContratos[normalizar(id)] || "";
    const tituloContrato = id => [contratoRotulo(id), nomeContrato(id)].filter(Boolean).join(" — ");
    const nomeFrente = (contratoId, aba) => nomesFrentes[normalizar(contratoId)]?.[normalizar(aba?.nome || aba?.id)] || texto(aba?.nome) || texto(aba?.id) || "Frente não informada";
    const quantidade = valor => (typeof valor === "number" || typeof valor === "string") && texto(valor) !== "" &&
        Number.isSafeInteger(Number(valor)) && Number(valor) >= 0 ? Number(valor) : null;
    const valorOperacional = valor => {
        const numero = quantidade(valor);
        return numero === null ? texto(valor) : String(numero).padStart(2, "0");
    };

    function icone(tipo) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", tipo === "cadeado" ? "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2" : "m9 5 7 7-7 7");
        svg.append(path);
        return svg;
    }

    function statusRecurso(recurso) {
        const s = normalizar(recurso.status);
        const conhecidos = {
            disponivel: ["✅", "Disponível", "verde"], atendendo: ["🔵", "Atendendo", "azul"],
            preventiva: ["🟡", "Preventiva", "amarelo"], manutencao: ["❌", "Manutenção / Inoperante", "vermelho"]
        };
        if (Object.hasOwn(conhecidos, s)) return conhecidos[s];
        if (/atend/.test(s)) return conhecidos.atendendo;
        if (/prevent/.test(s)) return conhecidos.preventiva;
        if (/manuten|inoper|quebrad|indispon/.test(s)) return conhecidos.manutencao;
        if (/dispon|operacional/.test(s)) return conhecidos.disponivel;
        const legado = normalizar(recurso.placa);
        if (/prevent/.test(legado)) return conhecidos.preventiva;
        if (/manuten|problema|inoper|quebrad/.test(legado)) return conhecidos.manutencao;
        return ["•", texto(recurso.status) || "Status não informado", "neutro"];
    }

    function statusAtividade(valor) {
        const s = normalizar(valor);
        if (/conclu|realizad|finalizad/.test(s)) return ["🟢", texto(valor), "verde"];
        if (/andamento|execucao/.test(s)) return ["🟡", texto(valor), "amarelo"];
        if (/programad|planejad|previst/.test(s)) return ["🔵", texto(valor), "azul"];
        if (/atras|posterg/.test(s)) return ["🔴", texto(valor), "vermelho"];
        return ["•", texto(valor) || "Status não informado", "neutro"];
    }

    function badge(config) {
        return el("span", `historico-status historico-status--${config[2]}`, `${config[0]} ${config[1]}`);
    }

    function pares(container, dados) {
        const lista = el("dl", "historico-quantidades");
        for (const [nome, valor] of Object.entries(dados || {})) {
            if (!texto(nome) || !["number", "string"].includes(typeof valor)) continue;
            const linha = el("div");
            const n = quantidade(valor);
            linha.append(el("dt", "", nome), el("dd", "", n === null ? texto(valor) : String(n).padStart(2, "0")));
            lista.append(linha);
        }
        container.append(lista);
        return lista.childElementCount;
    }

    function total(container, dados, titulo) {
        const valores = Object.values(dados).filter(v => ["number", "string"].includes(typeof v));
        if (!valores.length || valores.some(v => quantidade(v) === null)) return;
        const soma = valores.reduce((n, v) => n + quantidade(v), 0);
        const linha = el("p", "historico-total");
        linha.append(el("span", "", titulo), el("strong", "", `${soma} ${soma === 1 ? "colaborador" : "colaboradores"}`));
        container.append(linha);
    }

    function quantitativo(titulo, dados, agrupado = false, ausencias = false) {
        const bloco = el("section", "historico-bloco");
        bloco.append(el("h4", "", titulo));
        if (!objeto(dados)) {
            bloco.append(el("p", "historico-sem-dado", "Não informado neste relatório."));
            return bloco;
        }
        let linhas = 0;
        if (agrupado) {
            for (const [chave, rotulo] of [["direto", "Mão de obra direta"], ["indireto", "Mão de obra indireta"]]) {
                if (!objeto(dados[chave]) || !Object.keys(dados[chave]).length) continue;
                bloco.append(el("p", "historico-subgrupo", rotulo));
                linhas += pares(bloco, dados[chave]);
            }
            // Somar apenas dentro desta aba, preservando funções homônimas dos dois grupos.
            const valores = Object.values(dados.direto || {}).concat(Object.values(dados.indireto || {}));
            total(bloco, Object.fromEntries(valores.map((valor, i) => [i, valor])), titulo === "QLP geral" ? "Total QLP" : "Total de efetivo informado");
        } else if (ausencias) {
            const funcoes = Object.fromEntries(Object.entries(dados).filter(([k]) => !["justificadas", "naoJustificadas"].includes(k)));
            linhas += pares(bloco, funcoes);
            if (Object.hasOwn(dados, "justificadas") || Object.hasOwn(dados, "naoJustificadas")) {
                const resumo = {};
                if (Object.hasOwn(dados, "justificadas")) resumo["Justificadas"] = dados.justificadas;
                if (Object.hasOwn(dados, "naoJustificadas")) resumo["Não justificadas"] = dados.naoJustificadas;
                bloco.append(el("p", "historico-subgrupo", "Resumo informado"));
                linhas += pares(bloco, resumo);
            }
            // Totais reservados não são somados às funções (evita dupla contagem).
        } else {
            linhas += pares(bloco, dados);
            total(bloco, dados, "Total em mobilização");
        }
        if (!linhas) bloco.append(el("p", "historico-sem-dado", "Nenhuma quantidade registrada neste relatório."));
        return bloco;
    }

    function recursos(aba) {
        const secao = el("section", "historico-recursos");
        secao.append(el("h4", "", "Recursos"));
        const grupos = new Map();
        for (const recurso of aba.recursos || []) {
            const tipo = texto(recurso.tipo) || "Tipo não informado";
            if (!grupos.has(tipo)) grupos.set(tipo, []);
            grupos.get(tipo).push(recurso);
        }
        if (!grupos.size) secao.append(el("p", "historico-sem-dado", "Nenhum recurso registrado nesta frente."));
        for (const [tipo, itens] of grupos) {
            const grupo = el("div", "historico-recurso-grupo");
            grupo.append(el("p", "historico-subgrupo", tipo));
            const lista = el("ul", "historico-recurso-lista");
            for (const r of itens) {
                const item = el("li", "historico-recurso");
                const linha = el("div", "historico-recurso-linha");
                const identificacao = [texto(r.identificacao), texto(r.placa)].filter(Boolean);
                linha.append(el("strong", "", [...new Set(identificacao)].join(" · ") || "Identificação não informada"), badge(statusRecurso(r)));
                item.append(linha);
                const operador = texto(r.operador) || texto(r.responsavel);
                if (operador) item.append(el("p", "historico-secundario", `Responsável: ${operador}`));
                const contato = texto(r.contato);
                if (contato) item.append(el("p", "historico-secundario", `Contato: ${contato}`));
                const motivo = textoLinhas(r.motivoIndisponibilidade) || textoLinhas(r.motivo) || textoLinhas(r.observacoes);
                if (motivo) item.append(el("p", "historico-secundario", `Informação adicional: ${motivo}`));
                lista.append(item);
            }
            grupo.append(lista); secao.append(grupo);
        }
        return secao;
    }

    function campo(container, rotulo, valor, secundario = false) {
        const conteudo = textoLinhas(valor);
        if (!conteudo) return;
        const p = el("p", secundario ? "historico-secundario" : "");
        p.append(el("strong", "", `${rotulo}: `), document.createTextNode(conteudo));
        container.append(p);
    }

    function atividades(aba) {
        const secao = el("section", "historico-atividades");
        secao.append(el("h3", "historico-secao-titulo", "Atividades do turno"));
        if (!aba.atividades?.length) secao.append(el("p", "historico-sem-dado", "Nenhuma atividade registrada nesta frente."));
        for (const grupo of aba.atividades || []) {
            const card = el("article", "historico-equipe");
            const info = el("div", "historico-equipe-info");
            campo(info, "Líder", grupo.lider);
            campo(info, "Contato", grupo.telefone, true);
            campo(info, "Equipe", grupo.equipe);
            campo(info, "Ativo", grupo.ativo);
            campo(info, "Técnico de segurança", grupo.tecnicoSeguranca, true);
            card.append(info);
            if (!grupo.oms?.length) card.append(el("p", "historico-sem-dado", "Nenhuma OM registrada para esta equipe."));
            for (const om of grupo.oms || []) {
                const bloco = el("div", "historico-om");
                const header = el("div", "historico-om-header");
                header.append(el("strong", "", texto(om.numero) ? `OM ${texto(om.numero)}` : "OM não informada"), badge(statusAtividade(om.status)));
                bloco.append(header);
                const frente = el("div", "historico-om-frente");
                campo(frente, "Ativo", om.ativo);
                campo(frente, "Frente", om.frente);
                bloco.append(frente);
                if (textoLinhas(om.descricao)) bloco.append(el("p", "historico-texto", textoLinhas(om.descricao)));
                for (const [nome, rotulo] of [["resumoAtividades", "Resumo da atividade"], ["observacoes", "Observações do planejamento"]]) {
                    const conteudo = textoLinhas(om[nome]);
                    if (!conteudo) continue;
                    const box = el("section", "historico-resumo");
                    box.dataset.textoOm = nome;
                    box.append(el("h5", "", rotulo), el("p", "historico-texto", conteudo));
                    bloco.append(box);
                }
                card.append(bloco);
            }
            secao.append(card);
        }
        return secao;
    }

    function linhasQuantitativas(dados, agrupado = false, ausencias = false) {
        if (!objeto(dados)) return [];
        const linhas = [];
        const adicionar = valores => {
            for (const [nome, valor] of Object.entries(valores || {})) {
                if (!texto(nome) || !["number", "string"].includes(typeof valor) || !texto(valor)) continue;
                linhas.push(`${texto(nome)}: ${valorOperacional(valor)}`);
            }
        };
        if (agrupado) {
            if (objeto(dados.direto) && Object.keys(dados.direto).length) {
                linhas.push("Mão de obra direta");
                adicionar(dados.direto);
            }
            if (objeto(dados.indireto) && Object.keys(dados.indireto).length) {
                if (linhas.length) linhas.push("");
                linhas.push("Mão de obra indireta");
                adicionar(dados.indireto);
            }
            return linhas;
        }
        if (ausencias) {
            adicionar(Object.fromEntries(Object.entries(dados).filter(([chave]) => !["justificadas", "naoJustificadas"].includes(chave))));
            const resumo = [];
            if (Object.hasOwn(dados, "justificadas")) resumo.push(["Justificadas", dados.justificadas]);
            if (Object.hasOwn(dados, "naoJustificadas")) resumo.push(["Não justificadas", dados.naoJustificadas]);
            if (resumo.length) {
                if (linhas.length) linhas.push("");
                linhas.push("Resumo informado");
                adicionar(Object.fromEntries(resumo));
            }
            return linhas;
        }
        adicionar(dados);
        return linhas;
    }

    function inserirTextoBloco(destino, titulo, conteudo) {
        const linhas = conteudo.filter(linha => typeof linha === "string" && linha.trim());
        if (!linhas.length) return;
        if (destino.length) destino.push("");
        destino.push(titulo, "", ...conteudo);
    }

    function linhasRecursos(aba) {
        const grupos = new Map();
        for (const recurso of aba.recursos || []) {
            const tipo = texto(recurso?.tipo) || "Tipo não informado";
            if (!grupos.has(tipo)) grupos.set(tipo, []);
            grupos.get(tipo).push(recurso);
        }
        const linhas = [];
        for (const [tipo, recursosDoTipo] of grupos) {
            if (linhas.length) linhas.push("");
            linhas.push(tipo.toUpperCase());
            for (const recurso of recursosDoTipo) {
                const identificacao = [...new Set([texto(recurso.identificacao), texto(recurso.placa)].filter(Boolean))].join(" · ") || "Identificação não informada";
                const status = statusRecurso(recurso);
                linhas.push(identificacao, `${status[0]} ${status[1]}`);
                const responsavel = texto(recurso.operador) || texto(recurso.responsavel);
                if (responsavel) linhas.push(`Responsável: ${responsavel}`);
                if (texto(recurso.contato)) linhas.push(`Contato: ${texto(recurso.contato)}`);
                const motivo = textoLinhas(recurso.motivoIndisponibilidade) || textoLinhas(recurso.motivo) || textoLinhas(recurso.observacoes);
                if (motivo) linhas.push(`Informação adicional: ${motivo}`);
                linhas.push("");
            }
        }
        return linhas;
    }

    function linhasAtividades(aba) {
        const linhas = [];
        for (const grupo of aba.atividades || []) {
            const grupoLinhas = [];
            const adicionarCampo = (rotulo, valor) => {
                const conteudo = textoLinhas(valor);
                if (conteudo) grupoLinhas.push(`${rotulo}: ${conteudo}`);
            };
            adicionarCampo("Líder", grupo.lider);
            adicionarCampo("Contato", grupo.telefone);
            adicionarCampo("Equipe", grupo.equipe);
            adicionarCampo("Ativo", grupo.ativo);
            adicionarCampo("Técnico de segurança", grupo.tecnicoSeguranca);
            for (const om of grupo.oms || []) {
                if (grupoLinhas.length) grupoLinhas.push("");
                grupoLinhas.push(texto(om.numero) ? `OM ${texto(om.numero)}` : "OM não informada");
                adicionarCampo("Ativo", om.ativo);
                adicionarCampo("Frente", om.frente);
                const descricao = textoLinhas(om.descricao);
                if (descricao) grupoLinhas.push(descricao);
                const status = statusAtividade(om.status);
                if (texto(om.status)) grupoLinhas.push(`${status[0]} ${status[1]}`);
                const resumo = textoLinhas(om.resumoAtividades);
                if (resumo) grupoLinhas.push("Resumo da atividade:", resumo);
                const observacoes = textoLinhas(om.observacoes);
                if (observacoes) grupoLinhas.push("Observações do planejamento:", observacoes);
            }
            if (!grupoLinhas.filter(Boolean).length) continue;
            if (linhas.length) linhas.push("");
            linhas.push(...grupoLinhas);
        }
        return linhas;
    }

    const api = {
        registros: [], selecionado: null, filtros: {}, selecaoId: null,
        inicializado: false, carregando: false, carregandoDetalhe: false,
        mais: false, deslocamento: 0, buscaId: 0, detalheId: 0, consultado: false,
        copiaId: 0, copiaTimer: null,

        iniciar() {
            if (this.inicializado || !document.getElementById("historico")) return;
            this.inicializado = true;
            this.configurarContratos();
            porId("filtros").addEventListener("submit", evento => { evento.preventDefault(); this.buscar(); });
            porId("mais").addEventListener("click", () => this.buscar(true));
            porId("voltar").addEventListener("click", () => this.voltar());
            porId("lista").addEventListener("click", evento => {
                const button = evento.target.closest("button[data-registro]");
                if (button) this.selecionar(button.dataset.registro);
            });
            document.addEventListener("plamont:auth-alterado", () => {
                const chave = this.chaveSessao();
                if (chave === this.sessaoChave) return;
                this.sessaoChave = chave;
                this.limpar();
                if (!this.podeVisualizar()) this.feedback("Entre com uma conta autorizada para consultar o histórico.", "erro");
                else if (document.getElementById("historico").classList.contains("ativa")) this.buscar();
            });
            // Abrir pela navegação existente também funciona sem um novo roteador.
            new MutationObserver(() => {
                if (document.getElementById("historico").classList.contains("ativa") && !this.consultado && !this.carregando) this.abrir();
            }).observe(document.getElementById("historico"), { attributes: true, attributeFilter: ["class"] });
            this.sessaoChave = this.chaveSessao();
        },

        chaveSessao() {
            const a = window.PlamontAuth;
            return JSON.stringify([a?.sessao?.user?.id, a?.usuario?.id, a?.usuario?.perfil, a?.usuario?.ativo]);
        },
        podeVisualizar() { return window.PlamontAuth?.pode?.("visualizar") === true; },
        async abrir() {
            this.iniciar();
            try {
                await window.PlamontAuth?.pronto;
                if (!this.consultado && !this.carregando) return this.buscar();
            } catch (erro) { this.feedback(this.mensagemErro(erro), "erro"); }
        },
        limpar() {
            this.buscaId++; this.detalheId++; this.cancelarCopia();
            this.registros = []; this.selecionado = null; this.selecaoId = null;
            this.carregando = false; this.carregandoDetalhe = false; this.mais = false; this.deslocamento = 0; this.consultado = false;
            this.erroBusca = false;
            document.getElementById("historico").dataset.visualizacao = "consulta";
            this.renderizarLista(); this.renderizarDetalhe(); this.atualizarBotoes();
        },

        configurarContratos() {
            const select = porId("contrato");
            // Cadastro já existente; somente leitura, sem escolher/alterar uma aba atual.
            const cadastrados = typeof ARQUIVOS_CONTRATOS !== "undefined" ? ARQUIVOS_CONTRATOS.map(arquivo => arquivo.replace(/\.json$/, "")) : ["os440", "os441", "os442", "os450", "os456"];
            for (const id of cadastrados) this.adicionarOpcao(select, id, contratoRotulo(id));
        },
        adicionarOpcao(select, valor, rotulo) {
            if ([...select.options].some(op => op.value === valor)) return;
            const option = el("option", "", rotulo); option.value = valor; select.append(option);
        },
        lerFiltros() {
            const filtros = {};
            for (const [campo, id] of [["contratoId", "contrato"], ["data", "data"], ["turno", "turno"]]) {
                const valor = porId(id).value.trim();
                if (valor) filtros[campo] = valor;
            }
            return filtros;
        },
        feedback(mensagem = "", tipo = "carregando") {
            const box = porId("feedback"); box.textContent = mensagem; box.dataset.tipo = tipo; box.hidden = !mensagem;
        },
        mensagemErro(erro) {
            const mensagens = {
                sessao_expirada: "Entre na plataforma para consultar o histórico operacional.",
                sessao_alterada: "A sessão mudou durante a consulta. Busque o histórico novamente.",
                sem_permissao: "Você não possui permissão para visualizar o histórico operacional.",
                parametros_invalidos: "Confira os filtros e informe uma data operacional válida.",
                dados_invalidos: "Este relatório histórico possui dados inconsistentes e não pode ser apresentado.",
                schema_nao_suportado: "Este relatório usa um formato ainda não suportado pelo histórico.",
                servico_indisponivel: "O serviço de histórico ainda não está disponível. Tente novamente."
            };
            return mensagens[erro?.tipo] || "Não foi possível consultar o histórico. Tente novamente.";
        },
        atualizarBotoes() {
            porId("buscar").disabled = this.carregando;
            porId("buscar").textContent = this.carregando ? "Buscando…" : "Buscar";
            porId("mais").disabled = this.carregando;
            porId("mais").hidden = !this.mais;
            porId("lista").setAttribute("aria-busy", String(this.carregando));
            porId("detalhe").setAttribute("aria-busy", String(this.carregandoDetalhe));
        },

        async buscar(acrescentar = false) {
            this.iniciar();
            const request = ++this.buscaId;
            const sessao = this.chaveSessao();
            if (!acrescentar) {
                this.cancelarCopia();
                this.filtros = this.lerFiltros(); this.registros = []; this.deslocamento = 0; this.mais = false;
                this.detalheId++; this.selecaoId = null; this.selecionado = null; this.carregandoDetalhe = false;
                document.getElementById("historico").dataset.visualizacao = "consulta";
                this.renderizarDetalhe();
            }
            this.carregando = true; this.consultado = true;
            this.erroBusca = false;
            this.feedback("Carregando relatórios…"); this.renderizarLista(); this.atualizarBotoes();
            try {
                if (!window.HistoricoStorage) throw { tipo: "servico_indisponivel" };
                const pagina = await window.HistoricoStorage.listar({ ...this.filtros, limite: tamanhoPagina, deslocamento: this.deslocamento });
                if (request !== this.buscaId || sessao !== this.chaveSessao() || !this.podeVisualizar()) return;
                const ids = new Set(this.registros.map(r => r.id));
                this.registros.push(...copiar(pagina).filter(r => !ids.has(r.id)));
                this.deslocamento += pagina.length; this.mais = pagina.length === tamanhoPagina;
                for (const registro of this.registros) {
                    this.adicionarOpcao(porId("contrato"), registro.contratoId, contratoRotulo(registro.contratoId));
                    this.adicionarOpcao(porId("turno"), registro.turno, registro.turno);
                }
                this.feedback();
            } catch (erro) {
                if (request !== this.buscaId) return;
                this.erroBusca = true;
                this.feedback(this.mensagemErro(erro), "erro");
            } finally {
                if (request === this.buscaId) { this.carregando = false; this.renderizarLista(); this.atualizarBotoes(); }
            }
        },

        async selecionar(id) {
            const registro = this.registros.find(item => item.id === id);
            if (!registro) return;
            this.cancelarCopia();
            const request = ++this.detalheId;
            const sessao = this.chaveSessao();
            this.selecaoId = id; this.selecionado = null; this.carregandoDetalhe = true;
            document.getElementById("historico").dataset.visualizacao = "detalhe";
            this.feedback(); this.renderizarLista(); this.renderizarDetalhe(); this.atualizarBotoes();
            try {
                const resultado = await window.HistoricoStorage.carregar(copiar(registro));
                if (request !== this.detalheId || sessao !== this.chaveSessao() || !this.podeVisualizar()) return;
                if (!resultado) { this.feedback("Este relatório não foi encontrado ou não está acessível à sua sessão.", "erro"); return; }
                this.selecionado = copiar(resultado);
            } catch (erro) {
                if (request === this.detalheId) this.feedback(this.mensagemErro(erro), "erro");
            } finally {
                if (request === this.detalheId) {
                    this.carregandoDetalhe = false; this.renderizarDetalhe(); this.atualizarBotoes();
                    if (window.matchMedia("(max-width: 900px)").matches) {
                        porId("voltar").focus({ preventScroll: true });
                        porId("detalhe-painel").scrollIntoView({ block: "start", behavior: "auto" });
                    }
                }
            }
        },

        voltar() {
            this.detalheId++; this.carregandoDetalhe = false;
            document.getElementById("historico").dataset.visualizacao = "consulta";
            this.feedback(); this.atualizarBotoes();
            const selecionado = [...porId("lista").querySelectorAll("button")].find(b => b.dataset.registro === this.selecaoId);
            (selecionado || porId("buscar")).focus({ preventScroll: true });
            document.getElementById("historico").scrollIntoView({ block: "start", behavior: "auto" });
        },

        cancelarCopia() {
            this.copiaId++;
            if (this.copiaTimer) window.clearTimeout(this.copiaTimer);
            this.copiaTimer = null;
        },

        gerarTextoRelatorio(registro = this.selecionado) {
            if (!registro?.dados || !Array.isArray(registro.dados.abas)) return "";
            const linhas = [
                `RELATÓRIO HISTÓRICO — ${contratoRotulo(registro.contratoId)}`
            ];
            const nome = nomeContrato(registro.contratoId);
            if (nome) linhas.push(nome);
            linhas.push("", `Data: ${dataFormatada(registro.data)}`, `Turno: ${texto(registro.turno)}`);
            if (texto(registro.dados.horario)) linhas.push(`Horário: ${texto(registro.dados.horario)}`);

            const multiplasFrentes = registro.dados.abas.length > 1;
            for (const aba of registro.dados.abas) {
                const frente = nomeFrente(registro.contratoId, aba);
                const conteudo = [];
                inserirTextoBloco(conteudo, "QLP GERAL", linhasQuantitativas(aba.qlp, true));
                inserirTextoBloco(conteudo, "EFETIVO", linhasQuantitativas(aba.histograma, true));
                inserirTextoBloco(conteudo, "AUSÊNCIAS", linhasQuantitativas(aba.ausencias, false, true));
                inserirTextoBloco(conteudo, "MOBILIZAÇÃO", linhasQuantitativas(aba.mobilizacao));
                inserirTextoBloco(conteudo, "RECURSOS", linhasRecursos(aba));
                inserirTextoBloco(conteudo, "ATIVIDADES DO TURNO", linhasAtividades(aba));
                if (!conteudo.length) continue;
                linhas.push("");
                if (multiplasFrentes) {
                    linhas.push("=========================", frente.toUpperCase(), "=========================", "");
                } else if (frente) {
                    linhas.push(frente, "");
                }
                linhas.push(...conteudo);
            }
            const relatorio = linhas
                .join("\n")
                .replace(/<[^>\r\n]*>/g, "")
                .replace(/\b(?:https?:\/\/|www\.)[^\s]+/gi, "");

            return relatorio.replace(/\n{3,}/g, "\n\n").trim();
        },

        async escreverAreaTransferencia(conteudo) {
            if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(conteudo);
                    return true;
                } catch (_) {
                    // Alguns navegadores bloqueiam a API mesmo em contexto seguro; usa o fallback local abaixo.
                }
            }
            const area = document.createElement("textarea");
            area.value = conteudo;
            area.setAttribute("aria-hidden", "true");
            area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
            document.body.append(area);
            area.select();
            area.setSelectionRange(0, conteudo.length);
            let copiado = false;
            try { copiado = document.execCommand?.("copy") === true; } finally { area.remove(); }
            if (!copiado) throw new Error("clipboard_indisponivel");
            return true;
        },

        async copiarRelatorio(botao = porId("copiar")) {
            const registro = this.selecionado;
            const conteudo = this.gerarTextoRelatorio(registro);
            if (!registro || !conteudo || !botao) return false;
            this.cancelarCopia();
            const tentativa = this.copiaId;
            botao.disabled = true;
            botao.textContent = "Copiando…";
            try {
                await this.escreverAreaTransferencia(conteudo);
                if (tentativa !== this.copiaId || registro !== this.selecionado) return false;
                botao.textContent = "✓ Copiado";
            } catch (_) {
                if (tentativa !== this.copiaId || registro !== this.selecionado) return false;
                botao.textContent = "Não foi possível copiar";
            }
            if (tentativa !== this.copiaId || registro !== this.selecionado) return false;
            this.copiaTimer = window.setTimeout(() => {
                if (tentativa === this.copiaId && registro === this.selecionado && botao.isConnected) {
                    botao.disabled = false;
                    botao.textContent = "Copiar relatório";
                }
            }, 1800);
            return botao.textContent === "✓ Copiado";
        },

        renderizarLista() {
            const fragment = document.createDocumentFragment();
            for (const registro of this.registros) {
                const item = el("li"); const button = el("button", "historico-item");
                button.type = "button"; button.dataset.registro = registro.id;
                button.setAttribute("aria-label", `${dataFormatada(registro.data)} · ${registro.turno} · ${contratoRotulo(registro.contratoId)}`);
                button.setAttribute("aria-current", String(registro.id === this.selecaoId));
                const conteudo = el("span", "historico-item-texto");
                conteudo.append(el("strong", "", dataFormatada(registro.data)), el("small", "", `${registro.turno} · ${contratoRotulo(registro.contratoId)}`));
                if (registro.versao) conteudo.append(el("span", "historico-item-versao", `Versão salva ${registro.versao}`));
                const seta = icone("seta"); seta.classList.add("historico-seta");
                button.append(conteudo, seta); item.append(button); fragment.append(item);
            }
            porId("lista").replaceChildren(fragment);
            porId("contagem").textContent = `${this.registros.length} ${this.registros.length === 1 ? "registro" : "registros"}${this.mais ? "+" : ""}`;
            const estado = porId("lista-estado"); estado.hidden = this.registros.length > 0;
            estado.textContent = this.carregando ? "Carregando relatórios…" : (this.erroBusca ? "Consulta não concluída. Tente buscar novamente." : (this.consultado ? "Nenhum relatório histórico encontrado para os filtros selecionados." : "Use os filtros para consultar os relatórios."));
        },

        renderizarDetalhe() {
            const container = porId("detalhe");
            if (!this.selecionado || this.carregandoDetalhe) {
                container.replaceChildren(el("p", "historico-estado", this.carregandoDetalhe ? "Carregando relatório…" : "Selecione um relatório para visualizar o histórico."));
                return;
            }
            const registro = this.selecionado;
            const report = el("article", "historico-report");
            const header = el("header", "historico-report-header"); const titulo = el("div");
            titulo.append(el("h2", "", tituloContrato(registro.contratoId)), el("p", "historico-periodo", `${dataFormatada(registro.data)} · ${registro.turno}`));
            if (texto(registro.dados.horario)) titulo.append(el("p", "historico-horario", registro.dados.horario));
            const acoes = el("div", "historico-report-acoes");
            const selo = el("span", "historico-selo"); selo.append(icone("cadeado"), document.createTextNode("Somente leitura"));
            const versao = el("span", "historico-versao", `Versão ${registro.versao}`);
            const copiar = el("button", "historico-btn historico-copiar", "Copiar relatório");
            copiar.type = "button"; copiar.id = "historico-copiar";
            copiar.addEventListener("click", () => this.copiarRelatorio(copiar));
            acoes.append(selo, versao, copiar);
            header.append(titulo, acoes); report.append(header);
            for (const aba of registro.dados.abas) {
                const frente = el("section", "historico-frente"); frente.dataset.aba = aba.id;
                frente.append(el("h3", "historico-frente-titulo", nomeFrente(registro.contratoId, aba)), el("h3", "historico-secao-titulo", "Disponibilidade de mão de obra e recursos"));
                const numeros = el("div", "historico-quantitativos");
                const qlp = quantitativo("QLP geral", aba.qlp, true);
                qlp.classList.add("historico-bloco--qlp");
                const resumo = el("div", "historico-resumo-operacional");
                resumo.append(quantitativo("Efetivo (histograma)", aba.histograma, true),
                    quantitativo("Ausências", aba.ausencias, false, true), quantitativo("Efetivo em mobilização", aba.mobilizacao));
                numeros.append(qlp, resumo);
                frente.append(numeros, recursos(aba), atividades(aba)); report.append(frente);
            }
            report.append(el("p", "historico-report-footer", "Consulta histórica somente leitura. Conteúdo da última gravação deste contrato, data e turno."));
            container.replaceChildren(report);
        }
    };
    document.addEventListener("DOMContentLoaded", () => api.iniciar());
    return api;
})();
