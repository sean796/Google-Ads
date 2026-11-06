import { format, parse } from "date-fns";

export const SCHEDULE_TICK_MINUTES = 5;

export const TASK_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += SCHEDULE_TICK_MINUTES) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
})();

export function parseTaskIsoDate(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function toTaskIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTaskTimeLabel(value: string): string {
  if (!value.trim()) return "";
  const normalized = value.trim().slice(0, 5);
  return format(parse(normalized, "HH:mm", new Date()), "h:mm a");
}

