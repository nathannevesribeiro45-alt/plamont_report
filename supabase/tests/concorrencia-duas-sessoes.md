# Ensaio complementar em duas conexões PostgreSQL

Não executado nesta entrega. Usar banco de homologação e duas conexões persistentes independentes (o SQL Editor pode usar conexões do pool e não é indicado para manter BEGIN entre cliques).

1. Obtenha dois UUIDs de usuários de teste ativos com perfil editor, planejamento ou admin. Não use credenciais de produção no cliente. Carregue um contrato seed completo e escolha identidade de teste exclusiva.
2. Sessão A: BEGIN; SET LOCAL ROLE authenticated; configure `request.jwt.claim.sub` com o UUID A; chame salvar_aba_relatorio para a primeira aba, versão-base 0. Deixe a transação aberta.
3. Sessão B: BEGIN; SET LOCAL ROLE authenticated; configure a claim com UUID B; chame a RPC para a segunda aba, mesma identidade/seed e versão-base 0. Deve aguardar o lock da sessão A.
4. Sessão A: COMMIT. Sessão B deve terminar com versão 2, contendo ambas as alterações. COMMIT B. Verifique uma única linha e ordem das abas preservada.
5. Repita com outra identidade exclusiva, agora ambas alterando a mesma aba com base 0. Após COMMIT A, B deve falhar com SQLSTATE 40001/relatorio_conflito_aba. ROLLBACK B. A alteração A deve permanecer.
6. Para linha existente, carregue a mesma versão nas duas conexões e repita tanto abas diferentes (ambas preservadas) quanto mesma aba (conflito). Confirme autores/timestamps e ausência de versões perdidas.
7. Não apague dados reais para limpar o ensaio. Use banco descartável ou limpeza específica dos IDs de teste aprovada pelo responsável. Um ensaio real de disputa com COMMIT não pode ser integralmente desfeito pelo ROLLBACK de uma terceira conexão.

Não retransmitir automaticamente um conflito com uma versão-base nova sem conciliar o conteúdo: isso transformaria a detecção em sobrescrita silenciosa.
