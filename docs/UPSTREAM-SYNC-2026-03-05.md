# Upstream Sync Analysis — 2026-03-05

**Upstream:** `openclaw/openclaw` (branch `main`)
**Fork:** `guilhermexp/atomic` (branch `main`)
**Commits pendentes:** 111
**Conflitos detectados:** 0 (merge limpo)
**Arquivos alterados (fora do fork privado):** 505 (+27.830 / -3.541 linhas)

> Nossas mudancas privadas estao isoladas em `apps/electron-desktop/` e `apps/missioncontrol-macclaw-dashboard-design/` — nenhum conflito com o upstream.

---

## Indice

1. [Seguranca e Dependencias](#1-seguranca-e-dependencias)
2. [Agents — Core Loop e Compaction](#2-agents--core-loop-e-compaction)
3. [Gateway](#3-gateway)
4. [Cron Jobs](#4-cron-jobs)
5. [ACP — Persistent Bindings](#5-acp--persistent-bindings)
6. [Telegram](#6-telegram)
7. [Slack](#7-slack)
8. [Discord](#8-discord)
9. [Feishu (Lark)](#9-feishu-lark)
10. [Mattermost](#10-mattermost)
11. [Memory](#11-memory)
12. [Outbound / Media](#12-outbound--media)
13. [Browser Tool](#13-browser-tool)
14. [Skills e Plugins](#14-skills-e-plugins)
15. [TUI (Terminal UI)](#15-tui-terminal-ui)
16. [Control UI (Web)](#16-control-ui-web)
17. [TTS (Text-to-Speech)](#17-tts-text-to-speech)
18. [Ollama](#18-ollama)
19. [xAI / Grok](#19-xai--grok)
20. [OpenAI Codex](#20-openai-codex)
21. [Internacionalizacao (i18n)](#21-internacionalizacao-i18n)
22. [Daemon / Linux](#22-daemon--linux)
23. [Onboarding / Wizard](#23-onboarding--wizard)
24. [Diffs Extension](#24-diffs-extension)
25. [Subagents](#25-subagents)
26. [Session Management](#26-session-management)
27. [Documentacao](#27-documentacao)
28. [Infra / CI / Chore](#28-infra--ci--chore)

---

## 1. Seguranca e Dependencias

### `1ab93932` fix(secrets): harden api key normalization for ByteString headers

- **Impacto:** ALTO
- **O que muda:** Normaliza chaves de API que chegam como ByteString headers, evitando que valores malformados passem pela validacao e causem falhas silenciosas ou leaks.
- **Arquivos:** `src/agents/sanitize-for-prompt.ts`, `src/agents/minimax-vlm.normalizes-api-key.test.ts`

### `da0e245d` fix(security): avoid prototype-chain account path checks

- **Impacto:** ALTO
- **O que muda:** Corrige vulnerabilidade onde property lookups de account paths podiam subir pela prototype chain do JavaScript, potencialmente acessando propriedades nao intencionadas.
- **Arquivos:** `src/auto-reply/command-auth.ts`

### `4d06c909` fix(deps): bump tar to 7.5.10

- **Impacto:** MEDIO
- **O que muda:** Atualiza dependencia `tar` para resolver vulnerabilidade de seguranca conhecida.
- **Arquivos:** `pnpm-lock.yaml`

### `809f9513` fix(deps): patch hono transitive audit vulnerabilities

- **Impacto:** MEDIO
- **O que muda:** Aplica patches nas dependencias transitivas do Hono para resolver alertas de auditoria de seguranca.
- **Arquivos:** `pnpm-lock.yaml`, `package.json`

### `999b7e4e` fix(ui): bump dompurify to 3.3.2

- **Impacto:** MEDIO
- **O que muda:** Atualiza DOMPurify para versao com correcoes de XSS na Control UI.
- **Arquivos:** `ui/package.json`, `pnpm-lock.yaml`

---

## 2. Agents — Core Loop e Compaction

### `7a22b3fa` feat(agents): flush reply pipeline before compaction wait

- **Impacto:** ALTO
- **O que muda:** Garante que respostas parciais ja enviadas ao usuario sejam finalizadas (flushed) antes do agente entrar em compaction. Evita respostas truncadas quando o contexto excede o limite.
- **Arquivos:** `src/agents/pi-embedded-runner/run.ts`, `src/agents/pi-embedded-runner/run/attempt.ts`

### `036c3297` Compaction/Safeguard: add summary quality audit retries

- **Impacto:** ALTO
- **O que muda:** Adiciona retries automaticos quando o resumo de compaction nao atende criterios de qualidade (headings estruturados, cobertura de contexto). Evita perda de informacao critica em sessoes longas.
- **Arquivos:** `src/agents/pi-extensions/compaction-safeguard.ts`, `src/agents/pi-extensions/compaction-safeguard.test.ts` (+772 linhas de teste)

### `df0f2e34` Compaction/Safeguard: require structured summary headings

- **Impacto:** MEDIO
- **O que muda:** Exige que resumos de compaction sigam um formato com headings estruturados. Melhora a qualidade do contexto compactado.
- **Arquivos:** `src/agents/pi-extensions/compaction-safeguard.ts`

### `6c037614` fix(agents): skip compaction API call when session has no real messages

- **Impacto:** MEDIO
- **O que muda:** Evita chamadas API desnecessarias (e custos) quando a sessao nao tem mensagens reais para compactar.
- **Arquivos:** `src/agents/pi-embedded-runner/compact.ts`

### `60a6d111` fix(embedded): classify model_context_window_exceeded as context overflow, trigger compaction

- **Impacto:** ALTO
- **O que muda:** Quando o modelo retorna `model_context_window_exceeded`, agora e classificado corretamente como overflow de contexto e dispara compaction automatica em vez de falhar.
- **Arquivos:** `src/agents/pi-embedded-runner/run/attempt.ts`

### `591264ef` fix(agents): set preserveSignatures to isAnthropic in resolveTranscriptPolicy

- **Impacto:** MEDIO
- **O que muda:** Preserva assinaturas de bloco (thinking tags, etc.) apenas para modelos Anthropic, evitando enviar metadados incompativeis para outros providers.
- **Arquivos:** `src/agents/transcript-policy.ts`, `src/agents/transcript-policy.test.ts`

### `463fd473` fix(agents): guard context pruning against malformed thinking blocks

- **Impacto:** MEDIO
- **O que muda:** Protege o pruner de contexto contra blocos `<thinking>` malformados que podiam causar crashes ou remocao incorreta de mensagens.
- **Arquivos:** `src/agents/pi-extensions/context-pruning/pruner.ts`, `src/agents/pi-extensions/context-pruning/pruner.test.ts`

### `d9b69a61` fix(agents): guard promoteThinkingTagsToBlocks against malformed content entries

- **Impacto:** BAIXO
- **O que muda:** Adiciona guard contra entradas de conteudo malformadas ao promover thinking tags para blocos estruturados.
- **Arquivos:** `src/agents/pi-embedded-utils.ts`, `src/agents/pi-embedded-utils.test.ts`

### `49acb07f` fix(agents): classify insufficient_quota 400s as billing

- **Impacto:** MEDIO
- **O que muda:** Erros HTTP 400 com mensagem `insufficient_quota` sao agora classificados como erros de billing (e nao como erro generico), permitindo failover adequado.
- **Arquivos:** `src/agents/pi-embedded-helpers/errors.ts`, `src/agents/pi-embedded-helpers.ts`

### `8ac7ce73` fix: avoid false global rate-limit classification from generic cooldown text

- **Impacto:** MEDIO
- **O que muda:** Evita que textos genericos de cooldown sejam erroneamente classificados como rate-limit global, o que bloqueava todos os providers desnecessariamente.
- **Arquivos:** `src/agents/failover-error.ts`, `src/agents/failover-error.test.ts`

### `029c4737` fix(failover): narrow service-unavailable to require overload indicator

- **Impacto:** MEDIO
- **O que muda:** Restringe classificacao de "service unavailable" para exigir indicador de overload, evitando failover prematuro em erros 503 genericos.
- **Arquivos:** `src/agents/failover-error.ts`

### `f014e255` refactor(agents): share failover HTTP status classification

- **Impacto:** BAIXO (refactor)
- **O que muda:** Centraliza logica de classificacao de status HTTP para failover em modulo compartilhado. Sem mudanca de comportamento.
- **Arquivos:** `src/agents/failover-error.ts`

### `6859619e` test(agents): add provider-backed failover regressions

- **Impacto:** BAIXO (testes)
- **O que muda:** Adiciona cobertura de testes de regressao para cenarios de failover entre providers.
- **Arquivos:** `src/agents/model-fallback.test.ts`

### `4242c515` agents: preserve totalTokens on request failure instead of using contextWindow

- **Impacto:** MEDIO
- **O que muda:** Ao falhar uma request, preserva o `totalTokens` real em vez de usar `contextWindow` como fallback. Melhora precision do tracking de uso.
- **Arquivos:** `src/agents/pi-embedded-runner/run/attempt.ts`

### `96021a2b` fix: align AGENTS.md template section names with post-compaction extraction

- **Impacto:** BAIXO
- **O que muda:** Alinha nomes de secoes do template AGENTS.md com o que o extrator de pos-compaction espera, evitando perda de contexto de agente.
- **Arquivos:** `docs/reference/templates/AGENTS.md`

### `76bfd9b5` Agents: add generic poll-vote action support

- **Impacto:** MEDIO
- **O que muda:** Adiciona suporte a acoes de votacao em polls como ferramenta generica de agente (nao especifica de canal).
- **Arquivos:** `src/agents/tools/message-tool.ts`, `src/agents/tools/message-tool.test.ts`

---

## 3. Gateway

### `d326861e` fix(gateway): preserve streamed prefixes across tool boundaries

- **Impacto:** ALTO
- **O que muda:** Corrige perda de prefixos de texto ja streamed quando o agente cruza boundaries de tool calls. O usuario via respostas truncadas ou com texto inicial faltando.
- **Arquivos:** `src/agents/pi-embedded-runner/run.ts`

### `d86a12eb` fix(gateway): honor insecure ws override for remote hostnames

- **Impacto:** MEDIO
- **O que muda:** Respeita override de WebSocket inseguro (`ws://` em vez de `wss://`) para hostnames remotos, util para ambientes de desenvolvimento ou redes internas sem TLS.
- **Arquivos:** `ui/src/ui/gateway.ts`

### `c260e207` fix(routing): avoid full binding rescans in resolveAgentRoute

- **Impacto:** MEDIO
- **O que muda:** Otimiza resolucao de rotas evitando rescans completos de bindings — melhora performance em setups com muitos agentes/canais.
- **Arquivos:** `src/routing/` (multiplos arquivos)

### `72cf9253` Gateway: add SecretRef support for gateway.auth.token with auth-mode guardrails

- **Impacto:** MEDIO
- **O que muda:** Permite usar `SecretRef` (referencia a credential stores como 1Password, env vars) para o token de autenticacao do gateway, com guardrails que validam modo de auth.
- **Arquivos:** `src/gateway/`, `docs/gateway/secrets.md`

### `3a6b412f` fix(gateway): pass actual version to Control UI client instead of dev

- **Impacto:** BAIXO
- **O que muda:** A Control UI agora mostra a versao real do gateway em vez de "dev".
- **Arquivos:** `ui/src/ui/controllers/control-ui-bootstrap.ts`

### `c4dab17c` fix(gateway): prevent internal route leakage in chat.send

- **Impacto:** MEDIO
- **O que muda:** Previne que rotas internas do gateway vazem atraves de `chat.send`, fechando superficie de ataque.
- **Arquivos:** `src/routing/`

### `2b98cb6d` Fix gateway restart false timeouts on Debian/systemd

- **Impacto:** MEDIO
- **O que muda:** Corrige falsos timeouts ao reiniciar o gateway em sistemas Debian com systemd, onde o service reportava timeout antes do gateway estar pronto.
- **Arquivos:** `src/daemon/`

---

## 4. Cron Jobs

### `cc5dad81` cron: unify stale-run recovery and preserve manual-run every anchors

- **Impacto:** ALTO
- **O que muda:** Unifica logica de recovery de runs stale e preserva anchors de `every` para runs manuais. Antes, um run manual podia desalinhar o schedule futuro.
- **Arquivos:** `src/cron/`

### `79d00ae3` fix(cron): stabilize restart catch-up replay semantics

- **Impacto:** ALTO
- **O que muda:** Estabiliza semantica de replay catch-up ao reiniciar — garante que cron jobs perdidos durante downtime sejam executados na ordem correta sem duplicatas.
- **Arquivos:** `src/cron/`

### `28dc2e8a` cron: narrow startup replay backoff guard

- **Impacto:** MEDIO
- **O que muda:** Restringe o guard de backoff no replay de startup para evitar atrasos desnecessarios em cron jobs que devem executar imediatamente.
- **Arquivos:** `src/cron/`

### `1059b406` fix: cron backup should preserve pre-edit snapshot

- **Impacto:** MEDIO
- **O que muda:** Ao editar um cron job, o backup agora preserva o snapshot pre-edicao (nao o pos-edicao), permitindo rollback correto.
- **Arquivos:** `src/cron/`

### `544abc92` fix(cron): restore direct fallback after announce failure in best-effort mode

- **Impacto:** MEDIO
- **O que muda:** Quando o announce de um cron job falha em modo best-effort, restaura o fallback direto (envio para canal primario).
- **Arquivos:** `src/cron/`

### `9741e91a` test(cron): add cross-channel announce fallback regression coverage

- **Impacto:** BAIXO (testes)
- **O que muda:** Cobertura de testes para cenarios de fallback de announce cross-channel.

### `8b8167d5` fix(agents): bypass pendingDescendantRuns guard for cron announce delivery

- **Impacto:** MEDIO
- **O que muda:** Permite que announces de cron sejam entregues mesmo quando ha runs descendentes pendentes — evita que cron announces fiquem presos.
- **Arquivos:** `src/agents/pi-embedded-runner/run.ts`

---

## 5. ACP — Persistent Bindings

### `6a705a37` ACP: add persistent Discord channel and Telegram topic bindings

- **Impacto:** ALTO
- **O que muda:** Adiciona sistema completo de bindings persistentes para ACP (Agent Communication Protocol). Permite vincular agentes a canais Discord ou topics Telegram de forma permanente, sobrevivendo a restarts.
- **Arquivos:** Novos: `src/acp/persistent-bindings.ts`, `src/acp/persistent-bindings.lifecycle.ts`, `src/acp/persistent-bindings.resolve.ts`, `src/acp/persistent-bindings.route.ts`, `src/acp/persistent-bindings.types.ts`, `src/acp/persistent-bindings.test.ts` (+639 linhas), `src/acp/conversation-id.ts`
- **Docs:** `docs/experiments/plans/acp-persistent-bindings-discord-channels-telegram-topics.md` (+375 linhas)

---

## 6. Telegram

### `d58dafae` feat(telegram/acp): Topic Binding, Pin Binding Message, Fix Spawn Param Parsing

- **Impacto:** ALTO
- **O que muda:** Suporte a binding de ACP agents a topics do Telegram. Pins a mensagem de binding no topic. Corrige parsing de parametros do spawn.
- **Arquivos:** `src/agents/tools/telegram-actions.ts`, `src/telegram/`, `extensions/acpx/`

### `6dfd39c3` Harden Telegram poll gating and schema consistency

- **Impacto:** MEDIO
- **O que muda:** Endurece validacao de polls no Telegram e garante consistencia de schema entre envio e recepcao.
- **Arquivos:** `src/telegram/`

### `4bd34693` refactor(telegram): remove unused webhook callback helper

- **Impacto:** BAIXO (cleanup)
- **O que muda:** Remove helper de webhook callback nao utilizado.

### `c52215477` docs(telegram): recommend allowlist for single-user DM policy

- **Impacto:** BAIXO (docs)
- **O que muda:** Documenta recomendacao de usar allowlist para politica de DM single-user.

---

## 7. Slack

### `b9a20dc9` fix(slack): preserve dedupe while recovering dropped app_mention

- **Impacto:** ALTO
- **O que muda:** Ao recuperar eventos `app_mention` dropados (ex: por timeout), agora preserva deduplicacao corretamente. Antes, a recovery podia causar respostas duplicadas.
- **Arquivos:** `src/slack/`

### `7830366f` fix(slack): propagate mediaLocalRoots through Slack send path

- **Impacto:** MEDIO
- **O que muda:** Propaga `mediaLocalRoots` pelo path de envio do Slack, permitindo que midias locais (imagens de workspace, screenshots) sejam enviadas corretamente.
- **Arquivos:** `src/agents/tools/slack-actions.ts`, `src/slack/`

---

## 8. Discord

### `063e493d` fix: decouple Discord inbound worker timeout from listener timeout

- **Impacto:** MEDIO
- **O que muda:** Desacopla timeout do worker inbound do Discord do timeout do listener. Antes, um listener lento podia causar timeout no worker inteiro.
- **Arquivos:** `src/discord/`
- **Contribuicao:** @dutifulbob

---

## 9. Feishu (Lark)

### `3bf6ed18` Feishu: harden streaming merge semantics and final reply dedupe

- **Impacto:** ALTO
- **O que muda:** Endurece semantica de merge de streaming cards e deduplicacao de resposta final. Resolve problemas de mensagens duplicadas ou parciais no Feishu.
- **Arquivos:** `extensions/feishu/src/streaming-card.ts`, `extensions/feishu/src/send.ts`

### `63ce7c74` fix(feishu): comprehensive reply mechanism — outbound replyToId forwarding + topic-aware reply targeting

- **Impacto:** ALTO
- **O que muda:** Implementa mecanismo completo de reply no Feishu: forwarding de replyToId no outbound + targeting de reply com awareness de topic.
- **Arquivos:** `extensions/feishu/src/reply-dispatcher.ts`, `extensions/feishu/src/send.ts`, `extensions/feishu/src/outbound.ts` (+178 linhas de teste)

### `68e68bfb` fix(feishu): use msg_type media for mp4 video

- **Impacto:** MEDIO
- **O que muda:** Usa `msg_type: media` (em vez de `file`) para videos MP4, corrigindo exibicao inline de videos no Feishu.
- **Arquivos:** `extensions/feishu/src/media.ts`

### `ba223c77` fix(feishu): add HTTP timeout to prevent per-chat queue deadlocks

- **Impacto:** ALTO
- **O que muda:** Adiciona timeout HTTP para evitar deadlocks na fila por chat — antes, uma request travada bloqueava toda a fila.
- **Arquivos:** `extensions/feishu/src/client.ts`

### `bc66a8fa` fix(feishu): avoid media regressions from global HTTP timeout

- **Impacto:** MEDIO
- **O que muda:** Evita que o timeout HTTP global (adicionado acima) cause regressoes em uploads de media que legitimamente demoram mais.
- **Arquivos:** `extensions/feishu/src/media.ts`

### `627b37e3` Feishu: honor bot mentions by ID despite aliases

- **Impacto:** MEDIO
- **O que muda:** Reconhece mencoes ao bot por ID mesmo quando aliases sao usados, evitando que mensagens para o bot sejam ignoradas.
- **Arquivos:** `extensions/feishu/src/bot.ts`

### `b9f3f8d7` fix(feishu): use probed botName for mention checks

- **Impacto:** BAIXO
- **O que muda:** Usa o botName real (probed via API) em vez do configurado para checks de mention.

### `174eeea7` Feishu: normalize group slash command probing

- **Impacto:** BAIXO
- **O que muda:** Normaliza probing de slash commands em grupos.

### `995ae73d` synthesis: fix Feishu group mention slash parsing

- **Impacto:** BAIXO
- **O que muda:** Corrige parsing de slash com mention em grupos.

### `2972d6fa` fix(feishu): accept groupPolicy "allowall" as alias for "open"

- **Impacto:** BAIXO
- **O que muda:** Aceita `allowall` como alias de `open` na config de groupPolicy.

### `06ff25cc` fix(feishu): check response.ok before calling response.json() in streaming card

- **Impacto:** BAIXO
- **O que muda:** Verifica `response.ok` antes de chamar `.json()`, evitando crashes em respostas de erro.

---

## 10. Mattermost

### `136ca87f` feat(mattermost): add interactive buttons support

- **Impacto:** ALTO
- **O que muda:** Adiciona suporte a botoes interativos no Mattermost — agentes podem enviar mensagens com botoes de acao que o usuario pode clicar.
- **Arquivos:** `extensions/mattermost/src/mattermost/interactions.ts` (+429 linhas), `extensions/mattermost/src/mattermost/interactions.test.ts` (+335 linhas), `extensions/mattermost/src/mattermost/monitor.ts`, `extensions/mattermost/src/mattermost/send.ts`

### `89b303c5` Mattermost: switch plugin-sdk imports to scoped subpaths

- **Impacto:** BAIXO (refactor)
- **O que muda:** Migra imports do plugin-sdk para subpaths scoped.

### `e5b6a4e1` Mattermost: honor onmessage mention override and add gating diagnostics tests

- **Impacto:** MEDIO
- **O que muda:** Respeita override de mention no evento `onmessage` e adiciona testes de diagnostico de gating.
- **Arquivos:** `extensions/mattermost/src/group-mentions.ts`, `extensions/mattermost/src/mattermost/monitor.ts`

---

## 11. Memory

### `94fdee2e` fix(memory-flush): ban timestamped variant files in default flush prompt

- **Impacto:** MEDIO
- **O que muda:** Proibe arquivos variantes com timestamp no prompt de flush padrao — evita duplicacao de conhecimento na memoria do agente.
- **Arquivos:** `src/agents/memory-search.ts`

### `fb289b7a` Memory: handle SecretRef keys in doctor embeddings

- **Impacto:** MEDIO
- **O que muda:** O comando `openclaw doctor` agora sabe lidar com chaves de embedding referenciadas via SecretRef, em vez de falhar com "key not found".
- **Arquivos:** `src/agents/memory-search.ts`, `src/agents/memory-search.test.ts`

### `f771ba8d` fix(memory): avoid destructive qmd collection rebinds

- **Impacto:** ALTO
- **O que muda:** Evita rebinds destrutivos de colecoes QMD (Queryable Memory Documents) que podiam causar perda de dados de memoria.
- **Arquivos:** `src/memory/`

---

## 12. Outbound / Media

### `698c200e` fix(outbound): fail media-only text-only adapter fallback

- **Impacto:** MEDIO
- **O que muda:** Quando um adapter suporta apenas texto e recebe media-only, agora falha explicitamente em vez de enviar mensagem vazia.
- **Arquivos:** `src/outbound/`

### `bb07b2b9` Outbound: avoid empty multi-media fallback sends

- **Impacto:** MEDIO
- **O que muda:** Evita envio de mensagens vazias quando fallback de multi-media resulta em conteudo vazio.

### `efdf2ca0` Outbound: allow text-only plugin adapters

- **Impacto:** MEDIO
- **O que muda:** Plugins de canal que so suportam texto agora sao corretamente identificados e recebem fallback adequado.

---

## 13. Browser Tool

### `06a229f9` fix(browser): close tracked tabs on session cleanup

- **Impacto:** MEDIO
- **O que muda:** Fecha tabs rastreadas pelo browser tool quando a sessao e limpa, evitando leak de processos Chrome/Chromium.
- **Arquivos:** `src/agents/tools/browser-tool.ts`, `src/agents/tools/browser-tool.test.ts`

### `8d48235d` fix(browser): remove deprecated --disable-blink-features=AutomationControlled flag

- **Impacto:** BAIXO
- **O que muda:** Remove flag depreciada do Chromium que gerava warnings.

---

## 14. Skills e Plugins

### `688b72e1` plugins: enforce prompt hook policy with runtime validation

- **Impacto:** ALTO
- **O que muda:** Adiciona validacao em runtime para politicas de prompt hooks em plugins. Plugins nao podem mais injetar prompts nao autorizados.
- **Arquivos:** `src/plugins/`

### `48decefb` fix(skills): deduplicate slash commands by skillName across all interfaces

- **Impacto:** MEDIO
- **O que muda:** Desduplicao slash commands por skillName, evitando que o mesmo comando apareca multiplas vezes em interfaces diferentes.
- **Arquivos:** `src/skills/`

### `09c68f8f` add prependSystemContext and appendSystemContext to before_prompt_build

- **Impacto:** MEDIO
- **O que muda:** Hooks `before_prompt_build` agora recebem `prependSystemContext` e `appendSystemContext` — plugins podem injetar contexto no inicio ou fim do system prompt.
- **Arquivos:** `src/agents/pi-embedded-runner/extensions.ts`

---

## 15. TUI (Terminal UI)

### `6084c26d` fix(tui): render final event error when assistant output is empty

- **Impacto:** MEDIO
- **O que muda:** Quando o assistente nao produz output (ex: erro no provider), o TUI agora renderiza o erro final em vez de mostrar tela vazia.
- **Arquivos:** `src/tui/`

### `cec55350` fix(tui): prevent stale model indicator after /model

- **Impacto:** BAIXO
- **O que muda:** Apos usar `/model` para trocar modelo, o indicador na UI atualiza imediatamente em vez de mostrar o modelo anterior.

---

## 16. Control UI (Web)

### `edc386e9` fix(ui): catch marked.js parse errors to prevent Control UI crash

- **Impacto:** MEDIO
- **O que muda:** Captura erros de parse do marked.js (markdown renderer) para evitar crash da Control UI inteira quando uma mensagem contem markdown malformado.
- **Arquivos:** `ui/src/ui/markdown.ts`, `ui/src/ui/markdown.test.ts`

### `8891e1e4` fix(web-ui): render Accounts schema node properly

- **Impacto:** BAIXO
- **O que muda:** Renderiza corretamente o node de Accounts no formulario de configuracao da web UI.
- **Arquivos:** `ui/src/ui/views/config-form.analyze.ts`

### `0c08e3f5` UI: hoist lifecycle connect test mocks

- **Impacto:** BAIXO (testes)
- **O que muda:** Reorganiza mocks de testes de lifecycle para melhor manutenibilidade.

---

## 17. TTS (Text-to-Speech)

### `2c8ee593` TTS: add baseUrl support to OpenAI TTS config

- **Impacto:** MEDIO
- **O que muda:** Permite configurar `baseUrl` customizada para TTS OpenAI-compatible. Util para proxies, endpoints self-hosted, ou providers alternativos.
- **Arquivos:** `src/tts/`, `docs/tts.md`

---

## 18. Ollama

### `7597fc55` fix(ollama): pass provider headers to Ollama stream function

- **Impacto:** MEDIO
- **O que muda:** Propaga headers customizados do provider para a funcao de streaming do Ollama. Necessario para autenticacao em proxies ou instancias protegidas.
- **Arquivos:** `src/agents/ollama-stream.ts`, `src/agents/ollama-stream.test.ts`

---

## 19. xAI / Grok

### `ce0c1319` fix(agents): decode HTML entities in xAI/Grok tool call arguments

- **Impacto:** MEDIO
- **O que muda:** Decodifica entidades HTML nos argumentos de tool calls retornados por xAI/Grok (que as vezes retorna `&amp;`, `&lt;`, etc.).
- **Arquivos:** `src/agents/schema/clean-for-xai.ts`

### `987e4733` fix(agents): detect Venice provider proxying xAI/Grok models for schema cleaning

- **Impacto:** BAIXO
- **O que muda:** Detecta quando o provider Venice esta fazendo proxy para modelos xAI/Grok e aplica a mesma limpeza de schema.

---

## 20. OpenAI Codex

### `8088218f` fix(openai-codex): request required oauth api scopes

- **Impacto:** MEDIO
- **O que muda:** Solicita scopes OAuth corretos ao integrar com OpenAI Codex. Sem isso, algumas operacoes falhavam por permissao insuficiente.

### `92b48921` fix(auth): harden openai-codex oauth login path

- **Impacto:** MEDIO
- **O que muda:** Endurece o fluxo de login OAuth do Codex contra edge cases que podiam causar loops de autenticacao.

---

## 21. Internacionalizacao (i18n)

### `ed05810d` + `b3fb881a` fix: add spanish locale support

- **Impacto:** MEDIO
- **O que muda:** Adiciona suporte completo ao locale espanhol (es) na Control UI — 347 linhas de traducoes.
- **Arquivos:** `ui/src/i18n/locales/es.ts` (novo), `ui/src/i18n/lib/registry.ts`
- **Contribuicao:** @DaoPromociones

---

## 22. Daemon / Linux

### `53b2479e` Fix Linux daemon install checks when systemd user bus env is missing

- **Impacto:** MEDIO
- **O que muda:** Corrige verificacao de instalacao do daemon em Linux quando a variavel de ambiente do user bus do systemd nao esta definida (comum em containers e VMs).
- **Arquivos:** `src/daemon/`

### `4fb40497` fix(daemon): handle systemctl is-enabled exit 4 (not-found) on Ubuntu

- **Impacto:** BAIXO
- **O que muda:** Trata corretamente exit code 4 (`not-found`) do `systemctl is-enabled` no Ubuntu.

---

## 23. Onboarding / Wizard

### Multiplos commits de refactor no wizard

- **O que muda:** O wizard de onboarding recebeu refactors em `src/wizard/` — melhor suporte a configuracao de gateway, testes de finalizacao, e novas opcoes no CLI.
- **Arquivos:** `src/wizard/onboarding.ts`, `src/wizard/onboarding.finalize.ts`, `src/wizard/onboarding.gateway-config.ts` (+91 linhas teste)
- **Docs:** `docs/reference/wizard.md`, `docs/start/wizard-cli-reference.md`, `docs/cli/onboard.md` (novo)

---

## 24. Diffs Extension

### `1a67cf57` Diffs: restore system prompt guidance

- **Impacto:** MEDIO
- **O que muda:** Restaura orientacao de system prompt para a extensao Diffs — melhora qualidade de diffs gerados pelo agente.
- **Arquivos:** `extensions/diffs/index.ts`, `extensions/diffs/src/prompt-guidance.ts` (novo)

---

## 25. Subagents

### `4dc0c663` fix(subagents): strip leaked [[reply_to]] tags from completion announces

- **Impacto:** MEDIO
- **O que muda:** Remove tags `[[reply_to]]` que vazavam nos announces de completion de subagentes, causando confusao no canal de destino.
- **Arquivos:** `src/agents/subagent-announce.ts`, `src/agents/subagent-announce.format.e2e.test.ts` (+81 linhas)

---

## 26. Session Management

### `709dc671` fix(session): archive old transcript on daily/scheduled reset to prevent orphaned files

- **Impacto:** MEDIO
- **O que muda:** Ao fazer reset diario/agendado de sessao, arquiva o transcript antigo em vez de deixa-lo orfao no disco.
- **Arquivos:** `src/session/`

### `432e0222` fix: restore auto-reply system events timeline

- **Impacto:** MEDIO
- **O que muda:** Restaura timeline de eventos de sistema no auto-reply que estava quebrada.
- **Contribuicao:** @anisoptera

---

## 27. Documentacao

### `98aecab7` Docs: cover heartbeat, cron, and plugin route updates

- Documenta heartbeat, mudancas em cron jobs, e atualizacoes de rotas de plugins.

### `2b45eb0e` Docs: document Control UI locale support

- Documenta suporte a locales na Control UI.

### `6b2c1151` Docs: clarify OpenAI-compatible TTS endpoints

- Clarifica endpoints TTS compativeis com OpenAI.

### `1d3962a0` Docs: update gateway config reference for Slack and TTS

- Atualiza referencia de configuracao do gateway para Slack e TTS.

### `837b7b4b` Docs: add Slack typing reaction fallback

- Documenta fallback de typing reaction no Slack.

### `498948581` docs(changelog): document dependency security fixes

- Documenta fixes de seguranca de dependencias no changelog.

### Novos docs adicionados:

- `docs/cli/onboard.md` — referencia do comando onboard
- `docs/channels/mattermost.md` — documentacao completa do canal Mattermost (+152 linhas)
- `docs/experiments/plans/acp-persistent-bindings-discord-channels-telegram-topics.md` (+375 linhas)
- `docs/experiments/plans/discord-async-inbound-worker.md` (+337 linhas)
- `docs/experiments/proposals/acp-bound-command-auth.md` (+89 linhas)

---

## 28. Infra / CI / Chore

### `60849f33` chore(pr): enforce changelog placement and reduce merge sync churn

- Melhora fluxo de PR para changelogs.

### `5d5fa0da` fix(pr): make review claim step required

- Torna step de claim de review obrigatorio.

### `4cc293d0` fix(review): enforce behavioral sweep validation

- Adiciona validacao de behavioral sweep no review.

### `c8ebd48e` fix(node-host): sync rawCommand with hardened argv after executable path pinning

- Sincroniza rawCommand com argv endurecido apos fixacao de path do executavel.

### `3cd4978a` fix(llm-task): load runEmbeddedPiAgent from dist/extensionAPI in installs

- Corrige carregamento de extensionAPI em instalacoes de producao.

### `60d33637` fix(auth): grant senderIsOwner for internal channels with operator.admin scope

- Concede `senderIsOwner` para canais internos com scope `operator.admin`.

### `a0b731e2` fix(config): prevent RangeError in merged schema cache key generation

- Previne RangeError na geracao de cache key do schema mergeado.

### `aad372e1` feat: append UTC time alongside local time in shared Current time lines

- Adiciona horario UTC ao lado do horario local nas linhas "Current time" do system prompt.

### Changelog/style commits (sem impacto funcional):

- `1805735c`, `b5a94d27`, `fb4f52b7`, `2123265c`, `a970cae2`, `e6f0203e`, `9c684707`, `8c5692ac`, `97ea9df5`

---

## Resumo de Risco

| Categoria           | Commits               | Risco de conflito |
| ------------------- | --------------------- | ----------------- |
| Seguranca / deps    | 5                     | Nenhum            |
| Agents / compaction | 16                    | Nenhum            |
| Gateway             | 7                     | Nenhum            |
| Cron                | 7                     | Nenhum            |
| ACP bindings        | 1 (+6 arquivos novos) | Nenhum            |
| Telegram            | 4                     | Nenhum            |
| Slack               | 2                     | Nenhum            |
| Discord             | 1                     | Nenhum            |
| Feishu              | 11                    | Nenhum            |
| Mattermost          | 3                     | Nenhum            |
| Memory              | 3                     | Nenhum            |
| Outbound            | 3                     | Nenhum            |
| Browser             | 2                     | Nenhum            |
| Skills/plugins      | 3                     | Nenhum            |
| TUI                 | 2                     | Nenhum            |
| Control UI          | 3                     | Nenhum            |
| TTS                 | 1                     | Nenhum            |
| Ollama              | 1                     | Nenhum            |
| xAI/Grok            | 2                     | Nenhum            |
| OpenAI Codex        | 2                     | Nenhum            |
| i18n                | 2                     | Nenhum            |
| Daemon/Linux        | 2                     | Nenhum            |
| Onboarding          | ~4                    | Nenhum            |
| Diffs               | 1                     | Nenhum            |
| Subagents           | 1                     | Nenhum            |
| Sessions            | 2                     | Nenhum            |
| Docs                | 6+                    | Nenhum            |
| Infra/chore         | ~15                   | Nenhum            |

**Veredicto: merge seguro. Zero conflitos com mudancas privadas do fork.**
