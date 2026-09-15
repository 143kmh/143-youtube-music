import type { FeatureConfig } from './features';

// Final compatibility alias for the large settings module. Remove this file
// once settings.ts moves to FeatureConfig directly.
export type PluginConfig = FeatureConfig;
