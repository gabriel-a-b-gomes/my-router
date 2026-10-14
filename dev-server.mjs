// Servidor local para testar no seu computador, sem instalar nada:
//   node dev-server.mjs   →   http://localhost:3000
// Lê as chaves do arquivo .env e executa as funções da pasta /api
// do mesmo jeito que a Vercel faz.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

async function handleApi(req, res, name) {
  const file = path.join(root, 'api', `${name}.js`);
  if (name.startsWith('_') || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{"error":"Rota não encontrada"}');
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  try {
    await mod.default(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const api = url.pathname.match(/^\/api\/([\w-]+)\/?$/);
  if (api) return handleApi(req, res, api[1]);

  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root) || file.includes(`${path.sep}.`)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(root, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Não encontrado');
  }
}).listen(PORT, () => {
  console.log(`Meu Roteiro rodando em http://localhost:${PORT}`);
  if (!process.env.APP_PASSWORD) console.warn('⚠️  Defina APP_PASSWORD no arquivo .env para conseguir entrar.');
});
