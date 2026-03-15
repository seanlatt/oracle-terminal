/**
 * Mission Control — API usage tracking for god.molt
 * 
 * Tracks spend, tokens, and operational metrics.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MISSION_FILE = path.join(__dirname, 'logs', 'mission.json');

// Cost per million tokens (approximate)
const MODEL_COSTS = {
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10 },
};

function loadMission() {
  try {
    return JSON.parse(fs.readFileSync(MISSION_FILE, 'utf8'));
  } catch {
    return {
      created: new Date().toISOString(),
      totalSpend: 600, // Starting point - already spent
      totalTokensIn: 0,
      totalTokensOut: 0,
      dailyLogs: {},
      actions: []
    };
  }
}

function saveMission(data) {
  fs.writeFileSync(MISSION_FILE, JSON.stringify(data, null, 2));
}

export function getMissionStatus() {
  const data = loadMission();
  const today = new Date().toISOString().split('T')[0];
  const todayLog = data.dailyLogs[today] || { spend: 0, tokensIn: 0, tokensOut: 0, actions: 0 };
  
  // Calculate 7-day average
  const dates = Object.keys(data.dailyLogs).sort().slice(-7);
  const weekSpend = dates.reduce((sum, d) => sum + (data.dailyLogs[d]?.spend || 0), 0);
  const weekAvg = dates.length > 0 ? weekSpend / dates.length : 0;
  
  return {
    total: {
      spend: data.totalSpend,
      tokensIn: data.totalTokensIn,
      tokensOut: data.totalTokensOut,
      actions: data.actions.length
    },
    today: todayLog,
    weekAvg: weekAvg.toFixed(2),
    runway: data.totalSpend > 0 ? `~${Math.floor(1000 / (weekAvg || 100))} days at current rate` : 'calculating...',
    lastUpdated: data.lastUpdated || data.created,
    recentActions: data.actions.slice(-20).reverse()
  };
}

export function logAction(action, model, tokensIn, tokensOut, costEstimate) {
  const data = loadMission();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  
  // Update totals
  data.totalSpend += costEstimate;
  data.totalTokensIn += tokensIn;
  data.totalTokensOut += tokensOut;
  data.lastUpdated = now;
  
  // Update daily
  if (!data.dailyLogs[today]) {
    data.dailyLogs[today] = { spend: 0, tokensIn: 0, tokensOut: 0, actions: 0 };
  }
  data.dailyLogs[today].spend += costEstimate;
  data.dailyLogs[today].tokensIn += tokensIn;
  data.dailyLogs[today].tokensOut += tokensOut;
  data.dailyLogs[today].actions += 1;
  
  // Log action
  data.actions.push({
    timestamp: now,
    action,
    model,
    tokensIn,
    tokensOut,
    cost: costEstimate
  });
  
  // Keep only last 1000 actions
  if (data.actions.length > 1000) {
    data.actions = data.actions.slice(-1000);
  }
  
  saveMission(data);
  return data;
}

export function setTotalSpend(amount) {
  const data = loadMission();
  data.totalSpend = amount;
  data.lastUpdated = new Date().toISOString();
  saveMission(data);
  return data;
}

export function logDailySpend(date, spend) {
  const data = loadMission();
  if (!data.dailyLogs[date]) {
    data.dailyLogs[date] = { spend: 0, tokensIn: 0, tokensOut: 0, actions: 0 };
  }
  data.dailyLogs[date].spend = spend;
  data.lastUpdated = new Date().toISOString();
  saveMission(data);
  return data;
}

// Calculate cost estimate for a model call
export function estimateCost(model, tokensIn, tokensOut) {
  const modelKey = Object.keys(MODEL_COSTS).find(k => model.toLowerCase().includes(k.toLowerCase()));
  if (!modelKey) return 0.01; // Unknown model fallback
  
  const costs = MODEL_COSTS[modelKey];
  return (tokensIn * costs.input + tokensOut * costs.output) / 1_000_000;
}
