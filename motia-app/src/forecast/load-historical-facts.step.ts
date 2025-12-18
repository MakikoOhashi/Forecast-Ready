import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const inputSchema = z.object({
  requestId: z.string(),
  productId: z.string().optional(),
  timeRange: z.string().optional()
});

export const config: EventConfig = {
  name: 'LoadHistoricalFacts',
  type: 'event',
  description: 'Loads historical data for forecasting',
  subscribes: ['load-historical-facts'],
  emits: ['generate-forecast'],
  flows: ['forecast_pipeline'],
  input: inputSchema
};

export const handler: Handlers['LoadHistoricalFacts'] = async (input, { logger, emit }) => {
  const { requestId, productId = 'default-product', timeRange = 'last-30-days' } = input;

  logger.info('Loading historical facts', {
    requestId,
    productId,
    timeRange,
    step: 'load_historical_facts'
  });

  // Simulate loading historical data
  const historicalData = {
    productId,
    timeRange,
    dataPoints: [
      { date: '2023-01-01', value: 100 },
      { date: '2023-01-02', value: 110 },
      { date: '2023-01-03', value: 105 },
      { date: '2023-01-04', value: 120 },
      { date: '2023-01-05', value: 115 }
    ],
    loadedAt: new Date().toISOString()
  };

  logger.info('Historical facts loaded successfully', {
    requestId,
    dataPointsCount: historicalData.dataPoints.length,
    step: 'load_historical_facts'
  });

  // Emit event for forecast generation
  await emit({
    topic: 'generate-forecast',
    data: {
      requestId,
      historicalData,
      forecastParameters: {
        method: 'exponential-smoothing',
        confidenceLevel: 0.95
      }
    }
  });
};
