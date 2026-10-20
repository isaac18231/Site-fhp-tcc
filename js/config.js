/* Configuração dos pagamentos.
   apiUrl vazio  → checkout em modo simulado (nenhum valor é cobrado).
   apiUrl com o endereço do servidor (ex.: 'https://fhp-fibra.onrender.com')
                 → cobrança de verdade pelo Mercado Pago. Veja PAGAMENTOS.md. */
window.FHP_CONFIG = {
  apiUrl: '',
  // WhatsApp de atendimento com DDI e DDD, só números. Vazio esconde os botões de WhatsApp.
  whatsapp: '5521980611600'
};
