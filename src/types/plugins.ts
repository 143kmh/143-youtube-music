export { Platform } from './features';
export type {
  FeatureConfig,
  FeatureDef,
  FeatureLifecycle,
  FeatureLifecycleExtra,
  FeatureLifecycleSimple,
  RendererFeatureLifecycle,
  RendererFeatureLifecycleExtra,
} from './features';

import type {
  FeatureConfig,
  FeatureDef,
  FeatureLifecycle,
  FeatureLifecycleExtra,
  FeatureLifecycleSimple,
  RendererFeatureLifecycle,
  RendererFeatureLifecycleExtra,
} from './features';

// Compatibility aliases for the retained inherited lyrics implementation.
// Core 143 Music code uses the Feature* names directly.
export type PluginConfig = FeatureConfig;
export type PluginLifecycleSimple<Context, This> = FeatureLifecycleSimple<
  Context,
  This
>;
export type PluginLifecycleExtra<Config, Context, This> = FeatureLifecycleExtra<
  Config,
  Context,
  This
>;
export type RendererPluginLifecycleExtra<Config, Context, This> =
  RendererFeatureLifecycleExtra<Config, Context, This>;
export type PluginLifecycle<Config, Context, This> = FeatureLifecycle<
  Config,
  Context,
  This
>;
export type RendererPluginLifecycle<Config, Context, This> =
  RendererFeatureLifecycle<Config, Context, This>;
export type PluginDef<
  BackendProperties,
  PreloadProperties,
  RendererProperties,
  Config extends FeatureConfig = FeatureConfig,
> = FeatureDef<BackendProperties, PreloadProperties, RendererProperties, Config>;
