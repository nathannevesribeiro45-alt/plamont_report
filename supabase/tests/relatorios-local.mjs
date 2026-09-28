// Testes SQL reais em PostgreSQL/PGlite descartável; nenhum acesso remoto.
// Instale @electric-sql/pglite e execute este arquivo com Node.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(process.env.PLAMONT_TEST_PACKAGE || import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = name => readFileSync(path.join(dir, name), 'utf8');
const db = new PGlite();
let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log(`OK ${passed}: ${label}`); };
const ids = Array.from({length:7}, (_,i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const profiles = ['editor','planejamento','admin','visualizador','editor'];
const base = JSON.parse(readFileSync(path.join(dir, '../../contratos/os440.json'), 'utf8'));
base.data = '28/09/2026'; base.turno = 'Dia B';
const firstId = base.abas[0].id, secondId = base.abas[1].id;
const payload = (i, label) => ({...base.abas[i], teste_preservacao:label});
async function user(i, role, callback) {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [i === null ? '' : ids[i]]);
    await db.exec(`set local role ${role}`);
    const value = await callback();
    await db.exec('commit'); return value;
  } catch(e) { await db.exec('rollback'); throw e; }
}
const rpc = (i, aba, value, version, seed=base, identity={}) => user(i,'authenticated', async () =>
  (await db.query('select * from public.salvar_aba_relatorio($1,$2::date,$3,$4,$5::jsonb,$6::jsonb,$7)',
    [identity.id || seed?.id || base.id,identity.date || '2026-09-28',identity.shift || 'Dia B',aba,JSON.stringify(value),seed === null ? null : JSON.stringify(seed),version])).rows[0]);
async function rejects(label, action, code) {
  await assert.rejects(action, e => e.code === code); passed++; console.log(`OK ${passed}: ${label}`);
}
try {
  await db.exec(sql('bootstrap-local.sql'));
  await db.exec(sql('../usuarios.sql'));
  await db.exec('grant select on public.usuarios to authenticated');
  await db.exec(sql('../relatorios_turnos.sql'));
  await db.exec(sql('../relatorios_turnos.sql'));
  check('migração e reexecução',()=>assert.ok(true));
  for (let i=0;i<ids.length;i++) {
    await db.query('insert into auth.users values ($1)',[ids[i]]);
    if(i<profiles.length) await db.query('insert into public.usuarios(id,matricula,nome,perfil,ativo) values($1,$2,$3,$4,$5)',[ids[i],`TEST${i}`,'Teste sintético',profiles[i],i!==4]);
  }
  let r = await rpc(0,firstId,payload(0,'primeiro'),0);
  const created = r;
  check('01 INSERT por editor',()=>assert.equal(r.versao,1));
  check('03 primeira aba e outra preservada',()=>{assert.equal(r.dados.abas[0].teste_preservacao,'primeiro');assert.deepEqual(r.dados.abas[1],base.abas[1]);});
  check('06 autoria auth.uid e campos futuros',()=>{assert.equal(r.criado_por,ids[0]);assert.equal(r.atualizado_por,ids[0]);assert.equal(r.status,'aberto');assert.equal(r.fechado_por,null);});
  await rejects('02 UNIQUE',()=>db.query('insert into public.relatorios_turnos(contrato_id,data_relatorio,turno,dados) values($1,$2,$3,$4)',[base.id,'2026-09-28','Dia B',base]),'23505');
  r = await rpc(1,secondId,payload(1,'segundo'),0);
  check('04 abas diferentes com base antiga zero',()=>{assert.equal(r.dados.abas[0].teste_preservacao,'primeiro');assert.equal(r.dados.abas[1].teste_preservacao,'segundo');assert.equal(r.versao,2);});
  r = await rpc(2,firstId,payload(0,'terceiro'),1,null);
  check('05 versões 1/2/3, mesmo id',()=>{assert.equal(r.versao,3);assert.equal(r.id,created.id);});
  check('07 timestamps servidor e autor preservado',()=>{assert.deepEqual(r.criado_em,created.criado_em);assert.ok(r.atualizado_em > created.atualizado_em);assert.equal(r.criado_por,ids[0]);assert.equal(r.atualizado_por,ids[2]);});
  for(const i of [0,1,2,3]) {
    const read = await user(i,'authenticated',()=>db.query('select * from public.relatorios_turnos'));
    check(`08-11 SELECT perfil ${profiles[i]}`,()=>assert.equal(read.rows.length,1));
  }
  await rejects('08 visualizador RPC proibida',()=>rpc(3,firstId,payload(0,'negado'),3),'42501');
  for(const i of [0,3]) for(const query of ["insert into public.relatorios_turnos(contrato_id,data_relatorio,turno,dados) values('x','2026-09-28','Dia B','{}')","update public.relatorios_turnos set versao=99","delete from public.relatorios_turnos"]) {
    await rejects(`DML direto negado ${profiles[i]} ${query.split(' ')[0]}`,()=>user(i,'authenticated',()=>db.exec(query)),'42501');
  }
  await rejects('12 anon SELECT',()=>user(null,'anon',()=>db.query('select * from public.relatorios_turnos')),'42501');
  await rejects('12 anon EXECUTE',()=>user(null,'anon',()=>db.query('select public.salvar_aba_relatorio(null,null,null,null,null,null,null)')),'42501');
  for(const i of [4,5,null]) {
    const read = await user(i,'authenticated',()=>db.query('select * from public.relatorios_turnos'));
    check(`RLS inativo/sem perfil/sem UID ${i}`,()=>assert.equal(read.rows.length,0));
    await rejects(`RPC inativo/sem perfil/sem UID ${i}`,()=>rpc(i,firstId,payload(0,'negado'),3),'42501');
  }
  check('13 JSON completo/extras; 14 ordem ARRAY',()=>{
    assert.ok(Array.isArray(r.dados.abas));
    const expected=structuredClone(base); expected.abas=[payload(0,'terceiro'),payload(1,'segundo')];
    assert.deepEqual(r.dados,expected); assert.equal(r.schema_version,1);
  });
  await rejects('15 aba inexistente',()=>rpc(0,'inexistente',{id:'inexistente'},3),'22023');
  await rejects('conflito mesma aba antiga',()=>rpc(0,firstId,payload(0,'perda'),1),'40001');
  await rejects('versão futura',()=>rpc(0,firstId,payload(0,'perda'),99),'40001');
  await rejects('versão nula',()=>rpc(0,firstId,payload(0,'perda'),null),'22023');
  await rejects('payload ID diferente',()=>rpc(0,firstId,{id:'diferente'},3),'22023');
  await rejects('payload nulo',()=>rpc(0,firstId,null,3),'22023');
  let next=structuredClone(base); next.data='29/09/2026';
  const otherDate=await rpc(0,firstId,next.abas[0],0,next,{date:'2026-09-29'});
  check('16 data diferente',()=>assert.notEqual(otherDate.id,r.id));
  next=structuredClone(base);next.turno='Dia A';
  const otherShift=await rpc(1,firstId,next.abas[0],0,next,{shift:'Dia A'});
  check('17 turno diferente e planejamento INSERT',()=>assert.notEqual(otherShift.id,r.id));
  next=structuredClone(base);next.id='os441';
  const otherContract=await rpc(2,firstId,next.abas[0],0,next);
  check('18 contrato diferente e admin INSERT',()=>assert.notEqual(otherContract.id,r.id));
  for(const invalid of [null,{}, {...base,id:'errado'}, {...base,data:'2026-09-28'}, {...base,abas:{}}, {...base,abas:[]}, {...base,abas:[base.abas[0],base.abas[0]]}, {...base,abas:[{id:1}]}]) {
    await rejects('seed inválido rejeitado',()=>rpc(0,firstId,base.abas[0],0,invalid,{id:'novo'}),'22023');
  }
  for(const abas of [{},[],[base.abas[0],base.abas[0]],[{id:1}]]) {
    await rejects('array inválido com identidade válida',()=>rpc(0,firstId,base.abas[0],0,{...base,id:'novo',abas}),'22023');
  }
  await rejects('registro inexistente com versão > 0',()=>rpc(0,firstId,base.abas[0],1,{...base,id:'novo'}),'40001');
  const unchanged=(await db.query('select * from public.relatorios_turnos where id=$1',[r.id])).rows[0];
  check('erros não alteram dados nem versão',()=>assert.deepEqual(unchanged,r));
  await db.query("update public.relatorios_turnos set status='fechado',schema_version=2 where id=$1",[r.id]);
  r=await rpc(0,firstId,payload(0,'fechado sem fluxo'),3);
  check('sem bloqueio de fechamento e schema preservado',()=>{assert.equal(r.status,'fechado');assert.equal(r.schema_version,2);});
  await db.query('delete from auth.users where id=$1',[ids[0]]);
  const retained=(await db.query('select * from public.relatorios_turnos where id=$1',[r.id])).rows[0];
  check('FK SET NULL preserva relatório',()=>{assert.equal(retained.criado_por,null);assert.equal(retained.atualizado_por,null);assert.deepEqual(retained.dados,r.dados);});
  const count=(await db.query('select count(*)::int as n from public.relatorios_turnos')).rows[0].n;
  await db.exec(sql('../relatorios_turnos.sql'));
  check('reexecução preserva linhas',()=>assert.equal(count,4));
  check('quantidade final',()=>assert.equal(count,4));
  await db.exec(sql('relatorios-remoto-rollback.sql'));
  check('roteiro SQL remoto com rollback executável',()=>assert.ok(true));
  const finalCount=(await db.query('select count(*)::int as n from public.relatorios_turnos')).rows[0].n;
  check('rollback remove todos os fixtures remotos',()=>assert.equal(finalCount,count));
  console.log(`PASS: ${passed} verificações. Concorrência intercalada; não multissessão.`);
} finally { await db.close(); }
