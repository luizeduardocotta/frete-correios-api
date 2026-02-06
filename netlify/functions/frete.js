const fetch = require('node-fetch');

exports.handler = async (event) => {
    // 1. Configuração de Headers para evitar erro de CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // 2. Resposta para o navegador (Preflight OPTIONS)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        // 3. Validação do corpo da requisição
        if (!event.body) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ erro: "Corpo da requisição vazio" }) 
            };
        }

        const body = JSON.parse(event.body);
        
        // Limpa os CEPs (mantém apenas números)
        const cep_origem = body.cep_origem ? body.cep_origem.replace(/\D/g, "") : "";
        const cep_destino = body.cep_destino ? body.cep_destino.replace(/\D/g, "") : "";
        const itens = body.itens || [];

        if (cep_origem.length !== 8 || cep_destino.length !== 8) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ erro: "CEP inválido", detalhes: "Origem ou destino mal formatado" }) 
            };
        }

        // 4. Lógica de cálculo baseada nos itens que o seu HTML envia
        let pesoTotal = 0;
        let maxLargura = 11;
        let maxAltura = 2;
        let maxComprimento = 16;

        itens.forEach(item => {
            const qtd = parseInt(item.quantidade) || 1;
            // Note: usamos item.peso, item.largura etc, pois é como você mapeou no HTML
            pesoTotal += (parseFloat(item.peso) || 0.3) * qtd;
            maxLargura = Math.max(maxLargura, parseInt(item.largura) || 11);
            maxAltura = Math.max(maxAltura, (parseInt(item.altura) || 2) * qtd);
            maxComprimento = Math.max(maxComprimento, parseInt(item.comprimento) || 16);
        });

        // 5. Chamada para a API do Melhor Envio
        const meResponse = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
                "User-Agent": "Avant Digital (contato@avant.com.br)"
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

        // 6. Tratamento de erro da API externa
        if (!Array.isArray(data)) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    erro: "Erro Melhor Envio", 
                    detalhes: data.message || "Dados inválidos",
                    raw: data 
                })
            };
        }

        // 7. Retorno das opções de frete formatadas
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
        console.error("Erro interno:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ erro: "Erro interno na função", detalhes: err.message })
        };
    }
};

