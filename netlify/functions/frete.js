export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { cep_origem, cep_destino, itens } = body;

    if (!cep_origem || !cep_destino || !Array.isArray(itens) || itens.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ erro: "Dados incompletos", recebido: body })
      };
    }

    // Soma pesos e calcula volume
    let pesoTotal = 0;
    let volume = { largura: 0, altura: 0, comprimento: 0 };

    itens.forEach(p => {
      pesoTotal += Number(p.peso) || 0.3;
      volume.largura = Math.max(volume.largura, Number(p.largura) || 11);
      volume.altura = Math.max(volume.altura, Number(p.altura) || 11);
      volume.comprimento = Math.max(volume.comprimento, Number(p.comprimento) || 16);
    });

    const response = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
        "User-Agent": "Avant Digital"
      },
      body: JSON.stringify({
        from: { postal_code: cep_origem },
        to: { postal_code: cep_destino },
        products: [{
          weight: pesoTotal,
          width: volume.largura,
          height: volume.altura,
          length: volume.comprimento,
          insurance_value: 50,
          quantity: 1
        }]
      })
    });

    const data = await response.json();
    console.log("Resposta bruta do Melhor Envio:", JSON.stringify(data));

    // Se não for array, o Melhor Envio retornou um erro (ex: Token Inválido)
    if (!Array.isArray(data)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          erro: "Erro na comunicação com Melhor Envio", 
          detalhes: data.message || "Verifique o Token na Netlify",
          raw: data 
        })
      };
    }

    const opcoes = data
      .filter(s => !s.error) 
      .map(s => ({
        nome: s.name,
        valor: Number(s.price),
        prazo: Number(s.delivery_time || s.deadline)
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ opcoes })
    };

  } catch (err) {
    console.error("Erro na function:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: err.message })
    };
  }
}