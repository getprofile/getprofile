// /v1/models endpoint
// Forwards to upstream provider

import { Hono } from 'hono';
import { getUpstreamClient } from '../lib/upstream';
import { sendError, handleError } from '../lib/errors';
import { createLogger } from '@getprofile/core';

const logger = createLogger({ name: 'models-route' });

const models = new Hono();

models.get('/v1/models', async (c) => {
  try {
    const upstream = getUpstreamClient();
    const response = await upstream.listModels();
    return c.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Models endpoint error');
    const errorInfo = handleError(error);
    return sendError(c, 500, errorInfo.message, errorInfo.type);
  }
});

export default models;

