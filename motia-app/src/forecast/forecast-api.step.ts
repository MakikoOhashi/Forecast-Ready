import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'ForecastAPI',
  type: 'api',
  path: '/forecast',
  method: 'POST',
  description: 'Triggers forecast generation pipeline',
  emits: ['load-historical-facts'],
  flows: ['forecast_pipeline'],
  responseSchema: {
    200: z.object({
      message: z.string(),
      status: z.string(),
      requestId: z.string(),
      productId: z.string().optional(),
      timeRange: z.string().optional()
    })
  }
};

export const handler: Handlers['ForecastAPI'] = async (input, { emit, logger }) => {
  logger.info('=== FORECAST API ENDPOINT INVOKED ===');

  const requestId = Math.random().toString(36).substring(2, 11);
  const productId = input?.productId || 'default-product';
  const timeRange = input?.timeRange || 'last-30-days';

  logger.info('Forecast API endpoint called', {
    requestId,
    productId,
    timeRange,
    inputReceived: !!input,
    inputContent: input ? 'Input present' : 'No input'
  });

  logger.info('Emitting load-historical-facts event to start forecast pipeline', {
    requestId,
    topic: 'load-historical-facts',
    productId,
    timeRange
  });

  // Emit event to start the forecast pipeline
  const emitResult = await emit({
    topic: 'load-historical-facts',
    data: {
      requestId,
      productId,
      timeRange
    }
  });

  logger.info('Event emission completed', {
    requestId,
    emissionSuccess: true,
    topic: 'load-historical-facts'
  });

  return {
    status: 200,
    body: {
      message: 'Forecast pipeline started successfully',
      status: 'processing',
      requestId,
      productId,
      timeRange,
      timestamp: new Date().toISOString()
    }
  };
};
