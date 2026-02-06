const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        if (!event.body) {
            return { statusCode: 400, headers, body: JSON.stringify({ erro: "Corpo vazio" }) };
        }

        const body = JSON.parse(event.body);
        const { items, loja_id } = body;

        if (!loja_id) throw new Error("ID da loja não informado.");

        // 1. Busca o token dinâmico da loja no Supabase
        const { data: loja, error: erroLoja } = await supabase
            .from('lojas')
            .select('mp_access_token')
            .eq('id', loja_id)
            .single();

        if (erroLoja || !loja?.mp_access_token) throw new Error("Loja não encontrada ou token ausente.");

        // 2. Cria a Preferência no Mercado Pago
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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ init_point: result.init_point })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ erro: err.message })
        };
    }
};
