const qaPanel=document.createElement('aside');
qaPanel.style.cssText='position:fixed;bottom:8px;right:8px;z-index:100000;background:#fff;color:#082b50;padding:12px;border:2px solid #1974ad;border-radius:8px;box-shadow:0 3px 20px #0003;font:13px Arial;max-width:420px';
qaPanel.innerHTML='<strong>QA LOCAL — sem Supabase</strong><p><button id="qa-editor">Abrir editor de teste</button> <label>Resultado <select id="qa-modo"><option value="sucesso">Sucesso</option><option value="rejeicao">Rejeição confirmada</option></select></label> <button id="qa-release">Concluir envio simulado</button></p><p id="qa-status" role="status"></p>';
document.body.append(qaPanel);
document.getElementById('qa-editor').onclick=async()=>{await abrirPagina('os440',null);EditorRelatorio.iniciar();document.querySelector('.editor-relatorio')?.scrollIntoView({block:'start'});};
document.getElementById('qa-modo').onchange=e=>{QAPatch2.modo=e.target.value;};
document.getElementById('qa-release').onclick=()=>QAPatch2.liberar?.();
setInterval(()=>{document.getElementById('qa-status').textContent=`Uploads: ${QAPatch2.uploads} | RPCs: ${QAPatch2.rpcs} | Objetos: ${QAPatch2.objects.size} | Pendentes: ${AnexosOM.arquivosPendentes.size} | ${EditorRelatorio.salvando?'SALVANDO — controles bloqueados':EditorRelatorio.ativo?'Editor aberto':'Editor fechado'}`;},250);
