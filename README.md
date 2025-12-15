# Forecast-Ready Backend (Hackathon Project)

## Problem Statement

Demand and inventory forecasting is inherently uncertain and time-dependent.
In real production systems, forecasts are not single AI outputs but continuous processes that ingest new data, recompute predictions, evaluate accuracy, and adapt over time.

Many forecasting projects fail not because of poor models, but because the backend systems around them lack durability, observability, and reproducibility.

This project focuses on building a forecast-ready backend — a system designed to run forecasting pipelines continuously and reliably, rather than showcasing model accuracy.

## Non-Goals

This project intentionally does not aim to:

- Build a high-accuracy machine learning model

- Implement Shopify OAuth, billing, or production app installation flows

- Create a fully-featured frontend UI

- Connect to real production store data

The goal is backend architecture and execution reliability, not end-to-end product completeness.

## System Overview

This system provides a backend capable of:

- Ingesting historical sales and inventory data

- Running forecasting pipelines asynchronously

- Persisting forecasts and their evaluation results

- Supporting re-runs, retries, and future system extensions

The system is designed to be extensible to e-commerce platforms such as Shopify, without being coupled to platform-specific implementations.

## Core Design Principles
### Fact vs Prediction

- Facts represent confirmed historical data (e.g., sales, inventory levels)

- Predictions represent forecasted values and are never overwritten

- Facts and predictions are stored separately to allow evaluation and auditing

### Idempotency

- Re-running the same job for the same date produces the same result

- This allows safe retries and scheduled re-computation

### Re-runnable Pipelines

- Forecast pipelines can be re-executed when inputs or logic change

- Past forecasts remain preserved for comparison

### Observability

- Forecast results are compared against actual outcomes

- Prediction errors are stored to enable future evaluation and improvement

## Architecture Overview

### Supabase (PostgreSQL)
Acts as the source of truth for historical data, forecasts, and evaluation results.

### Motia
Serves as the execution engine for backend logic:

Jobs handle scheduled data aggregation

Workflows orchestrate forecasting pipelines with state persistence

### AI / Forecast Logic
Used to generate forecast values and human-readable explanations.
The specific model or algorithm is replaceable and not the focus of this project.

## Execution Model

- Historical data is ingested or aggregated via scheduled jobs

- A forecasting workflow processes the data step-by-step

- Forecast results are persisted as immutable records

- Actual outcomes are later compared against predictions

## Future Extensions

- Integration with Shopify webhooks for real-time order events

- SKU-level forecasting with lead-time awareness

- Automated re-training or logic switching based on forecast accuracy

- Alerting and decision-support layers built on top of forecast results

## Why This Project

Rather than treating forecasting as a one-off AI task, this project treats it as a long-running backend system problem.

The primary focus is on system design decisions — durability, idempotency, observability, and extensibility — which are critical for production-grade forecasting systems.

## Workflow: ForecastPipeline

1. load_historical_facts
2. validate_and_normalize_data
3. generate_features
4. run_forecast
5. persist_forecast_result
6. evaluate_against_actuals
7. emit_metrics_and_logs

Workflow: forecast_pipeline

Purpose:
Generate and persist a single forecast run based on historical facts, ensuring reproducibility, idempotency, and observability.

1. load_historical_facts

Loads historical sales and inventory facts from the database for the target scope and time range.
Guarantee: All downstream steps operate on a consistent, immutable snapshot of factual data.

2. validate_and_fill_gaps

Validates data completeness and applies gap-filling or fallback rules for missing values.
Guarantee: No downstream step receives incomplete or structurally invalid time-series data.

3. aggregate_time_windows

Aggregates raw facts into predefined time windows (e.g. rolling averages, weekly buckets).
Guarantee: Forecast inputs are normalized and comparable across SKUs and time ranges.

4. generate_forecast

Generates forecast values using a pluggable prediction strategy.
Guarantee: A forecast is produced deterministically from the aggregated inputs.

5. explain_forecast

Generates a human-readable explanation describing why the forecast changed or remained stable.
Guarantee: Each forecast result is accompanied by an interpretable rationale.

6. persist_forecast_result

Persists forecast outputs as immutable prediction records.
Guarantee: Forecast results are never overwritten and can be audited historically.

7. record_forecast_metrics

Compares forecasts against known outcomes (when available) and records evaluation metrics.
Guarantee: Forecast accuracy can be tracked and analyzed over time.

## Job: DailyAggregationJob
Schedule: once per day

- aggregate_daily_sales
- aggregate_inventory_snapshot
- persist_daily_facts

Job: daily_fact_aggregation
- Periodically aggregates raw events into immutable factual records.


## TODO
- [ ] Supabase connection
- [ ] Daily aggregation job
- [ ] Forecast workflow
