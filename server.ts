import express from "express";
import { createServer as createViteServer } from "vite";
import { startBot, bot } from "./src/bot.ts";
import { getPendingPayment, updatePaymentStatus, updateSubscription, getUser } from "./src/db.ts";
import { updateClientExpiry } from "./src/vpnService.ts";

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

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
        const SUBSCRIPTION_PLANS = [
          { id: '1', months: 1 },
          { id: '3', months: 3 },
          { id: '6', months: 6 },
          { id: '12', months: 12 },
        ];
        const plan = SUBSCRIPTION_PLANS.find(p => p.id === plan_id);

        if (plan) {
          updateSubscription(telegram_id, plan.months, amount);
          
          // Sync with panel
          const user = getUser(telegram_id);
          if (user && user.vpn_config) {
            const expiryTimestamp = new Date(user.subscription_ends_at).getTime();
            await updateClientExpiry(telegram_id, user.username, expiryTimestamp);
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
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
