-- Adição da aba Ambiental ao salvar, sem reescrever relatórios históricos.
-- Aplicar integralmente como postgres. Não reaplicar relatorios_turnos.sql.
do $instalacao$
begin
 if current_user <> 'postgres' then raise exception 'Execute como postgres.'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.salvar_aba_relatorio(text,date,text,text,jsonb,jsonb,integer)')
   and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""']) then
   raise exception 'RPC de relatórios ausente ou incompatível.';
 end if;
 if to_regprocedure('public.salvar_aba_ambiental_os442(text,date,text,text,jsonb,jsonb,integer)') is not null
   and obj_description(to_regprocedure('public.salvar_aba_ambiental_os442(text,date,text,text,jsonb,jsonb,integer)'),'pg_proc')
     is distinct from 'plamont.os442.ambiental.v1' then
   raise exception 'Função homônima desconhecida.';
 end if;
 execute $ddl$
 create or replace function public.salvar_aba_ambiental_os442(
   p_contrato_id text,p_data_relatorio date,p_turno text,p_aba_id text,
   p_dados_aba jsonb,p_contrato_base jsonb,p_versao_base integer
 ) returns public.relatorios_turnos language plpgsql security definer set search_path='' as $funcao$
 declare v_registro public.relatorios_turnos;
 begin
   if auth.uid() is null or not exists(select 1 from public.usuarios where id=auth.uid()
     and ativo and perfil in ('editor','planejamento','admin')) then
     raise exception using errcode='42501',message='relatorio_sem_permissao';
   end if;
   -- Identificadores já presentes no projeto são preservados por compatibilidade.
   if p_contrato_id is distinct from 'os442' or p_aba_id is distinct from 'infraeletrica'
     or p_dados_aba->>'nome' is distinct from 'Ambiental'
     or p_data_relatorio is null or not isfinite(p_data_relatorio)
     or p_turno is null or btrim(p_turno)='' or p_turno<>btrim(p_turno)
     or p_versao_base is null or p_versao_base<0 then
     raise exception using errcode='22023',message='relatorio_parametros_invalidos';
   end if;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
     jsonb_build_array('plamont.relatorios_turnos',p_contrato_id,p_data_relatorio,p_turno)::text,0));
   select * into v_registro from public.relatorios_turnos where contrato_id=p_contrato_id
     and data_relatorio=p_data_relatorio and turno=p_turno for update;
   if found then
     if jsonb_typeof(v_registro.dados->'abas') is distinct from 'array'
       or jsonb_typeof(v_registro.versoes_abas) is distinct from 'object' then
       raise exception using errcode='22023',message='relatorio_metadados_invalidos';
     end if;
     if not exists(select 1 from jsonb_array_elements(v_registro.dados->'abas') a where a->>'id'=p_aba_id) then
       if p_versao_base<>0 or v_registro.versoes_abas ? p_aba_id then
         raise exception using errcode='40001',message='relatorio_conflito_aba';
       end if;
       -- Apenas este relatório e apenas a aba ausente; versão/autoria são
       -- atualizadas pela RPC original na mesma transação.
       update public.relatorios_turnos set
         dados=jsonb_set(dados,'{abas}',(dados->'abas') || jsonb_build_array(jsonb_build_object('id',p_aba_id))),
         versoes_abas=jsonb_set(versoes_abas,array[p_aba_id],'0'::jsonb)
       where id=v_registro.id;
     end if;
   end if;
   return public.salvar_aba_relatorio(p_contrato_id,p_data_relatorio,p_turno,p_aba_id,p_dados_aba,p_contrato_base,p_versao_base);
 end;
 $funcao$;
 alter function public.salvar_aba_ambiental_os442(text,date,text,text,jsonb,jsonb,integer) owner to postgres;
 revoke all on function public.salvar_aba_ambiental_os442(text,date,text,text,jsonb,jsonb,integer) from public,anon,authenticated,service_role;
 grant execute on function public.salvar_aba_ambiental_os442(text,date,text,text,jsonb,jsonb,integer) to authenticated;
 comment on function public.salvar_aba_ambiental_os442(text,date,text,text,jsonb,jsonb,integer) is 'plamont.os442.ambiental.v1';
 notify pgrst,'reload schema';
 $ddl$;
end;
$instalacao$;
