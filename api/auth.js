const {
  TARGET_HASH,
  MAX_ATTEMPTS,
  COOLDOWN_SECONDS,
  getRateLimitState,
  saveRateLimitState,
  formatStatusResponse
} = require('./_rateLimit');

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const stateObj = await getRateLimitState(req);
  const statusInfo = formatStatusResponse(stateObj);

  if (statusInfo.locked) {
    res.statusCode = 429;
    res.end(JSON.stringify({
      ok: false,
      ...statusInfo
    }));
    return;
  }

  const body = await readJsonBody(req);
  const submittedHash = typeof body.hash === 'string' ? body.hash.trim().toLowerCase() : '';

  if (submittedHash === TARGET_HASH) {
    const cleanState = { failCount: 0, lockoutUntil: 0 };
    await saveRateLimitState(req, res, cleanState);
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      serverEnforced: true,
      locked: false,
      failCount: 0,
      remainingAttempts: MAX_ATTEMPTS,
      lockoutSeconds: 0
    }));
    return;
  }

  const nextFail = (stateObj.failCount || 0) + 1;
  if (nextFail >= MAX_ATTEMPTS) {
    const lockedState = {
      failCount: MAX_ATTEMPTS,
      lockoutUntil: Date.now() + COOLDOWN_SECONDS * 1000
    };
    await saveRateLimitState(req, res, lockedState);
    const lockedInfo = formatStatusResponse(lockedState);
    res.statusCode = 429;
    res.end(JSON.stringify({
      ok: false,
      ...lockedInfo
    }));
    return;
  }

  const nextState = { failCount: nextFail, lockoutUntil: 0 };
  await saveRateLimitState(req, res, nextState);
  const nextInfo = formatStatusResponse(nextState);
  res.statusCode = 401;
  res.end(JSON.stringify({
    ok: false,
    ...nextInfo
  }));
};
