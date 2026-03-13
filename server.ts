import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { startBot, bot } from "./src/bot.ts";
import { 
  getPendingPayment, 
  updatePaymentStatus, 
  updateSubscription, 
  getUser, 
  getAllUsers,
  getAllPlans,
  updatePlanPrice,
  getAllPayments,
  updateConnectionLimit,
  blockUser,
  extendSubscription,
  getAllPromoCodes,
  createPromoCode,
  deletePromoCode
} from "./src/db.ts";
import { updateClientExpiry } from "./src/vpnService.ts";

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const PORT = process.env.PORT || 3000;

  // Request logging middleware
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] API Request: ${req.method} ${req.url}`);
    }
    next();
  });

  // YooKassa Webhook
  app.post("/api/yookassa/webhook", async (req, res) => {
    const event = req.body;
    console.log('[Yookassa Webhook] Received event:', event.event);

    if (event.event === 'payment.succeeded') {
      const payment = event.object;
      const pending = getPendingPayment(payment.id);

      if (pending && pending.status === 'pending') {
        updatePaymentStatus(payment.id, 'succeeded');
        
        const { telegram_id, plan_id, amount } = pending;
        const plans = getAllPlans();
        const plan = plans.find(p => p.id === plan_id);

        if (plan) {
          updateSubscription(telegram_id, plan.months, amount);
          updateConnectionLimit(telegram_id, plan.connection_limit || 1);
          
          // Sync with panel
          const user = getUser(telegram_id);
          if (user && user.vpn_config) {
            const expiryTimestamp = new Date(user.subscription_ends_at).getTime();
            await updateClientExpiry(telegram_id, user.username, expiryTimestamp, user.connection_limit);
          }

          // Notify user
          try {
            await bot.telegram.sendMessage(telegram_id, `✅ *Оплата получена!* Ваша подписка продлена.`, { parse_mode: 'Markdown' });
          } catch (e) {
            console.error('Failed to notify user via bot:', e);
          }
        }
      }
    }
    res.sendStatus(200);
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Admin Panel API
  app.get("/api/admin/users", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const users = getAllUsers();
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/plans", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(getAllPlans());
  });

  app.post("/api/admin/plans/update", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { id, price } = req.body;
    if (!id || price === undefined) {
      return res.status(400).json({ error: "Missing id or price" });
    }
    updatePlanPrice(id, Number(price));
    res.json({ success: true });
  });

  app.post("/api/admin/users/block", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { telegram_id, blocked } = req.body;
    if (!telegram_id) {
      return res.status(400).json({ error: "Missing telegram_id" });
    }
    blockUser(telegram_id, blocked);
    res.json({ success: true });
  });

  app.post("/api/admin/users/extend", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { telegram_id, days } = req.body;
    if (!telegram_id || !days) {
      return res.status(400).json({ error: "Missing telegram_id or days" });
    }
    extendSubscription(telegram_id, Number(days));
    
    // Sync with panel
    const user = getUser(telegram_id);
    if (user && user.vpn_config) {
      const expiryTimestamp = new Date(user.subscription_ends_at).getTime();
      await updateClientExpiry(telegram_id, user.username, expiryTimestamp, user.connection_limit);
    }
    
    res.json({ success: true });
  });

  app.post("/api/admin/broadcast", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }
    
    const users = getAllUsers();
    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
        successCount++;
      } catch (e) {
        failCount++;
      }
    }
    
    res.json({ success: true, successCount, failCount });
  });

  app.get("/api/admin/payments", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(getAllPayments());
  });

  app.get("/api/admin/promos", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(getAllPromoCodes());
  });

  app.post("/api/admin/promos/create", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { code, days, max_uses } = req.body;
    createPromoCode(code, days, max_uses);
    res.json({ success: true });
  });

  app.post("/api/admin/promos/delete", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer Solbon5796+-") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { code } = req.body;
    deletePromoCode(code);
    res.json({ success: true });
  });

  // Start Telegram Bot
  startBot();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback for production
    app.get("*", (req, res) => {
      if (!req.url.startsWith('/api')) {
        res.sendFile(path.join(distPath, "index.html"));
      } else {
        res.status(404).json({ error: "API route not found" });
      }
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server [vpn-bot] running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
