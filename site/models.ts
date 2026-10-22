// Which models this site uses. The framework always has `default`: the model named by LLM_BASE_URL / LLM_API_KEY /
// LLM_MODEL (OpenRouter by default, see .env.example). Below are named presets (each with its own address and key
// variables) and which one each step uses by default; steps not listed use `default`.
// A deployment can still pick per step with environment variables (PREFILTER_MODEL, SCORE_MODEL...) or on the
// admin "Models" page.

import type { ModelPreset } from "@aihot/contracts/site-config";
export type { ModelPreset } from "@aihot/contracts/site-config";

/** Named presets. The OpenRouter ones share the default model's address and key, so one key covers every step. */
export const PRESETS: Record<string, ModelPreset> = {
  // OpenRouter, the site's default service. Every endpoint of these models lists response_format in OpenRouter's
  // model metadata, so JSON mode stays on.
  "or-claude-haiku": {
    service: "openrouter", model: "anthropic/claude-haiku-5.5", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", jsonMode: true, vision: true,
  },
  "or-gpt-luna": {
    service: "openrouter", model: "openai/gpt-6-luna", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", jsonMode: true, vision: true,
  },
  "or-gemini-flash-lite": {
    service: "openrouter", model: "google/gemini-3.5-flash-lite", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", jsonMode: true, vision: true,
  },
  // Direct provider presets, each with its own key.
  // GLM 5.3 Flash always reasons; the lowest effort keeps short structured tasks fast.
  "glm-5.3-flash": {
    service: "zhipu", model: "glm-5.3-flash", baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled" }, reasoning_effort: "low" }, jsonMode: true, vision: true,
  },
  // The scorer's parameters for glm-5.3-flash: temperature 1 with high reasoning, up to 180 s per call.
  "glm-5.3-flash-selection": {
    service: "zhipu", model: "glm-5.3-flash", baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled", clear_thinking: false }, reasoning_effort: "high", top_p: 0.95 }, jsonMode: true, vision: true,
    scoreCall: { temperature: 1, maxTokens: 65_536, timeoutMs: 180_000 },
  },
  // DeepSeek Flash reasons by default; structured tasks switch it off. deepseek-flash-think keeps it on,
  // with room in the output for the reasoning.
  "deepseek-flash": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "deepseek-flash-think": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY", reasoningTokens: 4000, jsonMode: true,
  },
  "qwen3.7-flash": {
    service: "dashscope", model: "qwen3.7-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "qwen3.8-flash": {
    service: "dashscope", model: "qwen3.8-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "mimo-v2.6-flash": {
    service: "mimo", model: "mimo-v2.6-flash", baseUrlEnv: "XIAOMI_MIMO_BASE_URL", apiKeyEnv: "XIAOMI_MIMO_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "qwen3-vl-flash": {
    service: "dashscope", model: "qwen3-vl-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: false, vision: true,
  },
};

/**
 * The model each step uses by default (steps are listed on the admin "Models" page): a preset name above or
 * `default`. Steps not listed use `default`. Example: { score: "or-gpt-luna", report: "or-claude-haiku" }
 */
export const DEFAULTS: Record<string, string> = {};
