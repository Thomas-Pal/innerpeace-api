import { randomUUID } from 'crypto';

type Level = 'info' | 'warn' | 'error' | 'debug';

type LogPayload = Record<string, unknown>;

function toSafeString(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function log(level: Level, payload: LogPayload) {
  const base = {
    level,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const line = toSafeString(base);

  switch (level) {
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  info: (payload: LogPayload) => log('info', payload),
  warn: (payload: LogPayload) => log('warn', payload),
  error: (payload: LogPayload) => log('error', payload),
  debug: (payload: LogPayload) => log('debug', payload),
};

export function mask(value?: string | string[] | null) {
  if (!value) return null;
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return null;
  const trimmed = first.trim();
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function buildCorrelationId(headerValue?: string | string[] | null) {
  const first = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const id = first && typeof first === 'string' && first.trim() ? first.trim() : randomUUID();
  return id;
}
