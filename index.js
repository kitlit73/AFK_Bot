'use strict';

const mineflayer = require('mineflayer');
const config = require('./settings.json');

let bot = null;
let reconnectTimeoutId = null;
let isReconnecting = false;
let reconnectAttempts = 0;

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

    bot.once('spawn', () => {
      console.log(`[Bot] Spawned (version: ${bot.version})`);

      reconnectAttempts = 0;
      isReconnecting = false;

      bot.on('messagestr', (message) => {
        console.log(`[Chat] ${message}`);
      });

      if (config.utils['auto-auth']?.enabled && authPassword) {
        console.log(`[Auth] auto-auth enabled, password: ${authPassword}`);

        bot.chat(`/login ${authPassword}`);
        console.log(`[Auth] Sent /login`);

        setTimeout(() => {
          if (bot) {
            bot.chat(`/login ${authPassword}`);
            console.log(`[Auth] Backup /login sent`);
          }
        }, 3000);

        bot.on('messagestr', (message) => {
          const msg = message.toLowerCase();
          if (msg.includes('register') || msg.includes('/register') || msg.includes('지정된 비밀번호')) {
            if (bot) {
              bot.chat(`/register ${authPassword} ${authPassword}`);
              console.log(`[Auth] Sent /register`);
            }
          }
        });
      } else {
        console.log(`[Auth] auto-auth disabled or no password`);
      }
    });

    bot.on('kicked', (reason) => {
      const kickReason = typeof reason === 'object' ? JSON.stringify(reason) : reason;
      console.log(`[Bot] Kicked: ${kickReason}`);
      try { bot.end(); } catch (e) { }
      bot = null;
      scheduleReconnect();
    });

    bot.on('end', (reason) => {
      console.log(`[Bot] Disconnected: ${reason || 'Unknown'}`);
      bot = null;
      scheduleReconnect();
    });

    bot.on('error', (err) => {
      console.log(`[Bot] Error: ${err.message}`);
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
