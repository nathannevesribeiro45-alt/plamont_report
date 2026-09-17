// Configuração do armazenamento compartilhado das fotos.
// Preencha com a URL do seu projeto Supabase e a chave ANON/PUBLIC.
// Nunca coloque aqui a service_role key.
window.PlamontSupabaseConfig = {
    url: "https://ntoadouzyjjgyhoihhap.supabase.co",
    anonKey: "sb_publishable_xGuKcW5CQDuUV4HYP2UbxA_uE6J0f7R",
    bucket: "report_fotos",

    // O usuário informa somente a matrícula. Ao criar contas no
    // Supabase Auth, use <matricula>@auth.plamont.local como e-mail interno.
    authEmailDomain: "auth.plamont.local"
};
