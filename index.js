'use strict';

const mineflayer = require('mineflayer');
const config = require('./settings.json');

let bot = null;
let reconnectTimeoutId = null;
let isReconnecting = false;
let reconnectAttempts = 0;
let isSpawned = false;
let loginInterval = null;

function getReconnectDelay() {
  const baseDelay = config.utils['auto-reconnect-delay'] || 3000;
  const maxDelay = config.utils['max-reconnect-delay'] || 30000;
  const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
  const jitter = Math.floor(Math.random() * 2000);
  return delay + jitter;
}

function createBot() {
  if (isReconnecting) {
    console.log('[Bot] Already reconnecting, skipping...');
    return;
  }

  isSpawned = false;

  if (bot) {
    try { bot.removeAllListeners(); bot.end(); } catch (e) { }
    bot = null;
  }

  const botVersion = config.server.version ? config.server.version : false;
  const botUsername = process.env.BOT_USERNAME || config['bot-account'].username;
  const authPassword = process.env.BOT_AUTH_PASSWORD || config.utils['auto-auth']?.password;

  console.log(`[Bot] Connecting to ${config.server.ip}:${config.server.port}...`);

  try {
    bot = mineflayer.createBot({
      username: botUsername,
      password: undefined,
      auth: 'offline',
      host: config.server.ip,
      port: config.server.port,
      version: botVersion,
      hideErrors: false,
      checkTimeoutInterval: 600000
    });

    setTimeout(() => {
      if (bot && bot.entity === undefined) {
        console.log('[Bot] Connection timeout - no spawn received');
        try { bot.end(); } catch (e) { }
        bot = null;
        scheduleReconnect();
      }
    }, 60000);

    bot.once('spawn', () => {
      console.log(`[Bot] Spawned (version: ${bot.version})`);

      isSpawned = true;
      reconnectAttempts = 0;

      if (loginInterval) {
        clearInterval(loginInterval);
        loginInterval = null;
        console.log('[Auth] Stopped auth loop - spawned successfully');
      }

      bot.on('messagestr', (message) => {
        console.log(`[Chat] ${message}`);
      });
    });

    bot.on('kicked', (reason) => {
      const kickReason = typeof reason === 'object' ? JSON.stringify(reason) : reason;
      console.log(`[Bot] Kicked: ${kickReason}`);
      isSpawned = false;
      try { bot.end(); } catch (e) { }
      bot = null;
      scheduleReconnect();
    });

    bot.on('end', (reason) => {
      console.log(`[Bot] Disconnected: ${reason || 'Unknown'}`);
      isSpawned = false;
      bot = null;
      scheduleReconnect();
    });

    bot.on('error', (err) => {
      console.log(`[Bot] Error: ${err.message}`);
    });

    bot.on('connect', () => {
      console.log('[Bot] Connection established, starting auth loop...');

      if (!isSpawned && config.utils['auto-auth']?.enabled && authPassword) {
        const sendLogin = () => {
          try {
            if (bot && !isSpawned) {
              bot.chat(`/login ${authPassword}`);
              console.log(`[Auth] Sent /login`);
            }
          } catch (e) {
            console.log(`[Auth] Error: ${e.message}`);
          }
        };

        setTimeout(() => {
          if (bot && !isSpawned) sendLogin();

          loginInterval = setInterval(() => {
            if (bot && !isSpawned) {
              sendLogin();
            } else if (loginInterval) {
              clearInterval(loginInterval);
              loginInterval = null;
            }
          }, 5000);
        }, 2000);
      }
    });

  } catch (err) {
    console.log(`[Bot] Failed to create bot: ${err.message}`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }

  if (isReconnecting) return;

  isReconnecting = true;
  reconnectAttempts++;

  const delay = getReconnectDelay();
  console.log(`[Bot] Reconnecting in ${delay / 1000}s (attempt #${reconnectAttempts})`);

  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    isReconnecting = false;
    createBot();
  }, delay);
}

console.log('='.repeat(50));
console.log('  Minecraft Simple Bot');
console.log('='.repeat(50));
console.log(`Server:       ${config.server.ip}:${config.server.port}`);
console.log(`Bot Username: ${process.env.BOT_USERNAME || config['bot-account'].username}`);
console.log(`Auth:         ${config.utils['auto-auth']?.enabled ? 'Enabled' : 'Disabled'}`);
console.log(`Auth Password: ${process.env.BOT_AUTH_PASSWORD || config.utils['auto-auth']?.password || 'NOT SET'}`);
console.log('='.repeat(50));

createBot();
