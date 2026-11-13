window.MapaSemanalStorage=(()=>{
    const contratos=Object.freeze(["os440","os441","os442","os450","os456"]);
    const sessao=()=>JSON.stringify([window.Auth?.sessao?.user?.id,window.Auth?.usuario?.perfil,window.Auth?.usuario?.ativo]);
    const podeEditar=()=>window.Auth?.pode?.("publicar")===true;
    function instante(data,hora){
        if(!dataValida(data)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora??""))return null;
        const t=new Date(data+"T"+hora+":00-03:00");
        return Number.isFinite(+t)?t:null;
    }
    function dataValida(v){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(v??""))return false;
        const d=new Date(v+"T12:00:00Z");
        return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;
    }
    function iso(data){
        const d=new Date(Date.UTC(data.getUTCFullYear(),data.getUTCMonth(),data.getUTCDate()));
        d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
        const ano=d.getUTCFullYear();
        return {ano,semana:Math.ceil(((d-new Date(Date.UTC(ano,0,1)))/86400000+1)/7)};
    }
    function calendario(agora=new Date(),proxima=false){
        const partes=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(agora);
        const v=k=>partes.find(p=>p.type===k).value;
        const d=new Date(`${v("year")}-${v("month")}-${v("day")}T12:00:00Z`);
        if(proxima)d.setUTCDate(d.getUTCDate()+7);
        return iso(d);
    }
    const semanaValida=(ano,semana)=>Number.isInteger(ano)&&ano>=2000&&ano<=2100&&Number.isInteger(semana)&&
        semana>=1&&semana<=iso(new Date(Date.UTC(ano,11,28))).semana;
    function periodo(ano,semana){
        const d=new Date(Date.UTC(ano,0,4));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(semana-1)*7);
        const fim=new Date(+d+6*86400000);
        const f=x=>x.toLocaleDateString("pt-BR",{timeZone:"UTC"});
        return `${f(d)} a ${f(fim)}`;
    }
    const valorSemana=({ano,semana})=>`${ano}-W${String(semana).padStart(2,"0")}`;
    function lerSemana(v){
        const m=/^(\d{4})-W(\d{2})$/.exec(v??"");
        const r=m?{ano:Number(m[1]),semana:Number(m[2])}:null;
        if(!r||!semanaValida(r.ano,r.semana))throw new Error("Selecione uma semana ISO válida, entre 2000 e 2100.");
        return r;
    }
    function validar(d){
        if(!d||!semanaValida(d.ano,d.semana)||typeof d.ativo!=="string"||!d.ativo.trim())
            throw new Error("Informe ativo e semana.");
        for(const k of ["inicio_data","fim_data"])if(d[k]!=null&&!dataValida(d[k]))throw new Error("Data da janela inválida.");
        for(const k of ["inicio_hora","fim_hora"])if(d[k]!=null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(d[k]))throw new Error("Hora da janela inválida.");
        const a=instante(d.inicio_data,d.inicio_hora),b=instante(d.fim_data,d.fim_hora);
        if((a&&b&&b<=a)||(d.inicio_data&&d.fim_data&&d.fim_data<d.inicio_data))
            throw new Error("O término previsto deve ser posterior ao início.");
        if(!Array.isArray(d.atividades))throw new Error("Lista de atividades inválida.");
        const ids=new Set();
        d.atividades.forEach((r,i)=>{
            if(!r.id||ids.has(r.id)||typeof r.om!=="string"||!r.om.trim()||
               typeof r.descricao!=="string"||!r.descricao.trim()||!dataValida(r.data))
                throw new Error(`Atividade ${i+1}: informe OM, descrição e data programada.`);
            if(r.hora!=null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora))
                throw new Error(`Atividade ${i+1}: hora inválida.`);
            ids.add(r.id);
        });
        return d;
    }
    function duracao(d){
        const a=instante(d.inicio_data,d.inicio_hora),b=instante(d.fim_data,d.fim_hora);
        if(!a||!b||b<=a)return "A definir";
        const minutos=Math.round((b-a)/60000),h=Math.floor(minutos/60),m=minutos%60;
        return `${h}h${m?String(m).padStart(2,"0")+"min":""}`;
    }
    function dataHora(data,hora){
        const d=dataValida(data)?data.split("-").reverse().join("/"):"Data a definir";
        return `${d}${hora?" às "+hora:" · hora a definir"}`;
    }
    const janela=d=>`${dataHora(d.inicio_data,d.inicio_hora)} → ${dataHora(d.fim_data,d.fim_hora)}`;
    async function rpc(nome,args,privado=false){
        const ctx=sessao();
        await window.Auth?.pronto;
        if(privado&&(!podeEditar()||ctx!==sessao()))throw {code:"42501"};
        if(!window.Auth?.supabase)throw new Error("Conexão com Supabase indisponível.");
        const {data,error}=await window.Auth.supabase.rpc(nome,args);
        if(privado&&ctx!==sessao())throw {code:"42501"};
        if(error)throw error;
        return data;
    }
    async function ativos(contrato){
        const saida=[],vistos=new Set();let depois=null;
        for(;;){
            const lote=await rpc("mps_listar_ativos_v1",{p_contrato:contrato,p_depois:depois});
            if(!Array.isArray(lote))throw new Error("Catálogo de ativos inválido.");
            if(!lote.length)return saida;
            for(const r of lote){
                if(typeof r.ativo!=="string"||vistos.has(r.ativo))throw new Error("Catálogo inconsistente.");
                vistos.add(r.ativo);saida.push(r);
            }
            depois=lote.at(-1).ativo;
        }
    }
    async function listar(contrato,{ano,semana},gestao=false,excluidas=false){
        const saida=[],ids=new Set();let depois=null;
        if(!semanaValida(ano,semana))throw new Error("Semana inválida.");
        for(;;){
            const lote=await rpc("mps_listar_v1",{p_contrato:contrato,p_ano:ano,p_semana:semana,
                p_depois:depois,p_gestao:gestao,p_excluidas:excluidas},gestao||excluidas);
            if(!Array.isArray(lote))throw new Error("Consulta inválida.");
            if(!lote.length)return saida;
            for(const r of lote){
                if(r.contrato!==contrato||!r.id||!r.dados||ids.has(r.id))throw new Error("Consulta inconsistente.");
                ids.add(r.id);saida.push(r);
            }
            depois=lote.at(-1).id;
        }
    }
    async function historico(id,antes=null){
        return rpc("mps_historico_v1",{p_id:id,p_antes:antes},true);
    }
    async function gravar(acao,r,dados,semanaConsulta,operacao=crypto.randomUUID()){
        if(acao==="salvar")validar(dados);
        const assinatura=sessao();
        try{
            const res=await rpc("mps_gravar_v1",{p_acao:acao,p_contrato:r.contrato,p_id:r.id,
                p_base:r.versao??0,p_dados:dados??null,p_operacao:operacao},true);
            if(res?.versao!==(r.versao??0)+1)throw new Error("Resposta de salvamento inválida.");
            return res;
        }catch(e){
            if(assinatura!==sessao()||["42501","40001","22023","PGRST202","42883"].includes(e?.code))throw e;
            try {
                const possibilidades=[semanaConsulta,dados,r.dados].filter(x=>x&&semanaValida(x.ano,x.semana));
                for(const semana of possibilidades){
                    for(const excluidas of [false,true]){
                        const reg=(await listar(r.contrato,semana,true,excluidas)).find(x=>x.id===r.id);
                        if(reg?.ultima_operacao===operacao&&reg.versao===(r.versao??0)+1)return reg;
                    }
                }
            }catch{}
            throw new Error("Operação não confirmada. A edição foi mantida. Reabra a consulta antes de tentar novamente.");
        }
    }
    function erro(e){
        if(["PGRST202","42883","42P01"].includes(e?.code))return "Prévia semanal ainda não instalada. Revise a migração programacao_semanal_mapa_v1.sql.";
        if(e?.code==="42501")return "Somente planejamento e admin ativos podem editar a programação.";
        if(e?.code==="40001")return "Conflito: outra pessoa alterou esta janela. O formulário foi mantido; reabra a versão atual antes de continuar.";
        return e?.message??"Não foi possível consultar o Supabase.";
    }
    return Object.freeze({contratos,sessao,podeEditar,instante,dataValida,iso,calendario,semanaValida,periodo,
        valorSemana,lerSemana,validar,duracao,dataHora,janela,ativos,listar,historico,gravar,erro});
})();
