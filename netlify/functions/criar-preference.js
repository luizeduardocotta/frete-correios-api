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

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    try {
        const body = JSON.parse(event.body);
        const { items, loja_id, payer } = body;

        // 1. Busca o token no Supabase
        const { data: loja, error: erroLoja } = await supabase
            .from('lojas')
            .select('mp_access_token')
            .eq('id', loja_id)
            .single();

        if (erroLoja || !loja?.mp_access_token) {
            return { statusCode: 400, headers, body: JSON.stringify({ erro: "Token não configurado no banco." }) };
        }

        // 2. Chamada ao Mercado Pago com back_urls fixas
        const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${loja.mp_access_token.trim()}`
            },
            body: JSON.stringify({
                items: items,
                payer: {
                    name: payer?.name || "Cliente",
                    email: payer?.email || "comprador@email.com",
                    address: {
                        street_name: payer?.address?.street_name || "Endereço não informado"
                    }
                },
                back_urls: {
                    success: "https://portallagoasanta.com.br/",
                    failure: "https://portallagoasanta.com.br/",
                    pending: "https://portallagoasanta.com.br/"
                },
                auto_return: "approved"
            })
        });

        const result = await mpResponse.json();

        if (!mpResponse.ok) {
            return { statusCode: mpResponse.status, headers, body: JSON.stringify({ erro: "Erro MP", detalhes: result }) };
        }

        return { statusCode: 200, headers, body: JSON.stringify({ init_point: result.init_point }) };

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message }) };
    }
};
