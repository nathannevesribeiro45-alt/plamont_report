/* ==========================================================
   PLAMONT AUTH — Perfis e permissões corporativas
   A autorização do banco deve sempre validar estas regras
   novamente com RLS/policies; este mapa atende à interface.
   ========================================================== */

window.PlamontPermissoes = Object.freeze({
    visualizador: Object.freeze({
        visualizar: true,
        editar: false,
        editarResumoAtividade: false,
        editarObservacoesPlanejamento: false,
        publicar: false,
        administrarUsuarios: false
    }),
    editor: Object.freeze({
        visualizar: true,
        editar: true,
        editarResumoAtividade: true,
        editarObservacoesPlanejamento: false,
        publicar: false,
        administrarUsuarios: false
    }),
    planejamento: Object.freeze({
        visualizar: true,
        editar: true,
        editarResumoAtividade: false,
        editarObservacoesPlanejamento: true,
        publicar: true,
        administrarUsuarios: false
    }),
    admin: Object.freeze({
        visualizar: true,
        editar: true,
        editarResumoAtividade: true,
        editarObservacoesPlanejamento: true,
        publicar: true,
        administrarUsuarios: true
    })
});
