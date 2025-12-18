import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const inputSchema = z.object({
  requestId: z.string(),
  historicalData: z.object({
    productId: z.string(),
    timeRange: z.string(),
    dataPoints: z.array(z.object({
      date: z.string(),
      value: z.number()
    })),
    loadedAt: z.string()
  }),
  forecastParameters: z.object({
    method: z.string(),
    confidenceLevel: z.number()
  })
});

export const config: EventConfig = {
  name: 'GenerateForecast',
  type: 'event',
  description: 'Generates forecast based on historical data',
  subscribes: ['generate-forecast'],
  emits: ['persist-forecast-result'],
  flows: ['forecast_pipeline'],
  input: inputSchema
};

export const handler: Handlers['GenerateForecast'] = async (input, { logger, emit }) => {
  const { requestId, historicalData, forecastParameters } = input;

  logger.info('Generating forecast', {
    requestId,
    productId: historicalData.productId,
    method: forecastParameters.method,
    dataPointsCount: historicalData.dataPoints.length,
    step: 'generate_forecast'
  });

  // Calculate average from historical data (simple dummy forecast)
  const total = historicalData.dataPoints.reduce((sum, point) => sum + point.value, 0);
  const average = total / historicalData.dataPoints.length;

  // Generate dummy forecast values (next 5 periods)
  const forecastValues = Array.from({ length: 5 }, (_, i) => {
    // Add some random variation around the average
    const variation = (Math.random() * 20 - 10); // -10 to +10
    return average + variation;
  });

  // Calculate future dates
  const lastDate = new Date(historicalData.dataPoints[historicalData.dataPoints.length - 1].date);
  const forecastPeriods = forecastValues.map((value, i) => {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + (i + 1));
    return {
      date: futureDate.toISOString().split('T')[0],
      forecastValue: Math.round(value * 100) / 100, // Round to 2 decimal places
      confidenceInterval: {
        lower: Math.round(value * 0.9 * 100) / 100,
        upper: Math.round(value * 1.1 * 100) / 100
      }
    };
  });

  const forecastResult = {
    requestId,
    productId: historicalData.productId,
    generatedAt: new Date().toISOString(),
    forecastMethod: forecastParameters.method,
    confidenceLevel: forecastParameters.confidenceLevel,
    forecastPeriods,
    forecastSummary: {
      averageForecast: Math.round(average * 100) / 100,
      minForecast: Math.min(...forecastValues),
      maxForecast: Math.max(...forecastValues),
      trend: Math.round((forecastValues[forecastValues.length - 1] - forecastValues[0]) * 100) / 100
    }
  };

  logger.info('Forecast generated successfully', {
    requestId,
    productId: historicalData.productId,
    averageForecast: forecastResult.forecastSummary.averageForecast,
    forecastPeriodsCount: forecastPeriods.length,
    step: 'generate_forecast'
  });

  // Emit event for persisting forecast result
  await emit({
    topic: 'persist-forecast-result',
    data: {
      requestId,
      forecastResult
    }
  });
};
