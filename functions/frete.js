export async function handler(event) {
  try {
    const body = JSON.parse(event.body);

    const { cep_origem, cep_destino, peso, comprimento, altura, largura } = body;

    const response = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer SUA_API_MELHORENVIO",
        "User-Agent": "Avant Digital"
      },
      body: JSON.stringify({
        from: { postal_code: cep_origem },
        to: { postal_code: cep_destino },
        products: [{
          weight: peso,
          width: largura,
          height: altura,
          length: comprimento,
          insurance_value: 50,
          quantity: 1
        }]
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}