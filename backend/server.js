const express = require('express');
const path = require('path');
const cors = require('cors');

const { runSalesAgent } = require('./src/agents/salesAgent');
const { runTechnicalAgent } = require('./src/agents/technicalAgent');
const { runPricingAgent } = require('./src/agents/pricingAgent');
const { orchestrateMainAgent } = require('./src/agents/mainAgent');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT_DIR, 'data');

// Serve mock RFP pages and the frontend
app.use('/mock-rfps', express.static(path.join(DATA_DIR, 'public_rfps')));
app.use('/', express.static(path.join(ROOT_DIR, 'frontend')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'backend', time: new Date().toISOString() });
});

app.get('/api/rfps/scan', async (req, res) => {
  try {
    const months = Number(req.query.months ?? 3);
    const result = await runSalesAgent({ months });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to scan RFPs', details: String(err?.message || err) });
  }
});

app.post('/api/run', async (req, res) => {
  try {
    const months = Number(req.body?.months ?? 3);
    const result = await orchestrateMainAgent({ months });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to run end-to-end', details: String(err?.message || err) });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
  console.log(`Mock RFP site at http://localhost:${port}/mock-rfps/`);
});
