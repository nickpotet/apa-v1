// Local only — never deployed to cloud (CLAUDE.md rule 2).
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { resolve } from 'path';
import { configRouter }  from './routes/config.js';
import { tokenRouter }   from './routes/token.js';
import { logRouter }     from './routes/log.js';
import { REPO_ROOT } from './paths.js';

const PORT = Number(process.env.AP_SERVER_PORT ?? 8787);
const HOST = process.env.AP_SERVER_HOST ?? '127.0.0.1';

const app = express();
app.use(cors({ origin: [`http://127.0.0.1:5173`, `http://127.0.0.1:${PORT}`] }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ap-server', time: new Date().toISOString() });
});

app.use(configRouter);
app.use(tokenRouter);
app.use(logRouter);

app.use(express.static(resolve(REPO_ROOT, 'kiosk/dist')));

app.listen(PORT, HOST, () => {
  console.log(`[ap-server] listening on http://${HOST}:${PORT}`);
});
