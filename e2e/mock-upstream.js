// @ts-check
const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Mock upstream used ONLY by the proxy spy test. It records the headers it
 * receives so the test can prove production cookies are not forwarded.
 */
const OUT = path.join(__dirname, '..', 'test-results', 'mock-upstream.json');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  let bodyLength = 0;
  req.on('data', (chunk) => {
    bodyLength += chunk.length;
  });
  req.on('end', () => {
    const record = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyLength,
    };
    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(record));
    } catch {
      /* best effort */
    }
    // The proxy forwards the Idempotency-Key header, which lets these tests ask
    // the mock to emit a safe/unsafe Retry-After value for the header-filter
    // regression without a second upstream.
    const retrySelector = req.headers['idempotency-key'];
    const responseHeaders = {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    };
    if (retrySelector === 'safe-retry-after') {
      responseHeaders['retry-after'] = '42';
    } else if (retrySelector === 'unsafe-retry-after') {
      // Non-numeric: Node's HTTP layer forbids CR/LF in header values, so this
      // exercises the validator's format rejection rather than injection.
      responseHeaders['retry-after'] = 'not-a-number';
    }
    res.writeHead(200, responseHeaders);
    res.end(JSON.stringify({ spy: true, method: req.method, url: req.url }));
  });
});

const PORT = Number(process.env.MOCK_PORT || 8098);
server.listen(PORT, '127.0.0.1');
