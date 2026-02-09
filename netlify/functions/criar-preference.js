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
      valor_total, // apenas debug
      cliente
    } = body;

    if (!items || !items.length) {
      throw new Error("Itens do pedido não informados");
    }

    if (!loja_id) {
      throw new Error("Loja não informada");
    }

    // 🔢 1️⃣ CALCULA TOTAL NO BACKEND
    const subtotal = items.reduce((acc, item) => {
      return acc + (Number(item.unit_price) * Number(item.quantity));
    }, 0);

    const frete = Number(valor_frete) || 0;
    const totalCalculado = Number((subtotal + frete).toFixed(2));

    if (!totalCalculado || totalCalculado <= 0) {
      throw new Error("Total inválido");
    }

    console.log("DEBUG PEDIDO:", {
      subtotal,
      frete,
      totalCalculado,
      valor_total_recebido: valor_total
    });

    // 2️⃣ CRIA PEDIDO PENDENTE
    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        loja_id,
        cliente_id: cliente?.id || null,
        nome_cliente: cliente?.nome || payer?.name || null,
        whatsapp: cliente?.whatsapp || null,
        total: totalCalculado,
        frete: frete,
        tipo_frete: tipo_frete || null,
        status: "Pendente",
        metodo_pagamento: "Mercado Pago"
      })
      .select()
      .single();

    if (erroPedido) {
      console.error("Erro Supabase (pedido):", erroPedido);
      throw new Error("Erro ao criar pedido");
    }

    // 3️⃣ SALVA ITENS DO PEDIDO 🔥🔥🔥
    const itensParaInserir = items.map(item => ({
      pedido_id: pedido.id,
      produto_id: item.id ? Number(item.id) : null,
      quantidade: Number(item.quantity),
      preco_unitario: Number(item.unit_price)
    }));

    const { error: erroItens } = await supabase
      .from('itens_pedido')
      .insert(itensParaInserir);

    if (erroItens) {
      console.error("Erro Supabase (itens):", erroItens);
      throw new Error("Erro ao salvar itens do pedido");
    }

    // 4️⃣ BUSCA TOKEN DO MP DA LOJA
    const { data: loja, error: erroLoja } = await supabase
      .from('lojas')
      .select('mp_access_token')
      .eq('id', loja_id)
      .single();

    if (erroLoja || !loja?.mp_access_token) {
      throw new Error("Token do Mercado Pago não configurado");
    }

    // 5️⃣ CRIA PREFERENCE NO MERCADO PAGO
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
          external_reference: String(pedido.id), // 🔥 referência interna
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
      console.error("Erro Mercado Pago:", result);
      throw new Error("Erro ao criar preferência no Mercado Pago");
    }

    // 6️⃣ ATUALIZA PEDIDO COM preference_id
    await supabase
      .from('pedidos')
      .update({ mp_preference_id: result.id })
      .eq('id', pedido.id);

    // 7️⃣ RETORNO FINAL
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        init_point: result.init_point,
        pedido_id: pedido.id
      })
    };

  } catch (err) {
    console.error("Erro geral criar-preference:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: err.message })
    };
  }
};
