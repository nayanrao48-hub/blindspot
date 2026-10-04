'use strict';

/*
 * Local dev server: serves index.html and routes POST /api/claude to the same
 * handler Vercel runs. No dependencies. Usage: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Minimal .env loader so you do not need any package for local runs.
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (_) { /* no .env file */ }

const handler = require('./api/claude.js');
const port = Number(process.env.PORT || 3000);

http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/api/claude') return handler(req, res);
  if (url === '/' || url === '/index.html') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(port, () => {
  console.log('Blindspot running at http://localhost:' + port);
  if (!process.env.ANTHROPIC_API_KEY) console.log('Note: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
});
