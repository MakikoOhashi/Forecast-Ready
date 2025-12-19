import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import { GeminiClient } from '../lib/gemini-client';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenvConfig({ path: resolve(process.cwd(), '.env') });

const inputSchema = z.object({
  requestId: z.string(),
  historicalData: z.object({
    productId: z.string(),
    timeRange: z.string(),
    dailySales: z.array(z.object({
      date: z.string(),
      value: z.number()
    })),
    inventorySnapshots: z.array(z.object({
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

  // This forecast is fully determined by the historical facts loaded from the database.
  // No randomness, no external calls, no hidden state - purely deterministic.

  logger.info('Starting deterministic forecast generation', {
    requestId,
    productId: historicalData.productId,
    method: forecastParameters.method,
    dailySalesCount: historicalData.dailySales.length,
    inventorySnapshotsCount: historicalData.inventorySnapshots.length,
    step: 'generate_forecast'
  });

  // Log input data summary
  logger.info('Input data summary for deterministic forecast', {
    requestId,
    productId: historicalData.productId,
    dateRange: `${historicalData.dailySales[0]?.date} to ${historicalData.dailySales[historicalData.dailySales.length - 1]?.date}`,
    totalSales: historicalData.dailySales.reduce((sum, sale) => sum + sale.value, 0),
    averageDailySales: historicalData.dailySales.reduce((sum, sale) => sum + sale.value, 0) / historicalData.dailySales.length,
    averageInventory: historicalData.inventorySnapshots.reduce((sum, inv) => sum + inv.value, 0) / historicalData.inventorySnapshots.length,
    step: 'generate_forecast'
  });

  // Step 1: Calculate 7-day moving average (deterministic)
  const movingAverages = [];
  for (let i = 0; i <= historicalData.dailySales.length - 7; i++) {
    const window = historicalData.dailySales.slice(i, i + 7);
    const sum = window.reduce((acc, day) => acc + day.value, 0);
    movingAverages.push(sum / 7);
  }
  const finalMovingAverage = movingAverages[movingAverages.length - 1] || 0;

  logger.info('Moving average calculation completed', {
    requestId,
    movingAverageWindowSize: 7,
    finalMovingAverage,
    step: 'generate_forecast'
  });

  // Step 2: Calculate trend slope (deterministic)
  const firstSales = historicalData.dailySales[0]?.value || 0;
  const lastSales = historicalData.dailySales[historicalData.dailySales.length - 1]?.value || 0;
  const daysCount = historicalData.dailySales.length;
  const trendSlope = (lastSales - firstSales) / daysCount;

  logger.info('Trend slope calculation completed', {
    requestId,
    firstSalesValue: firstSales,
    lastSalesValue: lastSales,
    daysCount,
    trendSlope,
    step: 'generate_forecast'
  });

  // Step 3: Generate deterministic forecast (next 5 periods)
  const lastDate = new Date(historicalData.dailySales[historicalData.dailySales.length - 1].date);
  const forecastPeriods = Array.from({ length: 5 }, (_, i) => {
    const daysAhead = i + 1;
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    // Deterministic forecast: moving average + trend adjustment
    const deterministicValue = finalMovingAverage + (trendSlope * daysAhead);

    // Confidence interval based on historical variance (deterministic)
    const historicalValues = historicalData.dailySales.map(sale => sale.value);
    const avg = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const variance = historicalValues.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / historicalValues.length;
    const stdDev = Math.sqrt(variance);
    const confidenceMargin = stdDev * forecastParameters.confidenceLevel;

    return {
      date: futureDate.toISOString().split('T')[0],
      forecastValue: Math.round(deterministicValue * 100) / 100,
      confidenceInterval: {
        lower: Math.round((deterministicValue - confidenceMargin) * 100) / 100,
        upper: Math.round((deterministicValue + confidenceMargin) * 100) / 100
      }
    };
  });

  // Calculate forecast summary (deterministic)
  const forecastValues = forecastPeriods.map(p => p.forecastValue);
  const forecastResult = {
    requestId,
    productId: historicalData.productId,
    generatedAt: new Date().toISOString(),
    forecastMethod: 'deterministic-moving-average-with-trend',
    confidenceLevel: forecastParameters.confidenceLevel,
    forecastPeriods,
    forecastSummary: {
      averageForecast: Math.round(forecastValues.reduce((a, b) => a + b, 0) / forecastValues.length * 100) / 100,
      minForecast: Math.min(...forecastValues),
      maxForecast: Math.max(...forecastValues),
      trend: Math.round((forecastValues[forecastValues.length - 1] - forecastValues[0]) * 100) / 100,
      // Additional deterministic metrics
      movingAverage: finalMovingAverage,
      trendSlope: trendSlope
    },
    forecastRationale: '' // Will be populated by AI explanation
  };

  logger.info('Deterministic forecast generated successfully', {
    requestId,
    productId: historicalData.productId,
    averageForecast: forecastResult.forecastSummary.averageForecast,
    minForecast: forecastResult.forecastSummary.minForecast,
    maxForecast: forecastResult.forecastSummary.maxForecast,
    trend: forecastResult.forecastSummary.trend,
    forecastPeriodsCount: forecastPeriods.length,
    step: 'generate_forecast'
  });

  // Step 4: Generate AI explanation using Gemini (non-deterministic but safe fallback)
  // This step is completely separate from the deterministic forecast logic
  // If Gemini fails, we use a deterministic fallback explanation
  try {
    // Initialize Gemini client with API key from environment
    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    const geminiClient = new GeminiClient(geminiApiKey, logger);

    // Prepare request with deterministic values only
    const explanationRequest = {
      movingAverage: finalMovingAverage,
      trendSlope: trendSlope,
      historicalDataPoints: historicalData.dailySales.length,
      forecastHorizon: forecastPeriods.length,
      productId: historicalData.productId
    };

    logger.info('Attempting to generate AI forecast explanation', {
      requestId,
      productId: historicalData.productId,
      usingGemini: !!geminiApiKey,
      step: 'generate_forecast_explanation'
    });

    // Generate explanation from Gemini API
    const explanationResponse = await geminiClient.generateForecastExplanation(explanationRequest);

    if (explanationResponse.success && explanationResponse.explanation) {
      forecastResult.forecastRationale = explanationResponse.explanation;
      logger.info('Successfully generated AI forecast explanation', {
        requestId,
        productId: historicalData.productId,
        explanation: explanationResponse.explanation,
        step: 'generate_forecast_explanation'
      });
    } else {
      // Fallback to deterministic explanation if Gemini fails
      const fallbackExplanation = geminiClient.generateFallbackExplanation(explanationRequest);
      forecastResult.forecastRationale = fallbackExplanation;
      logger.warn('Using fallback explanation due to Gemini API failure', {
        requestId,
        productId: historicalData.productId,
        explanation: fallbackExplanation,
        error: explanationResponse.error,
        step: 'generate_forecast_explanation'
      });
    }
  } catch (error) {
    // Handle any unexpected errors and use fallback
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in Gemini explanation generation', {
      requestId,
      productId: historicalData.productId,
      error: errorMessage,
      step: 'generate_forecast_explanation'
    });

    // Create fallback explanation manually if Gemini client fails to initialize
    const geminiClient = new GeminiClient('', logger);
    const fallbackExplanation = geminiClient.generateFallbackExplanation({
      movingAverage: finalMovingAverage,
      trendSlope: trendSlope,
      historicalDataPoints: historicalData.dailySales.length,
      forecastHorizon: forecastPeriods.length,
      productId: historicalData.productId
    });
    forecastResult.forecastRationale = fallbackExplanation;
  }

  // Emit event for persisting forecast result
  await emit({
    topic: 'persist-forecast-result',
    data: {
      requestId,
      forecastResult
    }
  });
};
