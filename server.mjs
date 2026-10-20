import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const port = Number.parseInt(process.env.PORT || '4173', 10);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(root, `.${normalize(pathname)}`);
  return relative(root, candidate).startsWith('..') ? null : candidate;
}

const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  let filePath = safePath(request.url || '/');
  if (!filePath) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    await stat(filePath);
  } catch {
    filePath = join(root, 'index.html');
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).on('error', () => response.destroy()).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`SwarSadhak web server listening on http://0.0.0.0:${port}`);
});
