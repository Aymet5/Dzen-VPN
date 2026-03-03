import axios from 'axios';
import { randomUUID } from 'crypto';
import https from 'https';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

const PANEL_URL = (process.env.VPN_PANEL_URL || 'https://108.165.174.229:2053/nAsKCqW4R7JCj6J0yR/').replace(/\/+$/, '') + '/';
const USERNAME = process.env.VPN_PANEL_USERNAME || 'admin';
const PASSWORD = process.env.VPN_PANEL_PASSWORD || 'Solbon5796+-';
const INBOUND_ID = parseInt(process.env.VPN_INBOUND_ID || '1');

let cookie = '';

const SPEED_LIMIT_50MBPS = 6250000; // 50 Mbps in bytes per second

async function login() {
  try {
    const params = new URLSearchParams();
    params.append('username', USERNAME);
    params.append('password', PASSWORD);

    const response = await axios.post(`${PANEL_URL}login`, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent: agent,
      timeout: 10000
    });
    
    if (response.data.success) {
      cookie = response.headers['set-cookie']?.[0] || '';
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('[VPN] Login Error:', error.message);
    return false;
  }
}

export async function deleteClient(telegramId: number, username: string | null): Promise<boolean> {
  if (!cookie) {
    const loggedIn = await login();
    if (!loggedIn) return false;
  }

  const email = `${username || 'user'}_${telegramId}`;

  try {
    // First find the client UUID
    const inboundResponse = await axios.get(`${PANEL_URL}panel/api/inbounds/get/${INBOUND_ID}`, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    const inbound = inboundResponse.data.obj;
    if (!inbound) return false;

    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const client = settings.clients?.find((c: any) => c.email === email);
    
    if (!client) return true; // Already deleted

    // Delete the client
    const response = await axios.post(`${PANEL_URL}panel/api/inbounds/${INBOUND_ID}/delClient/${client.id}`, {}, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    return response.data.success;
  } catch (error: any) {
    console.error('[VPN] Delete Client Error:', error.message);
    return false;
  }
}

export async function updateClientExpiry(telegramId: number, username: string | null, expiryTimestamp: number, limitIp: number = 1): Promise<boolean> {
  if (!cookie) {
    const loggedIn = await login();
    if (!loggedIn) return false;
  }

  const email = `${username || 'user'}_${telegramId}`;

  try {
    const inboundResponse = await axios.get(`${PANEL_URL}panel/api/inbounds/get/${INBOUND_ID}`, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    const inbound = inboundResponse.data.obj;
    if (!inbound) return false;

    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const client = settings.clients?.find((c: any) => c.email === email);
    
    if (!client) return false;

    // Update the client expiry time and connection limit
    const response = await axios.post(`${PANEL_URL}panel/api/inbounds/updateClient/${client.id}`, {
      id: INBOUND_ID,
      settings: JSON.stringify({
        clients: [{
          ...client,
          expiryTime: expiryTimestamp,
          limitIp: limitIp,
          up: SPEED_LIMIT_50MBPS,
          down: SPEED_LIMIT_50MBPS
        }]
      })
    }, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    return response.data.success;
  } catch (error: any) {
    console.error('[VPN] Update Client Expiry Error:', error.message);
    return false;
  }
}

export async function generateVlessConfig(telegramId: number, username: string | null, expiryTimestamp: number = 0, limitIp: number = 1): Promise<string | null> {
  try {
    if (!cookie) {
      const loggedIn = await login();
      if (!loggedIn) return null;
    }

    const email = `${username || 'user'}_${telegramId}`;
    let clientUuid = randomUUID();
    let isDuplicate = false;

    const addResponse = await axios.post(`${PANEL_URL}panel/api/inbounds/addClient`, {
      id: INBOUND_ID,
      settings: JSON.stringify({
        clients: [{
          id: clientUuid,
          flow: "",
          email: email,
          limitIp: limitIp,
          totalGB: 0,
          expiryTime: expiryTimestamp, // Передаем реальную дату
          enable: true,
          tgId: telegramId.toString(),
          subId: "",
          up: SPEED_LIMIT_50MBPS,
          down: SPEED_LIMIT_50MBPS
        }]
      })
    }, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    if (!addResponse.data.success) {
      if (addResponse.data.msg && addResponse.data.msg.includes('Duplicate email')) {
        isDuplicate = true;
      } else {
        console.error('[VPN] Add Client Failed:', addResponse.data.msg);
        cookie = '';
        const retry = await login();
        if (!retry) return null;
        return generateVlessConfig(telegramId, username, expiryTimestamp, limitIp);
      }
    }

    const inboundResponse = await axios.get(`${PANEL_URL}panel/api/inbounds/get/${INBOUND_ID}`, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    const inbound = inboundResponse.data.obj;
    if (!inbound) {
      console.error('[VPN] Inbound not found after adding client');
      return null;
    }

    if (isDuplicate) {
      const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
      const existingClient = settings.clients?.find((c: any) => c.email === email);
      if (existingClient) {
        clientUuid = existingClient.id;
        console.log('[VPN] Using existing client UUID:', clientUuid);
        
        // Update existing client to ensure expiry and limit are correct
        await updateClientExpiry(telegramId, username, expiryTimestamp, limitIp);
      } else {
        console.error('[VPN] Duplicate email reported but client not found in inbound settings');
        return null;
      }
    }

    const streamSettings = typeof inbound.streamSettings === 'string' ? JSON.parse(inbound.streamSettings) : inbound.streamSettings;
    const network = streamSettings.network || 'tcp';
    const security = streamSettings.security || 'none';
    
    // Robust Reality settings extraction
    const reality = streamSettings?.realitySettings || streamSettings?.settings?.realitySettings || {};
    const realityInner = reality.settings || {};

    const publicKey = reality.publicKey || realityInner.publicKey || process.env.VPN_PUBLIC_KEY;
    const shortId = reality.shortIds?.[0] || realityInner.shortIds?.[0] || '';
    const serverName = reality.serverNames?.[0] || realityInner.serverNames?.[0] || 'google.com';
    const spiderX = reality.spiderX || realityInner.spiderX || '%2F';

    if (!publicKey && security === 'reality') {
      console.error('[VPN] ERROR: Public Key (pbk) not found for Reality! Reality settings:', JSON.stringify(reality));
      return null;
    }

    const port = inbound.port;
    const host = new URL(PANEL_URL).hostname;

    let vlessLink = `vless://${clientUuid}@${host}:${port}?type=${network}&encryption=none&security=${security}`;
    
    if (security === 'reality') {
      vlessLink += `&pbk=${publicKey}&fp=chrome&sni=${serverName}&sid=${shortId}&spx=${encodeURIComponent(spiderX)}`;
    }
    
    vlessLink += `#ZenVPN_${email}`;
    
    console.log('[VPN] Success! Generated Link:', vlessLink);
    return vlessLink;

  } catch (error: any) {
    console.error('[VPN] Fatal Error:', error.message);
    return null;
  }
}
