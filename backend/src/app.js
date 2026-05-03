/**
 * SocietyPro Backend — Thin Express Server
 * Handles ONLY: email (SendGrid), SMS (MSG91), cron HTTP endpoints
 * All database CRUD is done client-side via Supabase JS SDK
 */
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://yourusername.github.io',
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-internal-token'],
}));
app.use(express.json({ limit: '50kb' }));

// Routes
app.use('/api/notify', require('./routes/notify'));
app.use('/api/jobs',   require('./routes/jobs'));
app.use('/api/admin',  require('./routes/admin'));

// Health check (used by Render keep-alive and monitoring)
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SocietyPro backend running on port ${PORT}`));
