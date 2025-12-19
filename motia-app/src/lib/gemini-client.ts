import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Logger } from 'motia';

interface GeminiExplanationRequest {
  movingAverage: number;
  trendSlope: number;
  historicalDataPoints: number;
  forecastHorizon: number;
  productId: string;
}

interface GeminiExplanationResponse {
  explanation: string;
  success: boolean;
  error?: string;
}

/**
 * Gemini API Client for generating forecast explanations
 * This is a utility module that provides AI-generated explanations
 * while maintaining complete separation from deterministic forecast logic
 */
export class GeminiClient {
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly logger: Logger;

  constructor(apiKey: string, logger: Logger, modelName: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.logger = logger;
  }

  /**
   * Generates a forecast rationale explanation using Gemini AI
   * @param request - Contains deterministic forecast parameters
   * @returns Explanation response with success status
   */
  async generateForecastExplanation(request: GeminiExplanationRequest): Promise<GeminiExplanationResponse> {
    try {
      // Initialize Gemini client
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: this.modelName });

      // Create structured prompt with deterministic values only
      const prompt = `
You are a business analytics assistant. Generate a concise, business-readable explanation for why this forecast makes sense.

Use ONLY the provided deterministic values:
- Moving average: ${request.movingAverage.toFixed(2)}
- Trend slope: ${request.trendSlope.toFixed(4)}
- Historical data points: ${request.historicalDataPoints}
- Forecast horizon: ${request.forecastHorizon} days
- Product ID: ${request.productId}

Rules:
1. Do NOT invent any numbers or make predictions
2. Refer only to the provided values
3. Explain how the moving average and trend slope justify the forecast
4. Keep it concise (2-3 sentences max)
5. Use business-friendly language
6. Focus on why this forecast is reasonable based on historical patterns

Example format:
"Based on a ${request.movingAverage.toFixed(2)} moving average and ${request.trendSlope.toFixed(4)} trend slope over ${request.historicalDataPoints} data points, this forecast reflects the established sales pattern. The ${request.forecastHorizon}-day horizon accounts for recent trends while maintaining historical consistency."

Generate the explanation:
`;

      this.logger.info('Sending request to Gemini API for forecast explanation', {
        productId: request.productId,
        movingAverage: request.movingAverage,
        trendSlope: request.trendSlope,
        historicalDataPoints: request.historicalDataPoints,
        forecastHorizon: request.forecastHorizon,
        step: 'generate_forecast_explanation'
      });

      // Generate content using Gemini
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const explanation = response.text();

      this.logger.info('Successfully received forecast explanation from Gemini API', {
        productId: request.productId,
        explanationLength: explanation.length,
        step: 'generate_forecast_explanation'
      });

      return {
        explanation,
        success: true
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Gemini API error';
      this.logger.error('Failed to generate forecast explanation from Gemini API', {
        productId: request.productId,
        error: errorMessage,
        step: 'generate_forecast_explanation'
      });

      return {
        explanation: '',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Fallback explanation generator - used when Gemini API fails
   * @param request - Contains deterministic forecast parameters
   * @returns Static explanation based on deterministic values
   */
  generateFallbackExplanation(request: GeminiExplanationRequest): string {
    const trendDirection = request.trendSlope > 0 ? 'positive' :
                          request.trendSlope < 0 ? 'negative' : 'stable';

    return `Forecast based on deterministic analysis: ${request.movingAverage.toFixed(2)} moving average with ${trendDirection} trend (slope: ${request.trendSlope.toFixed(4)}). Generated from ${request.historicalDataPoints} historical data points for ${request.forecastHorizon}-day horizon.`;
  }
}
