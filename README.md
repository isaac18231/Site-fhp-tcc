# FHP Fibra — Projeto demonstrativo

Site institucional e painel de acesso da FHP Fibra, desenvolvido exclusivamente com HTML5, CSS3 e JavaScript puro. Para executar, abra `index.html` diretamente no navegador.

## Acessos demonstrativos

| Nível | Usuário | Senha |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Funcionário | `funcionario` | `123456` |
| Cliente | `cliente` | `123456` |

Os planos, valores, velocidades, tabelas, gráficos e registros são demonstrativos e foram incluídos exclusivamente para apresentação acadêmica. Não representam informações comerciais ou estatísticas oficiais da FHP Fibra.

Esta versão utiliza `localStorage` para fins demonstrativos. Um sistema real de autenticação com banco de dados exigiria um backend e armazenamento seguro de senhas.

## Assistente com IA (opcional)

O assistente do site pode responder qualquer pergunta usando a IA da Anthropic. Sem isso, ele continua funcionando com respostas prontas.

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou superior).
2. Crie uma chave de API em console.anthropic.com.
3. Copie `.env.example` para `.env` e troque `cole-sua-chave-aqui` pela sua chave.
4. Execute `iniciar.bat` (Windows) ou `./iniciar.sh` (Mac/Linux), ou `node server.js` no terminal.
5. Acesse `http://localhost:3000`.

Nunca coloque a chave nos arquivos `.js` do site nem compartilhe o arquivo `.env`.
