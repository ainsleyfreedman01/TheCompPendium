// Copied serverless handler so functions are available when Vercel Project Root = mainPage
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let body = req.body;
  if (!body || Object.keys(body).length === 0) {
    try { body = JSON.parse(req.rawBody || '{}'); } catch (e) { body = {}; }
  }

  const { name, email, message, honeypot } = body;

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

  if (isSpammyMessage(message)) {
    console.log('Content filtered as spam, routing to reject:', body);
    return res.status(400).send('Missing required fields');
  }

  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const userId = process.env.EMAILJS_USER_ID || process.env.EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !userId) {
    console.error('EmailJS config not set: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID');
    return res.status(500).send('Email provider not configured');
  }

  const emailPayload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: userId,
    template_params: {
      from_name: name,
      from_email: email,
      message: message,
    },
  };

  if (process.env.TEST_MODE === 'true') {
    console.log('TEST_MODE - EmailJS payload:', emailPayload);
    return res.status(200).send('Message has been sent successfully. (test mode)');
  }

  const doFetch = (...args) => {
    if (typeof global.fetch === 'function') return global.fetch(...args);
    return import('node-fetch').then(m => m.default(...args));
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.EMAILJS_PRIVATE_KEY) {
      headers['Authorization'] = `Bearer ${process.env.EMAILJS_PRIVATE_KEY}`;
    }

    const resp = await doFetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(emailPayload),
    });

    if (!resp || !resp.ok) {
      const text = resp ? await resp.text().catch(() => '') : '';
      console.error('EmailJS error', resp && resp.status, text);
      if (process.env.DEBUG_EMAILJS === 'true') {
        const statusCode = resp && resp.status ? resp.status : 500;
        return res.status(statusCode).send(text || 'EmailJS error');
      }
      return res.status(500).send('Error sending email');
    }

    return res.status(200).send('Message has been sent successfully.');
  } catch (err) {
    console.error('EmailJS send error', err);
    if (process.env.DEBUG_EMAILJS === 'true') {
      return res.status(500).send(String(err.stack || err.message || err));
    }
    return res.status(500).send('Error sending email');
  }
};
