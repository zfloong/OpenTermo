import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SessionConfig } from "./tauriCommands";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve template variables in command strings.
 * Supported: {{host}}, {{user}}, {{port}}, {{name}}, {{session}}
 */
export function resolveCommandTemplate(
  command: string,
  session?: SessionConfig | null,
): string {
  if (!session) return command;
  return command
    .replace(/\{\{host\}\}/g, session.host)
    .replace(/\{\{user\}\}/g, session.user)
    .replace(/\{\{port\}\}/g, String(session.port))
    .replace(/\{\{name\}\}/g, session.name || session.host)
    .replace(/\{\{session\}\}/g, session.name || session.host);
}
