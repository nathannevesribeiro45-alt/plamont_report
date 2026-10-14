-- REVISAR antes de aplicar no SQL Editor do projeto correto, como postgres.
-- Pré-requisito: produtividade_semanal.sql (v1). Não executar v1 após v2.
-- Incremental: nenhuma tabela/linha é removida. Colunas legadas permanecem.
-- OS 440/456: migra peso/parafusos; OS 450: somente peso já existente.
-- OS 441: não inventa medições. OS 442: conserva o total executado antigo.
-- Autoria e versões existentes não são alteradas pelo backfill.
begin;
set local lock_timeout='10s';
do $$ begin
    if current_user<>'postgres' then raise exception 'Execute como postgres.'; end if;
    if to_regclass('public.produtividade_semanal') is null then
        raise exception 'Aplique e revise a migração v1 primeiro.';
    end if;
end $$;
lock table public.produtividade_semanal in access exclusive mode;

-- Espelho temporário sem dados: compara tipos, nulabilidade, defaults e TODAS
-- as constraints. Um comentário v1/v2 sozinho não autoriza migrar outra estrutura.
create temporary table plamont_produtividade_esperada(
    contrato_id text not null check(contrato_id in ('os440','os441','os442','os450','os456')),
    ano integer not null check(ano between 2000 and 2100),
    semana integer not null check(semana between 1 and extract(week from make_date(ano,12,28))::integer),
    programadas integer not null check(programadas between 0 and 1000000),
    programadas_executadas integer not null check(programadas_executadas between 0 and programadas),
    extras_executadas integer not null check(extras_executadas between 0 and 1000000),
    peso_kg numeric(14,3) not null check(peso_kg between 0 and 999999999.999),
    parafusos integer not null check(parafusos between 0 and 1000000),
    versao integer not null default 1 check(versao>=1),
    criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
    criado_por uuid,
    atualizado_por uuid,
    primary key(contrato_id,ano,semana)
)on commit drop;
do $$
declare v_marca text;v_real jsonb;v_esperado jsonb;v_oid oid;
begin
    v_marca:=obj_description('public.produtividade_semanal'::regclass,'pg_class');
    if v_marca not in ('plamont.produtividade_semanal.v1','plamont.produtividade_semanal.v2') or v_marca is null then
        raise exception 'Tabela desconhecida. Nenhum dado alterado.';
    end if;
    if v_marca='plamont.produtividade_semanal.v2' then
        alter table plamont_produtividade_esperada alter programadas drop not null,
            alter programadas_executadas drop not null,alter extras_executadas drop not null,
            alter peso_kg drop not null,alter parafusos drop not null;
        alter table plamont_produtividade_esperada add executadas integer not null check(executadas between 0 and 2000000),
            add medicoes jsonb not null check(jsonb_typeof(medicoes)='object');
    end if;
    select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        pg_get_expr(d.adbin,d.adrelid),a.attgenerated,a.attidentity)order by a.attname)into v_real
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid='public.produtividade_semanal'::regclass and a.attnum>0 and not a.attisdropped;
    select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        pg_get_expr(d.adbin,d.adrelid),a.attgenerated,a.attidentity)order by a.attname)into v_esperado
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid='plamont_produtividade_esperada'::regclass and a.attnum>0 and not a.attisdropped;
    if v_real is distinct from v_esperado then raise exception 'Colunas/defaults desconhecidos. Revise antes de migrar.'; end if;
    select jsonb_agg(jsonb_build_array(contype,pg_get_constraintdef(oid),convalidated)order by contype,pg_get_constraintdef(oid))
        into v_real from pg_constraint where conrelid='public.produtividade_semanal'::regclass;
    select jsonb_agg(jsonb_build_array(tipo,definicao,validado)order by tipo,definicao)into v_esperado from (
        select contype::text as tipo,pg_get_constraintdef(oid)as definicao,convalidated as validado
            from pg_constraint where conrelid='plamont_produtividade_esperada'::regclass
        union all select 'f','FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL',true
        union all select 'f','FOREIGN KEY (atualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL',true
    )esperado;
    if v_real is distinct from v_esperado then raise exception 'Constraints desconhecidas. Revise antes de migrar.'; end if;
    if exists(select 1 from pg_trigger where tgrelid='public.produtividade_semanal'::regclass and not tgisinternal)
        or not exists(select 1 from pg_class where oid='public.produtividade_semanal'::regclass
            and relrowsecurity and relowner='postgres'::regrole)
        then raise exception 'Triggers, proprietário ou RLS inesperados.'; end if;
    if (select count(*)from pg_policies where schemaname='public' and tablename='produtividade_semanal')<>1
        or not exists(select 1 from pg_policies where schemaname='public' and tablename='produtividade_semanal'
            and policyname='produtividade_publica_select' and cmd='SELECT' and permissive='PERMISSIVE'
            and roles @> array['anon','authenticated']::name[] and cardinality(roles)=2 and qual='true' and with_check is null)
        then raise exception 'Policies desconhecidas. Revise antes de migrar.'; end if;
    v_oid:=to_regprocedure('public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)');
    if v_oid is null or obj_description(v_oid,'pg_proc') is distinct from
        (case when v_marca='plamont.produtividade_semanal.v1' then 'plamont.salvar_produtividade_semanal.v1'
            else 'plamont.salvar_produtividade_semanal.legado.v2' end) then raise exception 'RPC legada desconhecida.'; end if;
    if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='salvar_produtividade_semanal' and p.oid<>v_oid
        and not (v_marca='plamont.produtividade_semanal.v2'
            and p.oid=to_regprocedure('public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,integer,jsonb,integer)')
            and obj_description(p.oid,'pg_proc')='plamont.salvar_produtividade_semanal.v2'))
        then raise exception 'Sobrecarga RPC desconhecida.'; end if;
    if v_marca='plamont.produtividade_semanal.v2' and to_regprocedure(
        'public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,integer,jsonb,integer)')is null
        then raise exception 'RPC v2 ausente.'; end if;
end $$;

-- Mantém TODOS os valores das colunas anteriores, inclusive em OS 441/442/450.
-- Esses valores legados não passam a ser indicadores indevidos na interface.
alter table public.produtividade_semanal add column if not exists executadas integer,
    add column if not exists medicoes jsonb;
update public.produtividade_semanal set
    executadas=programadas_executadas+extras_executadas,
    medicoes=case when contrato_id in ('os440','os456')then jsonb_build_object('peso_kg',peso_kg,'parafusos',parafusos)
        when contrato_id='os450' then jsonb_build_object('peso_kg',peso_kg) else '{}'::jsonb end
    where medicoes is null;
alter table public.produtividade_semanal alter column programadas drop not null,
    alter column programadas_executadas drop not null,alter column extras_executadas drop not null,
    alter column peso_kg drop not null,alter column parafusos drop not null,
    alter column executadas set not null,alter column medicoes set not null;
do $$ begin
    if obj_description('public.produtividade_semanal'::regclass,'pg_class')='plamont.produtividade_semanal.v1' then
        alter table public.produtividade_semanal add constraint produtividade_executadas_v2 check(executadas between 0 and 2000000),
            add constraint produtividade_medicoes_v2 check(jsonb_typeof(medicoes)='object');
    end if;
end $$;
comment on table public.produtividade_semanal is 'plamont.produtividade_semanal.v2';

-- Não modifica policies ou grants de outros módulos. Autoria segue privada.
revoke all on public.produtividade_semanal from public,anon,authenticated;
revoke all(contrato_id,ano,semana,programadas,programadas_executadas,extras_executadas,peso_kg,parafusos,
    executadas,medicoes,versao,criado_em,atualizado_em,criado_por,atualizado_por)
    on public.produtividade_semanal from public,anon,authenticated;
grant select(contrato_id,ano,semana,programadas,programadas_executadas,extras_executadas,peso_kg,parafusos,
    executadas,medicoes,versao,atualizado_em)on public.produtividade_semanal to anon,authenticated;

create or replace function public.salvar_produtividade_semanal(
    p_contrato_id text,p_ano integer,p_semana integer,p_programadas integer,p_programadas_executadas integer,
    p_extras_executadas integer,p_executadas integer,p_medicoes jsonb,p_versao_base integer
)returns jsonb language plpgsql security definer set search_path='' as $$
declare
    v_usuario uuid:=auth.uid();v_registro public.produtividade_semanal;v_existe boolean;
    v_chaves text[];v_chave text;v_valor jsonb;v_numero numeric;v_executadas integer;
begin
    if v_usuario is null or not exists(select 1 from public.usuarios u where u.id=v_usuario and u.ativo
        and u.perfil in ('editor','planejamento','admin'))then
        raise exception using errcode='42501',message='produtividade_sem_permissao';
    end if;
    if p_contrato_id is null or p_contrato_id not in ('os440','os441','os442','os450','os456')
        or p_ano is null or p_ano not between 2000 and 2100
        or p_semana is null or p_semana<1 or p_semana>extract(week from make_date(p_ano,12,28))::integer
        or p_versao_base is null or p_versao_base<0
        or p_medicoes is null or jsonb_typeof(p_medicoes)<>'object' then
        raise exception using errcode='22023',message='produtividade_valores_invalidos';
    end if;
    if p_contrato_id='os442'then
        if p_programadas is not null or p_programadas_executadas is not null or p_extras_executadas is not null
            or p_executadas is null or p_executadas not between 0 and 2000000 or p_medicoes<>'{}'::jsonb then
            raise exception using errcode='22023',message='produtividade_os442_somente_executadas';
        end if;
        v_executadas:=p_executadas;
    else
        if p_programadas is null or p_programadas not between 0 and 1000000
            or p_programadas_executadas is null or p_programadas_executadas not between 0 and p_programadas
            or p_extras_executadas is null or p_extras_executadas not between 0 and 1000000
            or p_executadas is not null then
            raise exception using errcode='22023',message='produtividade_programacao_invalida';
        end if;
        v_executadas:=p_programadas_executadas+p_extras_executadas;
    end if;
    v_chaves:=case p_contrato_id when 'os440'then array['peso_kg','parafusos']
        when 'os441'then array['rolos','telas_trocadas','chapas','cavaletes']
        when 'os442'then array[]::text[] when 'os450'then array['chutes','peso_kg','cavaletes','rolos']
        when 'os456'then array['peso_kg','parafusos']end;
    if p_contrato_id in ('os440','os456')and not p_medicoes ?& v_chaves then
        raise exception using errcode='22023',message='produtividade_medicoes_obrigatorias';
    end if;
    for v_chave,v_valor in select key,value from jsonb_each(p_medicoes)loop
        if not v_chave=any(v_chaves)or jsonb_typeof(v_valor)<>'number' then
            raise exception using errcode='22023',message='produtividade_medicao_nao_permitida';
        end if;
        v_numero:=v_valor::text::numeric;
        if v_numero<0 or (v_chave='peso_kg'and (v_numero>999999999.999 or v_numero<>round(v_numero,3)))
            or(v_chave<>'peso_kg'and (v_numero>1000000 or v_numero<>trunc(v_numero)))then
            raise exception using errcode='22023',message='produtividade_medicao_invalida';
        end if;
    end loop;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        jsonb_build_array('plamont.produtividade',p_contrato_id,p_ano,p_semana)::text,0));
    select * into v_registro from public.produtividade_semanal
        where contrato_id=p_contrato_id and ano=p_ano and semana=p_semana for update;
    v_existe:=found;
    if(v_existe and v_registro.versao<>p_versao_base)or(not v_existe and p_versao_base<>0)then
        raise exception using errcode='40001',message='produtividade_conflito',hint='Recarregue e confira antes de salvar.';
    end if;
    if not v_existe then
        insert into public.produtividade_semanal(contrato_id,ano,semana,programadas,programadas_executadas,
            extras_executadas,peso_kg,parafusos,executadas,medicoes,criado_por,atualizado_por)
        values(p_contrato_id,p_ano,p_semana,p_programadas,p_programadas_executadas,p_extras_executadas,
            (p_medicoes->>'peso_kg')::numeric,(p_medicoes->>'parafusos')::numeric::integer,
            v_executadas,p_medicoes,v_usuario,v_usuario)returning * into v_registro;
    else
        update public.produtividade_semanal set programadas=p_programadas,programadas_executadas=p_programadas_executadas,
            extras_executadas=p_extras_executadas,peso_kg=(p_medicoes->>'peso_kg')::numeric,
            parafusos=(p_medicoes->>'parafusos')::numeric::integer,executadas=v_executadas,medicoes=p_medicoes,
            versao=versao+1,atualizado_em=clock_timestamp(),atualizado_por=v_usuario
        where contrato_id=p_contrato_id and ano=p_ano and semana=p_semana returning * into v_registro;
    end if;
    return jsonb_build_object('contrato_id',v_registro.contrato_id,'ano',v_registro.ano,'semana',v_registro.semana,
        'programadas',v_registro.programadas,'programadas_executadas',v_registro.programadas_executadas,
        'extras_executadas',v_registro.extras_executadas,'peso_kg',v_registro.peso_kg,'parafusos',v_registro.parafusos,
        'executadas',v_registro.executadas,'medicoes',v_registro.medicoes,'versao',v_registro.versao,
        'atualizado_em',v_registro.atualizado_em);
end $$;
alter function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,integer,jsonb,integer)owner to postgres;
revoke all on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,integer,jsonb,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,integer,jsonb,integer)to authenticated;
comment on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,integer,jsonb,integer)
    is 'plamont.salvar_produtividade_semanal.v2';

-- Cliente antigo OS 440/456 continua salvando com a MESMA validação/vínculo de versão.
-- Cliente antigo OS 441/442/450 deve atualizar: não pode apagar as novas medições.
create or replace function public.salvar_produtividade_semanal(
    p_contrato_id text,p_ano integer,p_semana integer,p_programadas integer,p_programadas_executadas integer,
    p_extras_executadas integer,p_peso_kg numeric,p_parafusos integer,p_versao_base integer
)returns jsonb language plpgsql security definer set search_path='' as $$
begin
    if auth.uid()is null or not exists(select 1 from public.usuarios u where u.id=auth.uid()and u.ativo
        and u.perfil in ('editor','planejamento','admin'))then
        raise exception using errcode='42501',message='produtividade_sem_permissao';
    end if;
    if p_contrato_id is null or p_contrato_id not in ('os440','os456')then
        raise exception using errcode='22023',message='Atualize o site para editar este contrato.';
    end if;
    return public.salvar_produtividade_semanal(p_contrato_id,p_ano,p_semana,p_programadas,p_programadas_executadas,
        p_extras_executadas,null::integer,jsonb_build_object('peso_kg',p_peso_kg,'parafusos',p_parafusos),p_versao_base);
end $$;
alter function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)owner to postgres;
revoke all on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)to authenticated;
comment on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)
    is 'plamont.salvar_produtividade_semanal.legado.v2';
notify pgrst,'reload schema';
commit;
