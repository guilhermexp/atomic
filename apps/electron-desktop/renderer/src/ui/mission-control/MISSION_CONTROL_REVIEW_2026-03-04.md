# Mission Control — Revisão de Estado (2026-03-04)

## Escopo revisado

Arquivos inspecionados:

- `apps/electron-desktop/renderer/src/ui/mission-control/MissionControlPage.tsx`
- `apps/electron-desktop/renderer/src/ui/mission-control/BrainTab.tsx`
- `apps/electron-desktop/renderer/src/ui/mission-control/CronJobModal.tsx`
- `apps/electron-desktop/renderer/src/ui/sidebar/Sidebar.tsx`

---

## Resumo executivo

O Mission Control está **integrado e funcional** dentro do Electron, com persistência real em `config.get/config.patch`, aba de eventos em tempo real via `gw.onEvent`, atalho na sidebar e ações operacionais (cron CRUD, run-now, tracker de dispatches).

Ele **não está mais com seed/mock fixo inicial** no código da página principal (estado default vazio), mas ainda possui blocos cujo conteúdo depende de entrada manual/persistida no `missionControl` (ou seja: real no armazenamento, porém não 100% alimentado automaticamente por fontes runtime dedicadas).

---

## O que já está real e ativo

### 1) Integração com runtime/gateway

- Carrega estado com:
  - `config.get`
  - `sessions.list`
  - `models.list`
- Atualiza automaticamente por:
  - polling (`AUTO_REFRESH_MS = 15000`)
  - stream (`gw.onEvent`)

### 2) Persistência real

- Alterações da UI persistem em `missionControl` no config via `config.patch`.
- Isso inclui decisões, cron jobs, dispatches, backup snapshots, docs do brain e outros blocos.

### 3) Execução operacional

- `Run now` dispara `chat.send` em sessão isolada (`newSessionKey`) e cria dispatch rastreável.
- Dispatches têm status (`dispatched/running/completed/failed/unknown`) e link para abrir sessão.

### 4) Eventos em tempo real

- Aba `Eventos` mostra feed de eventos recebidos (`evt.event`, `evt.payload`) com filtro.
- Sidebar ganhou entrada `⚡ Eventos ao vivo` com badge de atividade recente.

### 5) UI em português

- Labels e ações principais traduzidos para PT-BR em Mission Control.

---

## O que ainda é “manual” (não automaticamente derivado do runtime)

> Observação: não é mock hardcoded inicial, mas também não é telemetria fully-automated.

- `brainDocs` e `fileTree`: hoje são mantidos no estado persistido do Mission Control (sem crawler/indexador automático do workspace nesta camada).
- `backupSnapshots`: timeline controlada por ações da UI (+ Snapshot / Marcar restauração OK), não vinculada diretamente ao pipeline de backup do core.
- `projects`, `orgDivisions`, `sponsorHub`, `contentLibrary`: persistidos e exibidos, porém sem ingestão automática de uma fonte operacional única.
- `integrationErrors`: painel existe, mas depende do preenchimento da própria camada Mission Control (não há pipeline central de erro por canal plugado aqui ainda).

---

## Arquitetura de dados atual (MissionControlPage)

1. `load()`:
   - busca config/sessões/modelos
   - hidrata `MissionControlData` com `readMissionControl(...)`
   - aplica derivados runtime (`deriveSystemsRuntime`, status de dispatch)
2. mutações de UI:
   - alteram estado local
   - chamam `persist(next)` → `config.patch`
3. stream:
   - `gw.onEvent` adiciona item no feed ao vivo
   - se evento `chat`, atualiza status dos dispatches
   - dispara `load()` para reconciliação

---

## Riscos / pontos de atenção técnicos

1. **Carga de rede em eventos**
   - A cada evento de gateway, atualmente chama `load()` completo.
   - Em cenários de alto volume pode gerar overhead evitável.

2. **Aba Eventos sem classificação semântica**
   - Feed cru com `JSON.stringify(payload)` (truncado), sem níveis/tipos enriquecidos.

3. **Cron sem executor nativo acoplado**
   - CRUD persiste estado e o run-now executa, mas não há scheduler runtime unificado dentro dessa tela.

4. **“Real-time” misto (stream + polling)**
   - Funciona bem para UX, mas ainda não é event-sourced puro para todos os blocos.

---

## Recomendações de evolução (ordem de impacto)

1. **Pipeline de eventos dedicado para MC**
   - reduzir `load()` full em todo evento;
   - aplicar reducers incrementais por tipo de evento (`chat`, `agent`, `tool`, `session`).

2. **Conectar backup timeline ao backend de backup**
   - consumir histórico real de snapshots/restores do serviço principal.

3. **Ingestão automática para Brain/Projects/File tree**
   - fonte runtime para árvore de arquivos e índices de docs/sessões;
   - evitar cadastro manual para manter “single source of truth”.

4. **Observabilidade de canais**
   - popular `integrationErrors` por eventos reais do subsistema de canais;
   - expor última falha, última entrega, contadores 24h.

5. **Enriquecimento visual do feed ao vivo**
   - badges por tipo de evento, severidade, busca por sessionKey/runId.

---

## Conclusão

Mission Control está em **estado operacional sólido de V2**:

- integrado ao app,
- persistente,
- com ações reais,
- e com feed de eventos ao vivo.

Para atingir nível “NOC completo” (100% real-first automatizado), o próximo passo é conectar os blocos hoje manuais/persistidos a pipelines runtime dedicados (backup, projetos, file-tree, erros de integração), além de otimizar o consumo de stream para evitar reload completo em todo evento.
