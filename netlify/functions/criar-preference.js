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

    // 1️⃣ Cria pedido PENDENTE
    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        loja_id,
        cliente_id: cliente?.id || null,
        nome_cliente: cliente?.nome || payer?.name,
        whatsapp: cliente?.whatsapp || null,
        total: valor_total,
        frete: valor_frete,
        tipo_frete,
        status: "PENDENTE",
        metodo_pagamento: "Mercado Pago"
      })
      .select()
      .single();

    if (erroPedido) {
      throw new Error("Erro ao criar pedido");
    }

    // 2️⃣ Busca token do Mercado Pago
    const { data: loja, error: erroLoja } = await supabase
      .from('lojas')
      .select('mp_access_token')
      .eq('id', loja_id)
      .single();

    if (erroLoja || !loja?.mp_access_token) {
      throw new Error("Token do Mercado Pago não configurado");
    }

    // 3️⃣ Cria preferência no Mercado Pago
    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${loja.mp_access_token.trim()}`
        },
        body: JSON.stringify({
          items,
          payer,
          back_urls: {
            success: "https://portallagoasanta.com.br/",
            failure: "https://portallagoasanta.com.br/",
            pending: "https://portallagoasanta.com.br/"
          },
          auto_return: "approved"
        })
      }
    );

    const result = await mpResponse.json();

    if (!mpResponse.ok) {
      throw new Error("Erro ao criar preferência no Mercado Pago");
    }

    // 4️⃣ Atualiza pedido com preference_id
    await supabase
      .from('pedidos')
      .update({ mp_preference_id: result.id })
      .eq('id', pedido.id);

    // 5️⃣ Retorna init_point
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        init_point: result.init_point,
        pedido_id: pedido.id
      })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: err.message })
    };
  }
};
