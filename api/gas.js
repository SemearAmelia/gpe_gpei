export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // COLOQUE A NOVA URL GERADA NO PASSO 7 AQUI DENTRO DAS ASPAS
  const GAS_URL = 'https://script.google.com/macros/s/AKfy.../exec';

  try {
    const gasResponse = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    // Pega o texto puro antes de converter, para evitar quebra se o Google mandar HTML
    const text = await gasResponse.text();
    
    try {
      const data = JSON.parse(text);
      res.status(200).json(data);
    } catch (e) {
      // Se não conseguiu converter para JSON, é porque o Google bloqueou a requisição
      console.error('Resposta não-JSON do Google:', text);
      res.status(500).json({ 
        error: 'Conexão recusada pelo banco de dados. Verifique se o Apps Script foi implantado para "Qualquer pessoa".' 
      });
    }
  } catch (error) {
    console.error('Erro no Fetch:', error);
    res.status(500).json({ error: 'Erro de comunicação entre o Vercel e o Google.' });
  }
}