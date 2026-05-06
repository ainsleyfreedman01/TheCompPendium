// Basic spam checks
function isMissing(v) {
  return v === undefined || v === null || v === '' || v === 'undefined';
}

function isSpammyMessage(msg) {
  if (!msg) return true;
  const urlRegex = /https?:\/\/\S+/gi;
  const urls = msg.match(urlRegex) || [];
  if (urls.length > 1) return true; // too many links

  const spamPhrases = /(buy now|free money|work from home|click here|visit (my )?site|cheap pills|viagra|subscribe)/i;
  if (spamPhrases.test(msg)) return true;

  if ((msg.match(/[A-Z]/g) || []).length / Math.max(1, msg.length) > 0.6) return true;
  return false;
}

function normalizeMessage(msg = '') {
  const letters = msg.replace(/[^A-Za-z]/g, '');
  const up = (letters.match(/[A-Z]/g) || []).length;
  if (letters.length > 0 && up / letters.length > 0.6) {
    msg = msg.toLowerCase();
    msg = msg.charAt(0).toUpperCase() + msg.slice(1);
  }
  return msg.replace(/\s{2,}/g, ' ').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let body = req.body;
  if (!body || Object.keys(body).length === 0) {
    // Vercel should parse JSON, but be defensive
    try { body = JSON.parse(req.rawBody || '{}'); } catch (e) { body = {}; }
  }

  const { name, email, message, honeypot } = body;

  // Normalize message early so spam heuristics operate on the sanitized text
  const safeMessageEarly = normalizeMessage(message);

  // Debug endpoint: when DEBUG_EMAILJS=true and the client posts { debug: true }
  // return which env vars are present (masked) so we can verify runtime config.
  if (process.env.DEBUG_EMAILJS === 'true' && body && body.debug === true) {
    const mask = v => (v ? (v.length > 6 ? `${v.slice(0,3)}...${v.slice(-3)}` : '***') : null);
    const diag = {
      serviceIdSet: !!process.env.EMAILJS_SERVICE_ID,
      templateIdSet: !!process.env.EMAILJS_TEMPLATE_ID,
      userIdSet: !!(process.env.EMAILJS_USER_ID || process.env.EMAILJS_PUBLIC_KEY),
      privateKeySet: !!process.env.EMAILJS_PRIVATE_KEY,
      privateKeyPreview: mask(process.env.EMAILJS_PRIVATE_KEY),
    };
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify(diag));
  }

  if (honeypot && honeypot.trim() !== '') {
    console.log('Honeypot triggered - rejecting submission from', req.headers['x-forwarded-for'] || req.socket.remoteAddress, 'payload:', body);
    return res.status(400).send('Missing required fields');
  }

  if (isMissing(name) || isMissing(email) || isMissing(message)) {
    console.log('Invalid contact form submission - missing fields', req.headers['x-forwarded-for'] || req.socket.remoteAddress, 'payload:', body);
    return res.status(400).send('Missing required fields');
  }

  if (isSpammyMessage(safeMessageEarly)) {
    console.log('Content filtered as spam, routing to reject:', body);
    return res.status(400).send('Missing required fields');
  }

  // Use EmailJS REST API
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const userId = process.env.EMAILJS_USER_ID || process.env.EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !userId) {
    console.error('EmailJS config not set: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID');
    return res.status(500).send('Email provider not configured');
  }

  const safeMessage = safeMessageEarly;
  const emailPayload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: userId,
    template_params: {
      from_name: name,
      from_email: email,
      email: email,
      message: safeMessage,
    },
  };

  if (process.env.TEST_MODE === 'true') {
    console.log('TEST_MODE - EmailJS payload:', emailPayload);
    return res.status(200).send('Message has been sent successfully. (test mode)');
  }
  // Use node-fetch directly for predictable server behavior
  const fetch = require('node-fetch');

  try {
    // Prefer public (no Authorization) flow by default. Only use private/server key
    // when `FORCE_PRIVATE_EMAILJS` is explicitly set to 'true'. This avoids provider
    // 403s when server keys are present in config but not enabled for the account.
    const usedPrivateKey = !!process.env.EMAILJS_PRIVATE_KEY && process.env.FORCE_PRIVATE_EMAILJS === 'true';

    // If private key is present, include accessToken in the payload and Authorization header
    const payload = Object.assign({}, emailPayload);
    if (usedPrivateKey) payload.accessToken = process.env.EMAILJS_PRIVATE_KEY;

    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (usedPrivateKey) headers['Authorization'] = `Bearer ${process.env.EMAILJS_PRIVATE_KEY}`;

    let resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp || !resp.ok) {
      const text = resp ? await resp.text().catch(() => '') : '';
      console.error('EmailJS error', resp && resp.status, text);

      // If server/private-key send was attempted and rejected, retry once with public flow
      if (usedPrivateKey) {
        console.log('Private-key send failed; retrying without Authorization to attempt public flow');
        const publicHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
        // strip accessToken for public retry
        const publicPayload = Object.assign({}, emailPayload);
        const retry = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: publicHeaders,
          body: JSON.stringify(publicPayload),
        });
        if (retry && retry.ok) return res.status(200).send('Message has been sent successfully.');
        const retryText = retry ? await retry.text().catch(() => '') : '';
        console.error('EmailJS retry (no auth) failed', retry && retry.status, retryText);
      }

      if (process.env.DEBUG_EMAILJS === 'true') {
        const statusCode = resp && resp.status ? resp.status : 500;
        // try to parse json for better debug output
        try {
          const j = JSON.parse(text || '{}');
          return res.status(statusCode).json(j);
        } catch (e) {
          return res.status(statusCode).send(text || 'EmailJS error');
        }
      }
      return res.status(500).send('Error sending email');
    }

    // Success: try to return provider JSON body when available
    try {
      const data = await resp.json().catch(() => null);
      if (data) return res.status(200).json(data);
    } catch (e) { /* ignore */ }
    return res.status(200).send('Message has been sent successfully.');
  } catch (err) {
    console.error('EmailJS send error', err);
    if (process.env.DEBUG_EMAILJS === 'true') {
      return res.status(500).send(String(err.stack || err.message || err));
    }
    return res.status(500).send('Error sending email');
  }
};
