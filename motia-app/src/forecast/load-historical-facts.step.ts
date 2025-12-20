import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import { supabase } from '../lib/supabase';

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
  logger.info('=== LOAD HISTORICAL FACTS STEP STARTED ===');

  const { requestId, productId = 'default-product', timeRange = 'last-30-days' } = input;

  logger.info('Loading historical facts from Supabase', {
    requestId,
    productId,
    timeRange,
    step: 'load_historical_facts',
    inputReceived: !!input,
    inputDetails: `requestId: ${requestId}, productId: ${productId}, timeRange: ${timeRange}`
  });

  // Query daily sales data from Supabase
  logger.info('Querying daily sales data from Supabase', {
    requestId,
    productId,
    step: 'load_historical_facts'
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: salesData, error: salesError } = await supabase
    .schema('forecast')
    .from('daily_sales')
    .select('sales_date, quantity')
    .eq('product_id', productId)
    .gte('sales_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('sales_date', { ascending: true });

  if (salesError) {
    logger.error('Failed to load daily sales data', {
      requestId,
      error: salesError.message,
      step: 'load_historical_facts'
    });
    throw new Error(`Failed to load daily sales data: ${salesError.message}`);
  }

  if (!salesData || salesData.length === 0) {
    logger.error('No daily sales data found', {
      requestId,
      productId,
      step: 'load_historical_facts'
    });
    throw new Error(`No daily sales data found for product ${productId}`);
  }

  // Query inventory snapshots data from Supabase
  logger.info('Querying inventory snapshots data from Supabase', {
    requestId,
    productId,
    step: 'load_historical_facts'
  });

  const { data: inventoryData, error: inventoryError } = await supabase
    .schema('forecast')
    .from('inventory_snapshots')
    .select('snapshot_date, inventory_level')
    .eq('product_id', productId)
    .gte('snapshot_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (inventoryError) {
    logger.error('Failed to load inventory snapshots data', {
      requestId,
      error: inventoryError.message,
      step: 'load_historical_facts'
    });
    throw new Error(`Failed to load inventory snapshots data: ${inventoryError.message}`);
  }

  if (!inventoryData || inventoryData.length === 0) {
    logger.error('No inventory snapshots data found', {
      requestId,
      productId,
      step: 'load_historical_facts'
    });
    throw new Error(`No inventory snapshots data found for product ${productId}`);
  }

  // Combine data for downstream processing
  const historicalData = {
    productId,
    timeRange,
    dailySales: salesData.map(item => ({
      date: item.sales_date,
      value: item.quantity
    })),
    inventorySnapshots: inventoryData.map(item => ({
      date: item.snapshot_date,
      value: item.inventory_level
    })),
    loadedAt: new Date().toISOString()
  };

  logger.info('Historical facts loaded successfully from Supabase', {
    requestId,
    dailySalesCount: historicalData.dailySales.length,
    inventorySnapshotsCount: historicalData.inventorySnapshots.length,
    step: 'load_historical_facts'
  });

  logger.info('Emitting generate-forecast event with loaded historical data', {
    requestId,
    topic: 'generate-forecast',
    dailySalesCount: historicalData.dailySales.length,
    inventorySnapshotsCount: historicalData.inventorySnapshots.length,
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

  logger.info('=== LOAD HISTORICAL FACTS STEP COMPLETED SUCCESSFULLY ===');
};
