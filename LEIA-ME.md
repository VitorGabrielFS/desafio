# Monetera Atendimento

Sistema de atendimento financeiro consultivo com IA generativa, interface mobile para o cliente e painel desktop para a equipe. A aplicação usa a API da Groq, mantém o contexto da conversa e possui estrutura para memória persistente de clientes empresariais.

## Funcionalidades

- Chat em formato de aplicativo mobile.
- Respostas geradas por LLM através da Groq.
- Histórico completo enviado ao modelo a cada mensagem.
- Prompt centralizado com personalidade, negociação financeira e escalonamento.
- Resposta estruturada em JSON.
- Encaminhamento para atendente com motivo e prioridade.
- Painel administrativo com fila, indicadores e detalhes do cliente.
- Conversa inicial com cliente empresarial já contextualizado.
- Painel da equipe recebe atualizações da conversa e solicitações de agenda.
- Estrutura D1 para clientes, conversas e mensagens.
- Modo demonstração quando não existe uma chave da Groq configurada.

## Requisitos

### Windows

- Windows 10 ou 11 de 64 bits.
- [Node.js LTS](https://nodejs.org/en/download), versão 22.13 ou superior.
- [Git para Windows](https://git-scm.com/install/windows.html), recomendado caso o projeto seja transferido por repositório.
- Navegador atualizado, como Chrome, Edge ou Firefox.

O npm já é instalado junto com o Node.js. Não instale React, Next.js, Vite ou Wrangler separadamente.

### macOS ou Linux

Instale Node.js LTS 22.13 ou superior e Git. Os comandos são os mesmos, mas use `npm` no lugar de `npm.cmd`.

## Instalação em uma nova máquina

### 1. Copiar o projeto

Copie a pasta completa para o novo computador. Não copie somente `app/`; arquivos como `package.json`, `vite.local.config.ts`, `worker/` e `.openai/` também são necessários.

Evite copiar estas pastas, pois serão recriadas:

- `node_modules/`
- `dist/`
- `.vinext/`
- `.wrangler/`

### 2. Confirmar as ferramentas

Abra o PowerShell dentro da pasta do projeto e execute:

```powershell
node --version
npm.cmd --version
git --version
```

O Node deve mostrar `v22.13.0` ou uma versão superior.

Se `node` ou `npm.cmd` não forem reconhecidos, feche e abra novamente o PowerShell após instalar o Node.js. Se ainda não funcionar, reinicie o Windows.

### 3. Instalar as dependências

No PowerShell, dentro da pasta que contém o `package.json`:

```powershell
npm.cmd install
```

Não use `npm install -g`. As dependências deste projeto devem ser instaladas localmente.

### 4. Criar uma chave da Groq

1. Entre no [console da Groq](https://console.groq.com/keys).
2. Crie uma nova API key.
3. Nunca envie a chave em conversa, commit, captura de tela ou repositório público.
4. Se uma chave for exposta, revogue-a e gere outra.

### 5. Configurar o ambiente

Na raiz do projeto, crie o arquivo `.env.local`. No Windows:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Preencha a linha sem aspas e sem espaços ao redor do sinal de igual:

```text
GROQ_API_KEY=gsk_sua_nova_chave_aqui
```

Salve e feche o Bloco de Notas. O arquivo `.env.local` é ignorado pelo Git e não deve ser compartilhado.

### 6. Iniciar o projeto

No Windows:

```powershell
npm.cmd run dev
```

No macOS ou Linux:

```bash
npm run dev
```

Abra o endereço exibido no terminal, normalmente:

```text
http://127.0.0.1:5173/
```

Mantenha o terminal aberto enquanto estiver usando o sistema. Para desligar o servidor, pressione `Ctrl + C`.

## Validar antes de entregar

Execute:

```powershell
npm.cmd run build
```

Uma compilação bem-sucedida termina com `Build complete`. O comando de desenvolvimento usa uma configuração local compatível com Windows; a compilação continua usando a configuração Cloudflare completa.

## Como saber se a Groq está funcionando

Envie uma mensagem no chat. Se a resposta variar conforme o contexto, a Groq está conectada.

Se aparecer repetidamente:

> Claro. Me conta qual ponto financeiro você quer priorizar: crédito, empréstimo, seguro empresarial ou organização do caixa.

a aplicação está no modo demonstração. Verifique se:

- o arquivo se chama exatamente `.env.local`, e não `.env.local.txt`;
- a linha começa com `GROQ_API_KEY=`;
- a chave não contém espaços ou aspas;
- o arquivo não está vazio;
- o servidor foi reiniciado depois da alteração.

## Erros comuns no Windows

### “npm não é reconhecido”

O Node.js ainda não foi instalado ou o terminal foi aberto antes da instalação. Instale o Node.js LTS e reinicie o PowerShell.

### “npm.ps1 não pode ser carregado”

Use `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run dev
```

Opcionalmente, para liberar scripts assinados para o usuário atual:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Essa mudança não é necessária se você continuar usando `npm.cmd`.

### “WRANGLER_LOG_PATH não é reconhecido”

A versão atual do projeto já foi corrigida para Windows. Confirme se o script `dev` no `package.json` contém:

```json
"dev": "vite --config vite.local.config.ts"
```

### “write EOF”

Confirme que o comando acima usa `vite`, não `vinext dev`. Feche processos antigos com `Ctrl + C` e tente novamente.

### A porta 5173 já está em uso

Use outra porta:

```powershell
npm.cmd run dev -- --port 5174
```

Depois abra `http://127.0.0.1:5174/`.

### O site abre, mas a IA não responde corretamente

Confira o terminal para mensagens de erro e valide a chave. Uma chave revogada, expirada ou sem cota não funcionará. Nunca coloque a chave diretamente em arquivos `.ts` ou `.tsx`.

## Comandos úteis

| Comando | Função |
|---|---|
| `npm.cmd install` | Instala as dependências no Windows |
| `npm.cmd run dev` | Inicia o ambiente local |
| `npm.cmd run build` | Compila e valida o projeto |
| `npm.cmd run lint` | Verifica padrões do código |
| `npm.cmd run db:generate` | Gera migrações após mudanças no banco |
| `Ctrl + C` | Encerra o servidor local |

No macOS ou Linux, substitua `npm.cmd` por `npm`.

## Estrutura principal

```text
app/
  api/chat/route.ts          Integração com Groq e resposta estruturada
  lib/system-prompt.ts       Personalidade e regras da IA
  ui/AtendimentoApp.tsx      Chat mobile e painel administrativo
  globals.css                Estilos das interfaces
db/schema.ts                 Estrutura do banco
drizzle/                     Migrações do banco
worker/index.ts              Entrada de produção Cloudflare
vite.local.config.ts         Ambiente local, inclusive no Windows
vite.config.ts               Compilação para Cloudflare
.env.example                 Modelo seguro de configuração
.openai/hosting.json         Declaração do banco D1
```

## Memória e banco de dados

O projeto declara um banco D1 chamado `DB`. A estrutura contém:

- `customers`: identificação, preferências e resumo do cliente;
- `conversations`: situação e motivo de encaminhamento;
- `messages`: histórico e metadados estruturados.

No modo local simplificado, a conversa em andamento fica na interface e o histórico é enviado à Groq. A persistência D1 é ativada no ambiente Cloudflare/Sites.

## Segurança

- Nunca versionar `.env.local`.
- Nunca colocar a API key no frontend.
- Revogar imediatamente chaves expostas.
- Solicitar somente os dados pessoais necessários.
- Não publicar históricos reais de clientes em ambientes de demonstração.
- Usar uma chave separada para desenvolvimento e produção.

## Atualização das dependências

Para uma instalação reproduzível, mantenha o `package-lock.json`. Em outra máquina, `npm.cmd install` utilizará as versões registradas nele.

Não atualize o npm global ou todas as dependências sem necessidade. Antes de qualquer atualização, faça uma cópia ou commit e execute novamente:

```powershell
npm.cmd run build
```

## Transferência rápida para outra máquina

1. Copie a pasta do projeto sem `node_modules`, `dist`, `.vinext` e `.wrangler`.
2. Instale Node.js LTS.
3. Execute `npm.cmd install`.
4. Crie `.env.local` usando `.env.example`.
5. Informe uma chave Groq nova.
6. Execute `npm.cmd run dev`.
7. Abra o endereço exibido.

Com esses passos, nenhuma configuração global adicional é necessária.

