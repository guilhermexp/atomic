import React from "react";
import { routes } from "./routes";

/**
 * Context that overrides the route the chat navigates to after sending a message.
 * When null (default), chat navigates to `routes.chat`. When set (e.g. inside
 * Mission Control), chat stays on the given base route.
 */
export const ChatBaseRouteCtx = React.createContext<string | null>(null);

export function useChatBaseRoute(): string {
  return React.useContext(ChatBaseRouteCtx) ?? routes.chat;
}
