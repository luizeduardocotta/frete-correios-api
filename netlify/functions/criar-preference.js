const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    // 1. Cabeçalhos que liberam o acesso do seu site (CORS)
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // 2. Resposta obrigatória para o navegador (Preflight)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        const body = JSON.parse(event.body);
        const { items, loja_id } = body;

        // 3. Busca o token da loja no Supabase
        const { data: loja, error: erroLoja } = await supabase
            .from('lojas')
            .select('mp_access_token')
            .eq('id', loja_id)
            .single();

        if (erroLoja || !loja?.mp_access_token) throw new Error("Loja não encontrada ou token ausente.");

        // 4. Cria a Preferência no Mercado Pago (Checkout Pro)
        const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${loja.mp_access_token}`
            },
            body: JSON.stringify({
                items: items,
                back_urls: {
                    success: `${event.headers.origin}/sucesso.html`,
                    failure: `${event.headers.origin}/carrinho.html`,
                    pending: `${event.headers.origin}/pendente.html`
                },
                auto_return: "approved"
            })
        });

        const result = await mpResponse.json();

        // 5. Retorna o link (init_point) com os headers de CORS
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ init_point: result.init_point })
        };

    } catch (err) {
        console.error("Erro na função:", err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ erro: err.message })
        };
    }
};