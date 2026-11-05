-- Editor de Grandes Paradas. Executar manualmente como postgres, após usuarios.sql.
-- Não importa JSONs, não altera tabelas existentes e não muda a Produtividade.
begin;
set local lock_timeout='10s';
do $$ begin
    if current_user <> 'postgres' or to_regclass('public.usuarios') is null then
        raise exception 'Execute como postgres após instalar public.usuarios.';
    end if;
    if to_regclass('public.gp_paradas_v1') is not null or to_regclass('public.gp_publicacoes_v1') is not null
       or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname in
                 ('gp_instante_v1','gp_validar_v1','gp_listar_v1','gp_historico_v1','gp_gravar_v1')) then
        raise exception 'Editor V1 já instalado ou objetos homônimos encontrados. Não reaplique sem revisar.';
    end if;
end $$;

create table public.gp_paradas_v1 (
    contrato text not null check (contrato in ('os440','os441','os442','os450','os456')),
    id text not null check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$'),
    versao integer not null check (versao>0),
    publicada integer check (publicada>0 and publicada<=versao),
    rascunho jsonb check (jsonb_typeof(rascunho)='object'),
    criado_por uuid not null,
    criado_em timestamptz not null default clock_timestamp(),
    atualizado_por uuid not null,
    atualizado_em timestamptz not null default clock_timestamp(),
    arquivado_em timestamptz,
    arquivado_por uuid,
    ultima_operacao uuid not null,
    origem_legada boolean not null default false,
    primary key (contrato,id),
    check (publicada is not null or rascunho is not null),
    check ((arquivado_em is null)=(arquivado_por is null))
);
create table public.gp_publicacoes_v1 (
    contrato text not null, id text not null, versao integer not null check(versao>0),
    dados jsonb not null check(jsonb_typeof(dados)='object'),
    publicado_por uuid not null, publicado_em timestamptz not null default clock_timestamp(),
    primary key (contrato,id,versao),
    foreign key (contrato,id) references public.gp_paradas_v1(contrato,id)
);
alter table public.gp_paradas_v1 add foreign key(contrato,id,publicada)
    references public.gp_publicacoes_v1(contrato,id,versao);
alter table public.gp_paradas_v1 enable row level security;
alter table public.gp_publicacoes_v1 enable row level security;
-- Sem políticas de acesso direto: apenas RPCs projetam dados.
revoke all on public.gp_paradas_v1,public.gp_publicacoes_v1 from public,anon,authenticated,service_role;

-- Horário civil da operação. Horas ausentes não são gravadas nem inferidas.
create function public.gp_instante_v1(d text,h text) returns timestamp
language plpgsql immutable set search_path='' as $$
declare t date;
begin
    if d is null or d !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
        or (h is not null and h !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
        raise exception using errcode='22023',message='Data ou hora inválida.';
    end if;
    t:=pg_catalog.make_date(substring(d,7,4)::int,substring(d,4,2)::int,substring(d,1,2)::int);
    return t+coalesce(h::time,time '00:00');
exception when datetime_field_overflow then
    raise exception using errcode='22023',message='Data inválida.';
end $$;

create function public.gp_validar_v1(d jsonb,c text,i text,publicar boolean,legado boolean)
returns void language plpgsql set search_path='' as $$
declare
    r jsonb; k text; v jsonb; t jsonb; p jsonb; s jsonb; a timestamp; b timestamp;
    par text[]; estado text;
begin
    if d is null or jsonb_typeof(d)<>'object' or d->>'id' is distinct from i
        or d->>'contrato' is distinct from c or pg_column_size(d)>2097152 then
        raise exception using errcode='22023',message='Identidade ou tamanho do documento inválido (máximo 2 MiB).';
    end if;
    foreach k in array array['id','contrato','nome','tipo','equipamento','estadoOperacional','dataStatus','observacoes'] loop
        if d?k and jsonb_typeof(d->k) not in ('string','null') then
            raise exception using errcode='22023',message='Campo textual inválido: '||k;
        end if;
    end loop;
    estado:=d->>'estadoOperacional';
    if (estado is not null and estado not in ('planejada','em_andamento','suspensa','concluida'))
       or (publicar and not legado and estado is null) then
        raise exception using errcode='22023',message='Informe o estado operacional.';
    end if;
    if publicar and (nullif(btrim(d->>'nome'),'') is null or
        (not legado and (nullif(btrim(d->>'equipamento'),'') is null or nullif(btrim(d->>'tipo'),'') is null))) then
        raise exception using errcode='22023',message='Preencha nome, equipamento e tipo antes de publicar.';
    end if;
    foreach k in array array['periodo','status','turno','atividades'] loop
        if d?k and jsonb_typeof(d->k) not in ('object','null') then
            raise exception using errcode='22023',message='Objeto inválido: '||k;
        end if;
    end loop;
    p:=d->'periodo'; s:=d->'status';
    foreach par slice 1 in array array[['inicio','inicioHora'],['previstoFim','previstoFimHora'],
        ['realizadoFim','realizadoFimHora'],['fim','fimHora']] loop
        if p->>par[1] is not null then
            perform public.gp_instante_v1(p->>par[1],p->>par[2]);
        elsif p->>par[2] is not null then
            raise exception using errcode='22023',message='Informe também a data de '||par[1];
        end if;
    end loop;
    if p->>'inicio' is not null then a:=public.gp_instante_v1(p->>'inicio',p->>'inicioHora'); end if;
    if coalesce(p->>'previstoFim',p->>'fim') is not null then
        b:=public.gp_instante_v1(coalesce(p->>'previstoFim',p->>'fim'),
           case when p->>'previstoFim' is not null then p->>'previstoFimHora' else p->>'fimHora' end);
    end if;
    if (publicar and not legado and (a is null or b is null or p->>'inicioHora' is null or
          p->>'previstoFim' is null or p->>'previstoFimHora' is null))
        or b<a or (p->>'realizadoFim' is not null and
            public.gp_instante_v1(p->>'realizadoFim',p->>'realizadoFimHora')<a) then
        raise exception using errcode='22023',message='Confira as datas e horas do período da parada.';
    end if;
    if estado='concluida' and publicar and (p->>'realizadoFim' is null or p->>'realizadoFimHora' is null) then
        raise exception using errcode='22023',message='Conclusão exige término real informado.';
    end if;
    if d->>'dataStatus' is not null then perform public.gp_instante_v1(d->>'dataStatus',null); end if;
    if s->>'data' is not null then
        perform public.gp_instante_v1(s->>'data',s->>'hora');
        if d->>'dataStatus' is not null and d->>'dataStatus'<>s->>'data' then
            raise exception using errcode='22023',message='Datas de status divergentes.';
        end if;
    elsif s->>'hora' is not null and d->>'dataStatus' is null then
        raise exception using errcode='22023',message='Hora do status exige data.';
    elsif s->>'hora' is not null then perform public.gp_instante_v1(d->>'dataStatus',s->>'hora');
    end if;
    foreach k in array array['pontos','marcos'] loop
        v:=d->k;
        if v is null or v='null'::jsonb then continue; end if;
        if jsonb_typeof(v)<>'array' then raise exception using errcode='22023',message='Lista inválida: '||k; end if;
        for r in select value from jsonb_array_elements(v) loop
            if jsonb_typeof(r)<>'object' then raise exception using errcode='22023',message='Item inválido: '||k; end if;
            perform public.gp_instante_v1(r->>'data',r->>'hora');
            if exists(select 1 from jsonb_each(r) e where
                (e.key in ('previsto','realizado') and case jsonb_typeof(e.value)
                    when 'number' then (e.value::text::numeric not between 0 and 100)
                    when 'null' then false else true end)
                or (e.key in ('previstoUnitario','realizadoUnitario') and jsonb_typeof(e.value) not in ('number','null'))
                or (e.key='descricao' and jsonb_typeof(e.value) not in ('string','null'))) then
                raise exception using errcode='22023',message='Medição ou descrição inválida: '||k;
            end if;
        end loop;
        if k='pontos' and exists(select 1 from jsonb_array_elements(v) e
            group by e->>'data',e->>'hora' having count(*)>1) then
            raise exception using errcode='22023',message='Dois pontos têm a mesma data e hora.';
        end if;
    end loop;
    foreach par slice 1 in array array[['realizado','realizadas'],['proximo','proximas']] loop
        t:=d->'turno'->par[1]; v:=d->'atividades'->par[2];
        if t is not null and t<>'null'::jsonb then
            if jsonb_typeof(t)<>'object' or exists(select 1 from jsonb_each(t) e where
                (e.key in ('dataInicio','dataFim','inicio','fim') and jsonb_typeof(e.value) not in ('string','null')))
                then raise exception using errcode='22023',message='Período de atividades inválido.'; end if;
            if (t->>'inicio' is not null and t->>'inicio' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
               or (t->>'fim' is not null and t->>'fim' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
                raise exception using errcode='22023',message='Hora das atividades inválida.';
            end if;
            if t->>'dataInicio' is not null then perform public.gp_instante_v1(t->>'dataInicio',t->>'inicio'); end if;
            if t->>'dataFim' is not null then perform public.gp_instante_v1(t->>'dataFim',t->>'fim'); end if;
            if t->>'dataInicio' is not null and t->>'dataFim' is not null
               and public.gp_instante_v1(t->>'dataFim',t->>'fim') < public.gp_instante_v1(t->>'dataInicio',t->>'inicio') then
                raise exception using errcode='22023',message='Término das atividades anterior ao início.';
            end if;
        end if;
        if v is null or v='null'::jsonb then continue; end if;
        if jsonb_typeof(v)<>'array' then raise exception using errcode='22023',message='Lista de atividades inválida.'; end if;
        for r in select value from jsonb_array_elements(v) loop
            if jsonb_typeof(r)<>'object' then raise exception using errcode='22023',message='Atividade inválida.'; end if;
            if exists(select 1 from jsonb_each(r) e where e.key in ('om','area','descricao','status')
                and jsonb_typeof(e.value) not in ('string','null')) then
                raise exception using errcode='22023',message='Campos da atividade devem ser textuais.';
            end if;
        end loop;
    end loop;
end $$;

create function public.gp_listar_v1(p_contrato text,p_depois text,p_gestao boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
    if p_gestao is null or (p_gestao and not exists(select 1 from public.usuarios u
        where u.id=auth.uid() and u.ativo and u.perfil in ('planejamento','admin'))) then
        raise exception using errcode='42501',message='Sem acesso à gestão.';
    end if;
    return coalesce((select jsonb_agg(x.item order by x.id collate "C") from (
        select g.id,jsonb_build_object('id',g.id,'contrato',g.contrato,'publicada',g.publicada,
            'publicado_em',p.publicado_em,'arquivado_em',g.arquivado_em,
            'dados',case when p_gestao then coalesce(g.rascunho,p.dados) else p.dados end)
            || case when p_gestao then jsonb_build_object('versao',g.versao,'tem_rascunho',g.rascunho is not null,
               'ultima_operacao',g.ultima_operacao) else '{}'::jsonb end as item
        from public.gp_paradas_v1 g left join public.gp_publicacoes_v1 p
          on (p.contrato,p.id,p.versao)=(g.contrato,g.id,g.publicada)
        where g.contrato=p_contrato and g.id collate "C">coalesce(p_depois,'')
          and (p_gestao or p.versao is not null)
        order by g.id collate "C" limit 20
    )x),'[]'::jsonb);
end $$;

create function public.gp_historico_v1(p_contrato text,p_id text,p_antes integer,p_autoria boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
    if p_autoria is null or (p_autoria and not exists(select 1 from public.usuarios u
        where u.id=auth.uid() and u.ativo and u.perfil in ('planejamento','admin'))) then
        raise exception using errcode='42501',message='Sem acesso à autoria.';
    end if;
    return coalesce((select jsonb_agg(x.item order by x.versao desc) from (
        select p.versao,jsonb_build_object('versao',p.versao,'publicado_em',p.publicado_em,'dados',p.dados)
            || case when p_autoria then jsonb_build_object('publicado_por',p.publicado_por,'autor',u.nome)
               else '{}'::jsonb end as item
        from public.gp_publicacoes_v1 p left join public.usuarios u on p_autoria and u.id=p.publicado_por
        where p.contrato=p_contrato and p.id=p_id and (p_antes is null or p.versao<p_antes)
        order by p.versao desc limit 10
    )x),'[]'::jsonb);
end $$;

create function public.gp_gravar_v1(p_acao text,p_contrato text,p_id text,p_base integer,
    p_dados jsonb,p_operacao uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
    u uuid:=auth.uid(); perfil text; g public.gp_paradas_v1; nova integer; existe boolean;
begin
    select v.perfil into perfil from public.usuarios v where v.id=u and v.ativo;
    if perfil is null or perfil not in ('planejamento','admin') or (p_acao='importar' and perfil<>'admin') then
        raise exception using errcode='42501',message='Sem permissão para esta operação.';
    end if;
    if p_acao is null or p_acao not in ('rascunho','publicar','arquivar','importar')
        or p_contrato is null or p_contrato not in ('os440','os441','os442','os450','os456')
        or p_id is null or p_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$'
        or p_base is null or p_base<0 or p_operacao is null then
        raise exception using errcode='22023',message='Operação, identidade ou versão inválida.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('plamont.gp.v1',p_contrato,p_id)::text,0));
    select * into g from public.gp_paradas_v1 where contrato=p_contrato and id=p_id for update;
    existe:=found;
    if existe and g.ultima_operacao=p_operacao and g.atualizado_por=u and g.versao=p_base+1 then
        return jsonb_build_object('versao',g.versao,'publicada',g.publicada,'arquivado_em',g.arquivado_em);
    end if;
    if p_acao='importar' and existe then
        if g.origem_legada and exists(select 1 from public.gp_publicacoes_v1 p
            where (p.contrato,p.id,p.versao)=(p_contrato,p_id,1) and p.dados=p_dados) then
            return jsonb_build_object('versao',g.versao,'publicada',g.publicada,'ja_importada',true);
        end if;
        raise exception using errcode='40001',message='Já existe uma parada com esse identificador.';
    end if;
    if coalesce(g.versao,0)<>p_base then
        raise exception using errcode='40001',message='Versão alterada por outro usuário.';
    end if;
    if g.arquivado_em is not null then raise exception using errcode='22023',message='Parada arquivada.'; end if;
    nova:=p_base+1;
    if p_acao in ('rascunho','importar') then
        perform public.gp_validar_v1(p_dados,p_contrato,p_id,p_acao='importar',p_acao='importar');
        if not existe then
            insert into public.gp_paradas_v1(contrato,id,versao,rascunho,criado_por,atualizado_por,ultima_operacao,origem_legada)
            values(p_contrato,p_id,nova,p_dados,u,u,p_operacao,p_acao='importar');
        else
            update public.gp_paradas_v1 set rascunho=p_dados,versao=nova,atualizado_por=u,
                atualizado_em=clock_timestamp(),ultima_operacao=p_operacao where contrato=p_contrato and id=p_id;
        end if;
    elsif not existe then
        raise exception using errcode='22023',message='Salve a parada antes de continuar.';
    end if;
    if p_acao in ('publicar','importar') then
        if p_acao='publicar' then
            if g.rascunho is null then raise exception using errcode='22023',message='Não há rascunho para publicar.'; end if;
            perform public.gp_validar_v1(g.rascunho,p_contrato,p_id,true,false);
        end if;
        insert into public.gp_publicacoes_v1(contrato,id,versao,dados,publicado_por)
        values(p_contrato,p_id,nova,case when p_acao='importar' then p_dados else g.rascunho end,u);
        update public.gp_paradas_v1 set publicada=nova,versao=nova,rascunho=null,atualizado_por=u,
            atualizado_em=clock_timestamp(),ultima_operacao=p_operacao where contrato=p_contrato and id=p_id;
    elsif p_acao='arquivar' then
        update public.gp_paradas_v1 set versao=nova,arquivado_em=clock_timestamp(),arquivado_por=u,
            atualizado_por=u,atualizado_em=clock_timestamp(),ultima_operacao=p_operacao
            where contrato=p_contrato and id=p_id;
    end if;
    select * into g from public.gp_paradas_v1 where contrato=p_contrato and id=p_id;
    return jsonb_build_object('versao',g.versao,'publicada',g.publicada,'arquivado_em',g.arquivado_em);
end $$;

revoke all on function public.gp_instante_v1(text,text),public.gp_validar_v1(jsonb,text,text,boolean,boolean),
    public.gp_listar_v1(text,text,boolean),public.gp_historico_v1(text,text,integer,boolean),
    public.gp_gravar_v1(text,text,text,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.gp_listar_v1(text,text,boolean),
    public.gp_historico_v1(text,text,integer,boolean) to anon,authenticated;
grant execute on function public.gp_gravar_v1(text,text,text,integer,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
