const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    if (body.type !== "payment") {
      return { statusCode: 200, body: "ok" };
    }

    const paymentId = body.data.id;

    // 🔎 Buscar pagamento no Mercado Pago
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN_MASTER}`
        }
      }
    );

    const payment = await mpRes.json();

    if (payment.status !== "approved") {
      return { statusCode: 200, body: "Pagamento não aprovado ainda" };
    }

    // 🛑 Evita duplicar pedido
    const { data: existente } = await supabase
      .from('pedidos')
      .select('id')
      .eq('mp_payment_id', paymentId)
      .single();

    if (existente) {
      return { statusCode: 200, body: "Pedido já registrado" };
    }

    // ✅ Cria pedido definitivo
    await supabase.from('pedidos').insert({
      mp_payment_id: paymentId,
      mp_preference_id: payment.order?.id || null,
      status: "Pago",
      metodo_pagamento: payment.payment_method_id,
      total: payment.transaction_amount,
      email_cliente: payment.payer?.email || null
    });

    return { statusCode: 200, body: "Pedido salvo com sucesso" };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};

