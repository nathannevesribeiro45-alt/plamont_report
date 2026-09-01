// ============================================================
// FOTOS STORAGE
// Camada de armazenamento das fotos das atividades.
// Usa Supabase Storage quando configurado; caso contrário,
// mantém o IndexedDB como fallback local para testes.
// ============================================================

const FotosStorage = {
    cliente: null,
    modo: "local",
    bucket: "report-fotos",

    inicializar() {
        const cfg = window.PlamontSupabaseConfig || {};
        this.bucket = cfg.bucket || "report-fotos";

        if (cfg.url && cfg.anonKey && window.supabase?.createClient) {
            try {
                this.cliente = window.supabase.createClient(cfg.url, cfg.anonKey);
                this.modo = "supabase";
            } catch (erro) {
                console.error("Não foi possível inicializar o Supabase. Fallback local ativado.", erro);
                this.cliente = null;
                this.modo = "local";
            }
        }

        return this.modo;
    },

    configurado() {
        return this.modo === "supabase" && !!this.cliente;
    },

    caminhoSeguro(valor) {
        return String(valor || "sem-dado")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || "sem-dado";
    },

    chaveParaPrefixo(chave) {
        const partes = String(chave || "sem-chave").split("::");
        return `fotos/${partes.map(parte => this.caminhoSeguro(parte)).join("/")}`;
    },

    async listar(chave) {
        if (!this.configurado()) return null;

        const prefixo = this.chaveParaPrefixo(chave);
        const { data, error } = await this.cliente.storage
            .from(this.bucket)
            .list(prefixo, { limit: 100, sortBy: { column: "created_at", order: "asc" } });

        if (error) throw error;

        return (data || [])
            .filter(item => item.name && !item.name.endsWith("/"))
            .map(item => {
                const caminho = `${prefixo}/${item.name}`;
                const { data: urlData } = this.cliente.storage.from(this.bucket).getPublicUrl(caminho);
                return {
                    id: caminho,
                    caminho,
                    arquivo: null,
                    url: urlData.publicUrl,
                    nome: item.name,
                    criadaEm: item.created_at ? new Date(item.created_at).getTime() : Date.now()
                };
            });
    },

    async salvar(chave, blob, nomeOriginal) {
        if (!this.configurado()) return null;

        const prefixo = this.chaveParaPrefixo(chave);
        const nome = `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}.jpg`;
        const caminho = `${prefixo}/${nome}`;

        const { error } = await this.cliente.storage
            .from(this.bucket)
            .upload(caminho, blob, {
                contentType: "image/jpeg",
                cacheControl: "31536000",
                upsert: false,
                metadata: { nomeOriginal: nomeOriginal || "foto.jpg" }
            });

        if (error) throw error;

        const { data } = this.cliente.storage.from(this.bucket).getPublicUrl(caminho);

        return {
            id: caminho,
            caminho,
            arquivo: blob,
            url: data.publicUrl,
            nome: nomeOriginal || nome,
            criadaEm: Date.now()
        };
    },

    async apagar(foto) {
        if (!this.configurado()) return;
        const caminho = foto?.caminho || foto?.id;
        if (!caminho) return;

        const { error } = await this.cliente.storage
            .from(this.bucket)
            .remove([caminho]);

        if (error) throw error;
    }
};

FotosStorage.inicializar();
