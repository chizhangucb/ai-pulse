-- Circuit breaker for the OpenRouter presets in site/models.ts (service "openrouter").
INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES ('openrouter', 300, 6000, 40000, 'Circuit breaker for the OpenRouter presets in site/models.ts') ON CONFLICT (service) DO NOTHING;
