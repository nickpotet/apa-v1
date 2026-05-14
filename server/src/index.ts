// Ap local server — runs on the kiosk mini-PC at 127.0.0.1:8787.
// CLAUDE.md rule 2: never deployed to cloud.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { configRouter }  from './routes/config.js';
import { tokenRouter }   from './routes/token.js';
import { attractRouter } from './routes/attract.js';
import { logRouter }     from './routes/log.js';

const PORT = Number(process.env.AP_SERVER_PORT ?? 8787);
const HOST = process.env.AP_SERVER_HOST ?? '127.0.0.1';

const app = express();
app.use(cors({ origin: 'http://127.0.0.1:5173' }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ap-server', time: new Date().toISOString() });
});

app.use(configRouter);
app.use(tokenRouter);
app.use(attractRouter);
app.use(logRouter);

app.listen(PORT, HOST, () => {
  console.log(`[ap-server] listening on http://${HOST}:${PORT}`);
});
