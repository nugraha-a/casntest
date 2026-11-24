const crypto = require('crypto');

const TARGET_HASH = '82f5bacfb16f052a221735719214613fa29d3110c5295ff5ba38195267d387bd';
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 300;
const COOKIE_NAME = '__cat_rl';
const HMAC_SECRET = process.env.AUTH_HMAC_SECRET || 'CAT_SKD_2026_VERCEL_HMAC_KEY_FALLBACK';

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/+$/, ''), token };
  }
  return null;
}

async function redisCommand(config, args) {
  const resp = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  if (!resp.ok) throw new Error('Redis REST error');
  const data = await resp.json();
  return data.result;
}

function signState(stateObj) {
  const payload = Buffer.from(JSON.stringify(stateObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySignedState(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      cookies[k] = decodeURIComponent(v);
    }
  });
  return cookies;
}

function setRateLimitCookie(res, stateObj) {
  const signed = signState(stateObj);
  const cookieVal = `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOLDOWN_SECONDS * 2}`;
  res.setHeader('Set-Cookie', cookieVal);
}

async function getRateLimitState(req) {
  const ip = getClientIp(req);
  const redis = getRedisConfig();
  const now = Date.now();

  if (redis) {
    try {
      const raw = await redisCommand(redis, ['GET', `cat_rl:${ip}`]);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lockoutUntil && parsed.lockoutUntil <= now) {
          return { failCount: 0, lockoutUntil: 0 };
        }
        return parsed;
      }
      return { failCount: 0, lockoutUntil: 0 };
    } catch (e) {
      // Fall through to memory + cookie
    }
  }

  if (!globalThis.__catRateLimit) {
    globalThis.__catRateLimit = new Map();
  }
  const memState = globalThis.__catRateLimit.get(ip);
  const cookies = parseCookies(req);
  const cookieState = verifySignedState(cookies[COOKIE_NAME]);

  let current = { failCount: 0, lockoutUntil: 0 };
  if (memState && cookieState) {
    current = (memState.failCount >= cookieState.failCount || memState.lockoutUntil >= cookieState.lockoutUntil)
      ? { ...memState }
      : { ...cookieState };
  } else if (memState) {
    current = { ...memState };
  } else if (cookieState) {
    current = { ...cookieState };
  }

  if (current.lockoutUntil && current.lockoutUntil <= now) {
    current = { failCount: 0, lockoutUntil: 0 };
    globalThis.__catRateLimit.set(ip, current);
  }
  return current;
}

async function saveRateLimitState(req, res, stateObj) {
  const ip = getClientIp(req);
  const redis = getRedisConfig();

  if (redis) {
    try {
      await redisCommand(redis, ['SET', `cat_rl:${ip}`, JSON.stringify(stateObj), 'EX', COOLDOWN_SECONDS * 2]);
      return;
    } catch (e) {
      // Fall through to memory + cookie
    }
  }

  if (!globalThis.__catRateLimit) {
    globalThis.__catRateLimit = new Map();
  }
  globalThis.__catRateLimit.set(ip, stateObj);
  setRateLimitCookie(res, stateObj);
}

function formatStatusResponse(stateObj) {
  const now = Date.now();
  const locked = Boolean(stateObj.lockoutUntil && stateObj.lockoutUntil > now);
  const lockoutSeconds = locked ? Math.ceil((stateObj.lockoutUntil - now) / 1000) : 0;
  const failCount = locked ? MAX_ATTEMPTS : (stateObj.failCount || 0);
  const remainingAttempts = locked ? 0 : Math.max(0, MAX_ATTEMPTS - failCount);

  return {
    serverEnforced: true,
    locked,
    failCount,
    remainingAttempts,
    lockoutSeconds
  };
}

module.exports = {
  TARGET_HASH,
  MAX_ATTEMPTS,
  COOLDOWN_SECONDS,
  getRateLimitState,
  saveRateLimitState,
  formatStatusResponse
};
