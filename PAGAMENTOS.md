# Pagamentos com Mercado Pago — guia de implantação

O site tem dois modos de pagamento:

| Modo | Quando acontece | O que cobra |
| --- | --- | --- |
| **Simulado** | `js/config.js` com `apiUrl: ''` (padrão) | Nada. Pix, cartão e boleto são de mentira, para apresentação. |
| **Mercado Pago** | `js/config.js` apontando para o servidor | De verdade (ou no modo de teste do Mercado Pago, sem dinheiro real). |

No modo Mercado Pago:

- **Assinatura:** o botão **ASSINAR** cobra a 1ª mensalidade. O cliente vai para o ambiente do Mercado Pago (Checkout Pro), escolhe **Pix, cartão ou boleto** e volta para o site, que confere o pagamento com o servidor.
- **Faturas mensais:** a página **Faturas** do painel do cliente lista as mensalidades (vencidas, em aberto, em processamento e pagas), cada uma com o botão **Pagar**.
- **Pagamento confirmado depois:** se o Pix ou o boleto for pago mais tarde, o painel confere sozinho com o Mercado Pago na próxima vez que o cliente entrar.

O GitHub Pages só hospeda páginas, então a parte que conversa com o Mercado Pago roda num servidor à parte, o `server.js`, que já existia no projeto. Este guia usa o plano gratuito do Render.

```
Navegador (GitHub Pages)  ──►  Servidor (Render)  ──►  Mercado Pago
  checkout.html, painel        server.js               cria a cobrança,
  js/config.js → apiUrl        servidor/pagamentos.js  guarda os pagamentos
```

A chave secreta do Mercado Pago (Access Token) fica **só** no servidor. O preço de cada plano também vem do servidor (`servidor/pagamentos.js`), nunca do navegador.

---

## 1. Criar a aplicação no Mercado Pago

1. Entre em **mercadopago.com.br/developers** com a conta que vai **receber** o dinheiro. Para cobrar de clientes de verdade, use a conta da empresa (CNPJ).
2. Abra **Suas integrações → Criar aplicação**. Escolha **Pagamentos online** e o produto **Checkout Pro**.
3. Dentro da aplicação, abra **Credenciais de teste** e copie o **Access Token**. É ele que vai no servidor.
4. Em **Contas de teste**, crie uma conta de **comprador**. Você vai usá-la para "pagar" sem dinheiro real.

> O Access Token é uma senha. Nunca coloque o token em arquivos do site (`js/...`), no GitHub ou em mensagens.

## 2. Colocar o servidor no ar (Render, gratuito)

1. Crie uma conta em **render.com** entrando com o GitHub.
2. Clique em **New → Blueprint** e escolha o repositório do site. O arquivo `render.yaml` já traz a configuração.
3. O Render pede os valores das variáveis. Preencha:

   | Variável | Valor |
   | --- | --- |
   | `MP_ACCESS_TOKEN` | o Access Token do passo 1 |
   | `MP_AMBIENTE` | `teste` (já vem preenchido) |
   | `SITE_ORIGINS` | `https://isaac18231.github.io` (já vem preenchido) |
   | `PUBLIC_URL` | deixe vazio por enquanto |
   | `MP_WEBHOOK_SECRET` | deixe vazio por enquanto (passo 3) |
   | `ANTHROPIC_API_KEY` | opcional, só para o assistente com IA |

4. Quando o deploy terminar, o Render mostra o endereço do serviço, algo como `https://fhp-fibra.onrender.com`. Volte em **Environment**, coloque esse endereço em `PUBLIC_URL` e salve. O serviço reinicia sozinho.
5. Abra `https://SEU-SERVICO.onrender.com/api/pagamentos/config` no navegador. Deve aparecer `{"ativo":true,"ambiente":"teste"}`.

> **Plano gratuito do Render:** o servidor "dorme" depois de 15 minutos sem uso e leva cerca de 1 minuto para acordar. O checkout já avisa o cliente quando isso acontece. Para uma operação de verdade, vale um plano pago, que fica sempre ligado.

## 3. Notificações (webhook) — recomendado

O site confere o status direto no Mercado Pago, então funciona sem este passo. As notificações deixam a confirmação mais rápida e ficam registradas no log do servidor.

1. Na aplicação do Mercado Pago, abra **Webhooks → Configurar notificações**.
2. Em URL, coloque `https://SEU-SERVICO.onrender.com/api/pagamentos/webhook` e marque o evento **Pagamentos**.
3. Copie a **assinatura secreta**, cole em `MP_WEBHOOK_SECRET` no Render e salve.

Com a assinatura configurada, o servidor recusa (erro 401) notificações que não vieram do Mercado Pago.

## 4. Ligar o site ao servidor

1. Abra `js/config.js` e troque a linha do `apiUrl`:

   ```js
   window.FHP_CONFIG = {
     apiUrl: 'https://SEU-SERVICO.onrender.com'
   };
   ```

2. Envie o arquivo para o GitHub. Em um ou dois minutos o checkout mostra **"Modo de teste do Mercado Pago"** e o botão **Pagar com Mercado Pago**.

## 5. Testar

1. Abra o site numa **janela anônima** e assine um plano.
2. No Mercado Pago, entre com a **conta de teste de comprador** do passo 1.
3. Pague com um dos **cartões de teste** da documentação do Mercado Pago (procure por "cartões de teste"). O nome do titular decide o resultado: `APRO` aprova e `OTHE` recusa.
4. Confira:
   - a volta ao site com **Pagamento aprovado**;
   - **Meu plano** com o plano ativo;
   - **Faturas** com a 1ª mensalidade paga;
   - o pagamento listado na conta do Mercado Pago (área de vendas de teste).

Se algo falhar, veja o **Logs** do serviço no Render. As linhas começam com `[mercado pago]`.

## 6. Passar a cobrar de verdade

Faça isso só depois de testar tudo:

1. Na aplicação do Mercado Pago, ative as **Credenciais de produção** e copie o **Access Token de produção**.
2. No Render, troque `MP_ACCESS_TOKEN` por esse token e mude `MP_AMBIENTE` para `producao`.
3. Antes de abrir para clientes:
   - troque os planos e preços de teste pelos oficiais nos **dois** lugares: `js/fhp.js` (o que aparece no site) e `servidor/pagamentos.js` (o que é cobrado);
   - tire do site os avisos de "projeto acadêmico";
   - publique termos de contratação e política de privacidade.

---

## O que este sistema ainda não faz

- **Contas ficam no navegador.** Cadastro, login e pedidos continuam no `localStorage`, como no resto do projeto. O painel do administrador não enxerga pagamentos feitos em outros aparelhos. O registro oficial de quem pagou é a conta do Mercado Pago. Para operar com clientes de verdade, as contas precisam ir para um banco de dados no servidor, com senhas protegidas.
- **Sem débito automático.** As faturas aparecem no painel e o cliente paga cada uma. Não há cobrança automática no cartão todo mês, nem lembrete por e-mail ou WhatsApp.
- **Trocar de plano recomeça a lista de faturas** a partir do mês da troca.
- **Estornos e reembolsos** são feitos pelo painel do Mercado Pago.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `js/config.js` | Liga o modo Mercado Pago (`apiUrl`) |
| `js/checkout.js` | Assinatura e pagamento de fatura, nos dois modos |
| `js/painel.js` | Página **Faturas** e conferência de pagamentos pendentes |
| `js/fhp.js` | Pedidos, faturas mensais e conexão com o servidor |
| `server.js` | Servidor do site (assistente com IA + pagamentos) |
| `servidor/pagamentos.js` | Rotas do Mercado Pago: criar cobrança, consultar status, webhook |
| `render.yaml`, `package.json` | Configuração para o Render |
| `.env.example` | Modelo das variáveis para rodar no computador |

### Rodar no computador

1. Copie `.env.example` para `.env` e preencha `MP_ACCESS_TOKEN` com o token **de teste**.
2. Rode `iniciar.bat` (Windows) ou `node server.js` e abra `http://localhost:3000`.

Aberto pelo próprio servidor, o site usa o Mercado Pago sem mexer no `js/config.js`. Há um detalhe: o Mercado Pago não devolve o cliente para endereços `localhost`. A cobrança é criada normalmente, mas o retorno automático só funciona com o site publicado.

### Rotas do servidor

| Rota | Uso |
| --- | --- |
| `GET /api/pagamentos/config` | Diz se os pagamentos estão ativos e em qual ambiente |
| `POST /api/pagamentos/preferencia` | Cria a cobrança no Mercado Pago e devolve o link de pagamento |
| `POST /api/pagamentos/status` | Consulta a situação de até 30 cobranças |
| `POST /api/pagamentos/webhook` | Recebe as notificações do Mercado Pago (com assinatura) |
