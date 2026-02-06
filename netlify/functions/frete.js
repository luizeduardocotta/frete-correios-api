const fetch = require('node-fetch');

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // 1. Resposta para o Preflight (CORS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Corpo vazio" }) };
    }

    const body = JSON.parse(event.body);
    
    // Limpeza de CEP: Remove traços e espaços
    const cep_origem = body.cep_origem ? body.cep_origem.replace(/\D/g, "") : "";
    const cep_destino = body.cep_destino ? body.cep_destino.replace(/\D/g, "") : "";
    const itens = body.itens || [];

    // 2. Validação básica
    if (cep_origem.length !== 8 || cep_destino.length !== 8 || itens.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          erro: "Dados inválidos", 
          detalhes: "Verifique os CEPs (8 dígitos) e se o carrinho não está vazio." 
        })
      };
    }

    // 3. Cálculo de Peso e Dimensões (Lógica de Cubagem)
    let pesoTotal = 0;
    let maxLargura = 11;
    let maxAltura = 2; // Mínimo Melhor Envio
    let maxComprimento = 16;

    itens.forEach(item => {
      const q = parseInt(item.quantidade) || 1;
      pesoTotal += (parseFloat(item.peso) || 0.3) * q;
      
      // Para dimensões, pegamos o maior lado dos itens no carrinho
      maxLargura = Math.max(maxLargura, parseInt(item.largura) || 11);
      maxAltura = Math.max(maxAltura, (parseInt(item.altura) || 2) * q); // Altura acumula se empilhar
      maxComprimento = Math.max(maxComprimento, parseInt(item.comprimento) || 16);
    });

    // 4. Chamada ao Melhor Envio
    const meResponse = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
        "User-Agent": "Avant Digital (contato@seudominio.com)"
      },
      body: JSON.stringify({
        from: { postal_code: cep_origem },
        to: { postal_code: cep_destino },
        products: [{
          id: "carrinho",
          weight: pesoTotal,
          width: maxLargura,
          height: maxAltura,
          length: maxComprimento,
          insurance_value: 50, // Seguro mínimo
          quantity: 1
        }]
      })
    });

    const data = await meResponse.json();

    if (!Array.isArray(data)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          erro: "Erro Melhor Envio", 
          detalhes: data.message || "Resposta inválida",
          raw: data 
        })
      };
    }

    // 5. Filtrar apenas opções válidas
    const opcoes = data
      .filter(s => !s.error && s.price)
      .map(s => ({
        nome: s.name,
        valor: parseFloat(s.price),
        prazo: s.delivery_time || s.deadline
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ opcoes })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: "Erro interno", detalhes: err.message })
    };
  }
}
