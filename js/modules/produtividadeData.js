/* Configuração e projeção dos lançamentos reais, sem números de demonstração.
   Semana sem registro não equivale a zero. Não importa dados dos reports. */
window.ProdutividadeData = (() => {
    const fisico=(chave,titulo,tipo='inteiro',id=chave)=>Object.freeze({chave,id,titulo,
        unidade:tipo==='decimal'?'kg':'un',tipo,max:tipo==='decimal'?999999999.999:1000000});
    const comuns=Object.freeze([
        {chave:'programadas',titulo:'OM’s programadas'},
        {chave:'programadas_executadas',titulo:'Programadas executadas'},
        {chave:'extras_executadas',titulo:'OM’s extras executadas'}
    ].map(c=>Object.freeze({...c,tipo:'inteiro',max:1000000,obrigatorio:true})));
    const legado=Object.freeze([fisico('peso_kg','Peso executado','decimal','peso'),fisico('parafusos','Parafusos trocados')]);
    const configuracao=Object.freeze(Object.fromEntries([
        ['os440','completo',legado,true],
        ['os441','completo',[fisico('rolos','Rolos'),fisico('telas_trocadas','Telas trocadas'),fisico('chapas','Chapas'),fisico('cavaletes','Cavaletes')]],
        ['os442','somente_executadas',[]],
        ['os450','completo',[fisico('chutes','Chutes'),fisico('peso_kg','Peso executado','decimal','peso'),fisico('cavaletes','Cavaletes'),fisico('rolos','Rolos')]],
        ['os456','completo',legado,true]
    ].map(([id,modo,camposFisicos,fisicosObrigatorios=false])=>[id,Object.freeze({modo,
        camposFisicos:Object.freeze(camposFisicos),fisicosObrigatorios,
        detalharOM:modo==='completo'&&!fisicosObrigatorios})])));
    function camposFormulario(id) {
        const c=configuracao[id];
        if(!c)throw new Error('Contrato inválido.');
        return c.modo==='somente_executadas'
            ? [{chave:'executadas',titulo:'OM’s executadas',tipo:'inteiro',max:2000000,obrigatorio:true}]
            : [...comuns,...c.camposFisicos.map(f=>({...f,obrigatorio:c.fisicosObrigatorios}))];
    }
    const contratos=Object.freeze([
        ['os440','OS 440','Integridade Estrutural'],['os441','OS 441','Manutenção de Desgaste'],
        ['os442','OS 442','Utilidades'],['os450','OS 450','Manutenção de Ativos'],['os456','OS 456','Cobre']
    ].map(([id,nome,descricao])=>Object.freeze({id,nome,descricao})));
    function periodoAtual(data=new Date()) {
        const dia=new Date(Date.UTC(data.getFullYear(),data.getMonth(),data.getDate()));
        dia.setUTCDate(dia.getUTCDate()+4-(dia.getUTCDay()||7));
        const ano=dia.getUTCFullYear();
        return {ano,semana:Math.ceil(((dia-new Date(Date.UTC(ano,0,1)))/86400000+1)/7)};
    }
    function semanas(ano) {
        return Array.from({length:periodoAtual(new Date(ano,11,28)).semana},(_,i)=>i+1);
    }
    function montarContratos(registros) {
        return contratos.map(c=>{
            const config=configuracao[c.id];
            const resultado={...c,...config,semanas:{},indicadores:config.camposFisicos.map(f=>({...f,valores:{}}))};
            registros.filter(r=>r.contrato_id===c.id).forEach(r=>{
                resultado.semanas[r.semana]=config.modo==='somente_executadas'
                    ? {modo:config.modo,executadas:r.executadas}
                    : {programadas:r.programadas,programadasExecutadas:r.programadas_executadas,
                        extrasExecutadas:r.extras_executadas,programadasNaoExecutadas:r.programadas-r.programadas_executadas};
                resultado.indicadores.forEach(i=>{i.valores[r.semana]=r.medicoes?.[i.chave];});
            });
            return resultado;
        });
    }
    return Object.freeze({visualizacaoPublica:true,contratos,configuracao,camposFormulario,periodoAtual,semanas,montarContratos});
})();
