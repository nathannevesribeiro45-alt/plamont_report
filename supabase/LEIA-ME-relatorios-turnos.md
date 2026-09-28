# Persistência de relatórios — infraestrutura v1

## Escopo e arquivos

Etapa exclusivamente de banco. Nenhum arquivo preexistente do frontend, contrato JSON, autenticação ou FotosStorage foi alterado. Não foi criado RelatoriosStorage, histórico, Realtime, upload ou fluxo de fechamento. O editor ainda não utiliza esta persistência.

- `relatorios_turnos.sql`: migração completa (executar como postgres).
- `tests/relatorios-local.mjs`: testes SQL em PostgreSQL/PGlite descartável, com os contratos reais do projeto.
- `tests/bootstrap-local.sql`: imitação mínima do ambiente Auth para o teste local. **Nunca executar no Supabase.**
- `tests/relatorios-remoto-rollback.sql`: testes SQL de integração com dados sintéticos e ROLLBACK obrigatório ao final.
- `tests/concorrencia-duas-sessoes.md`: roteiro complementar de concorrência simultânea.
- `tests/verificacao-pos-aplicacao.sql`: conferência somente leitura após aplicação.

## Diagnóstico confirmado

Projeto remoto: `plamont-reports-teste`, referência `ntoadouzyjjgyhoihhap`. Em 28/09/2026 foi consultada a estrutura real pelo SQL Editor: `usuarios.id` é UUID/PK/FK para `auth.users(id)` com DELETE CASCADE; `matricula` é única; `nome`, `perfil`, `ativo`, `criado_em` e `atualizado_em` estão presentes. Perfis: visualizador, editor, planejamento, admin. A tabela usuarios tem RLS, policy SELECT do próprio perfil e SELECT concedido a authenticated. A função pública preexistente era `atualizar_usuario_atualizado_em`. A tabela de relatórios ainda não existia antes desta aplicação.

No código, a sessão do Supabase Auth fornece o UUID usado por usuarios. A Edge Function admin-users continua independente; não foi modificada. A configuração usa apenas chave pública no frontend. Não foram copiadas credenciais administrativas.

Os JSONs usam data DD/MM/YYYY, turno em texto (Dia A/Dia B), contrato completo na raiz e `abas` como ARRAY. O identificador é `aba.id`, sensível a maiúsculas/acentos; existem IDs como `Cobre` e `manutenção de ativos`. Nenhum nome ou campo extra é normalizado.

## Tabela e índices

`public.relatorios_turnos` contém: id UUID; contrato_id TEXT; data_relatorio DATE; turno TEXT; status TEXT; dados JSONB; schema_version e versao INTEGER; criado_por/criado_em; atualizado_por/atualizado_em; fechado_por/fechado_em; e `versoes_abas` JSONB de metadados técnicos.

Uma UNIQUE sobre contrato_id/data_relatorio/turno garante uma linha por identidade. Seu índice também atende os prefixos contrato e contrato/data; não foram criados índices redundantes. Índices adicionais: data_relatorio e status. Sem índice JSONB nesta fase.

Constraints: identidade não vazia, data finita, status aberto/fechado, dados objeto, versões >= 1 e versoes_abas objeto. Os três autores referenciam auth.users com ON DELETE SET NULL, preservando relatórios quando uma conta é removida. Datas de auditoria são geradas por `now()` no servidor (início da transação), nunca pelo navegador.

## Acesso

| Perfil ativo | SELECT | Salvar via RPC | DML direto / DELETE |
| --- | --- | --- | --- |
| visualizador | Sim | Não | Não |
| editor | Sim | Sim | Não |
| planejamento | Sim | Sim | Não |
| admin | Sim | Sim | Não |
| inativo, sem perfil ou anônimo | Não | Não | Não |

RLS habilitado com policies SELECT/INSERT/UPDATE vinculadas a auth.uid(), usuarios.ativo e usuarios.perfil. Nenhuma policy DELETE. A leitura atende todos os contratos: não existe no projeto atual um vínculo de autorização por contrato.

As permissões SQL de clientes concedem somente SELECT na tabela e EXECUTE na RPC. INSERT/UPDATE conceituais são realizados exclusivamente pelo fluxo autorizado; liberar UPDATE direto permitiria ignorar merge, versões e autoria. As policies de escrita são uma proteção adicional, não substituem os grants.

Por isso a RPC é SECURITY DEFINER, propriedade de postgres, search_path vazio e referências de tabelas qualificadas. Como esse proprietário contorna RLS, a função verifica explicitamente auth.uid() e o perfil ativo a cada chamada, antes de qualquer escrita. EXECUTE é revogado de PUBLIC, anon e service_role e concedido a authenticated, com a validação interna bloqueando visualizadores. Credenciais administrativas, postgres e acessos privilegiados continuam fora do modelo de cliente; nunca devem ser enviados ao navegador.

## Contrato da RPC

```sql
public.salvar_aba_relatorio(
  p_contrato_id text,
  p_data_relatorio date,
  p_turno text,
  p_aba_id text,
  p_dados_aba jsonb,
  p_contrato_base jsonb,
  p_versao_base integer
) returns public.relatorios_turnos
```

- Identidade: contrato/data ISO/turno exato. No futuro, JS deverá converter DD/MM/YYYY para DATE.
- p_aba_id: ID exato, não título nem índice.
- p_dados_aba: **objeto completo da aba**, incluindo campos extras/anexos; não é patch parcial.
- p_contrato_base: contrato completo quando ainda não persistido; sua raiz id/data/turno deve coincidir com a identidade. Ignorado nos salvamentos seguintes, podendo ser NULL.
- p_versao_base: 0 para seed ainda não persistido; nos demais casos, versão global recebida na última leitura da aba que está sendo editada.

O primeiro salvamento copia o contrato_base completo e substitui a aba-alvo. É responsabilidade do futuro carregador enviar o seed completo: não há catálogo no banco que permita descobrir uma aba omitida pelo chamador. O servidor verifica array não vazio, IDs únicos e aba-alvo existente; não inventa abas ausentes.

Nos salvamentos seguintes, a função lê e bloqueia a linha atual, encontra a posição do ID com ordinality e usa jsonb_set somente naquele elemento do array. Não regrava o contrato_base antigo. Ordem, campos da raiz e todas as outras abas ficam preservados. A aba-alvo é substituída integralmente; não há merge de campos dentro dela.

Retorno: registro completo, incluindo dados, identidade, status, versões, autores e timestamps. A futura integração deve usar essa resposta como fonte de verdade, sem fingir que um erro foi um salvamento bem-sucedido. SELECT sem linha significa relatório ainda não persistido, permitindo fallback nos JSONs.

## Concorrência e versões

`versao` começa em 1 e cresce a cada salvamento bem-sucedido, mesmo se o conteúdo for igual. `schema_version` começa em 1 e não é incrementado por salvamentos normais. Nenhuma tabela de histórico é criada.

O metadado separado `versoes_abas` foi documentado antes da implementação e não altera o schema operacional de dados. Guarda, por ID, a última versão global em que aquela aba foi salva. Abas somente copiadas do seed começam com 0; a aba salva começa com 1.

Uma versão global antiga é aceita se a aba-alvo não foi alterada desde a leitura. Assim duas abas distintas podem ser salvas sem apagar alterações alheias. Se a mesma aba foi alterada depois da versão-base, retorna conflito. Versão-base futura também é rejeitada. O cliente não deve simplesmente substituir sua versão-base pela mais recente e reenviar conteúdo antigo: deve recarregar e conciliar a aba.

Um advisory lock transacional por identidade protege também a primeira criação, quando ainda não existe linha; SELECT FOR UPDATE protege a linha existente. Colisões do hash apenas causam espera adicional. Em isolamento READ COMMITTED, a segunda chamada lê o estado já atualizado. Em isolamento mais forte podem ocorrer erros de serialização, exigindo recarregamento. A transação padrão da RPC é a unidade de salvamento.

## Erros esperados

| SQLSTATE | Mensagem | Ação futura |
| --- | --- | --- |
| 42501 | relatorio_sem_permissao / permission denied | Verificar sessão, perfil e ativo |
| 22023 | relatorio_parametros_invalidos | Corrigir identidade e versão-base |
| 22023 | relatorio_aba_invalida | Enviar objeto completo com ID string correspondente |
| 22023 | relatorio_contrato_base_invalido | Corrigir seed e raiz id/data/turno |
| 22023 | relatorio_abas_invalidas | Corrigir array/IDs duplicados ou inválidos |
| 22023 | relatorio_aba_nao_encontrada | Recarregar; não criar aba silenciosamente |
| 22023 | relatorio_metadados_invalidos | Revisão administrativa; não forçar sobrescrita |
| 40001 | relatorio_base_inexistente | Recarregar fallback e confirmar identidade |
| 40001 | relatorio_conflito_aba | Recarregar e conciliar a mesma aba |
| 55P03 / 40001 / 40P01 | lock/serialização/deadlock | Recarregar e repetir de forma controlada |

Qualquer erro desfaz o salvamento. Conflitos incluem detalhe com ID e versões. Limites nativos de INTEGER e do tamanho da requisição permanecem aplicáveis.

## Aplicação e reexecução

Executar o arquivo relatorios_turnos.sql inteiro como postgres. A migração é transacional e não usa DROP TABLE. Pode ser reexecutada nesta versão, preservando linhas. Tabela homônima sem o marcador da infraestrutura, ou policies externas desconhecidas, interrompem a operação para revisão. O marcador não é um sistema completo de migração: mudanças futuras de colunas devem receber migração explícita e teste, não ser escondidas em IF NOT EXISTS. Não editar diretamente dados/versões com credenciais privilegiadas no fluxo normal.

Status fechado e seus campos estão preparados, mas não existe fechamento ou bloqueio de edição de relatórios fechados nesta etapa. Não há Realtime/publicação acrescentada. Não foram alteradas policies preexistentes de usuarios nem Storage.

## Testes e reprodução

Node + `@electric-sql/pglite@0.5.8`. Na pasta `supabase/tests`, instale a dependência e execute `node relatorios-local.mjs`. Para usar instalação externa, defina PLAMONT_TEST_PACKAGE como caminho absoluto para o package.json dessa instalação. O bootstrap cria somente um banco em memória; nunca roda no servidor.

Resultado local: **57 verificações aprovadas**, cobrindo os 18 cenários pedidos, perfis ativos/inativos/sem perfil, SELECT/RPC/DML direto, concorrência intercalada, versões, rollback em erros, seed inválido, ordem e campos extras, FKs e reexecução. Os testes de timestamp entre salvamentos usam transações separadas, como chamadas RPC normais. Dentro de uma única transação, now() permanece igual por definição.

O roteiro remoto usa fixtures sintéticos e roles reais, com auth.uid() simulado por claim de sessão. Não valida emissão/renovação de JWT nem a camada HTTP/PostgREST. Não execute somente trechos: o ROLLBACK final é obrigatório. Nenhuma senha ou e-mail de usuário real é usada.

**Aplicação remota realizada em 28/09/2026**, no projeto acima, com autorização explícita do usuário. O SQL Editor confirmou sucesso da migração. O roteiro remoto retornou **26 verificações OK**, cobrindo os 18 cenários solicitados, e terminou com ROLLBACK. Todos os dados de teste foram revertidos, não relatórios reais. A infraestrutura permanece instalada.

A conferência pós-aplicação retornou **10 resultados true**: tabela, RLS, UNIQUE, três policies sem DELETE, grants restritos, RPC com search_path fixo e ausência de relatórios/usuários sintéticos. O diagnóstico remoto e os testes não alteraram registros operacionais existentes.

Limitação: testes de concorrência executados nesta etapa intercalam versões antigas; não simulam duas conexões realmente simultâneas. O roteiro complementar permite ensaiar bloqueio em PostgreSQL multissessão. Não foi feito teste Editor → Salvar → F5, pois a integração JS foi expressamente excluída.

## Referências primárias

- [Supabase — funções, search_path e execução](https://supabase.com/docs/guides/database/functions)
- [Supabase — RLS e auth.uid](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL — bloqueios transacionais](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PGlite — PostgreSQL em WASM](https://pglite.dev/docs/about)
