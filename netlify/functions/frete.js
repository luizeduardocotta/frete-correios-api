const fetch = require('node-fetch');

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
        if (!event.body) {
            return { statusCode: 400, headers, body: JSON.stringify({ erro: "Corpo vazio" }) };
        }

        const body = JSON.parse(event.body);
        
        // Limpeza rigorosa dos CEPs
        const cep_origem = body.cep_origem ? body.cep_origem.replace(/\D/g, "") : "";
        const cep_destino = body.cep_destino ? body.cep_destino.replace(/\D/g, "") : "";
        const itens = body.itens || [];

        // Validação de CEP
        if (cep_origem.length !== 8 || cep_destino.length !== 8) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ erro: "CEP inválido", detalhes: "O CEP deve ter 8 dígitos." }) 
            };
        }

        // 4. Cálculo de Peso e Dimensões baseado no seu HTML
        let pesoTotal = 0;
        let maxLargura = 11;
        let maxAltura = 2;
        let maxComprimento = 16;

        itens.forEach(item => {
            const qtd = parseInt(item.quantidade) || 1;
            // O seu HTML envia 'peso', 'largura', 'altura', 'comprimento'
            pesoTotal += (parseFloat(item.peso) || 0.3) * qtd;
            
            // O Melhor Envio exige dimensões mínimas. Se o produto for menor, usamos o mínimo.
            maxLargura = Math.max(maxLargura, parseInt(item.largura) || 11);
            maxAltura = Math.max(maxAltura, (parseInt(item.altura) || 2) * qtd);
            maxComprimento = Math.max(maxComprimento, parseInt(item.comprimento) || 16);
        });

        // 5. Chamada para o Melhor Envio
        const meResponse = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
                "User-Agent": "Avant Digital (suporte@avant.com.br)"
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

        // Se a API retornar erro de validação (o seu erro atual)
        if (data.errors) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    erro: "Dados rejeitados pelo Melhor Envio", 
                    detalhes: "Verifique se o peso ou dimensões dos produtos no banco estão corretos.",
                    causa: data.errors 
                })
            };
        }

        const opcoes = Array.isArray(data) ? data
            .filter(s => !s.error && s.price)
            .map(s => ({
                nome: s.name,
                valor: parseFloat(s.price),
                prazo: s.delivery_time || s.deadline
            })) : [];

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
};
