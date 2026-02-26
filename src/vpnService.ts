import axios from 'axios';
import { randomUUID } from 'crypto';
import https from 'https';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

// Ensure trailing slash and clean URL
const PANEL_URL = (process.env.VPN_PANEL_URL || 'https://108.165.174.229:2053/nAsKCqW4R7JCj6J0yR/').replace(/\/+$/, '') + '/';
const USERNAME = process.env.VPN_PANEL_USERNAME || 'admin';
const PASSWORD = process.env.VPN_PANEL_PASSWORD || 'Solbon5796+-';
const INBOUND_ID = parseInt(process.env.VPN_INBOUND_ID || '1');

let cookie = '';

async function login() {
  try {
    console.log(`[VPN] Attempting login to ${PANEL_URL} with user: ${USERNAME}`);
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
      console.log('[VPN] Login successful');
      return true;
    }
    console.error('[VPN] Login failed:', response.data.msg);
    return false;
  } catch (error: any) {
    console.error('[VPN] Login Error:', error.message);
    return false;
  }
}

export async function generateVlessConfig(telegramId: number, username: string | null): Promise<string | null> {
  console.log(`[VPN] >>> Starting config generation for ${telegramId}`);
  
  try {
    if (!cookie) {
      const loggedIn = await login();
      if (!loggedIn) {
        console.error('[VPN] Aborting: Login failed');
        return null;
      }
    }

    const email = `${username || 'user'}_${telegramId}`;
    let clientUuid = randomUUID();
    let isDuplicate = false;

    console.log(`[VPN] Step 1: Adding client ${email} to inbound ${INBOUND_ID}`);
    const addResponse = await axios.post(`${PANEL_URL}panel/api/inbounds/addClient`, {
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
      httpsAgent: agent,
      timeout: 10000
    });

    if (!addResponse.data.success) {
      if (addResponse.data.msg && addResponse.data.msg.includes('Duplicate email')) {
        console.log(`[VPN] Client ${email} already exists, will fetch existing UUID`);
        isDuplicate = true;
      } else {
        console.warn('[VPN] Add client failed, retrying with fresh login...');
        cookie = '';
        const retryLogin = await login();
        if (!retryLogin) return null;
        
        // Second attempt
        const secondAddResponse = await axios.post(`${PANEL_URL}panel/api/inbounds/addClient`, {
          id: INBOUND_ID,
          settings: JSON.stringify({ clients: [{ id: clientUuid, flow: "xtls-rprx-vision", email: email, limitIp: 2, totalGB: 0, expiryTime: 0, enable: true, tgId: telegramId.toString(), subId: "" }] })
        }, { headers: { 'Cookie': cookie }, httpsAgent: agent, timeout: 10000 });

        if (!secondAddResponse.data.success) {
            if (secondAddResponse.data.msg && secondAddResponse.data.msg.includes('Duplicate email')) {
                isDuplicate = true;
            } else {
                console.error('[VPN] Permanent failure adding client:', secondAddResponse.data.msg);
                return null;
            }
        }
      }
    }

    console.log(`[VPN] Step 2: Fetching inbound details for ID ${INBOUND_ID}`);
    const inboundResponse = await axios.get(`${PANEL_URL}panel/api/inbounds/get/${INBOUND_ID}`, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent,
      timeout: 10000
    });

    const inbound = inboundResponse.data.obj;
    if (!inbound) {
      console.error('[VPN] Inbound not found in panel response');
      return null;
    }

    if (isDuplicate) {
      console.log('[VPN] Searching for client UUID in inbound settings...');
      const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
      const existingClient = settings.clients?.find((c: any) => c.email === email);
      if (existingClient) {
        clientUuid = existingClient.id;
        console.log(`[VPN] Found existing UUID: ${clientUuid}`);
      } else {
        console.error(`[VPN] Client ${email} not found in inbound clients list`);
        return null;
      }
    }

    console.log('[VPN] Step 3: Extracting reality settings');
    const streamSettings = typeof inbound.streamSettings === 'string' ? JSON.parse(inbound.streamSettings) : inbound.streamSettings;
    const realitySettings = streamSettings?.realitySettings;
    
    if (!realitySettings) {
      console.error('[VPN] REALITY settings are missing in this inbound. Make sure REALITY is enabled!');
      return null;
    }

    const serverName = realitySettings.serverNames?.[0] || 'google.com';
    const publicKey = realitySettings.publicKey;
    const shortId = realitySettings.shortIds?.[0] || '';
    const port = inbound.port;
    
    let host = '127.0.0.1';
    try {
        host = new URL(PANEL_URL).hostname;
    } catch (e) {
        console.error('[VPN] Invalid PANEL_URL format');
    }

    // Construct VLESS link
    let vlessLink = `vless://${clientUuid}@${host}:${port}?type=tcp&security=reality&sni=${serverName}&fp=chrome&pbk=${publicKey}&sid=${shortId}`;
    
    // Add flow only if it's a standard REALITY port (like 443) or if needed
    if (port === 443) {
      vlessLink += `&flow=xtls-rprx-vision`;
    }
    
    vlessLink += `#ZenVPN_${telegramId}`;
    
    console.log('[VPN] <<< SUCCESS: Config generated');
    return vlessLink;

  } catch (error: any) {
    console.error('[VPN] FATAL ERROR during generation:', error.message);
    if (error.response) {
        console.error('[VPN] Response status:', error.response.status);
        console.error('[VPN] Response data:', error.response.data);
    }
    return null;
  }
}
