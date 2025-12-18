import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const inputSchema = z.object({
  requestId: z.string(),
  forecastResult: z.object({
    requestId: z.string(),
    productId: z.string(),
    generatedAt: z.string(),
    forecastMethod: z.string(),
    confidenceLevel: z.number(),
    forecastPeriods: z.array(z.object({
      date: z.string(),
      forecastValue: z.number(),
      confidenceInterval: z.object({
        lower: z.number(),
        upper: z.number()
      })
    })),
    forecastSummary: z.object({
      averageForecast: z.number(),
      minForecast: z.number(),
      maxForecast: z.number(),
      trend: z.number()
    })
  })
});

export const config: EventConfig = {
  name: 'PersistForecastResult',
  type: 'event',
  description: 'Persists forecast result to storage',
  subscribes: ['persist-forecast-result'],
  emits: [],
  flows: ['forecast_pipeline'],
  input: inputSchema
};

export const handler: Handlers['PersistForecastResult'] = async (input, { logger, state }) => {
  const { requestId, forecastResult } = input;

  logger.info('Persisting forecast result', {
    requestId,
    productId: forecastResult.productId,
    forecastPeriodsCount: forecastResult.forecastPeriods.length,
    step: 'persist_forecast_result'
  });

  // Store forecast result in state
  await state.set('forecasts', requestId, {
    ...forecastResult,
    persistedAt: new Date().toISOString(),
    status: 'completed'
  });

  logger.info('Forecast result persisted successfully', {
    requestId,
    productId: forecastResult.productId,
    averageForecast: forecastResult.forecastSummary.averageForecast,
    trend: forecastResult.forecastSummary.trend,
    storedInState: true,
    step: 'persist_forecast_result'
  });

  // Log the forecast values for visibility
  forecastResult.forecastPeriods.forEach((period, index) => {
    logger.info(`Forecast period ${index + 1}`, {
      date: period.date,
      forecastValue: period.forecastValue,
      confidenceInterval: `${period.confidenceInterval.lower} - ${period.confidenceInterval.upper}`
    });
  });
};
