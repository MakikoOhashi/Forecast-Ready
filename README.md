# Forecast-Ready Backend (Hackathon Project)

## Problem Statement

Demand and inventory forecasting is inherently uncertain and time-dependent. In real production systems, forecasts are not single AI outputs but continuous processes that ingest new data, recompute predictions, evaluate accuracy, and adapt over time.

Many forecasting projects fail not because of poor models, but because the backend systems around them lack durability, observability, and reproducibility.

This project focuses on building a forecast-ready backend — a system designed to run forecasting pipelines continuously and reliably, rather than showcasing model accuracy.

## Non-Goals

This project intentionally does not aim to:

- Build a high-accuracy machine learning model
- Implement Shopify OAuth, billing, or production app installation flows
- Create a fully-featured frontend UI
- Connect to real production store data
- Implement scheduled execution or cron jobs
- Integrate with external e-commerce platforms

The goal is backend architecture and execution reliability, not end-to-end product completeness.

## System Overview

This forecasting system uses **Motia** as the orchestration engine and **Supabase** as the persistent data store to create a reproducible, observable forecasting pipeline.

### High-Level Architecture

**Motia** serves as the execution engine:
- Orchestrates the forecasting pipeline workflow
- Provides event-driven architecture with state persistence
- Handles asynchronous processing and error recovery
- Offers observability through logging and metrics

**Supabase (PostgreSQL)** serves as the source of truth:
- Stores immutable historical facts (sales, inventory)
- Persists immutable forecast predictions
- Maintains relationships between stores, products, and forecasts
- Provides queryable results for verification and analysis

## Execution Flow

The system follows a clear end-to-end flow:

1. **API Trigger**: HTTP POST request to `/forecast` endpoint initiates the pipeline
2. **Pipeline Execution**: Motia orchestrates the three-step forecasting workflow
3. **Data Persistence**: Results are stored in Supabase as immutable records
4. **Verification**: Logs and database records confirm successful execution

## API Trigger Mechanism

Forecast execution is explicitly triggered via HTTP API:

```bash
POST /forecast
Content-Type: application/json

{
  "productId": "product-123",
  "timeRange": "last-30-days"
}
```

**Response:**
```json
{
  "message": "Forecast pipeline started successfully",
  "status": "processing",
  "requestId": "abc123def45",
  "productId": "product-123",
  "timeRange": "last-30-days"
}
```

The API endpoint (`ForecastAPI`) emits a `load-historical-facts` event that starts the `forecast_pipeline` workflow.

## Forecast Pipeline: Step-by-Step

The `forecast_pipeline` consists of three deterministic steps:

### 1. load_historical_facts

**Purpose:** Load immutable historical data from Supabase

**Implementation:** `LoadHistoricalFacts` step handler

**Process:**
- Queries `forecast.daily_sales` table for historical sales data
- Queries `forecast.inventory_snapshots` table for inventory levels
- Retrieves data for the specified product and time range (default: last 30 days)
- Validates data presence and completeness
- Emits `generate-forecast` event with loaded data

**Data Structure:**
```typescript
{
  productId: string,
  timeRange: string,
  dailySales: Array<{date: string, value: number}>,
  inventorySnapshots: Array<{date: string, value: number}>,
  loadedAt: string
}
```

### 2. generate_forecast

**Purpose:** Generate deterministic forecast using loaded historical data

**Implementation:** `GenerateForecast` step handler

**Process:**
- Receives historical data from previous step
- Calculates 7-day moving average (deterministic)
- Computes trend slope from first to last data point (deterministic)
- Generates 5-period forecast using formula: `moving_average + (trend_slope * days_ahead)`
- Calculates confidence intervals based on historical variance
- Emits `persist-forecast-result` event with forecast results

**Forecast Method:** Deterministic moving average with trend adjustment
**Confidence Level:** 95% (configurable)

**Output Structure:**
```typescript
{
  requestId: string,
  productId: string,
  generatedAt: string,
  forecastMethod: string,
  confidenceLevel: number,
  forecastPeriods: Array<{
    date: string,
    forecastValue: number,
    confidenceInterval: {lower: number, upper: number}
  }>,
  forecastSummary: {
    averageForecast: number,
    minForecast: number,
    maxForecast: number,
    trend: number,
    movingAverage: number,
    trendSlope: number
  }
}
```

### 3. persist_forecast_result

**Purpose:** Store forecast results as immutable records in Supabase

**Implementation:** `PersistForecastResult` step handler

**Process:**
- Receives forecast results from previous step
- Inserts each forecast period as a separate row in `forecast.forecast_results` table
- Generates human-readable explanation including method and parameters
- Stores immutable records with timestamps and model version
- Logs successful insertion with Supabase record IDs

**Database Schema:**
```sql
forecast.forecast_results (
  id: uuid (primary key),
  store_id: uuid,
  product_id: uuid,
  forecast_date: date,
  forecast_quantity: integer,
  model_version: text,
  explanation: text,
  created_at: timestamptz
)
```

## Data Model: Facts vs Predictions

### Facts (Immutable Historical Data)

**Characteristics:**
- Represent confirmed, actual historical events
- Never modified after creation
- Serve as input to forecasting algorithms
- Stored in dedicated tables with unique constraints

**Tables:**
- `forecast.daily_sales`: Actual sales quantities by date
- `forecast.inventory_snapshots`: Actual inventory levels by date

**Example:**
```sql
INSERT INTO forecast.daily_sales
(store_id, product_id, sales_date, quantity)
VALUES ('store-1', 'product-123', '2023-01-15', 42);
```

### Predictions (Immutable Forecast Results)

**Characteristics:**
- Represent forecasted future values
- Never overwritten or modified
- Generated deterministically from facts
- Stored separately for auditability and comparison

**Tables:**
- `forecast.forecast_results`: Forecasted quantities by future date
- `forecast.forecast_evaluations`: Comparison of forecasts vs actuals

**Example:**
```sql
INSERT INTO forecast.forecast_results
(store_id, product_id, forecast_date, forecast_quantity, model_version, explanation)
VALUES ('store-1', 'product-123', '2023-02-01', 45, 'v0-dummy', 'Forecast generated using deterministic-moving-average-with-trend method');
```

## System Verification

### 1. Motia Workbench Logs

**Location:** Motia Workbench UI or logs
**What to Check:**
- Pipeline execution logs with `requestId` correlation
- Step-by-step progression: `load_historical_facts` → `generate_forecast` → `persist_forecast_result`
- Data summaries and validation messages
- Error logs (if any) with stack traces

**Example Log Entry:**
```
INFO: Historical facts loaded successfully from Supabase
  requestId: "abc123def45"
  dailySalesCount: 30
  inventorySnapshotsCount: 30
  step: "load_historical_facts"
```

### 2. Supabase Database Verification

**Table:** `forecast.forecast_results`
**Query:**
```sql
SELECT * FROM forecast.forecast_results
WHERE product_id = 'product-123'
ORDER BY forecast_date;
```

**Expected Results:**
- Multiple rows representing different forecast periods
- Consistent `requestId` across all periods from same run
- Valid `forecast_date` values (future dates)
- Non-null `model_version` and `explanation` fields
- Timestamps indicating when forecast was generated

### 3. End-to-End Verification

**Steps:**
1. Trigger forecast via API: `POST /forecast`
2. Note the `requestId` from response
3. Check Motia logs for pipeline progression
4. Query Supabase for new forecast records
5. Verify data consistency between logs and database

## Intentionally Unimplemented Features

This hackathon project focuses on core architecture and explicitly does not implement:

### Scheduling & Automation
- **No cron jobs or scheduled execution** - Forecasts are manually triggered via API
- **No automatic retries** - Pipeline must be manually re-triggered on failure
- **No event-based triggers** - No webhook listeners or real-time event processing

### Platform Integration
- **No Shopify integration** - Hardcoded store IDs, no OAuth flows
- **No e-commerce platform connectors** - Manual data insertion required
- **No billing or subscription management** - Single-tenant architecture

### Advanced Forecasting
- **No machine learning models** - Simple deterministic algorithms only
- **No model training or optimization** - Fixed forecasting parameters
- **No ensemble methods** - Single forecasting approach
- **No external data sources** - Only uses internal historical data

### Production Features
- **No authentication/authorization** - Open API endpoints
- **No rate limiting** - Unrestricted API access
- **No monitoring/alerting** - Manual log checking required
- **No data validation UI** - Errors require manual inspection

### Data Management
- **No data import/export tools** - Manual database operations
- **No historical data cleanup** - Unbounded data growth
- **No forecast versioning** - Single model version support

These omissions are intentional to focus on the core forecasting pipeline architecture and execution reliability.

## Future Extensions

The system is designed for extensibility. Future enhancements could include:

- **Shopify Integration**: Webhook listeners for real-time order events, OAuth flows
- **Advanced ML**: Pluggable forecasting models, model training pipelines
- **Scheduling**: Cron-based execution, automatic retry logic
- **Multi-tenancy**: Store isolation, permission management
- **Observability**: Dashboards, alerting, performance metrics
- **Data Pipeline**: Automated data ingestion, validation, and cleanup

## Development Setup

1. **Prerequisites**: Node.js, npm, Docker, Supabase CLI
2. **Installation**: `npm install`
3. **Database**: `supabase start`
4. **Execution**: `npm run dev`
5. **Trigger**: `POST /forecast` with product parameters

The system is designed for local development and testing, with clear separation between historical facts and forecast predictions for reproducibility and auditability.
