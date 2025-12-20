import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import { supabase } from '../lib/supabase';

// Define forecast result schema with optional rationale
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
      trend: z.number(),
      movingAverage: z.number().optional(),
      trendSlope: z.number().optional()
    })
  }).passthrough() // Allow additional properties like forecastRationale
});

export const config: EventConfig = {
  name: 'PersistForecastResult',
  type: 'event',
  description: 'Persists forecast result to Supabase database',
  subscribes: ['persist-forecast-result'],
  emits: [],
  flows: ['forecast_pipeline'],
  input: inputSchema
};

export const handler: Handlers['PersistForecastResult'] = async (input, { logger }) => {
  logger.info('=== PERSIST FORECAST RESULT STEP STARTED ===');

  const { requestId, forecastResult } = input;

  logger.info('Persist step received input', {
    requestId,
    inputReceived: !!input,
    forecastResultReceived: !!forecastResult,
    step: 'persist_forecast_result'
  });

  // Type assertion to handle the forecastRationale property
  const typedForecastResult = forecastResult as typeof forecastResult & {
    forecastRationale?: string;
  };

  logger.info('Starting to persist forecast results to Supabase', {
    requestId,
    productId: forecastResult.productId,
    forecastPeriodsCount: forecastResult.forecastPeriods.length,
    forecastRationaleReceived: !!typedForecastResult.forecastRationale,
    rationalePreview: typedForecastResult.forecastRationale?.substring(0, 50) || 'None',
    step: 'persist_forecast_result'
  });

  // For now, use a hardcoded store_id and product_id since we don't have the actual IDs
  // In a production environment, these would come from the database lookup
  const storeId = '00000000-0000-0000-0000-000000000000'; // Default store
  const productId = forecastResult.productId; // Use the productId as-is

  // Insert each forecast period as a separate row in Supabase
  const insertPromises = typedForecastResult.forecastPeriods.map(async (period, index) => {
    // Use AI-generated rationale if available, otherwise use deterministic explanation
    const forecastRationale = typedForecastResult.forecastRationale ||
                             `Forecast generated using ${typedForecastResult.forecastMethod} method. ` +
                             `Moving average: ${typedForecastResult.forecastSummary.movingAverage?.toFixed(2) || 'N/A'}, ` +
                             `Trend slope: ${typedForecastResult.forecastSummary.trendSlope?.toFixed(2) || 'N/A'}.`;

    // Prepare the insert data
    const insertData = {
      store_id: storeId,
      product_id: productId,
      forecast_date: period.date,
      forecast_quantity: Math.round(period.forecastValue),
      model_version: 'v0-dummy',
      explanation: forecastRationale,
      forecast_rationale: forecastRationale // Store in the new column
    };

    logger.info(`Attempting to insert forecast period ${index + 1} with rationale`, {
      requestId,
      periodIndex: index + 1,
      forecastDate: period.date,
      hasRationale: !!forecastRationale,
      rationaleLength: forecastRationale?.length || 0,
      step: 'persist_forecast_result'
    });

    // Try to insert with forecast_rationale first
    let insertResult = await supabase
      .from('forecast.forecast_results')
      .insert(insertData)
      .select();

    // If there's an error (possibly due to missing column), try without forecast_rationale
    if (insertResult.error) {
      logger.warn(`Initial insert failed, trying without forecast_rationale column`, {
        requestId,
        periodIndex: index + 1,
        forecastDate: period.date,
        error: insertResult.error.message,
        step: 'persist_forecast_result'
      });

    // Retry without forecast_rationale if the column doesn't exist
    const fallbackInsertData = { ...insertData };
    const { forecast_rationale: _, ...fallbackData } = fallbackInsertData;

      insertResult = await supabase
        .from('forecast.forecast_results')
        .insert(fallbackInsertData)
        .select();
    }

    if (insertResult.error) {
      logger.error(`Failed to insert forecast period ${index + 1} into Supabase`, {
        requestId,
        periodIndex: index + 1,
        forecastDate: period.date,
        error: insertResult.error.message,
        step: 'persist_forecast_result'
      });
      throw new Error(`Supabase insert failed for period ${index + 1}: ${insertResult.error.message}`);
    }

    logger.info(`Successfully inserted forecast period ${index + 1} into Supabase`, {
      requestId,
      periodIndex: index + 1,
      forecastDate: period.date,
      forecastQuantity: Math.round(period.forecastValue),
      supabaseRecordId: insertResult.data?.[0]?.id,
      step: 'persist_forecast_result'
    });

    return insertResult.data;
  });

  // Execute all inserts and wait for completion
  try {
    const results = await Promise.all(insertPromises);

    logger.info('All forecast results persisted successfully to Supabase', {
      requestId,
      productId: forecastResult.productId,
      totalRecordsInserted: results.length,
      averageForecast: forecastResult.forecastSummary.averageForecast,
      trend: forecastResult.forecastSummary.trend,
      modelVersion: 'v0-dummy',
      storedInDatabase: true,
      step: 'persist_forecast_result'
    });

    // Log summary of inserted records
    results.forEach((result: any, index: number) => {
      if (result?.[0]) {
        logger.info(`Supabase record ${index + 1} details`, {
          requestId,
          supabaseId: result[0].id,
          forecastDate: result[0].forecast_date,
          forecastQuantity: result[0].forecast_quantity,
          modelVersion: result[0].model_version
        });
      }
    });

    logger.info('=== PERSIST FORECAST RESULT STEP COMPLETED SUCCESSFULLY ===');
    logger.info('=== FORECAST PIPELINE COMPLETED END-TO-END ===');

  } catch (error) {
    logger.error('Failed to persist forecast results to Supabase', {
      requestId,
      productId: forecastResult.productId,
      error: error instanceof Error ? error.message : 'Unknown error',
      step: 'persist_forecast_result'
    });
    throw error;
  }
};
