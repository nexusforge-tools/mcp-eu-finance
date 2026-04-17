// Structured logger — writes JSON to stderr so stdout stays clean for MCP stdio protocol
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;
  const entry: LogEntry = { level, message, timestamp: new Date().toISOString(), ...meta };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => write('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => write('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
