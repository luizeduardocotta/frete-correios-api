const { createClient } = require('@supabase/supabase-js');

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

    // Buscar dados do pagamento no MP (opcional mas recomendado)
    // Aqui você pode pegar valor, status, email etc

    await supabase.from('pedidos').insert({
      mp_payment_id: paymentId,
      status: "Pago",
      metodo_pagamento: "Mercado Pago"
    });

    return { statusCode: 200, body: "ok" };

  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
