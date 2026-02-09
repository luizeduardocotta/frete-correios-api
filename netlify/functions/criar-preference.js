const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const body = JSON.parse(event.body);

    const {
      items,
      loja_id,
      payer,
      tipo_frete,
      valor_frete,
      valor_total,
      cliente
    } = body;

    // 1. Busca token do Mercado Pago
    const { data: loja, error: erroLoja } = await supabase
      .from('lojas')
      .select('mp_access_token')
      .eq('id', loja_id)
      .single();

    if (erroLoja || !loja?.mp_access_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ erro: "Token não configurado no banco." })
      };
    }

    // 2. Cria preferência no Mercado Pago
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${loja.mp_access_token.trim()}`
      },
      body: JSON.stringify({
        items,
        payer: {
          name: payer?.name || "Cliente",
          email: payer?.email || "comprador@email.com",
          address: {
            street_name: payer?.address?.street_name || "Endereço não informado"
          }
        },
        payment_methods: {
          included_payment_types: [
            { id: "ticket" },
            { id: "bank_transfer" },
            { id: "credit_card" }
          ],
          installments: 12
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
      return {
        statusCode: mpResponse.status,
        headers,
        body: JSON.stringify({ erro: "Erro MP", detalhes: result })
      };
    }

    // 3. Salva pedido no Supabase
    await supabase.from('pedidos').insert({
      loja_id,
      cliente_id: cliente?.id || null,
      nome_cliente: cliente?.nome || payer?.name,
      whatsapp: cliente?.whatsapp || null,

      total: valor_total,
      frete: valor_frete,
      tipo_frete,
      status: "Pendente",
      metodo_pagamento: "Mercado Pago",
      mp_preference_id: result.id
    });

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
