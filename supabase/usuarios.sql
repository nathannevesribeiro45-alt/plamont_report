-- Fundação de autenticação corporativa — Report Diário Plamont
-- Execute este script no SQL Editor do projeto Supabase.
-- Senhas pertencem exclusivamente a auth.users / Supabase Auth.

begin;

create table if not exists public.usuarios (
    id uuid primary key references auth.users(id) on delete cascade,
    matricula varchar(20) not null unique,
    nome varchar(120) not null,
    perfil varchar(30) not null default 'visualizador'
        check (perfil in ('visualizador', 'editor', 'planejamento', 'admin')),
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create or replace function public.atualizar_usuario_atualizado_em()
returns trigger
language plpgsql
as $$
begin
    new.atualizado_em = now();
    return new;
end;
$$;

drop trigger if exists usuarios_atualizado_em on public.usuarios;

create trigger usuarios_atualizado_em
before update on public.usuarios
for each row
execute function public.atualizar_usuario_atualizado_em();

alter table public.usuarios enable row level security;

drop policy if exists "usuario pode visualizar proprio perfil" on public.usuarios;

create policy "usuario pode visualizar proprio perfil"
on public.usuarios
for select
to authenticated
using (auth.uid() = id);

commit;

-- Primeiro administrador (executar após criar o usuário no Supabase Auth):
-- 1. Crie a conta Auth com o e-mail interno
--    <matricula>@auth.plamont.local e defina a senha no Supabase.
-- 2. Copie o UUID criado em auth.users.
-- 3. Execute, substituindo os valores entre <...>:
--
-- insert into public.usuarios (id, matricula, nome, perfil, ativo)
-- values ('<uuid-do-auth-user>', '<matricula>', '<nome>', 'admin', true);
