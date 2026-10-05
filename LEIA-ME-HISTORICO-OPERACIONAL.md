# Histórico de Relatórios — primeira versão funcional

Entrega de 05/10/2026, exclusivamente sobre o ZIP fornecido nesta etapa.
Base SHA256: `66DA1DD7BB6311DD198EE85C35D201A1857100216847E6A6B8A515EEEF743066`.

## Arquivos e instalação

Criados: `js/modules/historico.js`, `css/historico.css`.
Modificados: `index.html`, `js/modules/sidebar.js`.
Todos os demais arquivos foram preservados byte a byte, inclusive `historicoStorage.js`, `relatoriosStorage.js`, Editor, anexos, fotos, mapa, Grandes Paradas, JSONs e SQL.
O ZIP de entrada não foi sobrescrito. O novo ZIP contém o projeto completo, sem o diretório interno `.git`, mais esta documentação.

Para atualizar por arquivos, use os quatro arquivos completos da pasta/ZIP de entrega de arquivos modificados.
As cópias `.txt` abrem no Bloco de Notas; ao aplicar, salve com o nome original e na pasta correspondente, retirando somente o sufixo `.txt`.
Não são trechos para acrescentar ao fim dos arquivos: cada cópia contém o arquivo inteiro.
Não há SQL, migração, criação de snapshots ou alteração de configuração a executar.

## Como acessar

Abra o site, entre com uma conta ativa que tenha permissão `visualizar` e escolha **Histórico** no menu.
Use contrato, data operacional e turno para consultar. Campos sem valor significam todos os contratos, datas ou turnos.
Clique em um relatório para abrir o detalhe. Somente registros já persistidos aparecem; não há fallback ao JSON seed.

## Arquitetura e funções

Fluxo mantido: `relatorios_turnos → HistoricoStorage → Historico → interface`.
O módulo visual não chama Supabase, RPC, Storage nem os renderizadores operacionais.

- `iniciar()`: configuração idempotente de eventos, filtros e observação da página na navegação existente.
- `abrir()`: aguarda a autenticação existente e inicia a primeira consulta da página.
- `buscar()`: lê filtros e solicita uma página de metadados a `HistoricoStorage.listar()`.
- `selecionar(id)`: solicita exatamente o registro selecionado a `HistoricoStorage.carregar()` e trabalha com cópia independente.
- `renderizarLista()`: monta itens compactos com data, turno, contrato, versão discreta e destaque de seleção.
- `renderizarDetalhe()`: monta a folha operacional em blocos separados por aba/frente.
- `voltar()`: retorna à lista no mobile preservando filtros e registros, com foco no item selecionado.
- `limpar()`: invalida leituras pendentes e remove dados pessoais em mudanças de sessão/permissão.
- Helpers internos concentram quantitativos, recursos, atividades, status e mensagens controladas.

Não houve alteração de identidade: UUID ou contrato + data operacional + texto completo do turno.
Datas usam ISO nas consultas e DD/MM/AAAA na apresentação. Horário vem do JSON salvo, sem cálculo ou filtro de hora.

## Apresentação desktop e mobile

Desktop acima de 900px: filtros em uma linha e master/detail com aproximadamente 32%/68%, cards brancos e folha compacta.
Mobile até 900px: filtros empilhados e lista; ao selecionar, apenas o detalhe fica visível, com “Voltar ao histórico”.
O posicionamento de rolagem considera a barra superior móvel para não ocultar o botão Voltar.
CSS inteiramente restrito a `#historico`; nenhuma regra visual global foi alterada.

Cada aba mantém QLP, histograma/efetivo, ausências, mobilização, recursos e atividades associados à sua própria frente.
Não há soma de abas, nem mistura entre Integridade e Telhado da OS 440.
QLP e efetivo separam mão de obra direta/indireta e totalizam somente os valores válidos daquela aba.
Ausências mantêm as funções e os totais informados de justificadas/não justificadas, sem dupla contagem.
Campos vazios recebem mensagem de ausência de informação, sem inventar valores ou pessoas.

Recursos mantêm identificação/placa, responsável, contato secundário e motivo informado quando houver.
Estados reconhecidos: ✅ Disponível, 🔵 Atendendo, 🟡 Preventiva, ❌ Manutenção / Inoperante.
Notas legadas de placa são reconhecidas quando não houver estado explícito conhecido. Valores desconhecidos são preservados, não presumidos disponíveis.
Atividades mantêm líder, contato secundário, equipe, ativo quando existir, OM, frente, descrição e status.
`om.resumoAtividades` é exibido apenas se já existir como texto não vazio. Não foi acrescentado ao Editor ou aos JSONs.

Não há mapa, coordenadas, anexos, download, galeria, controles operacionais, edição, exclusão, criação manual de snapshot, comparação, PDF, gráficos ou KPIs grandes.
Textos permanecem selecionáveis e copiáveis; quebras de linha são preservadas.

## Segurança e consultas

Autenticação/permissões existentes foram reutilizadas: `visualizar`, sessão ativa e RLS existente.
O botão Histórico permanece acessível no menu; usuários sem acesso veem erro controlado dentro da página, sem carregar dados nem usar alert().
Nenhuma autenticação ou permissão paralela foi criada.

Todos os textos históricos são inseridos por `textContent`/nós de texto. O módulo visual não usa `innerHTML` ou interpretação de HTML histórico.
A saída possui somente campos operacionais explicitamente previstos, sem renderizar coordenadas ou URLs de anexos.
Dados em memória e no detalhe são removidos em logout/troca de usuário ou perda de permissão, mesmo com a página oculta.
Respostas atrasadas não podem substituir uma seleção mais recente ou um novo filtro.

SELECT e validação continuam exclusivamente no `historicoStorage.js` original:

- Listagem: metadados, filtros por igualdade, ordenação existente e limite de 50 registros por vez.
- Detalhe: identidade única, JSON e versões de abas, usando `maybeSingle()`.
- “Carregar mais” usa a paginação simples já suportada, sem SQL novo, contagem extra ou sistema complexo de cursores.

O Histórico não altera `Dashboard.contratos`, contrato atual, aba atual, período, rascunho ou cache de `RelatoriosStorage`.
Não existem chamadas de gravação ou acesso direto ao cliente no módulo visual.

## Testes e validação

- `node --check` nos dois JS criados/modificados e no módulo de leitura existente.
- 20 testes automatizados de interface/lógica com JSDOM, Auth, permissões e HistoricoStorage do ZIP.
- Os cinco contratos do ZIP foram usados como fixtures locais, com metadados e sessão claramente simulados, fora do projeto de entrega.
- Verificadas inicialização/navegação, projeções SELECT, três filtros, estados vazio/erro/carregando, cópias e preservação do Dashboard/cache.
- Verificadas OS 450 e OS 440, associação correta de frentes, ausência de dupla contagem, estados de recursos, resumo opcional, HTML malicioso e ausência de controles proibidos.
- Verificadas paginação além de 50, corrida de seleção, invalidação por nova busca, logout e retorno móvel com filtros preservados.
- Navegador real: layout desktop a 1440px e mobile a 390px, sem rolagem horizontal causada pela página; lista/detalhe exclusivos no mobile e Voltar visível abaixo da barra superior.
- Navegador real: retorno ao Dashboard, abertura do contrato OS 450 e Grandes Paradas; sem erros de console durante esses fluxos locais.
- Sessão real do Supabase fornecida pelo usuário: listagem retornou 23 relatórios na hora da validação.
- Leitura real da OS 450 em **02/10/2026 · Dia A**, versão salva 6: uma frente, 5 recursos, 4 equipes e 4 OMs; QLP 48, efetivo informado 46.
- Leitura real da OS 440 em **02/10/2026 · Dia A**: Integridade com 4 equipes/4 OMs e Telhado com 1 equipe/1 OM, em blocos independentes.
- Filtros reais de OS 450 + 02/10/2026 + Dia A retornaram exatamente uma linha. Conteúdo do Dashboard permaneceu igual após leitura antiga e troca de filtros.
- Fluxo móvel validado também com registro real da OS 450; Voltar preservou os três filtros.
- Nenhuma gravação, RPC, alteração de bucket/policy ou upload foi realizada ao Supabase nesses testes.
- Conferência por SHA256 de todos os arquivos antigos e da cópia TXT de cada arquivo modificado/criado.

Evidências visuais da sessão real: `historico-desktop-real.jpg`, `historico-mobile-real.jpg`, entregues separadamente.
Testes e servidor de QA não fazem parte do ZIP da aplicação.

## Limitações e próximos passos

Cada linha guarda a última gravação daquele contrato/data/turno, não todas as revisões anteriores.
Por isso a interface usa “Relatórios salvos”, não promete snapshots imutáveis. Um relatório antigo pode mudar se receber novo salvamento.
Listagem e detalhe podem mostrar versões diferentes se outro usuário salvar entre as consultas.
Paginação por deslocamento pode sofrer deslocamento de itens com gravações simultâneas; esta etapa não cria uma fotografia transacional da lista.
Turnos adicionais e contratos antigos descobertos na listagem são acrescentados aos filtros. Um turno raro fora das páginas já consultadas aparece após consultar/carregar aquela página com filtro de turno vazio.
Campos ausentes não são reconstruídos e dados inconsistentes ou schema desconhecido recebem erro controlado da camada existente.
Não foi testada escrita, pois ela não faz parte do Histórico. Edição/anexos continuam usando os arquivos originais intactos.

Próximo passo recomendado: publicar este ZIP pelo processo já usado pela equipe e validar o menu Histórico no endereço do site.
Somente depois avaliar, em escopo separado, Resumo de atividades no Editor e necessidade real de snapshots imutáveis.
