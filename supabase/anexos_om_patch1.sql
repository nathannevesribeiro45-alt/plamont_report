-- PATCH 1: infraestrutura isolada dos PDFs. Executar como postgres somente
-- após revisão/aprovação. Não altera RPC, relatórios, usuários ou fotos.
-- A leitura pública respeita o RLS de relatorios_turnos. Somente uploads
-- próprios e sem referência podem ser limpos nesta etapa; PATCH 7 tratará
-- exclusão funcional, outras autorias e concorrência com novos vínculos.
begin;
set local lock_timeout = '10s';

do $$
begin
    if current_user <> 'postgres' then raise exception 'Execute como postgres.'; end if;
    if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null
       or to_regclass('public.usuarios') is null or to_regclass('public.relatorios_turnos') is null then
        raise exception 'Pré-requisitos ausentes; nenhuma alteração aplicada.';
    end if;
    if exists (select 1 from pg_namespace where nspname = 'plamont_anexos'
               and obj_description(oid, 'pg_namespace') is distinct from 'plamont.anexos_om.patch1') then
        raise exception 'Schema existente não reconhecido. Revisão manual necessária.';
    end if;
    if not exists (select 1 from pg_namespace where nspname = 'plamont_anexos')
       and exists (select 1 from storage.buckets where id = 'report_anexos_om') then
        raise exception 'Bucket homônimo já existe sem a identificação deste patch. Não será modificado.';
    end if;
    if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass)
       or not (select relrowsecurity from pg_class where oid = 'public.relatorios_turnos'::regclass) then
        raise exception 'RLS precisa estar habilitado; revisão manual necessária.';
    end if;
    if not has_table_privilege('anon', 'public.relatorios_turnos', 'SELECT') then
        raise exception 'A leitura pública do relatório não está configurada.';
    end if;
end;
$$;

create schema if not exists plamont_anexos authorization postgres;
comment on schema plamont_anexos is 'plamont.anexos_om.patch1';
revoke all on schema plamont_anexos from public;
grant usage on schema plamont_anexos to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report_anexos_om', 'report_anexos_om', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

do $$
begin
    if not exists (select 1 from storage.buckets where id = 'report_anexos_om'
                   and name = 'report_anexos_om' and public = false
                   and file_size_limit = 20971520 and allowed_mime_types = array['application/pdf']::text[]) then
        raise exception 'Configuração divergente do bucket. O patch não a sobrescreve.';
    end if;
end;
$$;

create or replace function plamont_anexos.caminho_valido(caminho text)
returns boolean language sql immutable security invoker set search_path = ''
as $$
    select coalesce(length(caminho) <= 1024 and caminho ~
    '^anexos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{2}){1,128}/[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])/([0-9a-f]{2}){1,128}/([0-9a-f]{2}){1,255}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$', false);
$$;

create or replace function plamont_anexos.pode_editar()
returns boolean language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.usuarios u where u.id = (select auth.uid())
                   and u.ativo and u.perfil in ('editor','planejamento','admin'));
$$;

-- SECURITY INVOKER: se o relatório deixar de ser público no futuro, esta
-- consulta respeitará a visibilidade da linha para o visitante/usuário.
create or replace function plamont_anexos.referencia_visivel(caminho text)
returns boolean language sql stable security invoker set search_path = ''
as $$
    select exists (select 1 from public.relatorios_turnos r
        where jsonb_path_exists(r.dados,
            '$.abas[*].atividades[*].oms[*].anexos[*] ? (@.storagePath == $caminho)',
            jsonb_build_object('caminho', caminho)));
$$;

create or replace function plamont_anexos.pode_ler(caminho text, autor text)
returns boolean language sql stable security invoker set search_path = ''
as $$
    select plamont_anexos.caminho_valido(caminho) and (
        plamont_anexos.referencia_visivel(caminho)
        or (plamont_anexos.pode_editar() and autor = (select auth.uid())::text
            and split_part(caminho, '/', 2) = (select auth.uid())::text));
$$;

create or replace function plamont_anexos.pode_enviar(caminho text, autor text)
returns boolean language sql stable security invoker set search_path = ''
as $$
    select plamont_anexos.caminho_valido(caminho) and plamont_anexos.pode_editar()
        and autor = (select auth.uid())::text and split_part(caminho, '/', 2) = (select auth.uid())::text;
$$;

-- SECURITY DEFINER somente para impedir limpeza caso QUALQUER relatório
-- referencie o arquivo, inclusive uma linha não visível ao solicitante.
-- Esta primitiva não substitui reconciliação após RPC com resultado incerto.
create or replace function plamont_anexos.pode_limpar_upload(caminho text, autor text)
returns boolean language sql stable security definer set search_path = ''
as $$
    select case when plamont_anexos.pode_enviar(caminho, autor) then
        not exists (select 1 from public.relatorios_turnos r
            where jsonb_path_exists(r.dados,
                '$.abas[*].atividades[*].oms[*].anexos[*] ? (@.storagePath == $caminho)',
                jsonb_build_object('caminho', caminho)))
        else false end;
$$;

alter function plamont_anexos.caminho_valido(text) owner to postgres;
alter function plamont_anexos.pode_editar() owner to postgres;
alter function plamont_anexos.referencia_visivel(text) owner to postgres;
alter function plamont_anexos.pode_ler(text, text) owner to postgres;
alter function plamont_anexos.pode_enviar(text, text) owner to postgres;
alter function plamont_anexos.pode_limpar_upload(text, text) owner to postgres;
revoke all on all functions in schema plamont_anexos from public, anon, authenticated;
grant execute on function plamont_anexos.caminho_valido(text), plamont_anexos.pode_editar(),
    plamont_anexos.referencia_visivel(text), plamont_anexos.pode_ler(text,text),
    plamont_anexos.pode_enviar(text,text), plamont_anexos.pode_limpar_upload(text,text)
    to anon, authenticated;

-- Policies permissivas concedem SOMENTE os acessos do bucket novo.
drop policy if exists plamont_anexos_select on storage.objects;
create policy plamont_anexos_select on storage.objects for select to anon, authenticated
using (bucket_id = 'report_anexos_om' and plamont_anexos.pode_ler(name, owner_id));

drop policy if exists plamont_anexos_insert on storage.objects;
create policy plamont_anexos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'report_anexos_om' and plamont_anexos.pode_enviar(name, owner_id));

drop policy if exists plamont_anexos_delete on storage.objects;
create policy plamont_anexos_delete on storage.objects for delete to authenticated
using (bucket_id = 'report_anexos_om' and plamont_anexos.pode_limpar_upload(name, owner_id));

-- Barreiras RESTRICTIVE evitam que policies permissivas de outros módulos
-- liberem anon, UPDATE/upsert ou documentos ainda não publicados neste bucket.
-- Para todos os outros buckets, estas barreiras retornam true (não interferem).
drop policy if exists plamont_anexos_guard_select on storage.objects;
create policy plamont_anexos_guard_select on storage.objects as restrictive for select to public
using (bucket_id <> 'report_anexos_om' or plamont_anexos.pode_ler(name, owner_id));

drop policy if exists plamont_anexos_guard_insert on storage.objects;
create policy plamont_anexos_guard_insert on storage.objects as restrictive for insert to public
with check (bucket_id <> 'report_anexos_om' or plamont_anexos.pode_enviar(name, owner_id));

drop policy if exists plamont_anexos_guard_delete on storage.objects;
create policy plamont_anexos_guard_delete on storage.objects as restrictive for delete to public
using (bucket_id <> 'report_anexos_om' or plamont_anexos.pode_limpar_upload(name, owner_id));

drop policy if exists plamont_anexos_guard_update on storage.objects;
create policy plamont_anexos_guard_update on storage.objects as restrictive for update to public
using (bucket_id <> 'report_anexos_om') with check (bucket_id <> 'report_anexos_om');

commit;
