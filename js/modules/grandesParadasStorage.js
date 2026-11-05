window.GrandesParadasStorage = (() => {
    const estados=Object.freeze({planejada:"Planejada",em_andamento:"Em andamento",suspensa:"Suspensa",concluida:"Concluída"});
    const contratos=Object.freeze(["os440","os441","os442","os450","os456"]);
    const sessao=()=>JSON.stringify([window.Auth?.sessao?.user?.id,window.Auth?.usuario?.perfil,window.Auth?.usuario?.ativo]);
    const podeEditar=()=>window.Auth?.pode?.("publicar")===true;
    const podeImportar=()=>podeEditar()&&window.Auth?.usuario?.perfil==="admin";
    function instante(data,hora=null) {
        const m=typeof data==="string"&&data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if(!m||Number(m[3])===0||(hora!==null&&hora!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)))return null;
        const [,dia,mes,ano]=m.map(Number);
        const [h,min]=(hora??"00:00").split(":").map(Number);
        const t=new Date(0);
        t.setUTCFullYear(ano,mes-1,dia);t.setUTCHours(h,min,0,0);
        return t.getUTCFullYear()===ano&&t.getUTCMonth()===mes-1&&t.getUTCDate()===dia?t:null;
    }
    function validar(d,{publicar=false,legado=false}={}) {
        const falhar=m=>{throw new Error(m);};
        if(!d||!contratos.includes(d.contrato)||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(d.id??""))
            falhar("Contrato ou identificador inválido.");
        const par=(data,hora,nome,exigir=false)=>{
            if(!data&&!hora&&!exigir)return null;
            if(!data||(exigir&&!hora))falhar(`Informe data e hora: ${nome}.`);
            const t=instante(data,hora??null);
            if(!t)falhar(`Confira data e hora: ${nome}.`);
            return t;
        };
        if(d.estadoOperacional&&!Object.hasOwn(estados,d.estadoOperacional))falhar("Estado operacional inválido.");
        if(publicar&&(!d.nome?.trim()||(!legado&&(!d.tipo?.trim()||!d.equipamento?.trim()||!d.estadoOperacional))))
            falhar("Informe nome, tipo, equipamento e estado operacional antes de publicar.");
        const p=d.periodo??{},s=d.status??{};
        const inicio=par(p.inicio,p.inicioHora,"início",publicar&&!legado);
        const previsto=par(p.previstoFim,p.previstoFimHora,"término previsto",publicar&&!legado);
        par(p.fim,p.fimHora,"horizonte do gráfico");
        const real=par(p.realizadoFim,p.realizadoFimHora,"término real",publicar&&d.estadoOperacional==="concluida");
        if(inicio&&((previsto&&previsto<inicio)||(real&&real<inicio)))falhar("O término não pode anteceder o início.");
        par(s.data??d.dataStatus,s.hora,"status");
        const vistos=new Set();
        for(const [lista,itens] of [["Pontos",d.pontos??[]],["Marcos",d.marcos??[]]]){
            if(!Array.isArray(itens))falhar(`${lista}: lista inválida.`);
            itens.forEach((r,i)=>{
                const nome=`${lista}, item ${i+1}`;
                if(!r.data||!instante(r.data,r.hora??null))falhar(`${nome}: informe uma data válida.`);
                for(const k of ["previsto","realizado"])if(r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0||r[k]>100))
                    falhar(`${nome}: percentual deve estar entre 0 e 100.`);
                for(const k of ["previstoUnitario","realizadoUnitario"])if(r[k]!=null&&!Number.isFinite(r[k]))
                    falhar(`${nome}: valor unitário inválido.`);
                if(lista==="Pontos"){
                    const chave=`${r.data}|${r.hora??""}`;
                    if(vistos.has(chave))falhar("Dois pontos têm a mesma data e hora.");
                    vistos.add(chave);
                }
            });
        }
        for(const grupo of ["realizado","proximo"]){
            const t=d.turno?.[grupo];if(!t)continue;
            const a=t.dataInicio?par(t.dataInicio,t.inicio,grupo):null;
            const b=t.dataFim?par(t.dataFim,t.fim,grupo):null;
            if(a&&b&&b<a)falhar("Término das atividades anterior ao início.");
        }
        return d;
    }
    const semEstrutura=e=>["PGRST202","42883"].includes(e?.code);
    function erro(e) {
        if(semEstrutura(e))return "Editor ainda não instalado no Supabase. Revise e aplique a migração V1.";
        if(e?.code==="42501")return "Seu perfil não está autorizado.";
        if(e?.code==="40001")return "Outra edição já foi salva. O formulário foi mantido; copie o que precisar antes de reabrir a versão atual.";
        if(e?.code==="22023")return e.message;
        return e instanceof Error?e.message:"Não foi possível confirmar a operação no Supabase.";
    }
    async function rpc(nome,args,privado=false) {
        const assinatura=sessao();
        if(privado&&!podeEditar())throw {code:"42501"};
        await window.Auth?.pronto;
        const client=window.Auth?.supabase;
        if(!client)throw new Error("Conexão com o Supabase indisponível.");
        if(privado&&assinatura!==sessao())throw {code:"42501"};
        const {data,error}=await client.rpc(nome,args);
        if(privado&&assinatura!==sessao())throw {code:"42501"};
        if(error)throw error;
        return data;
    }
    async function listar(contrato,gestao=false) {
        if(!contratos.includes(contrato))return [];
        const saida=[],ids=new Set();let depois=null;
        for(;;){
            const lote=await rpc("gp_listar_v1",{p_contrato:contrato,p_depois:depois,p_gestao:gestao},gestao);
            if(!Array.isArray(lote))throw new Error("Resposta de consulta inválida.");
            if(!lote.length)return saida;
            for(const r of lote){
                if(r.contrato!==contrato||r.dados?.id!==r.id||r.dados?.contrato!==contrato||ids.has(r.id))
                    throw new Error("Resposta inconsistente. Atualize a consulta.");
                ids.add(r.id);saida.push(r);
            }
            depois=lote.at(-1).id;
        }
    }
    async function historico(contrato,id,antes=null,autoria=false) {
        const rows=await rpc("gp_historico_v1",{p_contrato:contrato,p_id:id,p_antes:antes,p_autoria:autoria},autoria);
        if(!Array.isArray(rows)||rows.some(r=>r.dados?.id!==id||r.dados?.contrato!==contrato))
            throw new Error("Resposta de histórico inválida.");
        return rows;
    }
    async function gravar(acao,{contrato,id,versao=0,dados=null,operacao=crypto.randomUUID()}) {
        if(acao==="importar"&&!podeImportar())throw {code:"42501"};
        const assinatura=sessao();
        const args={p_acao:acao,p_contrato:contrato,p_id:id,p_base:versao,p_dados:dados,p_operacao:operacao};
        try {
            const r=await rpc("gp_gravar_v1",args,true);
            if(!r||(!r.ja_importada&&r.versao!==versao+1))throw new Error("Resposta de gravação inválida.");
            return r;
        } catch(e) {
            if(assinatura!==sessao()||["42501","40001","22023"].includes(e?.code)||semEstrutura(e))throw e;
            // Não repete a escrita em caso de resposta incerta.
            try {
                const r=(await listar(contrato,true)).find(x=>x.id===id);
                if(r?.ultima_operacao===operacao&&r.versao===versao+1)return r;
            } catch {}
            throw new Error("Operação não confirmada. O formulário foi mantido. Consulte a gestão antes de tentar novamente.");
        }
    }
    return Object.freeze({estados,contratos,sessao,podeEditar,podeImportar,instante,validar,semEstrutura,erro,listar,historico,gravar});
})();
