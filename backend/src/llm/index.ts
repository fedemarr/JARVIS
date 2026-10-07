import dotenv from 'dotenv';
import { LlmProvider } from '../../../shared/llm';
import { GeminiLlmProvider } from './gemini';
import { AnthropicLlmProvider } from './anthropic';

dotenv.config({ path: '.env' }); // Ensure .env is loaded

export function getLlmProvider(): LlmProvider {
  const providerType = process.env.LLM_PROVIDER;
  const modelName = process.env.AI_MODEL;

  if (!providerType) {
    throw new Error('LLM_PROVIDER environment variable is not set.');
  }
  if (!modelName) {
    throw new Error('AI_MODEL environment variable is not set.');
  }

  switch (providerType.toLowerCase()) {
    case 'gemini':
      const geminiApiKey = process.env.GEMINI_API_KEY;
      return new GeminiLlmProvider(geminiApiKey || '', modelName);
    case 'anthropic':
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      return new AnthropicLlmProvider(anthropicApiKey || '', modelName);
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${providerType}`);
  }
}