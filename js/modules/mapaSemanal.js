window.MapaSemanal=(()=>{
    const S=window.MapaSemanalStorage;
    const el=id=>document.getElementById("mps-"+id);
    const node=(tag,texto,classe)=>{
        const e=document.createElement(tag);if(texto!=null)e.textContent=texto;if(classe)e.className=classe;return e;
    };
    const botao=(texto,fn,classe)=>{
        const b=node("button",texto,classe);b.type="button";b.addEventListener("click",fn);return b;
    };
    const escapar=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    let ativo=false,semana=S.calendario(new Date(),true),rows=[],ativos=[],token=0;
    const mapaPagina=document.getElementById("mapa");
    function aviso(texto,tipo="info"){el("aviso").textContent=texto;el("aviso").dataset.tipo=tipo;}
    function atualizarAcesso(){el("gerenciar").hidden=!S.podeEditar();}
    function contexto(){return {contrato:Mapa.contratoAtivo,...semana};}
    function conferirDiario(){
        if(MapaPainel.salvandoAnotacao||MapaPainel.temAnotacaoPendente?.()){
            aviso("Conclua a verificação das anotações do mapa diário antes de alternar.","erro");return false;
        }
        const alterado=[...document.querySelectorAll("#mapa-painel .mapa-anotacao-lider textarea")]
            .some(i=>i.value!==i.defaultValue);
        return !alterado||window.confirm("Há anotações do líder não salvas no mapa diário. Deseja descartá-las e abrir a prévia?");
    }
    function mudarModo(modo){
        if(modo&&!ativo&&!conferirDiario())return;
        if(Mapa.selecaoLocalizacao)return;
        if(modo&&!ativo)semana=S.calendario(new Date(),true);
        ativo=modo;token++;rows=[];ativos=[];
        mapaPagina.classList.toggle("mps-ativo",ativo);
        el("proxima").setAttribute("aria-pressed",String(ativo));
        el("diario").hidden=!ativo;el("filtros").hidden=!ativo;
        el("resumo").hidden=!ativo;el("semana").value=S.valorSemana(semana);
        Mapa.fecharPainel();aviso("");
        if(ativo)void renderizar();else{
            Mapa.iniciarLegenda();document.querySelectorAll("#mapa-legenda button").forEach(b=>b.disabled=false);
            Mapa.renderFrentes();
        }
    }
    async function renderizar(){
        if(!ativo||Mapa.selecaoLocalizacao)return;
        const n=++token,c=Mapa.contratoAtivo,s={...semana};
        Mapa.markersLayer?.clearLayers();Mapa.fecharPainel();rows=[];ativos=[];
        el("resumo-itens").replaceChildren(node("p","Carregando programação…"));
        el("periodo").textContent=S.periodo(s.ano,s.semana);
        el("resumo-subtitulo").textContent=S.valorSemana(s)===S.valorSemana(S.calendario(new Date(),true))?"Próxima semana":"Semana selecionada";
        aviso("Carregando programação publicada…");
        try{
            const [r,a]=await Promise.all([S.listar(c,s),S.ativos(c)]);
            if(n!==token||!ativo)return;
            rows=r;ativos=a;
            desenhar();
            aviso(rows.length?"":"Nenhuma programação publicada para este contrato e semana.");
        }catch(e){
            if(n!==token||!ativo)return;
            el("resumo-itens").replaceChildren(node("p","Consulta indisponível. Nenhum dado foi removido."));
            aviso(S.erro(e),"erro");
        }
    }
    function grupos(){
        const resultado=new Map();
        rows.forEach(r=>{
            const nome=r.dados.ativo;
            if(!resultado.has(nome))resultado.set(nome,[]);
            resultado.get(nome).push(r);
        });
        return resultado;
    }
    function localizacao(nome){
        const c=Dashboard.contratos[Mapa.contratoAtivo];
        for(const aba of c?.abas??[])for(const lider of aba.atividades??[])for(const om of lider.oms??[]){
            if(om.frente!==nome)continue;
            const p=validarCoordenadasOM(om.latitude,om.longitude);
            if(p.valida&&!p.vazia)return {lat:p.lat,lng:p.lng};
        }
        const a=ativos.find(x=>x.ativo===nome);
        const p=validarCoordenadasOM(a?.lat,a?.lng);
        return p.valida&&!p.vazia?{lat:p.lat,lng:p.lng}:null;
    }
    function desenhar(){
        el("resumo-itens").replaceChildren();
        const porAtivo=grupos(),contagem=porAtivo.size;
        let pinos=0;
        for(const [nome,janelas]of porAtivo){
            const grupo=node("section",null,"mps-ativo-item"),coord=localizacao(nome);
            grupo.append(node("h3",nome));
            if(!coord)grupo.append(node("p","Sem localização cadastrada","mps-sem-coordenada"));
            janelas.forEach((r,i)=>{
                const b=botao("",()=>abrir(nome,r.id),"mps-janela-resumo");
                const textos=node("span");
                textos.append(node("strong",`Janela ${i+1}`),node("span",S.janela(r.dados)));
                b.append(textos,node("strong",S.duracao(r.dados),"mps-duracao"));grupo.append(b);
            });
            el("resumo-itens").append(grupo);
            if(!coord||!Mapa.markersLayer)continue;
            const icon=L.divIcon({className:"mapa-marker-divicon mps-marker",
                html:`<div class="mapa-marker-wrap"><div class="mapa-marker status-planejada"></div>
                  <div class="mapa-marker-label"><span class="mapa-marker-tag status-planejada">Programação semanal</span><strong>${escapar(nome)}</strong></div></div>`,
                iconSize:[34,34],iconAnchor:[17,34]});
            const m=L.marker([coord.lat,coord.lng],{icon,title:nome,alt:`Ativo programado: ${nome}`});
            m.on("click",()=>abrir(nome));m.addTo(Mapa.markersLayer);pinos++;
        }
        if(!contagem)el("resumo-itens").append(node("p","Nenhum ativo com programação publicada."));
        const legenda=document.getElementById("mapa-legenda");
        legenda.querySelectorAll("button").forEach(b=>b.disabled=true);
        Mapa.atualizarLegenda([...Array(contagem)].map(()=>({status:"planejada"})));
        el("contagem").textContent=`${contagem} ativo(s) · ${pinos} localizado(s)`;
    }
    function abrir(nome,janelaId=null){
        if(!ativo)return;
        const itens=rows.filter(r=>r.dados.ativo===nome);
        const painel=document.getElementById("mapa-painel"),conteudo=document.getElementById("mapa-painel-conteudo");
        if(!itens.length||!conteudo)return;
        Mapa.fecharPainel();
        const h=node("h2",nome);h.tabIndex=-1;
        conteudo.replaceChildren(h,node("p",`${Mapa.contratoAtivo.replace("os","OS ")} · Prévia semanal`));
        const ordenados=janelaId?[...itens.filter(r=>r.id===janelaId),...itens.filter(r=>r.id!==janelaId)]:itens;
        ordenados.forEach((r,i)=>{
            const sec=node("section",null,"mapa-painel-secao mps-detalhe-janela");
            sec.append(node("h3",`Janela ${itens.indexOf(r)+1} — ${S.duracao(r.dados)}`),
                node("p",S.janela(r.dados)),node("p",r.dados.observacoes??""));
            if(!r.dados.atividades.length)sec.append(node("p","Nenhuma atividade cadastrada nesta janela."));
            r.dados.atividades.forEach(a=>{
                const card=node("article",null,"mapa-painel-atividade");
                const textos=node("div",null,"mapa-painel-atividade-texto");
                textos.append(node("strong",`OM ${a.om}`),node("p",a.descricao),node("p",S.dataHora(a.data,a.hora)));
                card.append(textos);sec.append(card);
            });
            conteudo.append(sec);
        });
        mapaPagina.classList.add("mps-detalhe-aberto");painel.classList.add("aberto");
        h.focus({preventScroll:true});
    }
    el("proxima").addEventListener("click",()=>mudarModo(true));
    el("diario").addEventListener("click",()=>mudarModo(false));
    el("semana").value=S.valorSemana(semana);
    el("semana").addEventListener("change",()=>{
        try{semana=S.lerSemana(el("semana").value);void renderizar();}
        catch(e){el("semana").value=S.valorSemana(semana);aviso(e.message,"erro");}
    });
    el("atual").addEventListener("click",()=>{semana=S.calendario();el("semana").value=S.valorSemana(semana);void renderizar();});
    el("atualizar").addEventListener("click",()=>{if(ativo)void renderizar();});
    document.addEventListener("plamont:auth-alterado",()=>{
        atualizarAcesso();if(ativo)void renderizar();
    });
    atualizarAcesso();
    return Object.freeze({get ativo(){return ativo;},contexto,renderizar,mudarModo,atualizarAcesso,abrir});
})();
