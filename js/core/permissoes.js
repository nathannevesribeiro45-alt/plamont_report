/* ==========================================================
   PLAMONT AUTH — Perfis e permissões corporativas
   A autorização do banco deve sempre validar estas regras
   novamente com RLS/policies; este mapa atende à interface.
   ========================================================== */

window.PlamontPermissoes = Object.freeze({
    visualizador: Object.freeze({
        visualizar: true,
        editar: false,
        publicar: false,
        administrarUsuarios: false
    }),
    editor: Object.freeze({
        visualizar: true,
        editar: true,
        publicar: false,
        administrarUsuarios: false
    }),
    planejamento: Object.freeze({
        visualizar: true,
        editar: true,
        publicar: true,
        administrarUsuarios: false
    }),
    admin: Object.freeze({
        visualizar: true,
        editar: true,
        publicar: true,
        administrarUsuarios: true
    })
});
