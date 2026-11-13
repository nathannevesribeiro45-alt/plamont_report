window.MapaSemanalEditor=(()=>{
    const S=window.MapaSemanalStorage;
    const el=id=>document.getElementById("mpse-"+id);
    const node=(tag,texto,classe)=>{
        const n=document.createElement(tag);if(texto!=null)n.textContent=texto;if(classe)n.className=classe;return n;
    };
    const button=(texto,fn)=>{
        const b=node("button",texto);b.type="button";b.addEventListener("click",fn);return b;
    };
    const clone=d=>JSON.parse(JSON.stringify(d));
    let registro=null,inicial=null,ocupado=false,token=0,ativos=[],historico=null;
    let assinatura=S.sessao(),consulta=S.calendario(new Date(),true);
    const sujo=()=>!!registro&&!registro.somente&&JSON.stringify(registro.dados)!==inicial;
    function msg(texto,tipo="info"){el("aviso").textContent=texto;el("aviso").dataset.tipo=tipo;}
    function podeSair(){
        if(ocupado){msg("Aguarde a confirmação do servidor.");return false;}
        return !sujo()||window.confirm("Há alterações não salvas nesta janela. Deseja descartá-las?");
    }
    function view(id){
        ["lista","formulario","historico"].forEach(k=>el(k).hidden=k!==id);
    }
    function bloqueio(sim){
        ocupado=sim;el("fechar").disabled=sim;el("voltar").disabled=sim;el("dados").disabled=sim||!!registro?.somente;
        el("contrato").disabled=sim;el("semana").disabled=sim;el("excluidas").disabled=sim;el("nova").disabled=sim;
        controles();
    }
    function controles(){
        const editavel=!!registro&&!registro.somente;
        el("salvar").hidden=!editavel;el("publicar").hidden=!editavel;
        el("salvar").disabled=ocupado;el("publicar").disabled=ocupado||sujo()||!registro?.tem_rascunho;
        if(registro)el("status").textContent=sujo()?"Alterações ainda não salvas.":registro.tem_rascunho?
            "Rascunho salvo; a programação pública anterior não mudou.":registro.publicada?
            `Publicação vigente: revisão ${registro.publicada}.`:"Nova janela, ainda não salva.";
        const d=registro?.dados;
        el("duracao").textContent=d?S.duracao(d):"A definir";
    }
    async function carregar(){
        if(ocupado||!podeSair()||!S.podeEditar())return;
        const n=++token,c=el("contrato").value;
        try{consulta=S.lerSemana(el("semana").value);}catch(e){msg(e.message,"erro");return;}
        registro=null;inicial=null;historico=null;view("lista");bloqueio(true);
        el("itens").replaceChildren();msg("Carregando janelas…");
        try{
            const [rows,a]=await Promise.all([S.listar(c,consulta,true,el("excluidas").checked),S.ativos(c)]);
            if(n!==token)return;ativos=a;
            if(!rows.length)el("itens").append(node("p","Nenhuma janela nesta consulta."));
            rows.forEach(r=>{
                const item=node("article",null,"mps-editor-item");
                item.append(node("h3",r.dados.ativo),node("p",`${S.valorSemana(r.dados)} · ${S.janela(r.dados)}`),
                    node("strong",S.duracao(r.dados),"mps-duracao"),
                    node("p",r.excluida_em?"Excluída (recuperável)":r.tem_rascunho?"Rascunho salvo":"Publicada"));
                const a=node("div",null,"mps-acoes");
                a.append(button(r.excluida_em?"Consultar":"Editar",()=>editar(r,!!r.excluida_em)),
                    button("Histórico",()=>abrirHistorico(r)));
                if(r.excluida_em)a.append(button("Restaurar janela",()=>acaoLinha("restaurar",r)));
                else a.append(button("Excluir janela",()=>acaoLinha("excluir",r)));
                item.append(a);el("itens").append(item);
            });
            msg(ativos.length?"":"Este contrato não possui frentes/ativos cadastrados. Cadastre a referência no fluxo operacional existente; nenhuma coordenada será inventada.");
        }catch(e){if(n===token)msg(S.erro(e),"erro");}
        finally{if(n===token)bloqueio(false);}
    }
    function abrir(){
        if(!S.podeEditar()||ocupado)return;
        const c=MapaSemanal.contexto();
        el("contrato").value=c.contrato??S.contratos[0];
        consulta=MapaSemanal.ativo?{ano:c.ano,semana:c.semana}:S.calendario(new Date(),true);
        el("semana").value=S.valorSemana(consulta);el("excluidas").checked=false;
        registro=null;inicial=null;el("dialogo").showModal();void carregar();
    }
    function fechar(){
        if(!podeSair())return;
        token++;registro=null;historico=null;el("dialogo").close();
    }
    function nova(){
        if(ocupado||!S.podeEditar())return;
        if(!ativos.length){msg("Não há ativo cadastrado neste contrato.","erro");return;}
        editar({id:crypto.randomUUID(),contrato:el("contrato").value,versao:0,
            dados:{...consulta,ativo:null,inicio_data:null,inicio_hora:null,fim_data:null,fim_hora:null,
                observacoes:null,atividades:[]}});
    }
    function editar(r,somente=false){
        if(ocupado)return;
        registro={...r,dados:clone(r.dados),somente};inicial=JSON.stringify(registro.dados);
        view("formulario");msg("");el("dados").disabled=somente;
        el("identidade").textContent=`${r.contrato.replace("os","OS ")} · Janela ${r.id}`;
        el("ativo").replaceChildren(node("option","Selecione o ativo"));
        el("ativo").options[0].value="";
        const nomes=[...new Set([...ativos.map(a=>a.ativo),...(r.dados.ativo?[r.dados.ativo]:[])])];
        for(const a of nomes){const o=node("option",a);o.value=a;el("ativo").append(o);}
        el("ativo").value=r.dados.ativo??"";
        el("referencia").value=S.valorSemana(r.dados);
        for(const k of ["inicio_data","inicio_hora","fim_data","fim_hora","observacoes"])el(k).value=r.dados[k]??"";
        atividades();controles();
    }
    function atividades(){
        const itens=registro.dados.atividades;
        el("atividades").replaceChildren();
        if(!itens.length)el("atividades").append(node("p","Nenhuma atividade. Cadastrar janela não cria OMs."));
        itens.forEach((r,i)=>{
            const linha=node("article",null,"mps-editor-item");
            linha.append(node("h3",`Atividade ${i+1}`));
            const grade=node("div",null,"mps-editor-grade");
            for(const [k,rotulo,tipo]of [["om","OM","text"],["descricao","Descrição da atividade","textarea"],
                ["data","Data programada","date"],["hora","Horário programado (opcional)","time"]]){
                const label=node("label",rotulo),input=node(tipo==="textarea"?"textarea":"input");
                if(tipo!=="textarea")input.type=tipo;input.value=r[k]??"";input.name=`atividades.${i}.${k}`;
                input.required=k!=="hora";
                input.addEventListener("input",()=>{
                    if(registro.somente||ocupado)return;
                    r[k]=input.value||null;controles();
                });
                label.append(input);grade.append(label);
            }
            linha.append(grade);
            if(!registro.somente)linha.append(button("Excluir atividade",()=>{
                if(ocupado)return;
                if(!window.confirm(`Remover OM ${r.om??"não informada"} desta janela? A remoção só será pública após salvar e publicar.`))return;
                itens.splice(i,1);atividades();controles();
            }));
            el("atividades").append(linha);
        });
        el("adicionar").hidden=registro.somente;
    }
    async function salvar(acao){
        if(!registro||registro.somente||ocupado||!S.podeEditar()||(acao==="publicar"&&el("publicar").disabled))return;
        const r=registro,n=token;
        try{
            if(!el("formulario").reportValidity())return;
            S.validar(r.dados);
            if(acao==="publicar"&&!window.confirm(`Publicar a janela de ${r.dados.ativo} (${S.janela(r.dados)})? O histórico anterior será preservado.`))return;
            bloqueio(true);msg("Confirmando no Supabase…");
            const res=await S.gravar(acao,r,acao==="salvar"?clone(r.dados):null,consulta);
            if(n!==token||r!==registro)return;
            r.versao=res.versao;r.publicada=res.publicada;r.tem_rascunho=acao==="salvar";inicial=JSON.stringify(r.dados);
            msg(acao==="salvar"?"Rascunho salvo. A programação pública não mudou.":"Publicação confirmada. Versão anterior preservada.","sucesso");
            if(acao==="publicar"&&MapaSemanal.ativo)void MapaSemanal.renderizar();
        }catch(e){if(n===token)msg(S.erro(e),"erro");}
        finally{if(n===token)bloqueio(false);}
    }
    async function acaoLinha(acao,r){
        if(ocupado||!S.podeEditar())return;
        const texto=acao==="excluir"?
            `Excluir a janela ${r.id} de ${r.dados.ativo} — ${S.janela(r.dados)}? As ${r.dados.atividades.length} atividade(s) vinculadas deixarão a consulta ativa. A janela completa ficará na lixeira para recuperação.`:
            `Restaurar a janela ${r.id} de ${r.dados.ativo}? A última publicação, se existir, voltará à consulta ativa.`;
        if(!window.confirm(texto))return;
        const n=token;
        try{
            bloqueio(true);msg("Confirmando no servidor…");
            await S.gravar(acao,r,null,consulta);
            if(n!==token)return;
            bloqueio(false);await carregar();
            msg(acao==="excluir"?"Janela excluída da consulta ativa. Recuperável na lixeira.":"Janela restaurada.","sucesso");
            if(MapaSemanal.ativo)void MapaSemanal.renderizar();
        }catch(e){if(n===token)msg(S.erro(e),"erro");}
        finally{if(n===token)bloqueio(false);}
    }
    async function abrirHistorico(r){
        if(ocupado)return;
        historico={r,antes:null};registro=null;inicial=null;view("historico");
        el("revisoes").replaceChildren();await maisHistorico();
    }
    async function maisHistorico(){
        if(!historico||ocupado)return;
        const h=historico,n=token;
        bloqueio(true);
        try{
            const rows=await S.historico(h.r.id,h.antes);
            if(n!==token)return;
            if(!Array.isArray(rows))throw new Error("Histórico inválido.");
            rows.forEach(x=>{
                const item=node("article",null,"mps-editor-item");
                item.append(node("h3",`Revisão ${x.versao} · ${x.acao}`),
                    node("p",`${new Date(x.criado_em).toLocaleString("pt-BR")} · ${x.autor}`),
                    button("Consultar revisão",()=>editar({...h.r,versao:x.versao,dados:x.dados},true)));
                el("revisoes").append(item);
            });
            if(rows.length)h.antes=rows.at(-1).versao;
            el("mais").hidden=rows.length<20;
            msg(rows.length?"":"Nenhuma outra revisão.");
        }catch(e){if(n===token)msg(S.erro(e),"erro");}
        finally{if(n===token)bloqueio(false);}
    }
    document.getElementById("mps-gerenciar").addEventListener("click",abrir);
    for(const c of S.contratos){const opt=node("option",c.replace("os","OS "));opt.value=c;el("contrato").append(opt);}
    for(const k of ["contrato","semana","excluidas"])el(k).addEventListener("change",()=>void carregar());
    el("nova").addEventListener("click",nova);
    el("fechar").addEventListener("click",fechar);
    el("dialogo").addEventListener("cancel",e=>{e.preventDefault();fechar();});
    el("voltar").addEventListener("click",()=>{
        if(!podeSair())return;
        registro=null;inicial=null;
        if(historico)view("historico");else void carregar();
    });
    el("voltar-historico").addEventListener("click",()=>{if(!ocupado){historico=null;void carregar();}});
    el("mais").addEventListener("click",maisHistorico);
    el("adicionar").addEventListener("click",()=>{
        if(!registro||registro.somente||ocupado)return;
        registro.dados.atividades.push({id:crypto.randomUUID(),om:null,descricao:null,data:null,hora:null});
        atividades();controles();
    });
    for(const k of ["ativo","inicio_data","inicio_hora","fim_data","fim_hora","observacoes"])
        el(k).addEventListener("input",()=>{
            if(!registro||registro.somente||ocupado)return;
            registro.dados[k]=el(k).value||null;controles();
        });
    el("referencia").addEventListener("change",()=>{
        if(!registro||ocupado)return;
        try{Object.assign(registro.dados,S.lerSemana(el("referencia").value));controles();}
        catch(e){el("referencia").value=S.valorSemana(registro.dados);msg(e.message,"erro");}
    });
    el("formulario").addEventListener("submit",e=>{e.preventDefault();void salvar("salvar");});
    el("publicar").addEventListener("click",()=>void salvar("publicar"));
    window.addEventListener("beforeunload",e=>{if(sujo()||ocupado){e.preventDefault();e.returnValue="";}});
    document.addEventListener("plamont:auth-alterado",()=>{
        const s=S.sessao();if(s===assinatura)return;assinatura=s;
        token++;registro=null;inicial=null;historico=null;bloqueio(false);
        el("dados").querySelectorAll("input,textarea").forEach(i=>i.value="");
        el("itens").replaceChildren();el("atividades").replaceChildren();el("revisoes").replaceChildren();
        if(el("dialogo").open)el("dialogo").close();
    });
    return Object.freeze({});
})();
