/**
 * Forecast API Endpoint
 *
 * This file location (src/forecast/forecast-api.step.ts) is correct because:
 * - Motia processes .step.ts files for API endpoints
 * - The path is configured as '/api/forecast' in the config
 * - This follows Motia's step-based architecture pattern
 *
 * How this API connects to the flow:
 * - The endpoint receives POST requests with { productId, timeRange }
 * - It emits the 'load-historical-facts' event which triggers the forecast_pipeline
 * - The forecast_pipeline is defined in this file's config with flows: ['forecast_pipeline']
 * - The pipeline processes through: load-historical-facts → generate-forecast → persist-forecast-result
 */

import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';


export const config: ApiRouteConfig = {
  name: 'ForecastAPI',
  type: 'api',
  path: '/api/forecast',
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
      timeRange: z.string().optional(),
      timestamp: z.string()
    }),
    400: z.object({
      error: z.string(),
      message: z.string()
    })
  }
};

export const handler: Handlers['ForecastAPI'] = async (input, { emit, logger }) => {
  // Log API request received
  logger.info('=== FORECAST API ENDPOINT INVOKED ===');

  try {
    // Parse and validate input
    const requestId = Math.random().toString(36).substring(2, 11);
    const productId = input?.body?.productId || input?.productId || 'default-product';
    const timeRange = input?.body?.timeRange || input?.timeRange || 'last-30-days';

    logger.info('API request received', {
      requestId,
      productId,
      timeRange,
      hasInput: !!input
    });

    // Log event emission
    logger.info('Emitting load-historical-facts event to start forecast pipeline', {
      requestId,
      topic: 'load-historical-facts',
      productId,
      timeRange
    });

    // Emit event to trigger the forecast pipeline
    const emitResult = await emit({
      topic: 'load-historical-facts',
      data: {
        requestId,
        productId,
        timeRange
      }
    });

    logger.info('Event emission completed successfully', {
      requestId,
      emissionSuccess: true,
      topic: 'load-historical-facts'
    });

    // Log request completion
    logger.info('Request completed - forecast pipeline started', {
      requestId,
      status: 'processing'
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
  } catch (error) {
    logger.error('Error processing forecast API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      status: 400,
      body: {
        error: 'bad_request',
        message: 'Failed to process forecast request'
      }
    };
  }
};
