# FHP Fibra — Projeto acadêmico

Site institucional e painel de acesso da FHP Fibra, desenvolvido exclusivamente com HTML5, CSS3 e JavaScript puro. Para executar, abra `index.html` diretamente no navegador.

## Acessos de teste

| Nível | Usuário | Senha |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Funcionário | `funcionario` | `123456` |
| Cliente | `cliente` | `123456` |

Os planos, valores, velocidades, tabelas, gráficos e registros são de teste e foram incluídos exclusivamente para apresentação acadêmica. Não representam informações comerciais ou estatísticas oficiais da FHP Fibra.

Esta versão utiliza `localStorage` para fins de teste. Um sistema real de autenticação com banco de dados exigiria um backend e armazenamento seguro de senhas.

## Checkout, faturas e pagamento

O botão **ASSINAR** de cada plano residencial abre `checkout.html`, que leva a pessoa por quatro etapas: dados da conta, endereço de instalação, pagamento da 1ª mensalidade e confirmação. No painel, a página **Faturas** lista as mensalidades e permite pagar cada uma.

Há dois modos:

- **Simulado** (padrão): nenhum valor é cobrado e nenhum dado sai do navegador. Detalhes abaixo.
- **Mercado Pago**: cobrança real (ou no modo de teste do Mercado Pago) com Pix, cartão e boleto. O passo a passo para ligar está em [PAGAMENTOS.md](PAGAMENTOS.md).

### Modo simulado

| Forma | O que acontece |
| --- | --- |
| Pix | Gera um QR Code e um código "copia e cola" de teste, válidos por 10 minutos. O botão **Simular pagamento confirmado** conclui o pedido. |
| Cartão de crédito | Valida número, validade e CVV e simula a resposta da operadora. |
| Boleto | Gera um boleto de teste com vencimento em 3 dias. Dá para **simular a compensação** ou **concluir e pagar depois** (o plano fica aguardando pagamento e o painel do cliente mostra o botão **Concluir pagamento**). |

Dados para testar:

| Dado | Valor | Resultado |
| --- | --- | --- |
| CPF | `529.982.247-25` | CPF válido de exemplo |
| Cartão | `4111 1111 1111 1111` | Aprovado (Visa) |
| Cartão | `5555 5555 5555 4444` | Aprovado (Mastercard) |
| Cartão | `4000 0000 0000 0002` | Recusado pelo emissor |
| Cartão | `4000 0000 0000 9995` | Limite insuficiente |

Use qualquer nome, validade futura e CVV de 3 dígitos.

Como funciona por dentro:

- `checkout.html`, `css/checkout.css` e `js/checkout.js` formam a página; `js/qrcode.js` desenha o QR Code sem bibliotecas externas.
- Os pedidos ficam em `localStorage`, na chave `fhp_pagamentos`. As funções estão em `js/fhp.js` (`createOrder`, `updateOrder`, `confirmPayment`, `deferPayment`).
- O número e o CVV do cartão nunca são gravados: o pedido guarda só a bandeira e os 4 últimos dígitos.
- Os planos empresariais não têm preço publicado, então o checkout encaminha para o Fale Conosco.

No modo simulado, o código Pix e a linha do boleto não seguem os padrões bancários e não podem ser pagos. Para cobrar de verdade, siga o [PAGAMENTOS.md](PAGAMENTOS.md).

## WhatsApp

O número de atendimento fica em `js/config.js` (`whatsapp: '5521980611600'`, com DDI e DDD, só números). Deixe vazio para esconder tudo. Com o número preenchido, o site mostra:

- um botão flutuante em todas as páginas, acima do botão do assistente, com uma mensagem pronta conforme a página (plano, pedido ou fatura no checkout, nome do cliente no painel);
- o atalho "Dúvidas? Fale no WhatsApp" em cada plano ("Pedir proposta" nos empresariais);
- o WhatsApp como primeiro canal no Fale Conosco, no rodapé e no cartão "Precisa de ajuda?" do painel;
- o link do WhatsApp nas respostas do assistente sobre contato, contratação e cobertura.

Os botões só abrem a conversa (wa.me); as mensagens são respondidas no WhatsApp da FHP. O código está em `js/whatsapp.js` e `css/whatsapp.css`.

## Assistente com IA (opcional)

O assistente do site pode responder qualquer pergunta usando a IA da Anthropic. Sem isso, ele continua funcionando com respostas prontas.

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou superior).
2. Crie uma chave de API em console.anthropic.com.
3. Copie `.env.example` para `.env` e troque `cole-sua-chave-aqui` pela sua chave (o mesmo arquivo guarda as chaves do Mercado Pago).
4. Execute `iniciar.bat` (Windows) ou `./iniciar.sh` (Mac/Linux), ou `node server.js` no terminal.
5. Acesse `http://localhost:3000`.

Nunca coloque a chave nos arquivos `.js` do site nem compartilhe o arquivo `.env`.
