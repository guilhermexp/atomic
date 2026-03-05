/** Typed interfaces for gateway RPC method responses. */

export interface ConfigGetResponse {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: Record<string, unknown>;
}

export interface SessionEntry {
  key: string;
  title?: string;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
  modelOverride?: string;
}

export interface SessionsListResponse {
  sessions?: SessionEntry[];
}

export interface AgentsListResponse {
  defaultId: string;
  mainKey: string;
  scope: "per-sender" | "global";
  agents: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      theme?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
    };
  }>;
}

export interface AgentsFilesListResponse {
  agentId: string;
  workspace: string;
  files: Array<{
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
    content?: string;
  }>;
}

export interface AgentsFilesGetResponse {
  agentId: string;
  workspace: string;
  file: {
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
    content?: string;
  };
}

export interface ModelsListResponse {
  models?: Array<{
    id: string;
    name?: string;
    provider: string;
    contextWindow?: number;
    reasoning?: boolean;
  }>;
}
