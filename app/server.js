'use strict';
const http = require('http');
const os   = require('os');

const PORT    = process.env.PORT     || 3000;
const POD     = process.env.POD_NAME || os.hostname();
const NS      = process.env.POD_NAMESPACE || 'unknown';
const NODE    = process.env.NODE_NAME     || 'unknown';

// Simulate CPU load for HPA testing
function burnCpu(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { Math.sqrt(Math.random()); }
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── GET / ── health + pod info
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({
      message:   'CoEdge KaaS Demo — Hello from Kubernetes!',
      pod:       POD,
      namespace: NS,
      node:      NODE,
      timestamp: new Date().toISOString(),
    }, null, 2));
    return;
  }

  // ── GET /health ── liveness / readiness probe
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', pod: POD }));
    return;
  }

  // ── GET /load?ms=2000 ── burn CPU to trigger HPA
  if (req.method === 'GET' && req.url.startsWith('/load')) {
    const params = new URL(req.url, `http://localhost`).searchParams;
    const ms     = Math.min(parseInt(params.get('ms') || '2000'), 10000);
    burnCpu(ms);
    res.writeHead(200);
    res.end(JSON.stringify({
      message:  `CPU burned for ${ms}ms`,
      pod:      POD,
      node:     NODE,
      duration: ms,
    }, null, 2));
    return;
  }

  // ── 404 ──
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found', path: req.url }));
});

server.listen(PORT, () => {
  console.log(`[${POD}] Listening on :${PORT}`);
  console.log(`[${POD}] Namespace: ${NS} | Node: ${NODE}`);
});
