# Testes ponta a ponta

A suíte usa Playwright com Chromium e executa o fluxo completo em um ambiente
isolado:

1. primeiro login do administrador e troca obrigatória de senha;
2. cadastro de loja e fornecedor;
3. cadastro de matéria-prima e produto fabricado;
4. definição da composição do produto;
5. registro e recebimento de compra;
6. conferência do estoque recebido;
7. produção e baixa da matéria-prima;
8. abertura de caixa;
9. venda pelo PDV e recebimento em dinheiro;
10. baixa do produto vendido e fechamento do caixa.

## Pré-requisitos

- PostgreSQL do projeto disponível na porta configurada no `server/.env`;
- dependências do workspace instaladas com `npm ci` na raiz;
- Chromium do Playwright instalado:

```bash
npx playwright install chromium
```

## Executar

```bash
npm run test:e2e
```

Para acompanhar e depurar o teste pela interface do Playwright:

```bash
npm run test:e2e:ui --workspace=pdv-carlos-client
```

Para assistir ao Chromium executando os cliques e preenchimentos:

```bash
npm run test:e2e:headed --workspace=pdv-carlos-client
```

O modo visual desativa a gravação de vídeo e trace durante a execução para não
disputar recursos com a janela do Chromium. Capturas de tela continuam sendo
geradas em caso de falha.

A execução recria somente o banco `pdv_carlos_e2e`, sobe o backend na porta
`3101` e o frontend na porta `5174`. O script recusa bancos cujo nome não
termine com `_e2e`.

Em caso de falha, o relatório HTML fica em `client/playwright-report` e os
traces, vídeos e capturas ficam em `client/test-results`.
