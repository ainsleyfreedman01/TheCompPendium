const sgMail = require('@sendgrid/mail');

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
    // Vercel should parse JSON, but be defensive
    try { body = JSON.parse(req.rawBody || '{}'); } catch (e) { body = {}; }
  }

  const { name, email, message, honeypot } = body;

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

  // Use SendGrid if API key is configured
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (!sendgridKey) {
    console.error('SENDGRID_API_KEY not configured');
    return res.status(500).send('Email provider not configured');
  }

  sgMail.setApiKey(sendgridKey);

  const from = process.env.SENDGRID_FROM || process.env.EMAIL_USER || 'no-reply@thecomppendium.com';
  const to = process.env.SENDGRID_TO || process.env.EMAIL_TO || process.env.EMAIL_USER;

  const msg = {
    to: to,
    from: from,
    subject: 'Feedback from The CompPendium',
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
  };

  if (process.env.TEST_MODE === 'true') {
    console.log('TEST_MODE - email payload:', msg);
    return res.status(200).send('Message has been sent successfully. (test mode)');
  }

  try {
    await sgMail.send(msg);
    return res.status(200).send('Message has been sent successfully.');
  } catch (err) {
    console.error('sendgrid error', err);
    return res.status(500).send('Error sending email');
  }
};
