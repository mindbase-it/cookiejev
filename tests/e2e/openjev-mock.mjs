// Deterministic OpenJev "systemone" mock. Usage: node tests/e2e/openjev-mock.mjs <port>
// Answers are derived from the option descriptions so the extension's OpenJev path can be tested end to end.
import http from 'node:http';

const port = Number(process.argv[2] ?? 4174);
const requests = [];

const RULES = {
  reject_button: /\b(reject|decline|deny|nope|no thanks|not for me|only necessary)\b/i,
  manage_button: /\b(settings|options|manage|customi[sz]e|preferences|tweak)\b/i,
  save_button: /\b(save|confirm|apply|keep)\b/i,
  accept_button: /\b(accept|agree|sure|ok|allow|got it)\b/i,
};
const CATEGORIES = [
  ['necessary', /\b(necessary|essential|required)\b/i],
  ['marketing', /\b(marketing|ads?|advertis)/i],
  ['analytics', /\b(analytics|statistic|measure)/i],
  ['personalization', /\b(personali[sz])/i],
  ['functional', /\b(functional)/i],
];

function choice(criteria, regex) {
  const entries = Object.entries(criteria).filter(([k]) => k !== 'none');
  const hit = entries.find(([, desc]) => typeof desc === 'string' && regex.test(desc));
  const probabilities = {};
  for (const [k] of Object.entries(criteria)) probabilities[k] = 0.02;
  const pick = hit ? hit[0] : 'none';
  probabilities[pick] = 0.9;
  return { type: 'choice', choice: pick, probabilities, confidence: 0.9 };
}

function answer(qid, q, state) {
  if (qid === 'is_consent') {
    return { type: 'noul', noul: /cookie|consent|tracking/i.test(state) ? 0.96 : 0.04 };
  }
  if (qid.startsWith('toggle_')) {
    const label = q.instructions;
    const cat = CATEGORIES.find(([, re]) => re.test(label));
    const pick = cat ? cat[0] : 'unknown';
    const probabilities = {};
    for (const k of Object.keys(q.criteria)) probabilities[k] = 0.02;
    probabilities[pick] = 0.9;
    return { type: 'choice', choice: pick, probabilities, confidence: 0.9 };
  }
  const re = RULES[qid];
  if (re && q.type === 'choice') return choice(q.criteria, re);
  return { type: 'choice', choice: 'none', probabilities: { none: 1 }, confidence: 1 };
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(requests));
      return;
    }
    if (url.pathname === '/__reset') {
      requests.length = 0;
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (url.pathname === '/v1/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model_dir: 'mock-openjev', T: 1 }));
      return;
    }
    if (url.pathname === '/v1/systemone' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const { state, questions } = JSON.parse(body);
          requests.push({ state, questions: Object.keys(questions) });
          const answers = {};
          for (const [qid, q] of Object.entries(questions)) answers[qid] = answer(qid, q, state);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'mock-1', model: 'mock-openjev', answers, usage: { input_tokens: 0, output_tokens: 0 } }));
        } catch (err) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 422, message: String(err) } }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(port, '127.0.0.1', () => console.warn(`openjev mock on http://127.0.0.1:${port}`));
