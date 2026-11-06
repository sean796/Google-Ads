export function supportChatLogFileName(ticketId?: number): string {
  return ticketId ? `ticket-${ticketId}-chat-log.json` : "pulse-assist-chat-log.json";
}

export function supportChatLogByteSize(chatLog: Record<string, unknown> | null): number {
  if (!chatLog) return 0;
  return new Blob([JSON.stringify(chatLog, null, 2)]).size;
}
