-- Somente leitura. Conferência após migração e testes com rollback.
select '01 Tabela criada' as verificacao, to_regclass('public.relatorios_turnos') is not null as ok
union all select '02 RLS habilitado', (select relrowsecurity from pg_class where oid='public.relatorios_turnos'::regclass)
union all select '03 UNIQUE contrato/data/turno', exists(select 1 from pg_constraint where conrelid='public.relatorios_turnos'::regclass and conname='relatorios_turnos_identidade' and contype='u')
union all select '04 Tres policies, nenhuma DELETE', (select count(*)=3 and count(*) filter(where cmd='DELETE' or cmd='ALL')=0 from pg_policies where schemaname='public' and tablename='relatorios_turnos')
union all select '05 Cliente somente SELECT direto', has_table_privilege('authenticated','public.relatorios_turnos','SELECT') and not has_table_privilege('authenticated','public.relatorios_turnos','INSERT,UPDATE,DELETE,TRUNCATE')
union all select '06 Anon sem leitura/escrita', not has_table_privilege('anon','public.relatorios_turnos','SELECT,INSERT,UPDATE,DELETE')
union all select '07 RPC autenticada e nao anonima', has_function_privilege('authenticated','public.salvar_aba_relatorio(text,date,text,text,jsonb,jsonb,integer)','EXECUTE') and not has_function_privilege('anon','public.salvar_aba_relatorio(text,date,text,text,jsonb,jsonb,integer)','EXECUTE')
union all select '08 RPC search_path restrito', (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.salvar_aba_relatorio(text,date,text,text,jsonb,jsonb,integer)'::regprocedure)
union all select '09 Relatorios de teste revertidos', not exists(select 1 from public.relatorios_turnos where contrato_id like 'teste-infra-%')
union all select '10 Usuarios de teste revertidos', not exists(select 1 from public.usuarios where nome='Teste SQL temporário')
order by verificacao;
