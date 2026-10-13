-- Aplicar como postgres no projeto correto. Totais semanais de consulta PUBLICA.
-- Autoria privada. Escrita somente por RPC para editor/planejamento/admin ativos.
-- Não altera relatórios, usuários, histórico, anexos nem suas policies.
begin;
set local lock_timeout='10s';
do $$
begin
    if current_user<>'postgres' then raise exception 'Execute como postgres.'; end if;
    if to_regclass('public.usuarios') is null then raise exception 'Tabela usuarios ausente.'; end if;
    if to_regclass('public.produtividade_semanal') is not null and
        obj_description(to_regclass('public.produtividade_semanal'),'pg_class') is distinct from 'plamont.produtividade_semanal.v1'
        then raise exception 'Tabela homonima desconhecida. Nenhum dado alterado; revise antes de migrar.'; end if;
    if to_regprocedure('public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)') is not null and
        obj_description(to_regprocedure('public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)'),'pg_proc') is distinct from 'plamont.salvar_produtividade_semanal.v1'
        then raise exception 'RPC homonima desconhecida. Revise antes de migrar.'; end if;
end;
$$;
create table if not exists public.produtividade_semanal(
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
    criado_por uuid references auth.users(id) on delete set null,
    atualizado_por uuid references auth.users(id) on delete set null,
    primary key(contrato_id,ano,semana)
);
comment on table public.produtividade_semanal is 'plamont.produtividade_semanal.v1';
create index if not exists produtividade_semanal_ano_idx on public.produtividade_semanal(ano);
alter table public.produtividade_semanal enable row level security;
do $$
begin
    if exists(select 1 from pg_policies where schemaname='public' and tablename='produtividade_semanal'
        and policyname<>'produtividade_publica_select') then raise exception 'Policy externa desconhecida; revise manualmente.'; end if;
end;
$$;
drop policy if exists produtividade_publica_select on public.produtividade_semanal;
create policy produtividade_publica_select on public.produtividade_semanal for select to anon,authenticated using(true);
revoke all on public.produtividade_semanal from public,anon,authenticated;
revoke select(contrato_id,ano,semana,programadas,programadas_executadas,extras_executadas,peso_kg,parafusos,versao,criado_em,atualizado_em,criado_por,atualizado_por)
    on public.produtividade_semanal from public,anon,authenticated;
grant select(contrato_id,ano,semana,programadas,programadas_executadas,extras_executadas,peso_kg,parafusos,versao,atualizado_em)
    on public.produtividade_semanal to anon,authenticated;
create or replace function public.salvar_produtividade_semanal(
    p_contrato_id text,p_ano integer,p_semana integer,p_programadas integer,p_programadas_executadas integer,
    p_extras_executadas integer,p_peso_kg numeric,p_parafusos integer,p_versao_base integer
)returns jsonb language plpgsql security definer set search_path='' as $$
declare
    v_usuario uuid:=auth.uid();v_registro public.produtividade_semanal;v_existe boolean;
begin
    if v_usuario is null or not exists(select 1 from public.usuarios u where u.id=v_usuario and u.ativo
        and u.perfil in ('editor','planejamento','admin')) then
        raise exception using errcode='42501',message='produtividade_sem_permissao';
    end if;
    if p_contrato_id is null or p_contrato_id not in ('os440','os441','os442','os450','os456')
        or p_ano is null or p_ano not between 2000 and 2100
        or p_semana is null or p_semana<1 or p_semana>extract(week from make_date(p_ano,12,28))::integer
        or p_programadas is null or p_programadas not between 0 and 1000000
        or p_programadas_executadas is null or p_programadas_executadas not between 0 and p_programadas
        or p_extras_executadas is null or p_extras_executadas not between 0 and 1000000
        or p_peso_kg is null or p_peso_kg::text in ('NaN','Infinity','-Infinity')
        or p_peso_kg not between 0 and 999999999.999 or p_peso_kg<>round(p_peso_kg,3)
        or p_parafusos is null or p_parafusos not between 0 and 1000000
        or p_versao_base is null or p_versao_base<0 then
        raise exception using errcode='22023',message='produtividade_valores_invalidos';
    end if;
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
            extras_executadas,peso_kg,parafusos,criado_por,atualizado_por)
        values(p_contrato_id,p_ano,p_semana,p_programadas,p_programadas_executadas,p_extras_executadas,
            p_peso_kg,p_parafusos,v_usuario,v_usuario)returning * into v_registro;
    else
        update public.produtividade_semanal set programadas=p_programadas,programadas_executadas=p_programadas_executadas,
            extras_executadas=p_extras_executadas,peso_kg=p_peso_kg,parafusos=p_parafusos,
            versao=versao+1,atualizado_em=clock_timestamp(),atualizado_por=v_usuario
        where contrato_id=p_contrato_id and ano=p_ano and semana=p_semana returning * into v_registro;
    end if;
    return jsonb_build_object('contrato_id',v_registro.contrato_id,'ano',v_registro.ano,'semana',v_registro.semana,
        'programadas',v_registro.programadas,'programadas_executadas',v_registro.programadas_executadas,
        'extras_executadas',v_registro.extras_executadas,'peso_kg',v_registro.peso_kg,'parafusos',v_registro.parafusos,
        'versao',v_registro.versao,'atualizado_em',v_registro.atualizado_em);
end;
$$;
alter function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)owner to postgres;
revoke all on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)from public,anon,authenticated,service_role;
grant execute on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)to authenticated;
comment on function public.salvar_produtividade_semanal(text,integer,integer,integer,integer,integer,numeric,integer,integer)is 'plamont.salvar_produtividade_semanal.v1';
notify pgrst,'reload schema';
commit;
