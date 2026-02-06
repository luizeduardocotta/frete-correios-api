const fetch = require('node-fetch');

exports.handler = async (event) => {
    // Headers de CORS - ESSENCIAIS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Resposta imediata para o navegador liberar o acesso (Preflight)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        if (!event.body) {
            return { statusCode: 400, headers, body: JSON.stringify({ erro: "Corpo vazio" }) };
        }

        const body = JSON.parse(event.body);
        const cep_origem = body.cep_origem ? body.cep_origem.replace(/\D/g, "") : "";
        const cep_destino = body.cep_destino ? body.cep_destino.replace(/\D/g, "") : "";
        const itens = body.itens || [];

        if (cep_origem.length !== 8 || cep_destino.length !== 8) {
            return { statusCode: 400, headers, body: JSON.stringify({ erro: "CEP inválido" }) };
        }

        // Cálculo simplificado para teste
        let pesoTotal = 0;
        itens.forEach(i => pesoTotal += (parseFloat(i.peso) || 0.3) * (i.quantidade || 1));

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
                    width: 11, height: 11, length: 16,
                    insurance_value: 50, quantity: 1
                }]
            })
        });

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ opcoes: Array.isArray(data) ? data.filter(s => !s.error).map(s => ({
                nome: s.name,
                valor: parseFloat(s.price),
                prazo: s.delivery_time || s.deadline
            })) : [], raw: data })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ erro: err.message })
        };
    }
};
