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

        // 1. Busca os tokens na tabela 'lojas'
        const { data: loja, error: erroLoja } = await supabase
            .from('lojas')
            .select('mp_access_token') // Nome confirmado pelo seu SQL
            .eq('id', loja_id)
            .single();

        if (erroLoja || !loja?.mp_access_token) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ erro: "Loja não encontrada ou mp_access_token ausente no banco." }) 
            };
        }

        // 2. Chamada ao Mercado Pago
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
                    email: payer?.email || "comprador@email.com"
                },
                back_urls: {
                    success: `${event.headers.origin}/sucesso.html`,
                    failure: `${event.headers.origin}/index.html`,
                    pending: `${event.headers.origin}/pendente.html`
                },
                auto_return: "approved"
            })
        });

        const result = await mpResponse.json();

        // Se o Mercado Pago retornar erro, enviamos o objeto de erro real para o seu index.html
        if (!mpResponse.ok) {
            return { 
                statusCode: mpResponse.status, 
                headers, 
                body: JSON.stringify({ erro: "Erro no Mercado Pago", detalhes: result }) 
            };
        }

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
