import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const args = process.argv.slice(2);
const openOnStart = args.includes('--open');
const portArgument = args.find(argument => argument !== '--open');
const port = Number(process.env.PORT || portArgument || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('端口需要是 0–65535 之间的整数。');
  process.exit(1);
}

function openBrowser(url) {
  let command;
  let commandArgs;
  if (process.platform === 'win32') {
    command = 'powershell.exe';
    commandArgs = ['-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath '" + url + "'"];
  } else {
    command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    commandArgs = [url];
  }
  execFile(command, commandArgs, { windowsHide: true }, error => {
    if (error) console.error('无法自动打开浏览器，请手动打开：' + url);
  });
}

const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    });
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已被占用，可运行 node server.mjs 4174 --open' : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  console.log('IconLab is ready. Local: ' + url);
  if (openOnStart) openBrowser(url);
});
