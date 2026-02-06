const fetch = require('node-fetch');

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    try {
        if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ erro: "Corpo vazio" }) };

        const body = JSON.parse(event.body);
        const cep_origem = body.cep_origem ? body.cep_origem.replace(/\D/g, "").substring(0, 8) : "";
        const cep_destino = body.cep_destino ? body.cep_destino.replace(/\D/g, "").substring(0, 8) : "";
        const itens = body.itens || [];

        let pesoTotal = 0;
        let maxLargura = 11, maxAltura = 2, maxComprimento = 16;

        itens.forEach(item => {
            const qtd = parseInt(item.quantidade) || 1;
            pesoTotal += (parseFloat(item.peso) || 0.3) * qtd;
            maxLargura = Math.max(maxLargura, parseInt(item.largura) || 11);
            maxAltura = Math.max(maxAltura, (parseInt(item.altura) || 2) * qtd);
            maxComprimento = Math.max(maxComprimento, parseInt(item.comprimento) || 16);
        });

        const meResponse = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
                "User-Agent": "Avant Shop"
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
                    insurance_value: 50,
                    quantity: 1
                }]
            })
        });

        const data = await meResponse.json();

        if (data.errors || data.message === "The given data was invalid.") {
            return {
                statusCode: 200, 
                headers,
                body: JSON.stringify({ erro: "Erro nos dados", causa: data.errors || data.message })
            };
        }

        const opcoes = Array.isArray(data) ? data
            .filter(s => !s.error && s.price)
            .map(s => ({
                nome: s.name,
                valor: parseFloat(s.price),
                prazo: s.delivery_time || s.deadline
            })) : [];

        return { statusCode: 200, headers, body: JSON.stringify({ opcoes }) };

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message }) };
    }
};
