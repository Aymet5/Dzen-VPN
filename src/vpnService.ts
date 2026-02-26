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
    const response = await axios.post(`${PANEL_URL}login`, {
      username: USERNAME,
      password: PASSWORD
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent: agent
    });
    
    if (response.data.success) {
      cookie = response.headers['set-cookie']?.[0] || '';
      return true;
    }
    return false;
  } catch (error) {
    console.error('VPN Login Error:', error);
    return false;
  }
}

export async function generateVlessConfig(telegramId: number, username: string | null): Promise<string | null> {
  if (!cookie) {
    const loggedIn = await login();
    if (!loggedIn) return null;
  }

  const email = `${username || 'user'}_${telegramId}`;
  const clientUuid = randomUUID();

  try {
    // Add client to 3X-UI
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

    if (!response.data.success) {
      // If cookie expired, retry once
      cookie = '';
      return generateVlessConfig(telegramId, username);
    }

    // Get Inbound details to construct the link
    const inboundResponse = await axios.get(`${PANEL_URL}panel/api/inbounds/get/${INBOUND_ID}`, {
      headers: { 'Cookie': cookie },
      httpsAgent: agent
    });

    const inbound = inboundResponse.data.obj;
    const streamSettings = JSON.parse(inbound.streamSettings);
    const realitySettings = streamSettings.realitySettings;
    
    const serverName = realitySettings.serverNames[0];
    const publicKey = realitySettings.publicKey;
    const shortId = realitySettings.shortIds[0];
    const port = inbound.port;
    const host = new URL(PANEL_URL!).hostname;

    // Construct VLESS link
    const vlessLink = `vless://${clientUuid}@${host}:${port}?type=tcp&security=reality&sni=${serverName}&fp=chrome&pbk=${publicKey}&sid=${shortId}&flow=xtls-rprx-vision#ZenVPN_${email}`;
    
    return vlessLink;
  } catch (error) {
    console.error('Generate VLESS Error:', error);
    return null;
  }
}
