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

---

# Forecast-Ready バックエンド (ハッカソンプロジェクト) - 日本語版

## 問題提起

需要と在庫の予測は本質的に不確実で時間依存です。実際の生産システムでは、予測は単一のAI出力ではなく、新しいデータを取り込み、予測を再計算し、精度を評価し、時間とともに適応する継続的なプロセスです。

多くの予測プロジェクトが失敗するのは、モデルの精度が低いからではなく、それらを取り巻くバックエンドシステムに耐久性、観測可能性、再現性が欠けているからです。

このプロジェクトは、予測の精度を披露するのではなく、予測パイプラインを継続的かつ信頼性高く実行するためのバックエンドシステムの構築に焦点を当てています。

## 非目標

このプロジェクトは意図的に以下を目指していません：

- 高精度な機械学習モデルの構築
- Shopify OAuth、課金、または本番アプリのインストールフローの実装
- フル機能のフロントエンドUIの作成
- 実際の本番ストアデータへの接続
- スケジュール実行やcronジョブの実装
- 外部eコマースプラットフォームとの統合

目標はバックエンドアーキテクチャと実行の信頼性であり、エンドツーエンドの製品の完全性ではありません。

## システム概要

この予測システムは、**Motia**をオーケストレーションエンジンとして、**Supabase**を永続的なデータストアとして使用し、再現可能で観測可能な予測パイプラインを作成します。

### 高レベルアーキテクチャ

**Motia**は実行エンジンとして機能します：
- 予測パイプラインワークフローをオーケストレーション
- 状態永続化付きのイベント駆動アーキテクチャを提供
- 非同期処理とエラー回復を処理
- ログとメトリクスを通じて観測可能性を提供

**Supabase (PostgreSQL)**は信頼できる情報源として機能します：
- 不変の履歴データ（売上、在庫）を保存
- 不変の予測結果を永続化
- ストア、製品、予測間の関係を維持
- 検証と分析のためのクエリ可能な結果を提供

## 実行フロー

システムは明確なエンドツーエンドフローに従います：

1. **APIトリガー**: `/forecast`エンドポイントへのHTTP POSTリクエストがパイプラインを開始
2. **パイプライン実行**: Motiaが3ステップの予測ワークフローをオーケストレーション
3. **データ永続化**: 結果が不変のレコードとしてSupabaseに保存
4. **検証**: ログとデータベースレコードが成功した実行を確認

## APIトリガーメカニズム

予測の実行はHTTP APIを介して明示的にトリガーされます：

```bash
POST /forecast
Content-Type: application/json

{
  "productId": "product-123",
  "timeRange": "last-30-days"
}
```

**レスポンス:**
```json
{
  "message": "Forecast pipeline started successfully",
  "status": "processing",
  "requestId": "abc123def45",
  "productId": "product-123",
  "timeRange": "last-30-days"
}
```

APIエンドポイント（`ForecastAPI`）は`load-historical-facts`イベントを発生させ、`forecast_pipeline`ワークフローを開始します。

## 予測パイプライン：ステップバイステップ

`forecast_pipeline`は3つの決定論的ステップで構成されています：

### 1. load_historical_facts

**目的**: Supabaseから不変の履歴データを読み込む

**実装**: `LoadHistoricalFacts`ステップハンドラー

**プロセス:**
- `forecast.daily_sales`テーブルから履歴売上データをクエリ
- `forecast.inventory_snapshots`テーブルから在庫レベルをクエリ
- 指定された製品と時間範囲（デフォルト：過去30日間）のデータを取得
- データの存在と完全性を検証
- 読み込んだデータで`generate-forecast`イベントを発生

**データ構造:**
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

**目的**: 読み込んだ履歴データを使用して決定論的な予測を生成

**実装**: `GenerateForecast`ステップハンドラー

**プロセス:**
- 前のステップから履歴データを受け取る
- 7日間の移動平均を計算（決定論的）
- 最初と最後のデータポイントからトレンド傾斜を計算（決定論的）
- 公式`moving_average + (trend_slope * days_ahead)`を使用して5期間の予測を生成
- 履歴分散に基づいて信頼区間を計算
- 予測結果で`persist-forecast-result`イベントを発生

**予測方法**: 移動平均とトレンド調整による決定論的予測
**信頼レベル**: 95%（設定可能）

**出力構造:**
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

**目的**: 予測結果をSupabaseに不変のレコードとして保存

**実装**: `PersistForecastResult`ステップハンドラー

**プロセス:**
- 前のステップから予測結果を受け取る
- 各予測期間を`forecast.forecast_results`テーブルに個別の行として挿入
- 方法とパラメータを含む人間が読める説明を生成
- タイムスタンプとモデルバージョンで不変のレコードを保存
- SupabaseレコードIDで成功した挿入をログに記録

**データベーススキーマ:**
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

## データモデル：事実 vs 予測

### 事実（不変の履歴データ）

**特性:**
- 確認済みの実際の履歴イベントを表す
- 作成後に決して変更されない
- 予測アルゴリズムへの入力として機能
- 専用テーブルに一意制約付きで保存

**テーブル:**
- `forecast.daily_sales`: 日別の実際の売上数量
- `forecast.inventory_snapshots`: 日別の実際の在庫レベル

**例:**
```sql
INSERT INTO forecast.daily_sales
(store_id, product_id, sales_date, quantity)
VALUES ('store-1', 'product-123', '2023-01-15', 42);
```

### 予測（不変の予測結果）

**特性:**
- 将来の予測値を表す
- 決して上書きまたは変更されない
- 事実から決定論的に生成
- 監査可能性と比較のために別々に保存

**テーブル:**
- `forecast.forecast_results`: 将来の日付ごとの予測数量
- `forecast.forecast_evaluations`: 予測 vs 実績の比較

**例:**
```sql
INSERT INTO forecast.forecast_results
(store_id, product_id, forecast_date, forecast_quantity, model_version, explanation)
VALUES ('store-1', 'product-123', '2023-02-01', 45, 'v0-dummy', 'deterministic-moving-average-with-trendメソッドを使用して生成された予測');
```

## システム検証

### 1. Motiaワークベンチログ

**場所**: MotiaワークベンチUIまたはログ
**確認事項:**
- `requestId`相関付きのパイプライン実行ログ
- ステップバイステップの進行: `load_historical_facts` → `generate_forecast` → `persist_forecast_result`
- データサマリと検証メッセージ
- エラーログ（ある場合）とスタックトレース

**ログエントリ例:**
```
INFO: Supabaseから履歴事実を正常に読み込みました
  requestId: "abc123def45"
  dailySalesCount: 30
  inventorySnapshotsCount: 30
  step: "load_historical_facts"
```

### 2. Supabaseデータベース検証

**テーブル**: `forecast.forecast_results`
**クエリ:**
```sql
SELECT * FROM forecast.forecast_results
WHERE product_id = 'product-123'
ORDER BY forecast_date;
```

**期待される結果:**
- 異なる予測期間を表す複数の行
- 同じ実行からのすべての期間にわたる一貫した`requestId`
- 有効な`forecast_date`値（将来の日付）
- ヌルでない`model_version`と`explanation`フィールド
- 予測が生成された時刻を示すタイムスタンプ

### 3. エンドツーエンド検証

**手順:**
1. APIを介して予測をトリガー: `POST /forecast`
2. レスポンスから`requestId`をメモ
3. パイプラインの進行状況をMotiaログで確認
4. 新しい予測レコードをSupabaseでクエリ
5. ログとデータベース間のデータ一貫性を検証

## 意図的に未実装の機能

このハッカソンプロジェクトはコアアーキテクチャに焦点を当て、以下を意図的に実装していません：

### スケジューリングと自動化
- **cronジョブやスケジュール実行なし** - 予測は手動でAPIを介してトリガー
- **自動リトライなし** - パイプラインは失敗時に手動で再トリガーが必要
- **イベントベースのトリガーなし** - ウェブフックリスナーやリアルタイムイベント処理なし

### プラットフォーム統合
- **Shopify統合なし** - ハードコードされたストアID、OAuthフローなし
- **eコマースプラットフォームコネクタなし** - 手動データ挿入が必要
- **課金やサブスクリプション管理なし** - シングルテナントアーキテクチャ

### 高度な予測
- **機械学習モデルなし** - 単純な決定論的アルゴリズムのみ
- **モデルトレーニングや最適化なし** - 固定予測パラメータ
- **アンサンブルメソッドなし** - 単一の予測アプローチ
- **外部データソースなし** - 内部履歴データのみ使用

### 本番機能
- **認証/認可なし** - オープンAPIエンドポイント
- **レート制限なし** - 無制限のAPIアクセス
- **監視/アラートなし** - 手動ログチェックが必要
- **データ検証UIなし** - エラーは手動検査が必要

### データ管理
- **データインポート/エクスポートツールなし** - 手動データベース操作
- **履歴データクリーンアップなし** - 無制限のデータ成長
- **予測バージョニングなし** - 単一モデルバージョンサポート

これらの省略は、コアの予測パイプラインアーキテクチャと実行の信頼性に焦点を当てるために意図的なものです。

## 将来の拡張

システムは拡張性を考慮して設計されています。将来の拡張には以下が含まれる可能性があります：

- **Shopify統合**: リアルタイム注文イベント用のウェブフックリスナー、OAuthフロー
- **高度なML**: プラガブルな予測モデル、モデルトレーニングパイプライン
- **スケジューリング**: cronベースの実行、自動リトライロジック
- **マルチテナント**: ストア分離、権限管理
- **観測可能性**: ダッシュボード、アラート、パフォーマンスメトリクス
- **データパイプライン**: 自動データ取り込み、検証、クリーンアップ

## 開発セットアップ

1. **前提条件**: Node.js、npm、Docker、Supabase CLI
2. **インストール**: `npm install`
3. **データベース**: `supabase start`
4. **実行**: `npm run dev`
5. **トリガー**: 製品パラメータ付きで`POST /forecast`

システムは、再現性と監査可能性のために、履歴事実と予測結果の間に明確な分離を持つ、ローカル開発とテスト用に設計されています。
</task_progress>

## Demo v0 -now
Sales History
  ↓
Demand Forecast
  ↓
forecast_results

## Future v1
Sales History
+ Customs Lead Time
+ Warehouse Transit Time
+ Reorder Frequency
+ Safety Stock Rules
+ Fallback Defaults (when data missing)
  ↓
Inventory Requirement Forecast
