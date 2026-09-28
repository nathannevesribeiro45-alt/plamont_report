-- Report Diário Plamont — infraestrutura v1, sem integração do frontend.
-- Executar como postgres no SQL Editor. Reexecutável sobre ESTA versão.
-- Não substitui automaticamente uma tabela homônima de origem desconhecida.
begin;
set local lock_timeout = '10s';

do $$
begin
    if current_user <> 'postgres' then
        raise exception 'Execute a infraestrutura como postgres.';
    end if;
    if to_regclass('public.usuarios') is null then
        raise exception 'Pré-requisito ausente: public.usuarios (usuarios.sql).';
    end if;
    if to_regclass('public.relatorios_turnos') is not null and
       obj_description(to_regclass('public.relatorios_turnos'), 'pg_class') is distinct from 'plamont.relatorios_turnos.v1' then
        raise exception 'Tabela existente não reconhecida. Inspecione e crie uma migração específica; nenhum dado foi alterado.';
    end if;
end;
$$;

create table if not exists public.relatorios_turnos (
    id uuid primary key default gen_random_uuid(),
    contrato_id text not null check (contrato_id <> '' and contrato_id = btrim(contrato_id)),
    data_relatorio date not null check (isfinite(data_relatorio)),
    turno text not null check (turno <> '' and turno = btrim(turno)),
    status text not null default 'aberto' check (status in ('aberto', 'fechado')),
    dados jsonb not null check (jsonb_typeof(dados) = 'object'),
    schema_version integer not null default 1 check (schema_version >= 1),
    versao integer not null default 1 check (versao >= 1),
    criado_por uuid references auth.users(id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_por uuid references auth.users(id) on delete set null,
    atualizado_em timestamptz not null default now(),
    fechado_por uuid references auth.users(id) on delete set null,
    fechado_em timestamptz,
    -- Última versão global em que cada aba foi salva; zero = apenas seed.
    -- Mantido fora de dados: não altera o schema operacional do contrato.
    versoes_abas jsonb not null default '{}'::jsonb check (jsonb_typeof(versoes_abas) = 'object'),
    constraint relatorios_turnos_identidade unique (contrato_id, data_relatorio, turno)
);
comment on table public.relatorios_turnos is 'plamont.relatorios_turnos.v1';
comment on column public.relatorios_turnos.versao is 'Versão operacional global, não histórico. Criação=1; cada salvamento posterior incrementa.';
comment on column public.relatorios_turnos.versoes_abas is 'Mapa aba.id -> última versão global de gravação. Zero representa aba apenas copiada do seed.';

-- O UNIQUE já cobre contrato_id e contrato_id+data_relatorio (prefixos).
create index if not exists relatorios_turnos_data_idx on public.relatorios_turnos (data_relatorio);
create index if not exists relatorios_turnos_status_idx on public.relatorios_turnos (status);

alter table public.relatorios_turnos enable row level security;

-- Uma policy externa permissiva não pode ampliar acesso silenciosamente.
do $$
begin
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relatorios_turnos'
               and policyname not in ('relatorios_turnos_select', 'relatorios_turnos_insert', 'relatorios_turnos_update')) then
        raise exception 'Policies não reconhecidas em relatorios_turnos. Revisão manual necessária.';
    end if;
end;
$$;

drop policy if exists relatorios_turnos_select on public.relatorios_turnos;
create policy relatorios_turnos_select on public.relatorios_turnos for select to authenticated
using (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.ativo
              and u.perfil in ('visualizador', 'editor', 'planejamento', 'admin')));

drop policy if exists relatorios_turnos_insert on public.relatorios_turnos;
create policy relatorios_turnos_insert on public.relatorios_turnos for insert to authenticated
with check (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.ativo
                   and u.perfil in ('editor', 'planejamento', 'admin')));

drop policy if exists relatorios_turnos_update on public.relatorios_turnos;
create policy relatorios_turnos_update on public.relatorios_turnos for update to authenticated
using (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.ativo
              and u.perfil in ('editor', 'planejamento', 'admin')))
with check (exists (select 1 from public.usuarios u where u.id = (select auth.uid()) and u.ativo
                   and u.perfil in ('editor', 'planejamento', 'admin')));

-- RLS filtra a leitura. Escrita de clientes SOMENTE pela RPC abaixo.
-- Evita UPDATE direto do JSON completo, autoria falsa e manipulação de versões.
revoke all on public.relatorios_turnos from public, anon, authenticated;
grant select on public.relatorios_turnos to authenticated;

create or replace function public.salvar_aba_relatorio(
    p_contrato_id text,
    p_data_relatorio date,
    p_turno text,
    p_aba_id text,
    p_dados_aba jsonb,
    p_contrato_base jsonb,
    p_versao_base integer
)
returns public.relatorios_turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_usuario uuid := auth.uid();
    v_registro public.relatorios_turnos;
    v_dados jsonb;
    v_versoes jsonb;
    v_posicao integer;
    v_quantidade integer;
    v_ultima integer;
    v_existe boolean;
begin
    -- SECURITY DEFINER é necessário porque authenticated NÃO tem DML direto.
    -- Não depende de Auth.pode(), JWT user_metadata ou p_usuario_id.
    if v_usuario is null or not exists (
        select 1 from public.usuarios u where u.id = v_usuario and u.ativo
        and u.perfil in ('editor', 'planejamento', 'admin')
    ) then
        raise exception using errcode = '42501', message = 'relatorio_sem_permissao';
    end if;
    if p_contrato_id is null or p_contrato_id = '' or p_contrato_id <> btrim(p_contrato_id)
       or p_data_relatorio is null or not isfinite(p_data_relatorio)
       or p_turno is null or p_turno = '' or p_turno <> btrim(p_turno)
       or p_aba_id is null or btrim(p_aba_id) = ''
       or p_versao_base is null or p_versao_base < 0 then
        raise exception using errcode = '22023', message = 'relatorio_parametros_invalidos';
    end if;
    if jsonb_typeof(p_dados_aba) is distinct from 'object'
       or jsonb_typeof(p_dados_aba->'id') is distinct from 'string'
       or p_dados_aba->>'id' is distinct from p_aba_id then
        raise exception using errcode = '22023', message = 'relatorio_aba_invalida';
    end if;

    -- Serializa também a PRIMEIRA criação (antes de existir linha para lock).
    -- Colisões do hash apenas serializam contratos extras; não misturam dados.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        jsonb_build_array('plamont.relatorios_turnos', p_contrato_id, p_data_relatorio, p_turno)::text, 0));
    select * into v_registro from public.relatorios_turnos r
    where r.contrato_id = p_contrato_id and r.data_relatorio = p_data_relatorio and r.turno = p_turno
    for update;
    v_existe := found;

    if not v_existe then
        if p_versao_base <> 0 then
            raise exception using errcode = '40001', message = 'relatorio_base_inexistente';
        end if;
        if jsonb_typeof(p_contrato_base) is distinct from 'object'
           or p_contrato_base->>'id' is distinct from p_contrato_id
           or p_contrato_base->>'data' is distinct from to_char(p_data_relatorio, 'DD/MM/YYYY')
           or p_contrato_base->>'turno' is distinct from p_turno then
            raise exception using errcode = '22023', message = 'relatorio_contrato_base_invalido';
        end if;
        v_dados := p_contrato_base;
    else
        -- Nunca regravar o seed antigo enviado pelo frontend.
        v_dados := v_registro.dados;
    end if;

    if jsonb_typeof(v_dados->'abas') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'relatorio_abas_invalidas';
    end if;
    if jsonb_array_length(v_dados->'abas') = 0 or exists (
        select 1 from jsonb_array_elements(v_dados->'abas') a
        where jsonb_typeof(a) <> 'object' or jsonb_typeof(a->'id') is distinct from 'string' or btrim(a->>'id') = ''
    ) or exists (
        select 1 from jsonb_array_elements(v_dados->'abas') a group by a->>'id' having count(*) > 1
    ) then
        raise exception using errcode = '22023', message = 'relatorio_abas_invalidas';
    end if;
    select count(*), min(ord - 1)::integer into v_quantidade, v_posicao
    from jsonb_array_elements(v_dados->'abas') with ordinality a(item, ord)
    where item->>'id' = p_aba_id;
    if v_quantidade <> 1 then
        raise exception using errcode = '22023', message = 'relatorio_aba_nao_encontrada';
    end if;

    if v_existe then
        -- Metadado ausente/inválido falha fechado em vez de permitir overwrite.
        if not (v_registro.versoes_abas ? p_aba_id)
           or jsonb_typeof(v_registro.versoes_abas->p_aba_id) is distinct from 'number'
           or (v_registro.versoes_abas->>p_aba_id) !~ '^[0-9]+$' then
            raise exception using errcode = '22023', message = 'relatorio_metadados_invalidos';
        end if;
        v_ultima := (v_registro.versoes_abas->>p_aba_id)::integer;
        if p_versao_base > v_registro.versao or p_versao_base < v_ultima then
            raise exception using errcode = '40001', message = 'relatorio_conflito_aba',
                detail = jsonb_build_object('aba_id', p_aba_id, 'versao_atual', v_registro.versao, 'ultima_versao_aba', v_ultima)::text,
                hint = 'Recarregue o relatório e concilie a aba antes de tentar salvar novamente.';
        end if;
    end if;

    v_dados := jsonb_set(v_dados, array['abas', v_posicao::text], p_dados_aba, false);
    if not v_existe then
        select jsonb_object_agg(a->>'id', 0) into v_versoes from jsonb_array_elements(v_dados->'abas') a;
        v_versoes := jsonb_set(v_versoes, array[p_aba_id], '1'::jsonb);
        insert into public.relatorios_turnos (contrato_id, data_relatorio, turno, dados, versoes_abas, criado_por, atualizado_por)
        values (p_contrato_id, p_data_relatorio, p_turno, v_dados, v_versoes, v_usuario, v_usuario)
        returning * into v_registro;
    else
        update public.relatorios_turnos r set
            dados = v_dados,
            versao = r.versao + 1,
            versoes_abas = jsonb_set(r.versoes_abas, array[p_aba_id], to_jsonb(r.versao + 1)),
            atualizado_por = v_usuario,
            atualizado_em = now()
        where r.id = v_registro.id
        returning * into v_registro;
    end if;
    return v_registro;
end;
$$;

alter function public.salvar_aba_relatorio(text, date, text, text, jsonb, jsonb, integer) owner to postgres;
revoke all on function public.salvar_aba_relatorio(text, date, text, text, jsonb, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.salvar_aba_relatorio(text, date, text, text, jsonb, jsonb, integer) to authenticated;
comment on function public.salvar_aba_relatorio(text, date, text, text, jsonb, jsonb, integer)
is 'Única escrita autorizada de relatórios: valida usuário ativo, faz merge atômico por aba e detecta conflito por versão. Base 0 para seed; demais chamadas usam a versão carregada.';

commit;
