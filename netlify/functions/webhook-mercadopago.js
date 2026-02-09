const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body);

    if (body.type !== "payment") {
      return { statusCode: 200, body: "Evento ignorado" };
    }

    const paymentId = body.data.id;

    // 🔎 1️⃣ Busca pagamento (primeiro sem token da loja ainda)
    const mpResMaster = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN_MASTER}`
        }
      }
    );

    const payment = await mpResMaster.json();

    if (payment.status !== "approved") {
      return { statusCode: 200, body: "Pagamento não aprovado" };
    }

    // 🔥 2️⃣ Pedido vem do external_reference
    const pedidoId = Number(payment.external_reference);

    if (!pedidoId) {
      return { statusCode: 200, body: "Pedido não identificado" };
    }

    // 🔎 3️⃣ Busca pedido
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, loja_id, status')
      .eq('id', pedidoId)
      .single();

    if (!pedido) {
      return { statusCode: 200, body: "Pedido não encontrado" };
    }

    if (pedido.status === "PAGO") {
      return { statusCode: 200, body: "Pedido já processado" };
    }

    // 🔎 4️⃣ Busca token da loja
    const { data: loja } = await supabase
      .from('lojas')
      .select('mp_access_token')
      .eq('id', pedido.loja_id)
      .single();

    if (!loja?.mp_access_token) {
      throw new Error("Token MP da loja não encontrado");
    }

    // ✅ 5️⃣ Atualiza pedido
    await supabase
      .from('pedidos')
      .update({
        status: "PAGO",
        mp_payment_id: payment.id,
        metodo_pagamento: payment.payment_method_id,
        total: payment.transaction_amount,
        email_cliente: payment.payer?.email || null
      })
      .eq('id', pedido.id);

    return { statusCode: 200, body: "Pedido atualizado com sucesso" };

  } catch (err) {
    console.error("Webhook MP erro:", err);
    return { statusCode: 500, body: err.message };
  }
};
