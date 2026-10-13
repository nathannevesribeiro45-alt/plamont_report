/* Usa o cliente/sessão existente, sem chaves privilegiadas, localStorage ou mocks. */
window.ProdutividadeStorage = {
    tabela:'produtividade_semanal',rpc:'salvar_produtividade_semanal',geracao:0,
    campos:'contrato_id,ano,semana,programadas,programadas_executadas,extras_executadas,peso_kg,parafusos,versao,atualizado_em',
    invalidar(){this.geracao++;},
    contexto(){return {geracao:this.geracao,usuario:window.Auth?.sessao?.user?.id||null};},
    conferir(ctx,editar=false){
        if(ctx.geracao!==this.geracao||ctx.usuario!==(window.Auth?.sessao?.user?.id||null)
            ||(editar&&!window.Auth?.pode?.('editarProdutividade'))){
            const erro=new Error('A sessão mudou. Recarregue os dados antes de continuar.');erro.code='sessao_alterada';throw erro;
        }
    },
    async cliente(){
        if(window.Auth?.pronto)await window.Auth.pronto;
        if(!window.Auth?.supabase)throw new Error('Conexão com o servidor indisponível.');
        return window.Auth.supabase;
    },
    validarValores(v){
        for(const campo of ['programadas','programadas_executadas','extras_executadas','parafusos'])
            if(!Number.isInteger(v[campo])||v[campo]<0||v[campo]>1000000)
                throw new Error('Quantidades devem ser inteiras entre 0 e 1.000.000.');
        if(v.programadas_executadas>v.programadas)
            throw new Error('OM’s programadas executadas não podem superar as programadas. Use extras para as demais.');
        if(!Number.isFinite(v.peso_kg)||v.peso_kg<0||v.peso_kg>999999999.999
            ||Math.abs(v.peso_kg*1000-Math.round(v.peso_kg*1000))>0.0001)
            throw new Error('Peso deve ser positivo ou zero, com até três casas decimais.');
        return v;
    },
    validarRegistro(r,ano){
        if(!r||!window.ProdutividadeData.contratos.some(c=>c.id===r.contrato_id)
            ||!Number.isInteger(r.ano)||r.ano!==ano||!window.ProdutividadeData.semanas(ano).includes(r.semana)
            ||!Number.isInteger(r.versao)||r.versao<1||!Number.isFinite(Date.parse(r.atualizado_em)))
            throw new Error('O servidor retornou um lançamento inválido.');
        const normalizado={...r,peso_kg:typeof r.peso_kg==='string'&&r.peso_kg.trim()!==''?Number(r.peso_kg):r.peso_kg};
        this.validarValores(normalizado);return normalizado;
    },
    async carregarAno(ano){
        const cliente=await this.cliente(),ctx=this.contexto(),registros=[],chaves=new Set();
        if(!Number.isInteger(ano)||ano<2000||ano>2100)throw new Error('Informe um ano entre 2000 e 2100.');
        // Paginar até uma página vazia, também com limites menores no servidor.
        for(let pagina=0,offset=0;pagina<267;pagina++){
            this.conferir(ctx);
            const {data,error}=await cliente.from(this.tabela).select(this.campos).eq('ano',ano)
                .order('contrato_id',{ascending:true}).order('semana',{ascending:true}).range(offset,offset+99);
            this.conferir(ctx);if(error)throw error;
            if(!Array.isArray(data))throw new Error('Resposta de consulta inválida.');
            if(!data.length)return registros;
            data.forEach(item=>{
                const r=this.validarRegistro(item,ano),chave=`${r.contrato_id}|${r.semana}`;
                if(chaves.has(chave))throw new Error('Consulta inconsistente. Recarregue os lançamentos.');
                chaves.add(chave);registros.push(r);
            });
            if(registros.length>265)throw new Error('Consulta acima do limite de contratos e semanas.');
            offset+=data.length;
        }
        throw new Error('Não foi possível concluir a consulta.');
    },
    async salvar(contexto,valores){
        const ctx=this.contexto(),cliente=await this.cliente();this.conferir(ctx,true);this.validarValores(valores);
        const {data,error}=await cliente.rpc(this.rpc,{
            p_contrato_id:contexto.contratoId,p_ano:contexto.ano,p_semana:contexto.semana,
            p_programadas:valores.programadas,p_programadas_executadas:valores.programadas_executadas,
            p_extras_executadas:valores.extras_executadas,p_peso_kg:valores.peso_kg,
            p_parafusos:valores.parafusos,p_versao_base:contexto.versao
        });
        this.conferir(ctx,true);if(error)throw error;
        const r=this.validarRegistro(data,contexto.ano);
        if(r.contrato_id!==contexto.contratoId||r.semana!==contexto.semana||r.versao!==contexto.versao+1)
            throw new Error('Confirmação inválida. Recarregue antes de tentar novamente.');
        return r;
    },
    mensagemErro(erro){
        if(['PGRST205','PGRST202','42P01','42883'].includes(erro?.code))
            return 'A estrutura da Produtividade ainda não está disponível no Supabase. Aplique produtividade_semanal.sql.';
        if(erro?.code==='40001')return 'Outra pessoa salvou esta semana. Recarregue e confira os valores antes de salvar novamente.';
        if(erro?.code==='42501')return 'Seu perfil não possui permissão para esta operação.';
        if(erro?.code==='sessao_alterada')return erro.message;
        if(erro?.code==='22023')return 'Os valores enviados não são válidos. Confira o lançamento.';
        return erro instanceof Error?erro.message:'Não foi possível confirmar a operação no servidor. Confira a conexão e recarregue antes de tentar novamente.';
    }
};
