-- Executar como postgres, após a migração, de preferência no projeto de teste.
-- Dados sintéticos apenas. A transação INTEIRA termina com ROLLBACK.
-- Nenhuma senha, e-mail ou conta utilizável é criada. Não enviar somente trechos.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';
create temporary table rt_resultados (teste text, resultado text) on commit drop;
create temporary table rt_contexto (seed jsonb, editor uuid, planejamento uuid, admin uuid, visualizador uuid, inativo uuid) on commit drop;
insert into rt_contexto select jsonb_build_object(
  'id','teste-infra-' || gen_random_uuid()::text,'nome','Contrato sintético','data','28/09/2026','turno','Dia B','horario','07h às 19h',
  'extra_raiz',jsonb_build_object('preservar',true),
  'abas',jsonb_build_array(
    jsonb_build_object('id','integridade','nome','Integridade','qlp','{}'::jsonb,'histograma','{}'::jsonb,'ausencias','{}'::jsonb,'mobilizacao','{}'::jsonb,'recursos','[]'::jsonb,'atividades','[]'::jsonb,'anexos','[]'::jsonb),
    jsonb_build_object('id','telhado','nome','Telhado','qlp','{}'::jsonb,'histograma','{}'::jsonb,'ausencias','{}'::jsonb,'mobilizacao','{}'::jsonb,'recursos','[]'::jsonb,'atividades','[]'::jsonb,'campo_extra','preservar'))
),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into auth.users(id) select unnest(array[editor,planejamento,admin,visualizador,inativo]) from rt_contexto;
insert into public.usuarios(id,matricula,nome,perfil,ativo)
select u.id,substr(replace(u.id::text,'-',''),1,20),'Teste SQL temporário',u.perfil,u.ativo
from rt_contexto c cross join lateral (values
 (c.editor,'editor',true),(c.planejamento,'planejamento',true),(c.admin,'admin',true),
 (c.visualizador,'visualizador',true),(c.inativo,'editor',false)) u(id,perfil,ativo);
grant select on rt_contexto to authenticated, anon;
grant select, insert on rt_resultados to authenticated, anon;

create function pg_temp.rt_assert(p_teste text,p_condicao boolean) returns void language plpgsql as $$
begin
 if p_condicao is distinct from true then raise exception 'FALHOU: %',p_teste; end if;
 insert into rt_resultados values(p_teste,'OK');
end $$;
create function pg_temp.rt_error(p_teste text,p_sql text,p_code text) returns void language plpgsql as $$
declare v_code text;
begin
 begin execute p_sql; exception when others then get stacked diagnostics v_code = returned_sqlstate; end;
 perform pg_temp.rt_assert(p_teste,v_code is not distinct from p_code);
end $$;
create function pg_temp.rt_save(p_aba text,p_marca text,p_versao integer)
returns public.relatorios_turnos language sql as $$
 select public.salvar_aba_relatorio(seed->>'id','2026-09-28','Dia B',p_aba,
   (select a || jsonb_build_object('teste',p_marca) from jsonb_array_elements(seed->'abas') a where a->>'id'=p_aba),seed,p_versao)
 from rt_contexto;
$$;

select set_config('request.jwt.claim.sub',editor::text,true) from rt_contexto;
set local role authenticated;
select pg_temp.rt_save('integridade','primeiro',0);
select pg_temp.rt_assert('01 INSERT editor e versão inicial',
 (select r.versao=1 and r.schema_version=1 and r.status='aberto' from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_assert('03 Aba atualizada; outra preservada',
 (select r.dados#>>'{abas,0,teste}'='primeiro' and r.dados#>'{abas,1}'=c.seed#>'{abas,1}' from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
reset role;
select pg_temp.rt_error('02 UNIQUE impede duplicação',
 format('insert into public.relatorios_turnos(contrato_id,data_relatorio,turno,dados) values(%L,%L,%L,%L)',seed->>'id','2026-09-28','Dia B',seed),'23505') from rt_contexto;
select set_config('request.jwt.claim.sub',planejamento::text,true) from rt_contexto;
set local role authenticated;
select pg_temp.rt_save('telhado','segundo',0);
select pg_temp.rt_assert('04/10 Planejamento; outra aba com base antiga',
 (select r.versao=2 and r.dados#>>'{abas,0,teste}'='primeiro' and r.dados#>>'{abas,1,teste}'='segundo' from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
reset role;
select set_config('request.jwt.claim.sub',admin::text,true) from rt_contexto;
set local role authenticated;
select pg_temp.rt_save('integridade','terceiro',1);
select pg_temp.rt_assert('05/11 Admin; versão 3, uma única linha',
 (select count(*)=1 and min(r.versao)=3 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_assert('06 Autoria servidor preservada e atualizada',
 (select r.criado_por=c.editor and r.atualizado_por=c.admin from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_assert('07 Timestamps now() do servidor',
 (select r.criado_em=now() and r.atualizado_em=now() from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_assert('13/14 JSON completo, extras e ordem do array',
 (select r.dados=(jsonb_set(jsonb_set(c.seed,'{abas,0}',c.seed#>'{abas,0}' || '{"teste":"terceiro"}'),'{abas,1}',c.seed#>'{abas,1}' || '{"teste":"segundo"}')) from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_error('Conflito mesma aba antiga','select pg_temp.rt_save(''integridade'',''perda'',1)','40001');
select pg_temp.rt_error('Versão futura rejeitada','select pg_temp.rt_save(''integridade'',''perda'',999)','40001');
select pg_temp.rt_error('15 Aba inexistente',format('select public.salvar_aba_relatorio(%L,%L,%L,%L,%L,null,3)',seed->>'id','2026-09-28','Dia B','invalida','{"id":"invalida"}'),'22023') from rt_contexto;
reset role;
select set_config('request.jwt.claim.sub',visualizador::text,true) from rt_contexto;
set local role authenticated;
select pg_temp.rt_assert('08 Visualizador SELECT',(select count(*)=1 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_error('08 Visualizador RPC negada','select pg_temp.rt_save(''integridade'',''negado'',3)','42501');
select pg_temp.rt_error('08 Visualizador INSERT negado', $$insert into public.relatorios_turnos(contrato_id,data_relatorio,turno,dados) values('negado','2026-09-28','Dia B','{}')$$,'42501');
select pg_temp.rt_error('08 Visualizador UPDATE negado','update public.relatorios_turnos set versao=99','42501');
select pg_temp.rt_error('DELETE negado','delete from public.relatorios_turnos','42501');
reset role;
select set_config('request.jwt.claim.sub',inativo::text,true) from rt_contexto;
set local role authenticated;
select pg_temp.rt_assert('Inativo sem leitura',(select count(*)=0 from public.relatorios_turnos));
select pg_temp.rt_error('Inativo sem escrita','select pg_temp.rt_save(''integridade'',''negado'',3)','42501');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.rt_error('12 Anônimo SELECT negado','select * from public.relatorios_turnos','42501');
select pg_temp.rt_error('12 Anônimo RPC negada','select public.salvar_aba_relatorio(null,null,null,null,null,null,null)','42501');
reset role;
select set_config('request.jwt.claim.sub',editor::text,true) from rt_contexto;
set local role authenticated;
select pg_temp.rt_assert('09 Editor SELECT',(select count(*)=1 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_save('integridade','quarto',3);
select pg_temp.rt_assert('09 Editor UPDATE autorizado',(select r.versao=4 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select pg_temp.rt_error('Editor não sobrescreve JSON diretamente','update public.relatorios_turnos set dados=''{}''','42501');
select public.salvar_aba_relatorio(seed->>'id','2026-09-29','Dia B','integridade',seed#>'{abas,0}',jsonb_set(seed,'{data}','"29/09/2026"'),0) from rt_contexto;
select pg_temp.rt_assert('16 Data independente',(select count(*)=2 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select public.salvar_aba_relatorio(seed->>'id','2026-09-28','Dia A','integridade',seed#>'{abas,0}',jsonb_set(seed,'{turno}','"Dia A"'),0) from rt_contexto;
select pg_temp.rt_assert('17 Turno independente',(select count(*)=3 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id'));
select public.salvar_aba_relatorio(seed->>'id' || '-outro','2026-09-28','Dia B','integridade',seed#>'{abas,0}',jsonb_set(seed,'{id}',to_jsonb(seed->>'id' || '-outro')),0) from rt_contexto;
select pg_temp.rt_assert('18 Contrato independente',(select count(*)=1 from public.relatorios_turnos r,rt_contexto c where r.contrato_id=c.seed->>'id' || '-outro'));
reset role;
select teste,resultado from rt_resultados order by teste;
select count(*) as verificacoes_ok, 'ROLLBACK ao final: nenhum dado sintético persistido' as observacao from rt_resultados;
rollback;
