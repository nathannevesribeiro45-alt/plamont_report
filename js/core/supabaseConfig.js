// Configuração do armazenamento compartilhado das fotos.
// Preencha com a URL do seu projeto Supabase e a chave ANON/PUBLIC.
// Nunca coloque aqui a service_role key.
window.PlamontSupabaseConfig = {
    url: "https://ntoadouzyjjgyhoihhap.supabase.co",
    anonKey: "sb_publishable_xGuKcW5CQDuUV4HYP2UbxA_uE6J0f7R",
    bucket: "report_fotos",
    // PATCH 1: infraestrutura privada; ainda não integrada ao Aplicar.
    anexosBucket: "report_anexos_om",

    // O usuário informa somente a matrícula. Ao criar contas no
    // Supabase Auth, use <matricula>@auth.plamont.local como e-mail interno.
    authEmailDomain: "auth.plamont.local",

    // Nome público da Edge Function administrativa. A chave de serviço
    // permanece exclusivamente no ambiente seguro da função.
    adminUsersFunction: "admin-users"
};
