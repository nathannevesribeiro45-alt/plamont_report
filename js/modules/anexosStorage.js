/* PATCH 1 — somente infraestrutura. Não escuta seleção/Aplicar/Cancelar,
   não altera OMs, Dashboard ou RelatoriosStorage e não cria cliente Supabase.
   A orquestração de upload + RPC será implementada no PATCH 2. */
window.AnexosStorage = (() => {
    "use strict";
    const MAX_BYTES = 20 * 1024 * 1024;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const PATH = /^anexos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:[0-9a-f]{2}){1,128}\/[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])\/(?:[0-9a-f]{2}){1,128}\/(?:[0-9a-f]{2}){1,255}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

    function erro(codigo, mensagem, causa) {
        return Object.assign(new Error(mensagem), { code: codigo, cause: causa });
    }

    function bucket() {
    const valor = window.PlamontSupabaseConfig?.anexosBucket;

    if (valor !== "report_fotos") {
        throw erro(
            "configuracao_anexos",
            "Bucket de anexos não configurado. Nenhum arquivo foi enviado."
        );
    }

    return valor;
}

    async function cliente() {
        const auth = window.PlamontAuth;
        if (!auth) throw erro("auth_indisponivel", "Autenticação indisponível.");
        if (typeof auth.inicializar === "function") await auth.inicializar();
        else if (auth.pronto) await auth.pronto;
        if (!auth.supabase?.storage) throw erro("storage_indisponivel", "Armazenamento indisponível.");
        return auth.supabase;
    }

    function usuarioEditor(esperado) {
        const auth = window.PlamontAuth;
        const id = auth?.usuario?.id;
        if (auth?.pode?.("editar") !== true || !UUID.test(id || "") || (esperado && esperado !== id)) {
            throw erro("anexo_sem_permissao", "Sua sessão ou permissão de edição mudou. Entre novamente antes de enviar arquivos.");
        }
        return id;
    }

    function segmento(valor, limite, nome) {
        if (typeof valor !== "string" || !valor.trim() || valor.includes("\0")) throw erro("contexto_invalido", `${nome} inválido.`);
        // Hex de UTF-8 é reversível: não remove acentos, pontuação ou caixa.
        const bytes = new TextEncoder().encode(valor);
        if (bytes.length > limite) throw erro("contexto_invalido", `${nome} excede o limite do caminho.`);
        return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    }

    function dataISO(valor) {
        if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw erro("contexto_invalido", "Informe a data ISO capturada do relatório em edição.");
        const data = new Date(`${valor}T00:00:00.000Z`);
        if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw erro("contexto_invalido", "Data do relatório inválida.");
        return valor;
    }

    function validarCaminho(caminho) {
        if (typeof caminho !== "string" || caminho.length > 1024 || !PATH.test(caminho)) throw erro("caminho_invalido", "Caminho do anexo inválido.");
        dataISO(caminho.split("/")[3]);
        return caminho;
    }

    function criarDestino(contexto, usuarioId, objetoId = window.crypto.randomUUID()) {
        if (!UUID.test(usuarioId || "") || !UUID.test(objetoId || "")) throw erro("contexto_invalido", "Identificador do usuário ou arquivo inválido.");
        // Recebe identidade capturada, nunca consulta relógio/Dashboard/aba ativa.
        const caminho = ["anexos", usuarioId, segmento(contexto?.contratoId, 128, "Contrato"),
            dataISO(contexto?.dataRelatorio), segmento(contexto?.turno, 128, "Turno"),
            segmento(contexto?.abaId, 255, "Aba"), `${objetoId}.pdf`].join("/");
        return Object.freeze({ bucket: bucket(), storagePath: validarCaminho(caminho), usuarioId, objetoId });
    }

    async function validarPDF(arquivo) {
        if (!(arquivo instanceof File) || !arquivo.size) throw erro("pdf_invalido", "Selecione um PDF não vazio.");
        if (arquivo.size > MAX_BYTES) throw erro("pdf_grande", "O limite por PDF é 20 MB.");
        if (!/\.pdf$/i.test(arquivo.name) || !["application/pdf", "application/octet-stream", ""].includes(arquivo.type.toLowerCase())) {
            throw erro("pdf_invalido", "Selecione um arquivo PDF.");
        }
        if (await arquivo.slice(0, 5).text() !== "%PDF-") throw erro("pdf_invalido", "O conteúdo do arquivo não possui cabeçalho PDF válido.");
        return true;
    }

    async function enviar(arquivo, destino) {
        await validarPDF(arquivo);
        const caminho = validarCaminho(destino?.storagePath);
        if (destino?.bucket !== bucket() || caminho.split("/")[1] !== destino.usuarioId) throw erro("contexto_invalido", "Destino do upload inválido.");
        const sdk = await cliente();
        const id = usuarioEditor(destino.usuarioId);
        let resposta;
        try {
            resposta = await sdk.storage.from(bucket()).upload(caminho, arquivo, {
                contentType: "application/pdf", cacheControl: "60", upsert: false
            });
        } catch (causa) {
            // Uma falha de transporte NÃO prova ausência do objeto no servidor.
            throw Object.assign(erro("upload_nao_confirmado", "Não foi possível confirmar o upload. Preserve o rascunho e confira esta tentativa antes de repetir.", causa), {
                storagePath: caminho, resultadoIncerto: true
            });
        }
        // Uma rejeição retornada pelo servidor não é uma exceção de transporte.
        if (resposta?.error) {
            console.error("[AnexosStorage] Upload rejeitado:", {
                status: resposta.error.statusCode ?? resposta.error.status ?? null,
                code: resposta.error.code ?? null,
                message: resposta.error.message ?? "Erro de Storage sem mensagem."
            });
            throw Object.assign(erro("upload_rejeitado", "O servidor recusou o envio do anexo.", resposta.error), {
                storagePath: caminho, resultadoIncerto: false, resultadoUpload: "rejeitado"
            });
        }
        if (!resposta?.data?.path || resposta.data.path !== caminho) throw Object.assign(erro("upload_nao_confirmado", "O servidor retornou uma confirmação de upload inesperada."), { storagePath: caminho, resultadoIncerto: true });
        // O chamador precisa reconciliar/limpar o envio se a sessão mudou.
        if (window.PlamontAuth?.usuario?.id !== id || !window.PlamontAuth?.pode?.("editar")) {
            throw Object.assign(erro("sessao_alterada_apos_upload", "Sessão alterada após o envio. O relatório ainda não foi salvo."), { storagePath: caminho, uploadConfirmado: true });
        }
        return Object.freeze({ storagePath: caminho, mimeType: "application/pdf", tamanho: arquivo.size });
    }

    async function baixar(caminho) {
        validarCaminho(caminho);
        const sdk = await cliente(); // Visitantes também usam o cliente oficial.
        const { data, error } = await sdk.storage.from(bucket()).download(caminho);
        if (error) throw erro("leitura_anexo", "Não foi possível abrir o anexo ou você não possui acesso.", error);
        if (!(data instanceof Blob)) throw erro("leitura_anexo", "Resposta de arquivo inválida.");
        return data;
    }

    async function criarUrlTemporaria(caminho, segundos = 120) {
        validarCaminho(caminho);
        if (!Number.isInteger(segundos) || segundos < 1 || segundos > 300) throw erro("prazo_invalido", "A URL deve durar entre 1 e 300 segundos.");
        const sdk = await cliente();
        const { data, error } = await sdk.storage.from(bucket()).createSignedUrl(caminho, segundos);
        if (error || !data?.signedUrl) throw erro("leitura_anexo", "Não foi possível obter acesso temporário ao PDF.", error);
        const url = new URL(data.signedUrl);
        const origem = new URL(window.PlamontSupabaseConfig.url);
        if (url.protocol !== "https:" || url.origin !== origem.origin) throw erro("url_invalida", "O servidor retornou uma URL inesperada.");
        return url.href; // Nunca colocar esta URL temporária no JSON do relatório.
    }

    async function removerUploadProprioSemReferencia(caminho) {
        validarCaminho(caminho);
        const sdk = await cliente();
        const id = usuarioEditor();
        if (caminho.split("/")[1] !== id) throw erro("anexo_sem_permissao", "A limpeza desta etapa só aceita uploads do próprio usuário.");
        // Uso futuro pelo orquestrador APÓS rejeição confirmada/reconciliação.
        // A policy também exige autoria e ausência de referência persistida.
        const { data, error } = await sdk.storage.from(bucket()).remove([caminho]);
        if (error) throw erro("limpeza_anexo", "Não foi possível limpar o upload desta tentativa.", error);
        if (!Array.isArray(data) || !data.some(item => item.name === caminho)) throw erro("limpeza_nao_confirmada", "A exclusão não foi confirmada. O objeto pode estar referenciado ou já não existir.");
        return true;
    }

    return Object.freeze({ MAX_BYTES, criarDestino, validarCaminho, validarPDF, enviar, baixar,
        criarUrlTemporaria, removerUploadProprioSemReferencia });
})();
