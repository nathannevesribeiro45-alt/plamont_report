/* Configuração e projeção dos lançamentos reais, sem números de demonstração.
   Semana sem registro não equivale a zero. Não importa dados dos reports. */
window.ProdutividadeData = (() => {
    const fisico=(chave,titulo,unidade='UND',id=chave)=>Object.freeze({chave,id,titulo,unidade,
        tipo:unidade==='UND'?'inteiro':'decimal',min:0,max:unidade==='UND'?1000000:999999999.999,
        precisao:unidade==='UND'?0:3,grafico:true,comparacao:true});
    const grupo=(id,titulo,campos)=>Object.freeze({id,titulo,campos:Object.freeze(campos)});
    const comuns=Object.freeze([
        {chave:'programadas',titulo:'OM’s programadas'},
        {chave:'programadas_executadas',titulo:'Programadas executadas'},
        {chave:'extras_executadas',titulo:'OM’s extras executadas'}
    ].map(c=>Object.freeze({...c,tipo:'inteiro',max:1000000,obrigatorio:true})));
    const estrutural=grupo('estrutura','Peso e parafusos',[
        fisico('peso_kg','Peso executado','kg','peso'),fisico('parafusos','Parafusos trocados')
    ]);
    const desgaste=[
        grupo('rolos','Rolos',[
            fisico('rolos_carga','Rolos de carga'),fisico('rolos_impacto','Rolos de impacto'),
            fisico('rolos_retorno','Rolos de retorno'),fisico('rolos_90_graus','Rolos de 90°'),fisico('rolos_45_graus','Rolos de 45°')
        ]),
        grupo('cavaletes','Cavaletes',[
            fisico('cavaletes_carga','Cavaletes de carga'),fisico('cavaletes_retorno','Cavaletes de retorno'),
            fisico('cavaletes_impacto','Cavaletes de impacto')
        ]),
        grupo('guarda_corpo','Guarda-corpo',[
            fisico('guarda_corpo_barra_chata_ml','Barra chata','ML'),fisico('guarda_corpo_rodape_ml','Rodapé','ML'),
            fisico('guarda_corpo_tubo_corrimao_ml','Tubo/corrimão','ML')
        ]),
        grupo('piso','Piso',[
            fisico('piso_grade_m2','Grade de piso','m²'),fisico('piso_chapa_m2','Chapa de piso','m²'),
            fisico('piso_tela_m2','Tela de piso','m²'),fisico('piso_degraus_und','Degraus')
        ]),
        grupo('chute','Chute',[
            fisico('chute_chapa_und','Chapa de chute'),fisico('chute_guia_mesa_impacto_und','Guia de chute/mesa de impacto')
        ])
    ];
    const componentes=grupo('componentes','Manutenção de componentes',[
        fisico('componentes_cabo_aco_ml','Cabo de aço','ML'),
        ...[
            ['freio','Freio'],['extrator','Extrator'],['talha','Talha'],['bobinador','Bobinador'],
            ['elevadores','Elevadores'],['ventiladores','Ventiladores'],['portico','Pórtico'],
            ['pontes','Pontes'],['paineis','Painéis'],['guincho','Guincho'],['esticamento','Esticamento']
        ].map(([chave,titulo])=>fisico(`componentes_${chave}_und`,titulo))
    ]);
    const preventiva=grupo('preventiva','Manutenção preventiva',[
        fisico('preventiva_eletrica_und','Manutenção Preventiva Elétrica'),
        fisico('preventiva_mecanica_und','Manutenção Preventiva Mecânica')
    ]);
    const agregados=Object.freeze({
        os441:[fisico('rolos','Rolos'),fisico('telas_trocadas','Telas trocadas'),fisico('chapas','Chapas'),fisico('cavaletes','Cavaletes')],
        os450:[fisico('chutes','Chutes'),fisico('cavaletes','Cavaletes'),fisico('rolos','Rolos')]
    });
    const configuracao=Object.freeze(Object.fromEntries([
        ['os440','completo',[estrutural],true],
        ['os441','completo',desgaste],
        ['os442','somente_executadas',[componentes]],
        ['os450','completo',[estrutural,...desgaste,preventiva]],
        ['os456','completo',[estrutural],true]
    ].map(([id,modo,grupos,fisicosObrigatorios=false])=>[id,Object.freeze({modo,
        grupos:Object.freeze(grupos),camposFisicos:Object.freeze(grupos.flatMap(g=>g.campos)),
        historicos:Object.freeze(agregados[id]??[]),fisicosObrigatorios,
        detalharOM:modo==='completo'&&!fisicosObrigatorios})])));
    function camposFormulario(id) {
        const c=configuracao[id];
        if(!c)throw new Error('Contrato inválido.');
        const oms=c.modo==='somente_executadas'
            ? [{chave:'executadas',titulo:'OM’s executadas',tipo:'inteiro',max:2000000,obrigatorio:true}]
            : comuns;
        return [...oms,...c.camposFisicos.map(f=>({...f,obrigatorio:c.fisicosObrigatorios}))];
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
            const resultado={...c,...config,semanas:{},indicadores:config.camposFisicos.map(f=>({...f,valores:{}})),
                indicadoresHistoricos:config.historicos.map(f=>({...f,valores:{}}))};
            registros.filter(r=>r.contrato_id===c.id).forEach(r=>{
                resultado.semanas[r.semana]=config.modo==='somente_executadas'
                    ? {modo:config.modo,executadas:r.executadas}
                    : {programadas:r.programadas,programadasExecutadas:r.programadas_executadas,
                        extrasExecutadas:r.extras_executadas,programadasNaoExecutadas:r.programadas-r.programadas_executadas};
                [...resultado.indicadores,...resultado.indicadoresHistoricos].forEach(i=>{
                    if(Object.hasOwn(r.medicoes,i.chave))i.valores[r.semana]=r.medicoes[i.chave];
                });
            });
            return resultado;
        });
    }
    return Object.freeze({visualizacaoPublica:true,contratos,configuracao,camposFormulario,periodoAtual,semanas,montarContratos});
})();
