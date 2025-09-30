// server.js
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const app = express();

// Routers
const maintenanceRouter = require('./routes/maintenance');
const vinRouter = require('./routes/vin-maintenance');
const vinNextRouter = require('./routes/vin-next-due');

app.use(express.json());

// API routes
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/vin-maintenance', vinRouter);
app.use('/api/vin-next-due', vinNextRouter);

// Optional health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
