export default async function handler(req, res) {
  // Apenas aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Substitua pela URL do Web App gerada na Fase 1
  const GAS_URL = process.env.GAS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbxT4VCfIyGA-RXf1pnxvmqvevZX_MmsZvkKCed9gmnlKsDhcqgvmipqr4l47jxa7Mmn0g/exec';

  try {
    const gasResponse = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        // Envia como text/plain para contornar preflight se necessário, 
        // mas o fetch do backend lida bem com isso
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });

    const data = await gasResponse.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro na comunicação com o GAS:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}