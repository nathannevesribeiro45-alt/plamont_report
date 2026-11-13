-- Aplicação MANUAL como postgres. Não altera relatórios, Produtividade ou Grandes Paradas.
-- Semana é apenas filtro. Nenhum job, expiração ou DELETE físico é criado.
begin;
set local lock_timeout='10s';
do $$ begin
    if current_user<>'postgres' or to_regclass('public.usuarios') is null
        or to_regclass('public.relatorios_turnos') is null then
        raise exception 'Execute como postgres após instalar usuários e relatórios.';
    end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
        and c.relname in ('mps_ativos_v1','mps_janelas_v1','mps_revisoes_v1'))
        or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'mps_%') then
        raise exception 'Programação V1 já instalada ou objetos homônimos. Revise antes de reaplicar.';
    end if;
end $$;
create table public.mps_ativos_v1 (
    contrato text not null check(contrato in ('os440','os441','os442','os450','os456')),
    ativo text not null check(length(ativo) between 1 and 300),
    lat double precision, lng double precision,
    primary key(contrato,ativo),
    check((lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180))
);
-- Apenas referência já presente no JSON fornecido. Nenhuma janela/OM é criada.
insert into public.mps_ativos_v1(contrato,ativo,lat,lng) values
    ('os456','CT-TR-353K-02 (AMOSTRADOR SECUNDÁRIO)',-2.5706422,-44.3673746);

create table public.mps_janelas_v1 (
    id uuid primary key,contrato text not null check(contrato in ('os440','os441','os442','os450','os456')),
    versao integer not null check(versao>0),publicada integer check(publicada>0 and publicada<=versao),
    rascunho jsonb check(jsonb_typeof(rascunho)='object'),
    criado_em timestamptz not null default clock_timestamp(),criado_por uuid not null,
    atualizado_em timestamptz not null default clock_timestamp(),atualizado_por uuid not null,
    excluida_em timestamptz,excluida_por uuid,ultima_operacao uuid not null,
    check(publicada is not null or rascunho is not null),
    check((excluida_em is null)=(excluida_por is null))
);
create table public.mps_revisoes_v1 (
    janela uuid not null references public.mps_janelas_v1(id),versao integer not null,
    acao text not null check(acao in ('salvar','publicar','excluir','restaurar')),dados jsonb not null,
    autor uuid not null,criado_em timestamptz not null default clock_timestamp(),
    primary key(janela,versao)
);
alter table public.mps_janelas_v1 add foreign key(id,publicada) references public.mps_revisoes_v1(janela,versao);
create index mps_janelas_contrato_v1 on public.mps_janelas_v1(contrato,id);
alter table public.mps_ativos_v1 enable row level security;
alter table public.mps_janelas_v1 enable row level security;
alter table public.mps_revisoes_v1 enable row level security;
revoke all on public.mps_ativos_v1,public.mps_janelas_v1,public.mps_revisoes_v1 from public,anon,authenticated,service_role;

create function public.mps_coord_v1(v text,limite numeric) returns double precision
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
    n:=replace(btrim(v),',','.')::numeric;
    if n between -limite and limite then return n::double precision; end if;
    return null;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

-- Reutiliza frentes dos relatórios salvos, expondo só referência do ativo e coordenadas.
-- Nenhuma OM, líder, telefone, equipe ou dado de autoria é retornado.
create function public.mps_catalogo_v1(p_contrato text) returns table(ativo text,lat double precision,lng double precision)
language sql stable security definer set search_path='' as $$
    with fontes as (
      select m.ativo,m.lat,m.lng,null::timestamptz as atualizado
      from public.mps_ativos_v1 m where m.contrato=p_contrato
      union all
      select om->>'frente',
        public.mps_coord_v1(om->>'latitude',90),public.mps_coord_v1(om->>'longitude',180),r.atualizado_em
      from public.relatorios_turnos r
      cross join lateral jsonb_array_elements(case when jsonb_typeof(r.dados->'abas')='array' then r.dados->'abas' else '[]'::jsonb end) aba
      cross join lateral jsonb_array_elements(case when jsonb_typeof(aba->'atividades')='array' then aba->'atividades' else '[]'::jsonb end) lider
      cross join lateral jsonb_array_elements(case when jsonb_typeof(lider->'oms')='array' then lider->'oms' else '[]'::jsonb end) om
      where r.contrato_id=p_contrato and jsonb_typeof(om->'frente')='string'
        and length(om->>'frente') between 1 and 300 and btrim(om->>'frente')<>''
    )
    select distinct on (f.ativo) f.ativo,
      case when f.lat is not null and f.lng is not null then f.lat end,
      case when f.lat is not null and f.lng is not null then f.lng end
    from fontes f order by f.ativo,(f.lat is not null and f.lng is not null) desc,f.atualizado desc nulls last;
$$;

create function public.mps_listar_ativos_v1(p_contrato text,p_depois text) returns jsonb
language sql stable security definer set search_path='' as $$
    select coalesce(jsonb_agg(to_jsonb(x)order by x.ativo collate "C"),'[]'::jsonb) from (
      select ref.* from public.mps_catalogo_v1(p_contrato) ref
      where ref.ativo collate "C">coalesce(p_depois,'')
        and (exists(select 1 from public.usuarios u where u.id=auth.uid() and u.ativo
              and u.perfil in ('planejamento','admin'))
          or exists(select 1 from public.mps_janelas_v1 j join public.mps_revisoes_v1 r
              on (r.janela,r.versao)=(j.id,j.publicada)
              where j.contrato=p_contrato and j.excluida_em is null and r.dados->>'ativo'=ref.ativo))
      order by ref.ativo collate "C" limit 100
    )x;
$$;

create function public.mps_validar_v1(d jsonb,c text) returns void
language plpgsql set search_path='' as $$
declare
    a jsonb;v text;inicio timestamp;fim timestamp;ano int;semana int;
    chave text;data_v date;hora_v time;
begin
    if d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>2097152
       or exists(select 1 from jsonb_object_keys(d)k where k not in
         ('ano','semana','ativo','inicio_data','inicio_hora','fim_data','fim_hora','observacoes','atividades')) then
       raise exception using errcode='22023',message='Documento inválido. Limite técnico de 2 MiB; campos externos não permitidos.';
    end if;
    if jsonb_typeof(d->'ano') is distinct from 'number' or jsonb_typeof(d->'semana') is distinct from 'number'
       or (d->>'ano')::numeric<>trunc((d->>'ano')::numeric) or (d->>'semana')::numeric<>trunc((d->>'semana')::numeric)
       or (d->>'ano')::numeric not between 2000 and 2100 then
        raise exception using errcode='22023',message='Ano ou semana inválidos.';
    end if;
    ano:=(d->>'ano')::int;semana:=(d->>'semana')::int;
    if semana not between 1 and extract(week from make_date(ano,12,28))::int
        or jsonb_typeof(d->'ativo') is distinct from 'string'
        or not exists(select 1 from public.mps_catalogo_v1(c) ref where ref.ativo=d->>'ativo') then
        raise exception using errcode='22023',message='Semana ou ativo não cadastrado neste contrato.';
    end if;
    foreach chave in array array['inicio_data','fim_data','inicio_hora','fim_hora','observacoes'] loop
        if d?chave and jsonb_typeof(d->chave) not in ('null','string') then
            raise exception using errcode='22023',message='Formato inválido: '||chave;
        end if;
        v:=d->>chave;
        if v is null then continue; end if;
        if chave in ('inicio_data','fim_data') then
            if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='Data inválida.'; end if;
            data_v:=v::date;
        elsif chave in ('inicio_hora','fim_hora') then
            if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception using errcode='22023',message='Hora inválida.'; end if;
            hora_v:=v::time;
        end if;
    end loop;
    if d->>'inicio_data' is not null and d->>'inicio_hora' is not null
       then inicio:=(d->>'inicio_data')::date+(d->>'inicio_hora')::time; end if;
    if d->>'fim_data' is not null and d->>'fim_hora' is not null
       then fim:=(d->>'fim_data')::date+(d->>'fim_hora')::time; end if;
    if (inicio is not null and fim is not null and fim<=inicio)
       or (d->>'inicio_data' is not null and d->>'fim_data' is not null and (d->>'fim_data')::date<(d->>'inicio_data')::date) then
        raise exception using errcode='22023',message='Término deve ser posterior ao início.';
    end if;
    if jsonb_typeof(d->'atividades') is distinct from 'array' then
        raise exception using errcode='22023',message='Lista de atividades inválida.';
    end if;
    for a in select value from jsonb_array_elements(d->'atividades') loop
        if jsonb_typeof(a)<>'object' or exists(select 1 from jsonb_object_keys(a)k where k not in ('id','om','descricao','data','hora'))
           or jsonb_typeof(a->'id') is distinct from 'string'
           or jsonb_typeof(a->'om') is distinct from 'string' or nullif(btrim(a->>'om'),'') is null
           or jsonb_typeof(a->'descricao') is distinct from 'string' or nullif(btrim(a->>'descricao'),'') is null
           or jsonb_typeof(a->'data') is distinct from 'string' or a->>'data' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
            raise exception using errcode='22023',message='Preencha OM, descrição e data da atividade.';
        end if;
        perform (a->>'id')::uuid;
        data_v:=(a->>'data')::date;
        if a?'hora' and (jsonb_typeof(a->'hora') not in ('string','null')
            or (a->>'hora' is not null and a->>'hora' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) then
            raise exception using errcode='22023',message='Hora programada inválida.';
        end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(d->'atividades') item group by item->>'id' having count(*)>1) then
        raise exception using errcode='22023',message='Identificador de atividade repetido.';
    end if;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception using errcode='22023',message='Data, horário, número ou identificador inválido.';
end $$;

create function public.mps_listar_v1(p_contrato text,p_ano int,p_semana int,p_depois uuid,p_gestao boolean,p_excluidas boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
    if p_gestao is null or p_excluidas is null or ((p_gestao or p_excluidas) and not exists(
      select 1 from public.usuarios u where u.id=auth.uid() and u.ativo and u.perfil in ('planejamento','admin'))) then
        raise exception using errcode='42501',message='Sem acesso à gestão.';
    end if;
    return coalesce((select jsonb_agg(x.r order by x.id) from (
      select j.id,jsonb_build_object('id',j.id,'contrato',j.contrato,'publicada',j.publicada,
        'publicado_em',p.criado_em,'dados',case when p_gestao then coalesce(j.rascunho,p.dados) else p.dados end)
        || case when p_gestao then jsonb_build_object('versao',j.versao,'tem_rascunho',j.rascunho is not null,
          'excluida_em',j.excluida_em,'ultima_operacao',j.ultima_operacao) else '{}'::jsonb end as r
      from public.mps_janelas_v1 j left join public.mps_revisoes_v1 p on (p.janela,p.versao)=(j.id,j.publicada)
      where j.contrato=p_contrato and (p_depois is null or j.id>p_depois)
        and ((p_excluidas and p_gestao and j.excluida_em is not null)or(not p_excluidas and j.excluida_em is null))
        and ((p.dados->>'ano')::int=p_ano and (p.dados->>'semana')::int=p_semana
          or p_gestao and (j.rascunho->>'ano')::int=p_ano and (j.rascunho->>'semana')::int=p_semana)
      order by j.id limit 30
    )x),'[]'::jsonb);
end $$;

create function public.mps_gravar_v1(p_acao text,p_contrato text,p_id uuid,p_base int,p_dados jsonb,p_operacao uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
    u uuid:=auth.uid();j public.mps_janelas_v1;existe boolean;n int;d jsonb;
begin
    if not exists(select 1 from public.usuarios v where v.id=u and v.ativo and v.perfil in ('planejamento','admin')) then
        raise exception using errcode='42501',message='Somente planejamento e admin ativos podem editar.';
    end if;
    if p_acao is null or p_acao not in ('salvar','publicar','excluir','restaurar') or p_id is null
      or p_base is null or p_base<0 or p_operacao is null or p_contrato is null
      or p_contrato not in ('os440','os441','os442','os450','os456') then
        raise exception using errcode='22023',message='Operação inválida.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
    select * into j from public.mps_janelas_v1 where id=p_id for update;existe:=found;
    if existe and j.contrato<>p_contrato then raise exception using errcode='22023',message='Contrato divergente.'; end if;
    if existe and j.ultima_operacao=p_operacao and j.versao=p_base+1 and j.atualizado_por=u then
        return jsonb_build_object('versao',j.versao,'publicada',j.publicada,'excluida_em',j.excluida_em);
    end if;
    if coalesce(j.versao,0)<>p_base then raise exception using errcode='40001',message='Outra pessoa salvou esta janela. Reabra antes de continuar.'; end if;
    if (p_acao='restaurar' and (not existe or j.excluida_em is null))
       or (p_acao<>'restaurar' and j.excluida_em is not null)
       or (p_acao<>'salvar' and not existe) then
        raise exception using errcode='22023',message='Estado da janela incompatível.';
    end if;
    n:=p_base+1;
    if p_acao='salvar' then
        perform public.mps_validar_v1(p_dados,p_contrato);d:=p_dados;
        -- Mantém a referência realmente selecionada, mesmo que o relatório diário
        -- deixe de listar o ativo no futuro. Não cria ativo ou coordenada fictícia.
        insert into public.mps_ativos_v1(contrato,ativo,lat,lng)
            select p_contrato,ref.ativo,ref.lat,ref.lng from public.mps_catalogo_v1(p_contrato) ref
            where ref.ativo=d->>'ativo' on conflict(contrato,ativo) do nothing;
        if not existe then
            insert into public.mps_janelas_v1(id,contrato,versao,rascunho,criado_por,atualizado_por,ultima_operacao)
            values(p_id,p_contrato,n,d,u,u,p_operacao);
        end if;
    else
        select coalesce(j.rascunho,r.dados) into d from (values(1))x(n)
          left join public.mps_revisoes_v1 r on (r.janela,r.versao)=(p_id,j.publicada);
        if p_acao='publicar' then
            if j.rascunho is null then raise exception using errcode='22023',message='Salve um rascunho antes de publicar.'; end if;
            perform public.mps_validar_v1(d,p_contrato);
        end if;
    end if;
    insert into public.mps_revisoes_v1(janela,versao,acao,dados,autor) values(p_id,n,p_acao,d,u);
    update public.mps_janelas_v1 set versao=n,atualizado_por=u,atualizado_em=clock_timestamp(),ultima_operacao=p_operacao,
        rascunho=case when p_acao='salvar' then d when p_acao='publicar' then null else rascunho end,
        publicada=case when p_acao='publicar' then n else publicada end,
        excluida_em=case when p_acao='excluir' then clock_timestamp() when p_acao='restaurar' then null else excluida_em end,
        excluida_por=case when p_acao='excluir' then u when p_acao='restaurar' then null else excluida_por end
        where id=p_id returning * into j;
    return jsonb_build_object('versao',j.versao,'publicada',j.publicada,'excluida_em',j.excluida_em);
end $$;

create function public.mps_historico_v1(p_id uuid,p_antes int) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
    if not exists(select 1 from public.usuarios u where u.id=auth.uid() and u.ativo and u.perfil in ('planejamento','admin')) then
        raise exception using errcode='42501',message='Sem acesso ao histórico de edição.';
    end if;
    return coalesce((select jsonb_agg(to_jsonb(x) order by x.versao desc) from (
      select versao,acao,dados,autor,criado_em from public.mps_revisoes_v1
      where janela=p_id and (p_antes is null or versao<p_antes) order by versao desc limit 20
    )x),'[]'::jsonb);
end $$;
revoke all on function public.mps_coord_v1(text,numeric),public.mps_catalogo_v1(text),
  public.mps_listar_ativos_v1(text,text),public.mps_validar_v1(jsonb,text),
  public.mps_listar_v1(text,int,int,uuid,boolean,boolean),public.mps_gravar_v1(text,text,uuid,int,jsonb,uuid),
  public.mps_historico_v1(uuid,int) from public,anon,authenticated,service_role;
grant execute on function public.mps_listar_ativos_v1(text,text),
  public.mps_listar_v1(text,int,int,uuid,boolean,boolean) to anon,authenticated;
grant execute on function public.mps_gravar_v1(text,text,uuid,int,jsonb,uuid),
  public.mps_historico_v1(uuid,int) to authenticated;
notify pgrst,'reload schema';
commit;
