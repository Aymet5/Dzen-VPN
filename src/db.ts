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
    total_spent INTEGER DEFAULT 0,
    last_expiration_notification TEXT,
    last_3day_notification TEXT,
    connection_limit INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    days INTEGER NOT NULL,
    max_uses INTEGER NOT NULL,
    current_uses INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS used_promos (
    user_id INTEGER,
    promo_code TEXT,
    PRIMARY KEY (user_id, promo_code)
  );

  CREATE TABLE IF NOT EXISTS pending_payments (
    id TEXT PRIMARY KEY,
    telegram_id INTEGER,
    plan_id TEXT,
    amount INTEGER,
    status TEXT DEFAULT 'pending',
    created_at TEXT
  );
`);

// Migrations for existing databases
try {
  db.exec("ALTER TABLE users ADD COLUMN last_expiration_notification TEXT");
} catch (e) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN connection_limit INTEGER DEFAULT 1");
} catch (e) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN last_3day_notification TEXT");
} catch (e) {}

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  trial_started_at: string;
  subscription_ends_at: string;
  vpn_config: string | null;
  total_spent: number;
  last_expiration_notification: string | null;
  last_3day_notification: string | null;
  connection_limit: number;
}

export function getUser(telegramId: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
}

export function createUser(telegramId: number, username: string | null, initialDays: number = 7): User {
  const now = new Date();
  const trialEnds = new Date(now.getTime() + initialDays * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, trial_started_at, subscription_ends_at, connection_limit)
    VALUES (?, ?, ?, ?, 1)
  `);
  
  stmt.run(telegramId, username, now.toISOString(), trialEnds.toISOString());
  return getUser(telegramId)!;
}

export function addDaysToUser(telegramId: number, days: number) {
  const user = getUser(telegramId);
  if (!user) return;

  const now = new Date();
  const currentEnds = new Date(user.subscription_ends_at);
  const baseDate = currentEnds > now ? currentEnds : now;
  
  baseDate.setDate(baseDate.getDate() + days);
  
  db.prepare('UPDATE users SET subscription_ends_at = ? WHERE telegram_id = ?')
    .run(baseDate.toISOString(), telegramId);
}

export function updateSubscription(telegramId: number, monthsToAdd: number, amountPaid: number) {
  const user = getUser(telegramId);
  if (!user) return;

  const now = new Date();
  const currentEnds = new Date(user.subscription_ends_at);
  const baseDate = currentEnds > now ? currentEnds : now;
  
  baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
  
  db.prepare('UPDATE users SET subscription_ends_at = ?, total_spent = total_spent + ? WHERE telegram_id = ?')
    .run(baseDate.toISOString(), amountPaid, telegramId);
}

export function createPendingPayment(id: string, telegramId: number, planId: string, amount: number) {
  db.prepare('INSERT INTO pending_payments (id, telegram_id, plan_id, amount, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, telegramId, planId, amount, new Date().toISOString());
}

export function getPendingPayment(id: string) {
  return db.prepare('SELECT * FROM pending_payments WHERE id = ?').get(id) as any;
}

export function updatePaymentStatus(id: string, status: string) {
  db.prepare('UPDATE pending_payments SET status = ? WHERE id = ?').run(status, id);
}

export function updateVpnConfig(telegramId: number, config: string | null) {
  db.prepare('UPDATE users SET vpn_config = ? WHERE telegram_id = ?')
    .run(config, telegramId);
}

export function updateExpirationNotification(telegramId: number) {
  db.prepare('UPDATE users SET last_expiration_notification = ? WHERE telegram_id = ?')
    .run(new Date().toISOString(), telegramId);
}

export function update3DayNotification(telegramId: number) {
  db.prepare('UPDATE users SET last_3day_notification = ? WHERE telegram_id = ?')
    .run(new Date().toISOString(), telegramId);
}

export function updateConnectionLimit(telegramId: number, limit: number) {
  db.prepare('UPDATE users SET connection_limit = ? WHERE telegram_id = ?')
    .run(limit, telegramId);
}

export function getAllUsers(): User[] {
  return db.prepare('SELECT * FROM users').all() as User[];
}

// Promo Code Functions
export function createPromoCode(code: string, days: number, maxUses: number) {
  db.prepare('INSERT INTO promo_codes (code, days, max_uses) VALUES (?, ?, ?)')
    .run(code.toUpperCase(), days, maxUses);
}

export function getPromoCode(code: string) {
  return db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code.toUpperCase()) as any;
}

export function usePromoCode(telegramId: number, code: string) {
  const promo = getPromoCode(code);
  if (!promo) return false;

  // Check if user already used it
  const alreadyUsed = db.prepare('SELECT * FROM used_promos WHERE user_id = ? AND promo_code = ?')
    .get(telegramId, promo.code);
  
  if (alreadyUsed) return 'ALREADY_USED';
  if (promo.current_uses >= promo.max_uses) return 'EXHAUSTED';

  // Apply days
  addDaysToUser(telegramId, promo.days);

  // Mark as used
  db.prepare('INSERT INTO used_promos (user_id, promo_code) VALUES (?, ?)').run(telegramId, promo.code);
  db.prepare('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = ?').run(promo.code);

  return true;
}

export function getAllPromoCodes() {
  return db.prepare('SELECT * FROM promo_codes').all() as any[];
}

export function deletePromoCode(code: string) {
  db.prepare('DELETE FROM promo_codes WHERE code = ?').run(code.toUpperCase());
  db.prepare('DELETE FROM used_promos WHERE promo_code = ?').run(code.toUpperCase());
}
