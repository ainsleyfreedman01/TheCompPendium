// Invoke the Vercel-style handler directly for quick local tests
const path = require('path');

process.env.TEST_MODE = process.env.TEST_MODE || 'true';
// Provide dummy EmailJS envs for local TEST_MODE invocation so handler can proceed to test branch
process.env.EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_test';
process.env.EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_test';
process.env.EMAILJS_USER_ID = process.env.EMAILJS_USER_ID || 'user_test';

const handler = require(path.join('..','api','send-email.js'));

const req = {
  method: 'POST',
  body: {
    name: 'Unit Test',
    email: 'test@example.com',
    message: 'THIS IS A TEST MESSAGE IN ALL CAPS',
    honeypot: ''
  },
  headers: {},
  socket: { remoteAddress: '127.0.0.1' },
  rawBody: null,
};

const res = {
  _status: 200,
  headers: {},
  status(code) { this._status = code; return this; },
  setHeader(k,v){ this.headers[k]=v; },
  send(payload){
    console.log('RESPONSE_STATUS', this._status);
    if (typeof payload === 'object') console.log(JSON.stringify(payload, null, 2));
    else console.log(String(payload));
    process.exit(0);
  }
};

handler(req, res).then(()=>{
  // handler may resolve without calling send (rare) - exit gracefully
  process.exit(0);
}).catch(err=>{
  console.error('Handler error', err);
  process.exit(1);
});
