import { Telegraf, Markup } from 'telegraf';
import { getUser, createUser, updateSubscription, updateVpnConfig, getAllUsers } from './db.ts';
import { generateVlessConfig, deleteClient, updateClientExpiry } from './vpnService.ts';

const BOT_TOKEN = process.env.BOT_TOKEN || '8208808548:AAGYjjNDU79JP-0TRUxv0HuEfKBchlNVAfM';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
export const bot = new Telegraf(BOT_TOKEN);

const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('🚀 Получить VPN', 'get_vpn')],
  [Markup.button.callback('👤 Моя подписка', 'my_sub'), Markup.button.callback('📖 Инструкция', 'how_to')],
  [Markup.button.callback('💳 Купить подписку', 'buy_sub')],
  [Markup.button.callback('🎁 Пригласить друга', 'invite_friends')],
  [Markup.button.url('💬 Поддержка', 'https://t.me/podder5')]
]);

async function sendMainMenu(ctx: any, edit = false) {
  const text = '👋 Добро пожаловать в ДзенVPN!\n\nВыберите действие в меню ниже:';
  if (edit) {
    try {
      await ctx.editMessageText(text, MAIN_MENU);
    } catch (e) {
      // Message is not modified or other error
    }
  } else {
    await ctx.reply(text, MAIN_MENU);
  }
}

const YOOKASSA_PROVIDER_TOKEN = process.env.YOOKASSA_PROVIDER_TOKEN || '';

const SUBSCRIPTION_PLANS = [
  { id: '1', label: '1 месяц', months: 1, price: 99, description: 'Базовый доступ на 30 дней' },
  { id: '3', label: '3 месяца', months: 3, price: 249, description: 'Экономия 15% - Квартальный доступ' },
  { id: '6', label: '6 месяцев', months: 6, price: 449, description: 'Экономия 25% - Полгода свободы' },
  { id: '12', label: '12 месяцев', months: 12, price: 799, description: 'Экономия 33% - Целый год без границ' },
];

bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  const username = ctx.from.username || null;
  
  let user = getUser(tgId);
  if (!user) {
    user = createUser(tgId, username);
    await ctx.reply('🎁 Вам начислено 7 дней бесплатного пробного периода!');
  }
  
  await sendMainMenu(ctx, false);
});

bot.command('admin', async (ctx) => {
  const tgId = ctx.from.id;
  if (!ADMIN_IDS.includes(tgId)) return;

  const users = getAllUsers();
  const now = new Date();
  
  let activeSubs = 0;
  let trialUsers = 0;
  let totalRevenue = 0;
  
  users.forEach(u => {
    const endsAt = new Date(u.subscription_ends_at);
    if (endsAt > now) {
      activeSubs++;
      if (u.total_spent === 0) trialUsers++;
    }
    totalRevenue += u.total_spent;
  });

  const statsText = `📊 *Админ-панель ДзенVPN*

👥 Всего пользователей: ${users.length}
✅ Активных подписок: ${activeSubs}
🎁 На пробном периоде: ${trialUsers}
💰 Общая выручка: ${totalRevenue} ₽`;

  await ctx.reply(statsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📥 Скачать базу (CSV)', 'download_csv')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ])
  });
});

bot.action('download_csv', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;

  const users = getAllUsers();
  let csv = 'ID;Telegram ID;Username;Trial Started;Subscription Ends;Total Spent (RUB)\n';
  
  users.forEach(u => {
    csv += `${u.id};${u.telegram_id};${u.username || ''};${u.trial_started_at};${u.subscription_ends_at};${u.total_spent}\n`;
  });

  const buffer = Buffer.from(csv, 'utf-8');
  await ctx.replyWithDocument({ source: buffer, filename: 'users_database.csv' });
  await ctx.answerCbQuery();
});

bot.action('main_menu', async (ctx) => {
  await sendMainMenu(ctx, true);
});

bot.action('my_sub', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return;

  const endsAt = new Date(user.subscription_ends_at);
  const now = new Date();
  const isActive = endsAt > now;
  
  const status = isActive ? '✅ Активна' : '❌ Истекла';
  const dateStr = endsAt.toLocaleString('ru-RU');

  const text = `👤 *Моя подписка*\n\nСтатус: ${status}\nДействует до: ${dateStr}`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'main_menu')]])
  });
});

bot.action('buy_sub', async (ctx) => {
  const text = `💳 *Выберите тарифный план:*

Мы подготовили для вас самые выгодные условия. Чем дольше период, тем дешевле обходится месяц!`;
  
  const buttons = SUBSCRIPTION_PLANS.map(plan => [
    Markup.button.callback(`${plan.label} — ${plan.price} ₽`, `buy_${plan.id}`)
  ]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'main_menu')]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action(/^buy_(\d+)$/, async (ctx) => {
  const planId = ctx.match[1];
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
  
  if (!plan) return;

  if (!YOOKASSA_PROVIDER_TOKEN) {
    await ctx.answerCbQuery('❌ Ошибка: Платежная система не настроена.', { show_alert: true });
    return;
  }

  await ctx.deleteMessage().catch(() => {});
  
  await ctx.replyWithInvoice({
    title: `ДзенVPN: ${plan.label}`,
    description: plan.description,
    payload: `sub_${plan.id}_${ctx.from.id}`,
    provider_token: YOOKASSA_PROVIDER_TOKEN,
    currency: 'RUB',
    prices: [{ label: plan.label, amount: plan.price * 100 }], // Amount in kopecks
    start_parameter: `sub_${plan.id}`,
  });
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const payload = ctx.message.successful_payment.invoice_payload;
  const amount = ctx.message.successful_payment.total_amount / 100;
  const parts = payload.split('_');
  const planId = parts[1];
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);

  if (plan) {
    updateSubscription(ctx.from.id, plan.months, amount);
    
    // Sync with panel immediately
    const user = getUser(ctx.from.id);
    if (user && user.vpn_config) {
      const expiryTimestamp = new Date(user.subscription_ends_at).getTime();
      await updateClientExpiry(ctx.from.id, ctx.from.username || null, expiryTimestamp);
    }
    
    await ctx.reply(`🎉 *Оплата прошла успешно!*

Ваша подписка продлена на *${plan.label}*. 
Теперь вы можете получить или обновить свой VPN-конфиг в главном меню.`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🚀 Начать пользоваться', 'main_menu')]])
    });
  }
});

bot.action('get_vpn', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return;

  const endsAt = new Date(user.subscription_ends_at);
  const now = new Date();
  
  if (endsAt <= now) {
    await ctx.editMessageText('❌ Ваша подписка истекла. Пожалуйста, продлите её для получения доступа к VPN.', Markup.inlineKeyboard([
      [Markup.button.callback('💳 Купить подписку', 'buy_sub')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ]));
    return;
  }

  if (user.vpn_config) {
    await sendVpnConfig(ctx, user.vpn_config);
  } else {
    await ctx.editMessageText('⏳ Генерируем ваш уникальный конфиг...', Markup.inlineKeyboard([]));
    
    try {
      const expiryTimestamp = new Date(user.subscription_ends_at).getTime();
      const config = await generateVlessConfig(ctx.from.id, ctx.from.username || null, expiryTimestamp);
      if (config) {
        updateVpnConfig(ctx.from.id, config);
        await sendVpnConfig(ctx, config);
      } else {
        throw new Error('Failed to generate config');
      }
    } catch (error) {
      console.error('VPN Generation Error:', error);
      await ctx.editMessageText(
        '❌ Произошла ошибка при генерации конфига. Пожалуйста, обратитесь в поддержку.',
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'main_menu')]])
      );
    }
  }
});

bot.action('reset_vpn', async (ctx) => {
  await ctx.editMessageText('⏳ Сбрасываем текущее подключение и генерируем новое...', Markup.inlineKeyboard([]));
  
  try {
    const user = getUser(ctx.from.id);
    const expiryTimestamp = user ? new Date(user.subscription_ends_at).getTime() : 0;
    
    // 1. Delete from panel
    await deleteClient(ctx.from.id, ctx.from.username || null);
    
    // 2. Clear in DB
    updateVpnConfig(ctx.from.id, null);
    
    // 3. Generate new
    const config = await generateVlessConfig(ctx.from.id, ctx.from.username || null, expiryTimestamp);
    if (config) {
      updateVpnConfig(ctx.from.id, config);
      await sendVpnConfig(ctx, config);
    } else {
      throw new Error('Failed to generate new config');
    }
  } catch (error) {
    console.error('VPN Reset Error:', error);
    await ctx.answerCbQuery('❌ Ошибка при обновлении. Попробуйте позже.', { show_alert: true });
    await sendMainMenu(ctx, false);
  }
});

bot.action('how_to', async (ctx) => {
  const text = `📖 *Как подключить ДзенVPN?*

Настройка займет всего 2 минуты. Выберите ваше устройство, чтобы получить подробную инструкцию:`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📱 Android', 'how_android'), Markup.button.callback('🍏 iOS (iPhone)', 'how_ios')],
      [Markup.button.callback('💻 Windows', 'how_pc'), Markup.button.callback('🍎 macOS', 'how_mac')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ])
  });
});

bot.action('how_android', async (ctx) => {
  const text = `🤖 *Инструкция для Android*

1. Скачайте приложение *Happ Proxy* по кнопке ниже.
2. Скопируйте ваш ключ (VLESS-ссылку) из раздела "🚀 Получить VPN".
3. Откройте приложение и добавьте конфиг через иконку *"+"* или *"Import"*.
4. Нажмите на добавленный профиль и кнопку подключения.
5. При первом запуске разрешите создание VPN-соединения.

✅ *Готово!*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([
      [Markup.button.url('📥 Скачать Happ Proxy (Play Store)', 'https://play.google.com/store/apps/details?id=com.happproxy')],
      [Markup.button.callback('⬅️ Назад', 'how_to')]
    ])
  });
});

bot.action('how_ios', async (ctx) => {
  const text = `🍏 *Инструкция для iOS (iPhone/iPad)*

1. Установите приложение *Happ Proxy* по кнопке ниже.
2. Скопируйте ваш ключ (VLESS-ссылку).
3. В приложении нажмите *"+"* -> *"Import from Clipboard"*.
4. Выберите добавленный сервер и нажмите кнопку подключения (Connect).
5. Разрешите добавление конфигурации VPN в настройках iPhone.

✅ *Готово!*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([
      [Markup.button.url('📥 Скачать Happ Proxy (App Store)', 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215')],
      [Markup.button.callback('⬅️ Назад', 'how_to')]
    ])
  });
});

bot.action('how_pc', async (ctx) => {
  const text = `💻 *Инструкция для Windows*

1. Скачайте [v2rayN-Core.zip](https://github.com/2dust/v2rayN/releases) и распакуйте его.
2. Запустите *v2rayN.exe*.
3. Скопируйте ваш ключ (VLESS-ссылку).
4. В программе нажмите *"Servers"* -> *"Import bulk URL from clipboard"*.
5. Нажмите правой кнопкой на сервер -> *"Set as active server"*.
6. В системном трее (возле часов) нажмите правой кнопкой на иконку v2rayN -> *"System Proxy"* -> *"Set system proxy"*.

✅ *Готово!*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'how_to')]])
  });
});

bot.action('how_mac', async (ctx) => {
  const text = `🍎 *Инструкция для macOS*

1. Установите [FoXray](https://apps.apple.com/us/app/foxray/id6448898396) или [V2RayXS](https://github.com/Cenmrev/V2RayX/releases).
2. Скопируйте ваш ключ (VLESS-ссылку).
3. В приложении нажмите кнопку добавления сервера из буфера обмена.
4. Выберите сервер и нажмите кнопку подключения.

✅ *Готово!*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'how_to')]])
  });
});

async function sendVpnConfig(ctx: any, config: string) {
  const text = `🚀 *Ваш VPN конфиг (VLESS):*

\`${config}\`
_(Нажмите на код выше, чтобы скопировать)_

*Краткая инструкция:*
1. Установите приложение для вашего устройства.
2. Импортируйте скопированный ключ.
3. Нажмите кнопку "Подключиться".

📖 Подробные пошаговые инструкции для всех устройств доступны в главном меню в разделе *"Инструкция"*`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Обновить подключение', 'reset_vpn')],
      [Markup.button.callback('📖 Подробная инструкция', 'how_to')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ])
  });
}

bot.action('invite_friends', async (ctx) => {
  const botUsername = ctx.botInfo.username;
  const shareLink = `https://t.me/${botUsername}?start=ref_${ctx.from.id}`;
  
  const text = `🎁 *Приглашайте друзей и делитесь свободой!*

Ваша персональная ссылка для приглашения:
\`${shareLink}\`

Отправьте эту ссылку друзьям. Когда они подключатся, они получат 7 дней пробного периода, а вы поможете нашему сервису расти!`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.url('🚀 Поделиться ссылкой', `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent('Попробуй быстрый и надежный ДзенVPN! 7 дней бесплатно по моей ссылке:')}`)],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ])
  });
});
bot.on('message', async (ctx) => {
  if ('text' in ctx.message && !ctx.message.text.startsWith('/start')) {
    try {
      await ctx.deleteMessage();
      await sendMainMenu(ctx, false);
    } catch (e) {
      console.error('Failed to delete message', e);
    }
  }
});

export function startBot() {
  bot.launch().then(() => console.log('Bot started'));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
