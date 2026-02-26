import axios from 'axios';
import { randomUUID } from 'crypto';
import https from 'https';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

const PANEL_URL = process.env.VPN_PANEL_URL || 'https://108.165.174.229:2053/nAsKCqW4R7JCj6J0yR/';
const USERNAME = process.env.VPN_PANEL_USERNAME || 'admin';
const PASSWORD = process.env.VPN_PANEL_PASSWORD || 'Solbon5796+-';
const INBOUND_ID = parseInt(process.env.VPN_INBOUND_ID || '1');

let cookie = '';

async function login() {
  try {
    console.log(`[VPN] Attempting login to ${PANEL_URL} with user: ${USERNAME}`);
    const params = new URLSearchParams();
    params.append('username', USERNAME!);
    params.append('password', PASSWORD!);

    const response = await axios.post(`${PANEL_URL}login`, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent: agent
    });
    
    if (response.data.success) {
      cookie = response.headers['set-cookie']?.[0] || '';
      console.log('[VPN] Login successful');
      return true;
    }
    console.error('[VPN] Login failed:', response.data.msg);
    return false;
  } catch (error: any) {
    console.error('VPN Login Error:', error.message);
    return false;
  }
}

export async function generateVlessConfig(telegramId: number, username: string | null, isRetry = false): Promise<string | null> {
  console.log(`[VPN] Generating config for user ${telegramId}`);
  if (!cookie) {
    const loggedIn = await login();
    if (!loggedIn) return null;
  }

  const email = `${username || 'user'}_${telegramId}`;
  let clientUuid = randomUUID();

  try {
    const response = await axios.post(`${PANEL_URL}panel/api/inbounds/addClient`, {
      id: INBOUND_ID,
      settings: JSON.stringify({
        clients: [{
          id: clientUuid,
          flow: "xtls-rprx-vision",
          email: email,
          limitIp: 2,
          totalGB: 0,
          expiryTime: 0,
          enable: true,
          tgId: telegramId.toString(),
          subId: ""
        }]
      })
    }, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    let isDuplicate = false;
    if (!response.data.success) {
      if (response.data.msg && response.data.msg.includes('Duplicate email')) {
        isDuplicate = true;
      } else if (!isRetry) {
        cookie = '';
        return generateVlessConfig(telegramId, username, true);
      } else {
        console.error('[VPN] Add client failed:', response.data.msg);
        return null;
      }
    }

    const inboundResponse = await axios.get(`${PANEL_URL}panel/api/inbounds/get/${INBOUND_ID}`, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    const inbound = inboundResponse.data.obj;
    if (!inbound) return null;
    
    if (isDuplicate) {
      const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
      const existingClient = settings.clients?.find((c: any) => c.email === email);
      if (existingClient) {
        clientUuid = existingClient.id;
      } else {
        return null;
      }
    }

    const streamSettings = typeof inbound.streamSettings === 'string' ? JSON.parse(inbound.streamSettings) : inbound.streamSettings;
    const realitySettings = streamSettings.realitySettings;
    
    if (!realitySettings) {
      console.error('[VPN] Reality settings not found in inbound!');
      return null;
    }

    const serverName = realitySettings.serverNames[0];
    const publicKey = realitySettings.publicKey;
    const shortId = realitySettings.shortIds[0];
    const port = inbound.port;
    const host = new URL(PANEL_URL!).hostname;

    const vlessLink = `vless://${clientUuid}@${host}:${port}?type=tcp&security=reality&sni=${serverName}&fp=chrome&pbk=${publicKey}&sid=${shortId}&flow=xtls-rprx-vision#ZenVPN_${email}`;
    
    console.log('[VPN] Config generated successfully');
    return vlessLink;
  } catch (error: any) {
    console.error('Generate VLESS Error:', error.message);
    return null;
  }
}
