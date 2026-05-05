// Simple helper to POST a sample contact payload to /api/send-email
// Usage: node scripts/test-send-email.js [url]
// Defaults to http://localhost:3000/api/send-email

const url = process.argv[2] || 'http://localhost:3000/api/send-email';

async function doFetch(...args) {
  if (typeof global.fetch === 'function') return global.fetch(...args);
  const m = await import('node-fetch');
  return m.default(...args);
}

(async () => {
  const payload = {
    name: 'Local Test',
    email: 'test@example.com',
    message: 'This is a test from scripts/test-send-email.js',
    honeypot: ''
  };

  try {
    const resp = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    console.log('HTTP', resp.status);
    console.log(text);
  } catch (err) {
    console.error('Request failed', err);
    process.exit(1);
  }
})();
