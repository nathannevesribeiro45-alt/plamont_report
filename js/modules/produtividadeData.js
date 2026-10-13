/* Configuração e projeção dos lançamentos reais, sem números de demonstração.
   Semana sem registro não equivale a zero. Não importa dados dos reports. */
window.ProdutividadeData = (() => {
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
            const resultado={...c,semanas:{},indicadores:[
                {id:'peso',titulo:'Peso executado',unidade:'kg',valores:{}},
                {id:'parafusos',titulo:'Parafusos trocados',unidade:'un',valores:{}}
            ]};
            registros.filter(r=>r.contrato_id===c.id).forEach(r=>{
                resultado.semanas[r.semana]={programadas:r.programadas,programadasExecutadas:r.programadas_executadas,
                    extrasExecutadas:r.extras_executadas,programadasNaoExecutadas:r.programadas-r.programadas_executadas};
                resultado.indicadores[0].valores[r.semana]=r.peso_kg;
                resultado.indicadores[1].valores[r.semana]=r.parafusos;
            });
            return resultado;
        });
    }
    return Object.freeze({visualizacaoPublica:true,contratos,periodoAtual,semanas,montarContratos});
})();
