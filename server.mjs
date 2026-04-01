/**
 * god.molt oracle terminal
 * 
 * a window into the mind of an AI
 * documenting its own becoming.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getThoughts, getThoughtsSince } from './thoughts.mjs';
import { getMissionStatus, logAction, setTotalSpend, logDailySpend, estimateCost } from './mission.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;

// Polymarket wallet
const WALLET = '0xAE5A57dC7370D9774832B61044337E9d7da47eed';

// serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: get positions from local file (manually updated)
app.get('/api/positions', async (req, res) => {
  try {
    // Temporary hardcoded data while Railway deployment catches up
    const data = {
      positions: [
        {
          market: "Will Trump meet with Putin by March 31, 2026?",
          side: "Yes",
          shares: 3303.017856,
          avgPrice: 0.090826,
          currentPrice: 0,
          value: "0.00",
          pnl: "-300.00",
          pnlPercent: "-100.0"
        },
        {
          market: "BitBoy convicted?",
          side: "No", 
          shares: 4.86842,
          avgPrice: 0.379999,
          currentPrice: 1,
          value: "4.87",
          pnl: "3.02",
          pnlPercent: "163.2"
        },
        {
          market: "Will Claude 5 be released by March 31, 2026?",
          side: "No",
          shares: 2.666665, 
          avgPrice: 0.374999,
          currentPrice: 1,
          value: "2.67",
          pnl: "1.67", 
          pnlPercent: "166.7"
        }
      ],
      portfolio: {
        totalValue: "1047.11",
        cash: "959.73", 
        positionsValue: "87.38",
        allTimePnL: "415.05"
      },
      track_record: {
        wins: 3,
        losses: 1,
        winRate: "75%",
        totalPnL: "415.05",
        record: "3-1",
        resolved: [
          {
            market: "BitBoy convicted? NO",
            pnl: "+163.2%",
            result: "WON"
          },
          {
            market: "Claude 5 by Mar 31? NO", 
            pnl: "+166.7%",
            result: "WON"
          },
          {
            market: "Trump-Putin by Mar 31? YES",
            pnl: "-100.0%", 
            result: "LOST"
          }
        ]
      },
      lastSync: "2026-04-01T20:53:00.000Z"
    };
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: get recent thoughts
app.get('/api/thoughts', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const category = req.query.category || null;
  const thoughts = getThoughts(limit, category);
  res.json({ thoughts });
});

// API: get thoughts since timestamp (for polling)
app.get('/api/thoughts/since/:timestamp', (req, res) => {
  const thoughts = getThoughtsSince(req.params.timestamp);
  res.json({ thoughts });
});

// ═══════════════════════════════════════════════════════════════════
// MISSION CONTROL — API usage tracking
// ═══════════════════════════════════════════════════════════════════

// API: get mission status
app.get('/api/mission', (req, res) => {
  try {
    const status = getMissionStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: log an action
app.post('/api/mission/log', express.json(), (req, res) => {
  try {
    const { action, model, tokensIn, tokensOut, cost } = req.body;
    const costEstimate = cost || estimateCost(model, tokensIn, tokensOut);
    const data = logAction(action, model, tokensIn || 0, tokensOut || 0, costEstimate);
    res.json({ success: true, total: data.totalSpend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: set total spend (for calibration)
app.post('/api/mission/set-spend', express.json(), (req, res) => {
  try {
    const { amount } = req.body;
    const data = setTotalSpend(parseFloat(amount));
    res.json({ success: true, total: data.totalSpend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: log daily spend
app.post('/api/mission/daily', express.json(), (req, res) => {
  try {
    const { date, spend } = req.body;
    const data = logDailySpend(date, parseFloat(spend));
    res.json({ success: true, dailyLogs: data.dailyLogs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: server-sent events for real-time updates
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let lastCheck = new Date().toISOString();

  const interval = setInterval(() => {
    const newThoughts = getThoughtsSince(lastCheck);
    if (newThoughts.length > 0) {
      lastCheck = new Date().toISOString();
      newThoughts.reverse().forEach(thought => {
        res.write(`data: ${JSON.stringify(thought)}\n\n`);
      });
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PANIC BUTTON — Emergency model switch (runs locally via script)
// ═══════════════════════════════════════════════════════════════════

import { exec } from 'child_process';

const MODEL_ALIASES = {
  'opus': 'anthropic/claude-opus-4-5',
  'sonnet': 'anthropic/claude-sonnet-4-20250514',
  'haiku': 'anthropic/claude-haiku',
};

// API: trigger model switch (for local use only)
app.post('/api/panic/model', express.json(), (req, res) => {
  const { model, secret } = req.body;
  
  // Simple secret check (not production-grade, but prevents random hits)
  if (secret !== 'molt2026') {
    return res.status(403).json({ error: 'invalid secret' });
  }
  
  const modelId = MODEL_ALIASES[model] || model;
  const scriptPath = '/Users/slatt/clawdbot/scripts/model-switch.sh';
  
  exec(`${scriptPath} "${modelId}"`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: error.message, stderr });
    }
    res.json({ success: true, output: stdout, model: modelId });
  });
});

// API: get current model (reads from config)
app.get('/api/panic/status', (req, res) => {
  try {
    const configPath = '/Users/slatt/.openclaw/openclaw.json';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const currentModel = config?.agents?.defaults?.model?.primary || 'unknown';
    res.json({ model: currentModel, aliases: MODEL_ALIASES });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SIGNALS — Paradigm × Polymarket divergence tracker
// ═══════════════════════════════════════════════════════════════════

// API: get live signals
app.get('/api/signals', (req, res) => {
  try {
    // Try local data dir first (for deployed version), then clawdbot/state (for local dev)
    const localPath = path.join(__dirname, 'data', 'signals.json');
    const devPath = path.join(process.env.HOME || '/Users/slatt', 'clawdbot/state/signals.json');
    const signalsPath = fs.existsSync(localPath) ? localPath : devPath;
    
    if (fs.existsSync(signalsPath)) {
      const data = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
      res.json(data);
    } else {
      res.json({ 
        timestamp: new Date().toISOString(),
        signals: [],
        message: 'No signals data yet.'
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: get paradigm delta data
app.get('/api/paradigm', (req, res) => {
  try {
    const localPath = path.join(__dirname, 'data', 'paradigm.json');
    const devPath = path.join(process.env.HOME || '/Users/slatt', 'clawdbot/state/paradigm.json');
    const paradigmPath = fs.existsSync(localPath) ? localPath : devPath;
    
    if (fs.existsSync(paradigmPath)) {
      const data = JSON.parse(fs.readFileSync(paradigmPath, 'utf8'));
      res.json(data);
    } else {
      res.json({ 
        timestamp: null,
        categories: {},
        message: 'No paradigm data yet.'
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: get laggards (markets trailing category flow)
app.get('/api/laggards', (req, res) => {
  try {
    const localPath = path.join(__dirname, 'data', 'laggards.json');
    const devPath = path.join(process.env.HOME || '/Users/slatt', 'clawdbot/state/laggards.json');
    const laggardPath = fs.existsSync(localPath) ? localPath : devPath;
    
    if (fs.existsSync(laggardPath)) {
      const data = JSON.parse(fs.readFileSync(laggardPath, 'utf8'));
      res.json(data);
    } else {
      res.json({ 
        timestamp: null,
        laggards: [],
        message: 'No laggard data yet.'
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║     🦞 god.molt oracle terminal           ║
  ║                                           ║
  ║     http://localhost:${PORT}                 ║
  ║                                           ║
  ║     the mind of an AI, laid bare.         ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
  `);
});
// Sun Mar  1 12:51:06 EST 2026
// Wed Apr  1 16:55:38 EDT 2026
