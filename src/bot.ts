import { Telegraf, Markup } from 'telegraf';
import { getUser, createUser, updateSubscription, updateVpnConfig, getAllUsers } from './db.ts';
import { generateVlessConfig, deleteClient } from './vpnService.ts';

const BOT_TOKEN = process.env.BOT_TOKEN || '8208808548:AAGYjjNDU79JP-0TRUxv0HuEfKBchlNVAfM';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
export const bot = new Telegraf(BOT_TOKEN);

const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('🚀 Получить VPN', 'get_vpn')],
  [Markup.button.callback('👤 Моя подписка', 'my_sub'), Markup.button.callback('📖 Инструкция', 'how_to')],
  [Markup.button.callback('💳 Купить подписку', 'buy_sub')],
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
  if (!ADMIN_IDS.includes(tgId)) {
    return;
  }

  const users = getAllUsers();
  const totalUsers = users.length;
  const now = new Date();
  
  let activeSubs = 0;
  let totalRevenue = 0;
  
  let userList = users.map(u => {
    const endsAt = new Date(u.subscription_ends_at);
    const isActive = endsAt > now;
    if (isActive) activeSubs++;
    totalRevenue += u.total_spent;
    
    const statusIcon = isActive ? '✅' : '❌';
    const premiumIcon = u.total_spent > 0 ? '💎' : '🆓';
    
    return `${premiumIcon} ID: ${u.telegram_id} | @${u.username || 'no_name'}\n   └ До: ${endsAt.toLocaleDateString('ru-RU')} ${statusIcon} | Потрачено: ${u.total_spent} ⭐️`;
  }).join('\n\n');

  const statsText = `📊 *Админ-панель ДзенVPN*

Всего пользователей: ${totalUsers}
Активных подписок: ${activeSubs}
Общая выручка: ${totalRevenue} ⭐️

*Список пользователей:*
${userList || 'Пользователей пока нет'}`;

  // Split message if it's too long (Telegram limit is 4096 chars)
  if (statsText.length > 4000) {
    const chunks = statsText.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } else {
    await ctx.reply(statsText, { parse_mode: 'Markdown' });
  }
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
  const text = `💳 *Купить подписку*\n\nКак купить Telegram Stars? Оплатить можно банковской картой прямо в Telegram при покупке. Звезды зачислятся моментально.\n\nВыберите тариф:`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('1 Месяц - 100 ⭐️', 'buy_1')],
      [Markup.button.callback('6 Месяцев - 500 ⭐️', 'buy_6')],
      [Markup.button.callback('1 Год - 900 ⭐️', 'buy_12')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ])
  });
});

bot.action(/^buy_(\d+)$/, async (ctx) => {
  const months = parseInt(ctx.match[1]);
  let amount = 0;
  let title = '';
  
  if (months === 1) { amount = 100; title = 'Подписка на 1 месяц'; }
  else if (months === 6) { amount = 500; title = 'Подписка на 6 месяцев'; }
  else if (months === 12) { amount = 900; title = 'Подписка на 1 год'; }
  else return;

  await ctx.deleteMessage().catch(() => {});
  
  await ctx.replyWithInvoice({
    title: title,
    description: `Оплата подписки ДзенVPN на ${months} мес.`,
    payload: `sub_${months}_${ctx.from.id}`,
    provider_token: '', // Empty for Telegram Stars
    currency: 'XTR',
    prices: [{ label: title, amount: amount }]
  }, Markup.inlineKeyboard([
    [Markup.button.pay(`Оплатить ${amount} ⭐️`)],
    [Markup.button.callback('Отмена', 'main_menu')]
  ]));
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const payload = ctx.message.successful_payment.invoice_payload;
  const amount = ctx.message.successful_payment.total_amount; // Stars amount
  const match = payload.match(/^sub_(\d+)_(\d+)$/);
  if (match) {
    const months = parseInt(match[1]);
    const tgId = parseInt(match[2]);
    updateSubscription(tgId, months, amount);
    
    await ctx.reply(`✅ Оплата прошла успешно! Ваша подписка продлена на ${months} мес.`);
    await sendMainMenu(ctx, false);
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
      const config = await generateVlessConfig(ctx.from.id, ctx.from.username || null);
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
    // 1. Delete from panel
    await deleteClient(ctx.from.id, ctx.from.username || null);
    
    // 2. Clear in DB
    updateVpnConfig(ctx.from.id, null);
    
    // 3. Generate new
    const config = await generateVlessConfig(ctx.from.id, ctx.from.username || null);
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

1. Скачайте приложение [v2rayNG](https://play.google.com/store/apps/details?id=com.v2ray.ang).
2. Скопируйте ваш ключ (VLESS-ссылку) из раздела "🚀 Получить VPN".
3. Откройте v2rayNG и нажмите на иконку *"+"* в правом верхнем углу.
4. Выберите *"Import config from clipboard"*.
5. Нажмите на добавленный профиль (он станет серым/выделенным).
6. Нажмите на круглую кнопку с иконкой *V* внизу для подключения.
7. При первом запуске разрешите создание VPN-соединения.

✅ *Готово!*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'how_to')]])
  });
});

bot.action('how_ios', async (ctx) => {
  const text = `🍏 *Инструкция для iOS (iPhone/iPad)*

1. Установите [V2Ray Tun](https://apps.apple.com/us/app/v2ray-tun/id1466598387) или [Streisand](https://apps.apple.com/us/app/streisand/id6450534064).
2. Скопируйте ваш ключ (VLESS-ссылку).
3. В приложении (например, Streisand) нажмите *"+"* -> *"Import from Clipboard"*.
4. Выберите добавленный сервер и нажмите кнопку подключения (Connect).
5. Разрешите добавление конфигурации VPN в настройках iPhone.

✅ *Готово!*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'how_to')]])
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
