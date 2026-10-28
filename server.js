/**
 * server.js — Server lokal mandiri PeatGuard Cuaca
 * Menjalankan static files dan serverless function /api/* secara lokal.
 * Jalankan: node server.js
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import handler serverless kita
import forecastHandler from './api/forecast.js';
import alertsHandler from './api/alerts.js';
import hotspotsHandler from './api/hotspots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// Muat .env secara otomatis untuk lokal
if (fs.existsSync(path.join(__dirname, '.env'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [k, ...v] = trimmed.split('=');
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// Adaptor response sederhana menyerupai Vercel Response
function createVercelResponse(res) {
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
      return this;
    },
    json(data) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return this;
    },
    send(body) {
      res.end(body);
      return this;
    }
  };
}

const server = http.createServer(async (req, res) => {
  // CORS header untuk lokal
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Tangani Serverless API
  if (pathname === '/api/forecast' || pathname === '/api/forecast.js') {
    const vercelReq = {
      method: req.method,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: req.headers,
    };
    const vercelRes = createVercelResponse(res);
    try {
      await forecastHandler(vercelReq, vercelRes);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/alerts' || pathname === '/api/alerts.js') {
    const vercelReq = {
      method: req.method,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: req.headers,
    };
    const vercelRes = createVercelResponse(res);
    try {
      await alertsHandler(vercelReq, vercelRes);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/hotspots' || pathname === '/api/hotspots.js') {
    const vercelReq = {
      method: req.method,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: req.headers,
    };
    const vercelRes = createVercelResponse(res);
    try {
      await hotspotsHandler(vercelReq, vercelRes);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 2. Tangani File Statis (index.html, css, js, data/wilayah, dll.)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  // Pastikan tidak path traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Akses ditolak');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Coba jika tanpa ekstensi .html
      if (fs.existsSync(filePath + '.html')) {
        filePath += '.html';
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Halaman tidak ditemukan (404)');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`🌿 PeatGuard Cuaca berjalan di:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`👉 http://127.0.0.1:${PORT}`);
  console.log(`Tekan Ctrl+C untuk menghentikan server.`);
  console.log(`==================================================\n`);
});
