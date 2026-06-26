const express = require('express');
const pinoHttp = require('pino-http');
const path = require('path');
const env = require('./config/env');
const logger = require('./config/logger');
const { applyPreBodySecurity, applyPostBodySecurity } = require('./middleware/security');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(pinoHttp({ logger }));
applyPreBodySecurity(app);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
applyPostBodySecurity(app);
app.use('/uploads', express.static(path.resolve(process.cwd(), env.storage.uploadDir)));

app.get('/health', (_req, res) => res.json({ success: true, message: 'SOKON API is healthy', data: { uptime: process.uptime() } }));
app.use(env.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
