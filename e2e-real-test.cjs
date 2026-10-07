const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        host: 'localhost',
        port: 3001,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d.toString()));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch {
            resolve(buf);
          }
        });
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

async function runChat(msg, approve) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ message: msg });
    const events = [];
    const req = http.request(
      {
        host: 'localhost',
        port: 3001,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => {
          buf += d.toString();
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const evLine = block.match(/^event: (.+)$/m);
            const dataLine = block.match(/^data: (.+)$/m);
            if (!evLine || !dataLine) continue;
            let parsed;
            try {
              parsed = JSON.parse(dataLine[1]);
            } catch {
              continue;
            }
            events.push({ ev: evLine[1], parsed });
            if (evLine[1] === 'confirmation_required') {
              post('/api/confirm', { pendingId: parsed.pendingId, approved: approve }).catch(() => {});
            }
          }
        });
        res.on('end', () => resolve(events));
        res.on('error', () => resolve(events));
      },
    );
    req.on('error', () => resolve(events));
    req.end(body);
    setTimeout(() => {
      req.destroy();
      resolve(events);
    }, 120000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label, maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const events = await fn();
    const err = events.find((e) => e.ev === 'error');
    if (err) {
      const msg = String(err.parsed.message || '');
      const m = msg.match(/retry in ([\d.]+)s/i);
      const wait = m ? Math.min(parseFloat(m[1]) + 3, 60) : 30;
      console.log(`  [${label}] intento ${attempt}: rate limit, esperando ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }
    return events;
  }
  console.log(`  [${label}] se agotaron los reintentos`);
  process.exit(1);
}

async function main() {
  // Test 1: hora (tool segura)
  console.log('\n=== TEST 1: get_current_time ===');
  let events = await withRetry(() => runChat('¿Qué hora es? Respondé con una sola línea.', true), 'time');
  let starts = events.filter((e) => e.ev === 'tool_start').map((e) => e.parsed.name);
  let results = events.filter((e) => e.ev === 'tool_result');
  let tokens = events.filter((e) => e.ev === 'token').map((e) => e.parsed.text).join('');
  console.log(`  tool_start: ${starts.join(', ')}`);
  console.log(`  tool_result ok: ${results.every((r) => r.parsed.ok)} (${results.map((r) => r.parsed.name).join(', ')})`);
  console.log(`  respuesta: ${tokens.slice(0, 120)}`);
  if (starts.includes('get_current_time') && results.length > 0 && results.every((r) => r.parsed.ok) && tokens.trim()) {
    console.log('  ✓ TEST 1 OK');
  } else {
    console.log('  ✗ TEST 1 FAIL');
  }

  // Test 2: write_file aprobada (dangerous)
  console.log('\n=== TEST 2: write_file aprobada ===');
  events = await withRetry(() => runChat('Creá un archivo llamado data/e2e_real.txt con el texto "fase3 real"', true), 'write-approve');
  let confirmReq = events.filter((e) => e.ev === 'confirmation_required');
  let confirmRes = events.filter((e) => e.ev === 'confirmation');
  results = events.filter((e) => e.ev === 'tool_result');
  tokens = events.filter((e) => e.ev === 'token').map((e) => e.parsed.text).join('');
  console.log(`  confirmation_required: ${confirmReq.length} (${confirmReq.map((c) => c.parsed.tool).join(', ')})`);
  console.log(`  confirmation approved: ${confirmRes.map((c) => c.parsed.approved).join(', ')}`);
  console.log(`  tool_result: ${results.map((r) => `${r.parsed.name} ok=${r.parsed.ok}`).join(', ')}`);
  console.log(`  respuesta: ${tokens.slice(0, 120)}`);
  const fs = require('fs');
  const exists = fs.existsSync('./data/e2e_real.txt');
  if (confirmReq.length > 0 && confirmRes[0]?.parsed.approved === true && exists) {
    console.log('  ✓ TEST 2 OK');
  } else {
    console.log('  ✗ TEST 2 FAIL');
  }

  // Test 3: write_file rechazada
  console.log('\n=== TEST 3: write_file rechazada ===');
  events = await withRetry(() => runChat('Creá un archivo llamado data/e2e_real.txt con el texto "fase3 real"', false), 'write-reject');
  confirmRes = events.filter((e) => e.ev === 'confirmation');
  results = events.filter((e) => e.ev === 'tool_result');
  tokens = events.filter((e) => e.ev === 'token').map((e) => e.parsed.text).join('');
  console.log(`  confirmation approved: ${confirmRes.map((c) => c.parsed.approved).join(', ')}`);
  console.log(`  tool_result: ${results.map((r) => `${r.parsed.name} ok=${r.parsed.ok}`).join(', ')}`);
  if (confirmRes[0]?.parsed.approved === false && results[0]?.parsed.ok === false) {
    console.log('  ✓ TEST 3 OK');
  } else {
    console.log('  ✗ TEST 3 FAIL');
  }

  process.exit(0);
}

main();
