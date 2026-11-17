# InDesign MCP para Windows — base 0.1.0

Adaptação local de [lucdesign/indesign-mcp-server](https://github.com/lucdesign/indesign-mcp-server),
mantendo a licença MIT e o catálogo de 51 ferramentas. Substitui AppleScript/osascript
por Windows PowerShell 5.1 em modo STA e automação COM do InDesign.

Fluxo: **Codex → MCP/STDIO → Node.js → PowerShell/COM → InDesign/ExtendScript**.
Não exige Python, VBScript ou um painel UXP.

## Estado validado

Em 17/11/2026, no Windows deste computador:

- 7 testes automatizados aprovados.
- Inicialização de cliente e servidor MCP por STDIO; catálogo com 51 ferramentas.
- Comunicação real com InDesign 2026, versão 21.6.0.57.
- Criação de documento A4, texto com acentos e múltiplas linhas, leitura do documento
  e do texto, salvamento INDD e exportação PDF.
- Os arquivos produzidos foram verificados quanto à existência e tamanho; o PDF
  também teve sua assinatura de formato verificada. O teste não faz revisão visual.

As demais ferramentas são herdadas e ainda precisam de testes reais por recurso
(GREP, tabelas, estilos avançados, data merge, EPUB, empacotamento etc.).
Esta é uma base de desenvolvimento, não uma certificação das 51 ferramentas.
O InDesign 2027 foi detectado no computador, mas não foi validado neste ciclo.

## Requisitos

- Windows, com InDesign instalado, licenciado e registrado como servidor COM.
- Node.js 20 ou superior e npm.
- Windows PowerShell 5.1, incluído no Windows.
- Codex ou outro cliente MCP com transporte STDIO.

Não precisa de chave da API da Adobe para a automação local.

## Instalação e diagnóstico

Abra o PowerShell nesta pasta:

~~~powershell
npm ci --ignore-scripts
npm test
$env:INDESIGN_PROGID = 'InDesign.Application.2026'
$env:INDESIGN_ALLOW_LAUNCH = '1'
npm run doctor
~~~

O diagnóstico lê versão, quantidade de documentos abertos e texto de teste.
INDESIGN_ALLOW_LAUNCH=1 permite a ativação COM, que pode abrir o InDesign. Sem essa
opção, a ponte tenta apenas GetActiveObject. Algumas instalações não registram
a instância aberta na tabela COM de objetos ativos; nesses casos, habilite a ativação.

## Conectar ao Codex

O arquivo [codex.mcp.example.toml](codex.mcp.example.toml) contém um bloco de exemplo.
Substitua C:/projetos/indesign-mcp-windows pela pasta do seu clone.
Copie o bloco para o config.toml do Codex, preservando o
restante do arquivo, e reinicie o cliente/conexão MCP.

A configuração global normalmente fica em %USERPROFILE%\.codex\config.toml.
Também é possível usar .codex/config.toml de um projeto confiável.
Se mover esta pasta, atualize os caminhos de args e cwd.
O exemplo foi preparado, mas não foi instalado automaticamente na configuração global.

Documentação: [MCP no Codex](https://developers.openai.com/codex/mcp).

Exemplos de pedidos após conectar:

- “Consulte o documento aberto no InDesign.”
- “Crie um A4 com uma caixa de texto e o título Relatório mensal.”
- “Salve o documento e exporte um PDF nesta pasta.”

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| INDESIGN_PROGID | InDesign.Application | Recomenda-se fixar a versão: InDesign.Application.2026. |
| INDESIGN_ALLOW_LAUNCH | desabilitado | 1 permite ativar/abrir a aplicação via COM. |
| INDESIGN_TIMEOUT_MS | 60000 | Limite por chamada COM; entre 1000 e 600000 ms. |
| INDESIGN_ALLOWED_DIRS | vazio | Pastas extras separadas por ponto e vírgula no Windows. |
| INDESIGN_ALLOW_ARBITRARY_CODE | desabilitado | Apenas 1 habilita execute_indesign_code. |

Por herança da base original, os caminhos de usuário e a pasta de trabalho são
permitidos para ferramentas de arquivo. Caminhos retornados para o JSX usam /,
evitando interpretar barras de caminhos Windows como escapes de texto.
As restrições de caminho não constituem um sandbox: a base contém geradores de
ExtendScript herdados, ainda sem auditoria completa. Use com clientes e conteúdo
confiáveis. Código arbitrário permanece desabilitado por padrão.

Algumas operações herdadas exigem o argumento confirmDestructive: true, como
exportar, salvar com caminho, excluir página e fechar documento. A validação
agora interrompe a operação quando esse argumento não é o booleano true.

## Teste real reproduzível

~~~powershell
$env:INDESIGN_PROGID = 'InDesign.Application.2026'
$env:INDESIGN_ALLOW_LAUNCH = '1'
npm run smoke
~~~

O teste cria um documento próprio, chama as ferramentas através de um cliente MCP
e grava teste-windows.indd, teste-windows.pdf e report.json numa nova
subpasta de output/. Ao terminar, fecha somente o documento de teste pelo seu ID.
Não fecha o InDesign nem documentos anteriores.

Para PDF, omita preset para partir das preferências atuais, ou forneça o nome
exato de um preset instalado, inclusive a tradução. Nomes inexistentes geram erro.
As preferências globais de PDF são restauradas após exportar. A configuração de
perfil de destino não substitui um fluxo de pré-impressão validado.

## Estrutura

- index.js: catálogo e ferramentas adaptadas da base original.
- src/windows-bridge.js: fila de chamadas, arquivos temporários únicos, UTF-8,
  resultado/erro do ExtendScript e tratamento de timeout.
- scripts/invoke-indesign.ps1: acesso COM e execução DoScript.
- scripts/doctor.js: diagnóstico sem editar documentos.
- scripts/smoke.js: teste integrado com arquivos de exemplo.
- test/: testes do transporte, geração de texto e validações MCP.
- codex.mcp.example.toml: configuração sugerida.

## Falhas comuns

- **Não conecta ao COM:** confira o ProgID, a versão instalada e a opção
  INDESIGN_ALLOW_LAUNCH. InDesign e cliente devem rodar na mesma sessão de usuário
  e com o mesmo nível de privilégio; normalmente sem administrador.
- **Timeout:** verifique diálogos abertos, telas iniciais, licença ou scripts
  demorados. Encerrar o processo PowerShell não garante cancelar o script dentro
  do InDesign. Após timeout, esta instância bloqueia novas chamadas; confira o
  estado do aplicativo antes de reiniciar o servidor MCP.
- **Política PowerShell:** o processo filho usa ExecutionPolicy Bypass somente
  nessa execução. O projeto não altera a política permanente; políticas
  corporativas podem impedir a execução mesmo assim.

## Referências e licença

- Base: [lucdesign/indesign-mcp-server](https://github.com/lucdesign/indesign-mcp-server),
  arquivos consultados da branch main em 17/11/2026. O SDK MCP 0.5.0 foi mantido
  da base e fixado no lockfile; uma atualização de SDK fica como trabalho posterior.
- [Adobe: Application / doScript](https://developer.adobe.com/indesign/uxp/dom/api/a/application/).
- [Adobe: ScriptLanguage](https://developer.adobe.com/indesign/uxp/dom/api/s/script-language/).
- [Adobe: PDFExportPreference](https://developer.adobe.com/indesign/uxp/dom/api/p/pdf-export-preference/).
- Licença MIT em LICENSE, com crédito ao autor original.
