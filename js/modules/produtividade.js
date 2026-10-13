/* Lançamentos semanais reais. Consulta pública, escrita com sessão autorizada.
   Mantém a página independente do editor/relatórios e não utiliza mocks. */
window.Produtividade = (() => {
    const atualISO=window.ProdutividadeData.periodoAtual();
    const estado={contratoId:'os440',ano:atualISO.ano,semana:atualISO.semana,
        comparacao:atualISO.semana>1?atualISO.semana-1:null,registros:[],carregando:false,
        carregado:false,salvando:false,erro:null,requisicao:0,editor:null};
    let contratos=window.ProdutividadeData.montarContratos([]);
    let inicializado = false;
    let modoCompacto = null;
    const el = id => document.getElementById(`produtividade-${id}`);
    const autorizado=()=>window.ProdutividadeData.visualizacaoPublica || window.Auth?.pode?.('visualizarProdutividade')===true;
    const podeEditar=()=>window.Auth?.pode?.('editarProdutividade')===true;
    const assinaturaSessao=()=>JSON.stringify([window.Auth?.sessao?.user?.id||null,window.Auth?.usuario?.perfil||null,window.Auth?.usuario?.ativo===true]);
    let ultimaSessao=assinaturaSessao();
    const campos=['programadas','programadas_executadas','extras_executadas','peso_kg','parafusos'];
    const vazio={programadas:null,programadasExecutadas:null,extrasExecutadas:null,programadasNaoExecutadas:null,executadas:null,aderencia:null};
    const html = texto => String(texto ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const numero = (valor, casas = 0) => Number.isFinite(valor)
        ? valor.toLocaleString('pt-BR', { maximumFractionDigits: casas }) : '—';

    // Ícones locais exclusivamente decorativos; sem dependências externas.
    function icone(nome) {
        const desenhos = {
            agenda: '<rect x="4" y="6" width="16" height="15" rx="3"/><path d="M8 3v6M16 3v6M4 11h16M8 15h3M8 18h6"/>',
            concluido: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
            alvo: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 9-9M17 4h3v3"/>',
            barras: '<path d="M3 21h18"/><rect x="5" y="13" width="3" height="5" rx=".5"/><rect x="11" y="9" width="3" height="9" rx=".5"/><rect x="17" y="3" width="3" height="15" rx=".5"/>',
            relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
            turno: '<path d="M3 19h18M5 19v-2a7 7 0 0 1 14 0v2M9 11V8h6v3M12 7V5"/>',
            producao: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7 6l9 5"/>',
            estruturas: '<path d="m4 5 10-3 6 4-10 3-6-4Zm0 0v4l6 4 10-3V6M8 12v5M16 11v5M4 17l6 4 10-3v-4l-10 3-6-4v4Z"/>',
            parafusos: '<path d="m9 3 7 2 2 5-5 4-7-2-2-5 5-4ZM9 13l-4 7 4 2 4-8M7 16l4 2M6 19l3 1M9 7l5 2"/>'
        };
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${desenhos[nome] || desenhos.producao}</svg>`;
    }
    function ajustarFiltrosVisuais() {
        const compacto = window.innerWidth <= 900;
        if (compacto !== modoCompacto) el('filtros').open = !compacto;
        modoCompacto = compacto;
    }

    // O limite visual não altera os volumes brutos nem a aderência bruta.
    function calcularMetricas(dados) {
        if (!dados) return null;
        const executadas = dados.programadasExecutadas + dados.extrasExecutadas;
        const aderenciaBruta = dados.programadas > 0 ? executadas / dados.programadas * 100 : null;
        return { ...dados, executadas, aderenciaBruta,
            aderencia: aderenciaBruta === null ? null : Math.min(100, aderenciaBruta) };
    }
    function variacao(atual, base) {
        if (!Number.isFinite(atual) || !Number.isFinite(base)) return null;
        if (base === 0) return atual === 0 ? 0 : null;
        return (atual - base) / base * 100;
    }
    function pontosPercentuais(atual, base) {
        return Number.isFinite(atual) && Number.isFinite(base) ? atual - base : null;
    }
    function diferenca(valor, unidade = '%') {
        if (!Number.isFinite(valor)) return '<span class="prod-neutro">Sem base</span>';
        const sinal = Math.abs(valor) < 0.00001 ? '' : valor > 0 ? '+' : '−';
        return `<span class="${valor > 0 ? 'prod-positivo' : valor < 0 ? 'prod-negativo' : 'prod-neutro'}">${sinal}${numero(Math.abs(valor), 1)} ${unidade}</span>`;
    }
    const percentual = valor => Number.isFinite(valor) ? `${numero(valor, 1)}%` : 'Sem base';
    const registroAtual=()=>estado.registros.find(r=>r.contrato_id===estado.contratoId&&r.semana===estado.semana);
    function mensagem(texto,tipo='info') {el('mensagem').textContent=texto;el('mensagem').dataset.tipo=tipo;}
    function atualizarMensagem() {
        if(estado.carregando)return mensagem('Carregando lançamentos do servidor…');
        if(estado.erro)return mensagem(window.ProdutividadeStorage.mensagemErro(estado.erro),'erro');
        const registro=registroAtual();
        mensagem(registro?`Lançamento salvo em ${new Date(registro.atualizado_em).toLocaleString('pt-BR')}.`
            :'Nenhum lançamento salvo para esta OS e semana. Os traços indicam dados ainda não informados.');
    }
    function assinaturaFormulario() {
        return JSON.stringify(campos.map(c=>el('formulario').elements.namedItem(c).value));
    }
    function sujo() {return !!estado.editor&&assinaturaFormulario()!==estado.editor.inicial;}
    function fecharEditor() {estado.editor=null;el('formulario').hidden=true;el('formulario').reset();}
    function confirmarMudanca() {
        if(estado.salvando){mensagem('Aguarde a confirmação do salvamento para continuar.');return false;}
        if(sujo()&&!window.confirm('Existem alterações não salvas nesta semana. Deseja descartá-las?'))return false;
        fecharEditor();return true;
    }
    function confirmarSaida(destino) {
        if(estado.salvando){mensagem('Aguarde a confirmação do salvamento para continuar.');return false;}
        return destino==='produtividade'||confirmarMudanca();
    }
    function abrirEditor() {
        if(!podeEditar()||!estado.carregado||estado.erro||estado.carregando||estado.salvando)return false;
        const r=registroAtual(),form=el('formulario');
        campos.forEach(c=>{form.elements.namedItem(c).value=r?r[c]:'';});
        estado.editor={contratoId:estado.contratoId,ano:estado.ano,semana:estado.semana,
            versao:r?.versao||0,usuario:window.Auth?.sessao?.user?.id,inicial:assinaturaFormulario()};
        el('editor-titulo').textContent=`Editar ${estado.contratoId.replace('os','OS ')} — Semana ${estado.semana}/${estado.ano}`;
        form.hidden=false;el('editor-campos').disabled=false;
        mensagem('Informe os totais e clique em Salvar no servidor. Os indicadores mostram os últimos valores salvos.');
        form.elements.namedItem('programadas').focus();return true;
    }
    function cancelarEditor() {if(!confirmarMudanca())return false;atualizarMensagem();return true;}
    function atualizarControles() {
        const bloqueado=estado.carregando||estado.salvando;
        ['ano','semana','comparacao','atualizar'].forEach(id=>{el(id).disabled=bloqueado;});
        el('contratos').querySelectorAll('button').forEach(b=>{b.disabled=bloqueado;});
        el('editar').hidden=!podeEditar();el('editar').disabled=bloqueado||!estado.carregado||!!estado.erro;
        el('editor-campos').disabled=estado.salvando||!podeEditar();
        el('salvar').disabled=estado.salvando||!podeEditar();el('cancelar').disabled=estado.salvando;
        el('salvar').textContent=estado.salvando?'Salvando…':'Salvar no servidor';
    }
    async function salvar() {
        if(!podeEditar()||!estado.editor||estado.salvando||estado.carregando)return false;
        if(estado.editor.usuario!==window.Auth?.sessao?.user?.id)return false;
        const contexto={...estado.editor},token=estado.requisicao;
        try {
            const valores={};
            campos.forEach(c=>{
                const input=el('formulario').elements.namedItem(c);
                if(input.value.trim()==='')throw new Error('Informe todos os valores. Use zero quando não houver produção.');
                valores[c]=Number(input.value);
            });
            window.ProdutividadeStorage.validarValores(valores);
            if(!el('formulario').reportValidity())return false;
            estado.salvando=true;atualizarControles();mensagem('Salvando no servidor…');
            const r=await window.ProdutividadeStorage.salvar(contexto,valores);
            if(token!==estado.requisicao)return false;
            estado.registros=estado.registros.filter(item=>!(item.contrato_id===r.contrato_id&&item.semana===r.semana));
            estado.registros.push(r);fecharEditor();renderDados();
            mensagem('Alterações salvas no servidor. Indicadores atualizados.','sucesso');return true;
        } catch(erro) {
            if(token===estado.requisicao)mensagem(window.ProdutividadeStorage.mensagemErro(erro),'erro');
            return false;
        } finally {if(token===estado.requisicao){estado.salvando=false;atualizarControles();}}
    }
    async function carregar() {
        if(!confirmarMudanca())return false;
        const token=++estado.requisicao;
        estado.carregando=true;estado.carregado=false;estado.erro=null;estado.registros=[];
        renderDados();atualizarMensagem();
        try {
            const registros=await window.ProdutividadeStorage.carregarAno(estado.ano);
            if(token!==estado.requisicao)return false;
            estado.registros=registros;estado.carregado=true;
        } catch(erro) {if(token===estado.requisicao)estado.erro=erro;}
        finally {if(token===estado.requisicao){estado.carregando=false;renderDados();atualizarMensagem();}}
        return token===estado.requisicao&&!estado.erro;
    }
    function preparar() {
        ajustarFiltrosVisuais();
        if (!el('contratos').children.length)
            Abas.renderContratos(el('contratos'), window.ProdutividadeData.contratos, selecionarContrato);
        if (inicializado) return;
        el('semana').addEventListener('change', evento => selecionarSemana(Number(evento.target.value)));
        el('ano').addEventListener('change',evento=>selecionarAno(Number(evento.target.value)));
        el('editar').addEventListener('click',abrirEditor);
        el('cancelar').addEventListener('click',cancelarEditor);
        el('atualizar').addEventListener('click',()=>carregar());
        el('formulario').addEventListener('submit',evento=>{evento.preventDefault();void salvar();});
        window.addEventListener('beforeunload',evento=>{if(sujo()||estado.salvando){evento.preventDefault();evento.returnValue='';}});
        el('comparacao').addEventListener('change', evento => {
            if (!autorizado()||estado.carregando||estado.salvando) return;
            estado.comparacao = evento.target.value === '' ? null : Number(evento.target.value);
            renderDados();
        });
        window.addEventListener('resize', () => {
            if (autorizado() && document.getElementById('produtividade').classList.contains('ativa')) {
                ajustarFiltrosVisuais();
                Abas.atualizarContratoAtivo(el('contratos'), estado.contratoId);
            }
        });
        inicializado = true;
    }
    function atualizarComparacoes() {
        const anteriores = window.ProdutividadeData.semanas(estado.ano).filter(s => s < estado.semana).reverse();
        el('comparacao').innerHTML = '<option value="">Sem comparação</option>' + anteriores.map(s => `<option value="${s}">Semana ${s}${s === estado.semana - 1 ? ' (anterior)' : ''}</option>`).join('');
        el('comparacao').value = estado.comparacao ?? '';
    }
    function selecionarContrato(id) {
        if (!autorizado()||estado.carregando||!window.ProdutividadeData.contratos.some(c => c.id === id)||!confirmarMudanca()) return false;
        estado.contratoId = id;
        renderDados();atualizarMensagem();
        el('contratos').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
    }
    function selecionarSemana(semana) {
        if (!autorizado()||estado.carregando||!window.ProdutividadeData.semanas(estado.ano).includes(semana)||!confirmarMudanca()) {
            el('semana').value=estado.semana;return false;
        }
        estado.semana = semana;
        estado.comparacao = semana>1?semana-1:null;
        renderDados();atualizarMensagem();
        return true;
    }
    async function selecionarAno(ano) {
        if(!Number.isInteger(ano)||ano<2000||ano>2100){
            el('ano').value=estado.ano;mensagem('Informe um ano inteiro entre 2000 e 2100.','erro');return false;
        }
        if(estado.carregando||!confirmarMudanca()) {
            el('ano').value=estado.ano;return false;
        }
        estado.ano=ano;estado.semana=Math.min(estado.semana,window.ProdutividadeData.semanas(ano).length);
        estado.comparacao=estado.semana>1?estado.semana-1:null;return carregar();
    }
    function renderPeriodo() {
        const periodo = Dashboard.periodo;
        el('periodo').innerHTML = periodo
            ? `<span>${icone('agenda')}${html(periodo.data)}</span><span>${icone('turno')}${html(periodo.turno)}</span><span>${icone('relogio')}${html(periodo.horario)}</span>`
            : '<span>Período operacional indisponível</span>';
    }
    function renderKpis(atual, anterior) {
        const semDados=!atual;atual=atual||vazio;
        const itens = [
            ['Programadas', numero(atual.programadas), semDados?'Semana sem lançamento':'OM’s na semana selecionada', 'agenda'],
            ['Executadas', numero(atual.executadas), semDados?'Semana sem lançamento':`${numero(atual.programadasExecutadas)} programadas + ${numero(atual.extrasExecutadas)} extras`, 'concluido'],
            ['Aderência', percentual(atual.aderencia), estado.semana>1?`${diferenca(pontosPercentuais(atual.aderencia, anterior?.aderencia), 'p.p.')} vs. semana ${estado.semana - 1}`:'Sem semana anterior neste ano', 'alvo'],
            ['Semana anterior', percentual(anterior?.aderencia), anterior ? `Aderência da semana ${estado.semana - 1}` : 'Semana anterior sem dados', 'barras']
        ];
        el('kpis').innerHTML = itens.map(([titulo, valor, detalhe, nomeIcone]) => `<article class="prod-card prod-kpi"><span class="prod-icone ${nomeIcone === 'concluido' ? 'prod-verde' : ''}" aria-hidden="true">${icone(nomeIcone)}</span><div class="prod-kpi-conteudo"><h2>${titulo}</h2><strong class="prod-valor">${valor}</strong><p>${detalhe}</p></div></article>`).join('');
    }
    function renderEvolucao(contrato) {
        const semanas = window.ProdutividadeData.semanas(estado.ano).filter(s => s <= estado.semana).slice(-5);
        const x = i => semanas.length === 1 ? 287 : 74 + i * 426 / (semanas.length - 1);
        const y = valor => 196 - valor * 1.5;
        const dados = semanas.map(s => calcularMetricas(contrato.semanas[s])||vazio);
        const anteriores = semanas.map(s => calcularMetricas(contrato.semanas[s - 1]));
        function serie(valores, cor, tracejada) {
            // Uma semana sem base interrompe a linha; não é convertida em zero.
            let inicio = true;
            const caminho = valores.map((m, i) => {
                if (!Number.isFinite(m?.aderencia)) { inicio = true; return ''; }
                const comando = `${inicio ? 'M' : 'L'}${x(i)} ${y(m.aderencia)}`;
                inicio = false;
                return comando;
            }).join(' ');
            return `<path d="${caminho}" fill="none" stroke="${cor}" stroke-width="2.5" ${tracejada ? 'stroke-dasharray="7 5"' : ''}/>` + valores.map((m, i) => Number.isFinite(m?.aderencia) ? `<circle cx="${x(i)}" cy="${y(m.aderencia)}" r="4" fill="${cor}" tabindex="0"><title>${tracejada ? 'Semana anterior' : 'Aderência'}: semana ${semanas[i] - (tracejada ? 1 : 0)}, ${percentual(m.aderencia)}</title></circle>${!tracejada ? `<text x="${x(i)}" y="${y(m.aderencia) - 12}" text-anchor="middle" class="prod-svg-valor">${percentual(m.aderencia)}</text>` : ''}` : '').join('');
        }
        el('evolucao').innerHTML = `<svg viewBox="0 0 550 246" role="img" aria-labelledby="prod-evolucao-title prod-evolucao-desc"><title id="prod-evolucao-title">Evolução da aderência — ${html(contrato.nome)}</title><desc id="prod-evolucao-desc">${semanas.map((s,i) => `Semana ${s}: ${percentual(dados[i].aderencia)}; semana anterior: ${percentual(anteriores[i]?.aderencia)}.`).join(' ')}</desc>${[0,25,50,75,100].map(v => `<line x1="74" x2="500" y1="${y(v)}" y2="${y(v)}" stroke="#e1eaf4"/><text x="51" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join('')}${semanas.map((s,i) => `<line x1="${x(i)}" x2="${x(i)}" y1="46" y2="196" stroke="#e1eaf4"/><text x="${x(i)}" y="219" text-anchor="middle">S${s}</text>`).join('')}${serie(anteriores, '#9cacbf', true)}${serie(dados, '#087cf2', false)}</svg><div class="prod-legenda"><span><i class="prod-azul"></i>Aderência da semana</span><span><i class="prod-cinza"></i>Semana anterior</span></div>`;
    }
    function renderComposicao(atual) {
        if(!atual){
            el('composicao-titulo').textContent=`Composição das OM’s — Semana ${estado.semana}`;
            el('composicao').innerHTML='<p class="prod-sem-dados">Sem lançamento nesta semana. A composição aparecerá após o primeiro salvamento.</p>';
            return;
        }
        const grupos = [['Programadas executadas', atual.programadasExecutadas, '#087cf2'], ['Extras executadas', atual.extrasExecutadas, '#0bae56'], ['Programadas não executadas', atual.programadasNaoExecutadas, '#ff8b0a']];
        const total = grupos.reduce((s,g) => s + g[1], 0), circunferencia = 2 * Math.PI * 70;
        let offset = 0;
        const arcos = grupos.map(([,valor,cor]) => {
            const tamanho = total > 0 ? valor / total * circunferencia : 0;
            const arco = `<circle cx="110" cy="110" r="70" fill="none" stroke="${cor}" stroke-width="27" stroke-dasharray="${tamanho} ${circunferencia}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"/>`;
            offset += tamanho;
            return arco;
        }).join('');
        el('composicao-titulo').textContent = `Composição das OM’s — Semana ${estado.semana}`;
        el('composicao').innerHTML = `<div class="prod-donut"><svg viewBox="0 0 220 220" role="img" aria-labelledby="prod-donut-title"><title id="prod-donut-title">${grupos.map(([nome,valor]) => `${nome}: ${valor}`).join('; ')}. Total executadas: ${atual.executadas}.</title><circle cx="110" cy="110" r="70" fill="none" stroke="#edf2f8" stroke-width="27"/>${arcos}<text x="110" y="108" text-anchor="middle" class="prod-donut-total">${numero(atual.executadas)}</text><text x="110" y="132" text-anchor="middle">OM’s executadas</text></svg><div class="prod-donut-legenda">${grupos.map(([nome,valor,cor]) => `<p><span><i style="background:${cor}"></i>${nome}</span><strong>${numero(valor)}</strong></p>`).join('')}<p class="prod-donut-base"><span>Total programadas (base)</span><strong>${numero(atual.programadas)}</strong></p></div></div>`;
    }
    function renderProducao(contrato) {
        const base = estado.comparacao;
        el('fisica-titulo').textContent = `Produção física — Semana ${estado.semana}`;
        el('fisica-base').textContent = `Totais informados para ${contrato.descricao}. ${base === null ? 'Sem comparação selecionada.' : `Base de comparação: semana ${base}.`}`;
        el('fisica').innerHTML = contrato.indicadores.map(indicador => {
            const atual = indicador.valores[estado.semana], anterior = base === null ? null : indicador.valores[base];
            return `<article class="prod-indicador" data-indicador="${html(indicador.id)}"><span class="prod-icone prod-fisica-icone">${icone(indicador.id)}</span><div class="prod-indicador-conteudo"><h3>${html(indicador.titulo)}</h3><strong class="prod-fisica-valor">${numero(atual, 3)} <small>${html(indicador.unidade)}</small></strong><div class="prod-indicador-rodape"><p>${base === null ? 'Sem comparação' : `Semana ${base}: ${numero(anterior, 3)} ${html(indicador.unidade)}`}</p><p>Variação: ${diferenca(variacao(atual, anterior))}</p></div></div></article>`;
        }).join('');
    }
    function renderComparativo(contrato, atual) {
        atual=atual||vazio;
        const base = estado.comparacao, anterior = calcularMetricas(contrato.semanas[base]);
        el('comparativo-base').textContent = base === null ? 'Selecione uma semana anterior em “Comparar com”.' : `Semana ${estado.semana} em relação à semana ${base}. Variação de volume em %; aderência em pontos percentuais.`;
        const itens = [
            ['Programadas', numero(atual.programadas), anterior ? numero(anterior.programadas) : '—', variacao(atual.programadas, anterior?.programadas), '%'],
            ['Executadas (programadas + extras)', numero(atual.executadas), anterior ? numero(anterior.executadas) : '—', variacao(atual.executadas, anterior?.executadas), '%'],
            ['Aderência', percentual(atual.aderencia), percentual(anterior?.aderencia), pontosPercentuais(atual.aderencia, anterior?.aderencia), 'p.p.'],
            ...contrato.indicadores.map(i => [i.titulo, `${numero(i.valores[estado.semana], 3)} ${html(i.unidade)}`, base === null ? '—' : `${numero(i.valores[base], 3)} ${html(i.unidade)}`, variacao(i.valores[estado.semana], base === null ? null : i.valores[base]), '%'])
        ];
        el('comparativo').innerHTML = itens.map(([titulo,valor,valorBase,delta,unidade], i) => `<article><span class="prod-icone ${i === 1 ? 'prod-verde' : ''}">${icone(['agenda','concluido','alvo'][i] || contrato.indicadores[i-3]?.id)}</span><div class="prod-comparativo-conteudo"><h3>${html(titulo)}</h3><strong>${valor}</strong><p>${diferenca(delta, unidade)}</p><p>${base === null ? 'Sem base selecionada' : `Semana ${base}: ${valorBase}`}</p></div></article>`).join('');
    }
    function renderDados() {
        if (!autorizado()) return false;
        preparar();
        contratos=window.ProdutividadeData.montarContratos(estado.registros);
        const contrato = contratos.find(c => c.id === estado.contratoId);
        const atual = calcularMetricas(contrato.semanas[estado.semana]);
        const anterior = calcularMetricas(contrato.semanas[estado.semana - 1]);
        atualizarComparacoes();
        el('ano').value=estado.ano;
        el('semana').innerHTML=[...window.ProdutividadeData.semanas(estado.ano)].reverse().map(s=>`<option value="${s}">Semana ${s}</option>`).join('');
        el('semana').value = estado.semana;
        Abas.atualizarContratoAtivo(el('contratos'), contrato.id);
        renderPeriodo();
        el('contexto').textContent = `${contrato.nome} — ${contrato.descricao} · Semana ${estado.semana}/${estado.ano}`;
        renderKpis(atual, anterior);
        renderEvolucao(contrato);
        renderComposicao(atual);
        renderProducao(contrato);
        renderComparativo(contrato, atual);
        atualizarControles();
        return true;
    }
    async function render() {
        if(!autorizado())return false;
        if(estado.editor||estado.salvando)return renderDados();
        return carregar();
    }
    document.addEventListener('plamont:auth-alterado', () => {
        const atualSessao=assinaturaSessao();
        if(atualSessao===ultimaSessao)return; // Refresh do mesmo usuário não descarta rascunhos.
        ultimaSessao=atualSessao;
        window.ProdutividadeStorage.invalidar();estado.requisicao++;estado.salvando=false;estado.carregando=false;
        estado.registros=[];estado.carregado=false;fecharEditor();
        if(document.getElementById('produtividade')?.classList.contains('ativa'))void render();
    });
    return {render,selecionarContrato,selecionarSemana,selecionarAno,calcularMetricas,variacao,pontosPercentuais,
        podeVisualizar:autorizado,podeEditar,abrirEditor,cancelarEditor,salvar,confirmarSaida};
})();
