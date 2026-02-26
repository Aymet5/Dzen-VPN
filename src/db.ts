import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'vpn_bot.db');
export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    trial_started_at DATETIME,
    subscription_ends_at DATETIME,
    vpn_config TEXT,
    total_spent INTEGER DEFAULT 0
  )
`);

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  trial_started_at: string;
  subscription_ends_at: string;
  vpn_config: string | null;
  total_spent: number;
}

export function getUser(telegramId: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
}

export function createUser(telegramId: number, username: string | null): User {
  const now = new Date();
  const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, trial_started_at, subscription_ends_at)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(telegramId, username, now.toISOString(), trialEnds.toISOString());
  return getUser(telegramId)!;
}

export function updateSubscription(telegramId: number, monthsToAdd: number, starsSpent: number) {
  const user = getUser(telegramId);
  if (!user) return;

  const now = new Date();
  const currentEnds = new Date(user.subscription_ends_at);
  const baseDate = currentEnds > now ? currentEnds : now;
  
  baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
  
  db.prepare('UPDATE users SET subscription_ends_at = ?, total_spent = total_spent + ? WHERE telegram_id = ?')
    .run(baseDate.toISOString(), starsSpent, telegramId);
}

export function updateVpnConfig(telegramId: number, config: string) {
  db.prepare('UPDATE users SET vpn_config = ? WHERE telegram_id = ?')
    .run(config, telegramId);
}

export function getAllUsers(): User[] {
  return db.prepare('SELECT * FROM users').all() as User[];
}
