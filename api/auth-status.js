const { getRateLimitState, formatStatusResponse } = require('./_rateLimit');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const stateObj = await getRateLimitState(req);
  res.statusCode = 200;
  res.end(JSON.stringify(formatStatusResponse(stateObj)));
};
