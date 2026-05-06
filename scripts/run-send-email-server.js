// Minimal Express wrapper to run the Vercel-style function locally for testing
// Load local environment variables from .env when present
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const handler = require(path.join('..','api','send-email.js'));

app.post('/api/send-email', (req, res) => {
  return handler(req, res);
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Local send-email server listening on http://localhost:${port}`));
