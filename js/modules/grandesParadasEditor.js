window.GrandesParadasEditor=(()=>{
    const S=window.GrandesParadasStorage;
    const el=id=>document.getElementById("gp-"+id);
    const clone=d=>JSON.parse(JSON.stringify(d));
    const node=(tag,texto,classe)=>{
        const n=document.createElement(tag);
        if(texto!=null)n.textContent=texto;
        if(classe)n.className=classe;
        return n;
    };
    const botao=(texto,acao,classe)=>{
        const b=node("button",texto,classe);b.type="button";b.addEventListener("click",acao);return b;
    };
    const contratoNome=id=>id.replace("os","OS ");
    const dataPublicacao=x=>x?new Date(x).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";
    let atual=null,previa=null,ocupado=false,requisicao=0,hist=null,gestao=false;
    let assinaturaSessao=S.sessao();
    const sujo=()=>!!atual&&!atual.somente&&JSON.stringify(atual.dados)!==atual.inicial;
    const informar=(texto,tipo="info")=>{el("mensagem").textContent=texto;el("mensagem").dataset.tipo=tipo;};
    const confirmarSaida=()=>!ocupado&&(!sujo()||window.confirm("Há alterações não salvas. Deseja descartá-las?"));
    function atualizarAcesso(){
        el("gerenciar").hidden=!S.podeEditar();
        el("historico-publico").hidden=!CurvaS.publicados.some(p=>p.id===CurvaS.paradaAtual?.id);
    }
    function mostrar(painel){
        ["lista","edicao","historico"].forEach(id=>{el(id).hidden=id!==painel;});
        el("titulo").textContent={lista:"Gerenciar Grandes Paradas",edicao:"Grande Parada",historico:"Histórico de publicações"}[painel];
    }
    function fechar(){
        if(!confirmarSaida())return;
        requisicao++;atual=null;hist=null;previa=null;el("dialogo").close();
    }
    function dialogo(painel){
        informar("");mostrar(painel);
        if(!el("dialogo").open)el("dialogo").showModal();
    }
    function bloquear(sim){
        ocupado=sim;
        el("fechar").disabled=sim;el("filtro").disabled=sim;el("nova").disabled=sim;
        el("campos").disabled=sim||!!atual?.somente;
        atualizarAcoes();
    }
    async function listar(){
        const token=++requisicao,contrato=el("filtro").value;
        atual=null;previa=null;hist=null;dialogo("lista");bloquear(true);
        el("itens").replaceChildren();informar("Carregando paradas…");
        try{
            const [rows,legado]=await Promise.all([S.listar(contrato,true),CurvaS.carregarLegado(contrato)]);
            if(token!==requisicao)return;
            const encontrados=new Set(rows.map(r=>r.id));
            for(const d of legado.paradas)if(!encontrados.has(d.id))
                rows.push({id:d.id,dados:d,contrato,legado:true});
            if(!rows.length)el("itens").append(node("p","Nenhuma parada cadastrada neste contrato."));
            rows.forEach(r=>{
                const item=node("article",null,"gp-item");
                const meta=[S.estados[r.dados.estadoOperacional]??"Estado não informado",
                    r.arquivado_em?"Arquivada":r.legado?"JSON legado":r.tem_rascunho?"Rascunho":"Publicada"];
                item.append(node("h3",r.dados.nome||"Parada sem nome"),node("p",meta.join(" · ")),
                    node("p",`Previsto: ${CurvaS.dataHora(r.dados.periodo?.inicio,r.dados.periodo?.inicioHora)} → ${CurvaS.dataHora(r.dados.periodo?.previstoFim??r.dados.periodo?.fim,r.dados.periodo?.previstoFimHora??r.dados.periodo?.fimHora)}`),
                    node("p",`Última publicação: ${dataPublicacao(r.publicado_em)}`));
                const a=node("div",null,"gp-acoes");
                a.append(botao(r.arquivado_em||r.legado?"Consultar":"Editar",()=>abrirEdicao(r,!!(r.arquivado_em||r.legado))));
                if(r.publicada)a.append(botao("Histórico",()=>abrirHistorico(r.contrato,r.id,true)));
                item.append(a);el("itens").append(item);
            });
            informar(legado.erroLegado?"O arquivo legado deste contrato está indisponível.":"");
        }catch(e){if(token===requisicao)informar(S.erro(e),"erro");}
        finally{if(token===requisicao)bloquear(false);}
    }
    function gerenciar(){
        if(!S.podeEditar()||ocupado)return;
        el("filtro").value=CurvaS.contratoAtual??S.contratos[0];gestao=true;void listar();
    }
    function abrirEdicao(r,somente=false){
        atual={...r,dados:clone(r.dados),somente,inicial:JSON.stringify(r.dados)};
        previa=null;dialogo("edicao");desenharEdicao();bloquear(false);
    }
    function nova(){
        if(!S.podeEditar()||ocupado)return;
        const contrato=el("filtro").value;
        const id=crypto.randomUUID(); // Identificador técnico; nenhum dado operacional padrão.
        abrirEdicao({id,contrato,versao:0,dados:{id,contrato}});
    }
    function valor(path){return path.reduce((a,k)=>a?.[k],atual.dados);}
    function escrever(path,v){
        let obj=atual.dados;
        for(let i=0;i<path.length-1;i++)obj=obj[path[i]]??=(typeof path[i+1]==="number"?[]:{});
        obj[path.at(-1)]=v;
    }
    const iso=d=>typeof d==="string"&&d.includes("/")?d.split("/").reverse().join("-"):"";
    const br=d=>d?d.split("-").reverse().join("/"):null;
    function campo(rotulo,path,tipo="text",opcoes=null){
        const label=node("label",rotulo),input=node(opcoes?"select":tipo==="textarea"?"textarea":"input");
        if(opcoes){
            input.append(node("option","Não informado"));input.options[0].value="";
            for(const [chave,nome] of Object.entries(opcoes)){
                const opt=node("option",nome);opt.value=chave;input.append(opt);
            }
        }else if(tipo!=="textarea"){
            input.type=tipo;
            if(tipo==="number"){input.step="any";input.inputMode="decimal";}
        }
        input.name=path.join(".");
        const v=valor(path);
        input.value=tipo==="date"?iso(v):v??"";
        input.addEventListener("input",()=>{
            if(!atual||atual.somente||ocupado)return;
            const x=input.value;
            escrever(path,tipo==="date"?br(x):x===""?null:tipo==="number"?input.valueAsNumber:x);
            if(path.join(".")==="status.data")atual.dados.dataStatus=br(x);
            previa=null;el("previa").hidden=true;atualizarAcoes();
        });
        label.append(input);return label;
    }
    function secao(titulo,aberta=false){
        const d=node("details",null,"gp-grupo");d.open=aberta;d.append(node("summary",titulo));return d;
    }
    function grade(...itens){
        const d=node("div",null,"gp-grade");d.append(...itens);return d;
    }
    function periodo(path,nome,inicio,hora,fim,horaFim){
        return grade(campo(`Data de início — ${nome}`,[...path,inicio],"date"),
            campo("Hora de início",[...path,hora],"time"),campo(`Data de término — ${nome}`,[...path,fim],"date"),
            campo("Hora de término",[...path,horaFim],"time"));
    }
    function listaCampos(titulo,path,esquema,{antes=null,ordenar=false}={}){
        const grupo=secao(titulo),lista=node("div");
        if(antes)grupo.append(antes);
        grupo.append(lista);
        const atualizar=()=>{
            const itens=valor(path)??[];
            lista.replaceChildren();
            const linhas=itens.map((r,i)=>({r,i}));
            if(ordenar)linhas.sort((a,b)=>(S.instante(a.r.data,a.r.hora)??Infinity)-(S.instante(b.r.data,b.r.hora)??Infinity));
            linhas.forEach(({i},n)=>{
                const linha=node("div",null,"gp-linha");
                linha.append(node("strong",`Item ${n+1}`),grade(...esquema.map(([rot,k,t])=>campo(rot,[...path,i,k],t))));
                if(!atual.somente)linha.append(botao("Remover item",()=>{
                    if(!window.confirm("Remover este item do rascunho? As publicações anteriores não mudam."))return;
                    itens.splice(i,1);previa=null;el("previa").hidden=true;atualizar();atualizarAcoes();
                }));
                lista.append(linha);
            });
            if(!itens.length)lista.append(node("p","Nenhum item informado."));
        };
        atualizar();
        if(!atual.somente)grupo.append(botao("Adicionar item",()=>{
            let itens=valor(path);if(!Array.isArray(itens)){itens=[];escrever(path,itens);}
            itens.push({});previa=null;el("previa").hidden=true;atualizar();atualizarAcoes();
            lista.querySelector(".gp-linha:last-child input")?.focus();
        }));
        return grupo;
    }
    function desenharEdicao(){
        const d=atual.dados;
        el("edicao-meta").textContent=`${contratoNome(atual.contrato)} · ${atual.id} · ${atual.legado?"JSON legado":atual.arquivado_em?"Arquivada":atual.tem_rascunho?"Rascunho salvo":atual.publicada?"Publicada":"Nova parada"}`;
        const geral=secao("1. Informações gerais",true);
        geral.append(grade(campo("Nome",["nome"]),campo("Equipamento",["equipamento"]),campo("Tipo",["tipo"])));
        const periodos=secao("2. Períodos e estado");
        periodos.append(grade(campo("Estado operacional",["estadoOperacional"],"text",S.estados),
            campo("Data do status",["status","data"],"date"),campo("Hora do status",["status","hora"],"time")),
            periodo(["periodo"],"planejamento","inicio","inicioHora","previstoFim","previstoFimHora"),
            grade(campo("Data de término real",["periodo","realizadoFim"],"date"),campo("Hora de término real",["periodo","realizadoFimHora"],"time"),
                campo("Data do horizonte do gráfico (opcional)",["periodo","fim"],"date"),campo("Hora do horizonte (opcional)",["periodo","fimHora"],"time")));
        if(!d.status?.data&&d.dataStatus)periodos.querySelector('[name="status.data"]').value=iso(d.dataStatus);
        const pontos=listaCampos("3. Pontos da Curva S",["pontos"],[
            ["Data","data","date"],["Hora","hora","time"],["Previsto (%)","previsto","number"],["Realizado (%)","realizado","number"],
            ["Previsto unitário (opcional)","previstoUnitario","number"],["Realizado unitário (opcional)","realizadoUnitario","number"]
        ],{ordenar:true});
        const marcos=listaCampos("4. Marcos",["marcos"],[
            ["Data","data","date"],["Hora","hora","time"],["Previsto (%)","previsto","number"],["Descrição","descricao","textarea"]
        ],{ordenar:true});
        const atividades=(titulo,lista,turno)=>listaCampos(titulo,["atividades",lista],[
            ["OM","om"],["Área/equipamento","area"],["Descrição","descricao","textarea"],["Status","status"]
        ],{antes:periodo(["turno",turno],"atividades","dataInicio","inicio","dataFim","fim")});
        const obs=secao("7. Observações");obs.append(campo("Observações",["observacoes"],"textarea"));
        el("campos").replaceChildren(geral,periodos,pontos,marcos,
            atividades("5. Atividades realizadas","realizadas","realizado"),
            atividades("6. Atividades a realizar","proximas","proximo"),obs);
        el("previa").hidden=true;
        atualizarAcoes();
    }
    function atualizarAcoes(){
        if(!atual)return;
        const editar=!atual.somente&&S.podeEditar();
        el("rascunho").hidden=!editar;el("rascunho").disabled=ocupado;
        el("publicar").hidden=!editar;el("publicar").disabled=ocupado||!atual.tem_rascunho||sujo()||previa!==JSON.stringify(atual.dados);
        el("arquivar").hidden=!editar||!atual.versao;el("arquivar").disabled=ocupado||sujo();
        el("importar").hidden=!atual.legado||!S.podeImportar();el("importar").disabled=ocupado||!previa;
        el("ver-previa").disabled=ocupado;
        el("voltar").disabled=ocupado;
        el("edicao-status").textContent=sujo()?"Alterações não salvas.":atual.tem_rascunho?
            "Rascunho salvo. Confira a prévia para habilitar Publicar.":atual.publicada?`Versão publicada: ${atual.publicada}`:"";
    }
    function validarFormulario(publicar=false){
        for(const i of el("campos").querySelectorAll("input")){
            if(!i.validity.valid){const grupo=i.closest("details");if(grupo)grupo.open=true;i.reportValidity();throw new Error("Confira o campo destacado.");}
        }
        S.validar(atual.dados,{publicar,legado:atual.legado});
    }
    function verPrevia(){
        if(!atual||ocupado)return;
        try{
            validarFormulario();
            const d=atual.dados,metrics=CurvaS.calcularMetricas(d);
            el("previa-resumo").textContent=`${d.nome??"Sem nome"} · ${S.estados[d.estadoOperacional]??"Estado não informado"} · ${CurvaS.dataHora(metrics.dataStatusFormatada,d.status?.hora)} · ${d.marcos?.length??0} marco(s) · ${d.atividades?.realizadas?.length??0} atividade(s) realizada(s) · ${d.atividades?.proximas?.length??0} próxima(s)`;
            CurvaS.renderGrafico(d,metrics,el("previa-grafico"));
            el("previa").hidden=false;previa=JSON.stringify(d);atualizarAcoes();
            el("previa").scrollIntoView({block:"nearest"});informar("Prévia local. Nada foi publicado.");
        }catch(e){informar(S.erro(e),"erro");}
    }
    async function gravar(acao){
        if(!atual||ocupado||!S.podeEditar()||(atual.somente&&acao!=="importar"))return;
        if((acao==="publicar"&&el("publicar").disabled)||(acao==="importar"&&el("importar").disabled)||
            (acao==="arquivar"&&el("arquivar").disabled))return;
        const c=atual,token=requisicao;
        try{
            if(acao!=="arquivar")validarFormulario(acao!=="rascunho");
            const confirmacoes={publicar:"Publicar este rascunho para consulta? A versão anterior será preservada.",
                arquivar:"Arquivar esta parada? Ela e seu histórico continuam disponíveis para consulta.",
                importar:"Importar e registrar este JSON legado como primeira publicação, sem alterar o arquivo original?"};
            if(confirmacoes[acao]&&!window.confirm(confirmacoes[acao]))return;
            bloquear(true);informar("Gravando no Supabase…");
            const r=await S.gravar(acao,{...c,dados:["rascunho","importar"].includes(acao)?clone(c.dados):null});
            if(token!==requisicao||atual!==c)return;
            c.versao=r.versao;c.publicada=r.publicada;c.tem_rascunho=acao==="rascunho";
            c.inicial=JSON.stringify(c.dados);
            if(acao==="importar"||acao==="arquivar"){
                bloquear(false);await listar();
            }else{
                el("edicao-meta").textContent=`${contratoNome(c.contrato)} · ${c.id} · ${acao==="rascunho"?"Rascunho salvo":"Publicada"}`;
            }
            if(!S.podeEditar()||!el("dialogo").open)return;
            informar(r.ja_importada?"Parada já importada. Nenhum dado alterado.":
                {rascunho:"Rascunho salvo. A versão pública não mudou.",publicar:"Publicação confirmada. Histórico preservado.",
                    arquivar:"Parada arquivada. Histórico preservado.",importar:"JSON importado sem modificar o original."}[acao],"sucesso");
            if(acao!=="rascunho")void CurvaS.render();
        }catch(e){if(token===requisicao)informar(S.erro(e),"erro");}
        finally{if(token===requisicao)bloquear(false);}
    }
    async function abrirHistorico(contrato,id,autoria=false){
        if(ocupado||!confirmarSaida())return;
        gestao=autoria;atual=null;previa=null;hist={contrato,id,autoria,antes:null};
        dialogo("historico");el("versoes").replaceChildren();await maisHistorico();
    }
    async function maisHistorico(){
        if(!hist||ocupado)return;
        const h=hist,token=++requisicao;bloquear(true);el("mais").disabled=true;informar("Carregando publicações…");
        try{
            const rows=await S.historico(h.contrato,h.id,h.antes,h.autoria);
            if(token!==requisicao)return;
            rows.forEach(r=>{
                const item=node("article",null,"gp-item");
                item.append(node("h3",`Versão ${r.versao} · ${r.dados.nome??"—"}`),
                    node("p",`${dataPublicacao(r.publicado_em)}${r.publicado_por?` · ${r.autor??r.publicado_por}`:""}`),
                    botao("Consultar versão",()=>abrirEdicao({id:h.id,contrato:h.contrato,publicada:r.versao,dados:r.dados},true)));
                el("versoes").append(item);
            });
            if(rows.length)h.antes=rows.at(-1).versao;
            el("mais").hidden=rows.length<10;
            informar(!el("versoes").children.length?"Nenhuma publicação registrada.":"");
        }catch(e){if(token===requisicao)informar(S.erro(e),"erro");}
        finally{if(token===requisicao){bloquear(false);el("mais").disabled=false;}}
    }
    function voltar(){
        if(!confirmarSaida())return;
        if(hist){atual=null;previa=null;dialogo("historico");return;}
        if(gestao&&S.podeEditar())void listar();else fechar();
    }
    function iniciar(){
        for(const id of S.contratos){const opt=node("option",contratoNome(id));opt.value=id;el("filtro").append(opt);}
        el("gerenciar").addEventListener("click",gerenciar);
        el("historico-publico").addEventListener("click",()=>{
            if(CurvaS.paradaAtual)void abrirHistorico(CurvaS.contratoAtual,CurvaS.paradaAtual.id);
        });
        el("filtro").addEventListener("change",listar);
        el("nova").addEventListener("click",nova);
        el("voltar").addEventListener("click",voltar);el("voltar-historico").addEventListener("click",()=>{
            if(!ocupado){hist=null;voltar();}
        });
        el("fechar").addEventListener("click",fechar);
        el("dialogo").addEventListener("cancel",e=>{e.preventDefault();fechar();});
        el("ver-previa").addEventListener("click",verPrevia);
        el("mais").addEventListener("click",maisHistorico);
        for(const acao of ["rascunho","publicar","arquivar","importar"])
            el(acao).addEventListener("click",()=>gravar(acao));
        window.addEventListener("beforeunload",e=>{if(sujo()||ocupado){e.preventDefault();e.returnValue="";}});
        document.addEventListener("plamont:auth-alterado",()=>{
            const s=S.sessao();if(s===assinaturaSessao)return;assinaturaSessao=s;
            requisicao++;atual=null;hist=null;previa=null;bloquear(false);
            el("campos").replaceChildren();el("itens").replaceChildren();el("versoes").replaceChildren();
            if(el("dialogo").open)el("dialogo").close();
            atualizarAcesso();
        });
        atualizarAcesso();
    }
    iniciar();
    return Object.freeze({atualizarAcesso});
})();
