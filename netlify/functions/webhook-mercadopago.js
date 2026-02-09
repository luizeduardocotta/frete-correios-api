const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    // Mercado Pago envia POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body);

    // Só processa pagamentos
    if (body.type !== "payment") {
      return { statusCode: 200, body: "Evento ignorado" };
    }

    const paymentId = body.data.id;

    // 🔎 Busca pagamento no Mercado Pago
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN_MASTER}`
        }
      }
    );

    const payment = await mpRes.json();

    // Processa somente pagamento aprovado
    if (payment.status !== "approved") {
      return { statusCode: 200, body: "Pagamento ainda não aprovado" };
    }

    const preferenceId = payment.order?.id;

    if (!preferenceId) {
      return { statusCode: 200, body: "Preference não encontrada" };
    }

    // 🔎 Localiza pedido existente (criado no criar-preference)
    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .select('id, status')
      .eq('mp_preference_id', preferenceId)
      .single();

    if (erroPedido || !pedido) {
      return { statusCode: 200, body: "Pedido não localizado" };
    }

    // 🛑 Evita reprocessar
    if (pedido.status === "PAGO") {
      return { statusCode: 200, body: "Pedido já confirmado" };
    }

    // ✅ Atualiza pedido
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

