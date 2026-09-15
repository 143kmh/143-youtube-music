import type {
  BackendContext,
  MenuContext,
  PreloadContext,
  RendererContext,
} from './contexts';
import type { MusicPlayer } from '@/types/music-player';

type Author = string;

export type FeatureConfig = {
  enabled: boolean;
};

export type FeatureLifecycleSimple<Context, This> = (
  this: This,
  ctx: Context,
) => void | Promise<void>;
export type FeatureLifecycleExtra<Config, Context, This> = This & {
  start?: FeatureLifecycleSimple<Context, This>;
  stop?: FeatureLifecycleSimple<Context, This>;
  onConfigChange?: (this: This, newConfig: Config) => void | Promise<void>;
};
export type RendererFeatureLifecycleExtra<Config, Context, This> = This &
  FeatureLifecycleExtra<Config, Context, This> & {
    onPlayerApiReady?: (
      this: This,
      playerApi: MusicPlayer,
      context: Context,
    ) => void | Promise<void>;
  };

export type FeatureLifecycle<Config, Context, This> =
  | FeatureLifecycleSimple<Context, This>
  | FeatureLifecycleExtra<Config, Context, This>;
export type RendererFeatureLifecycle<Config, Context, This> =
  | FeatureLifecycleSimple<Context, This>
  | RendererFeatureLifecycleExtra<Config, Context, This>;

export enum Platform {
  Windows = 1 << 0,
  macOS = 1 << 1,
  Linux = 1 << 2,
  Freebsd = 1 << 3,
}

export interface FeatureDef<
  BackendProperties,
  PreloadProperties,
  RendererProperties,
  Config extends FeatureConfig = FeatureConfig,
> {
  name: () => string;
  authors?: Author[];
  description?: () => string;
  addedVersion?: string;
  config?: Config;
  platform?: Platform;

  menu?: (
    ctx: MenuContext<Config>,
  ) =>
    | Promise<Electron.MenuItemConstructorOptions[]>
    | Electron.MenuItemConstructorOptions[];
  stylesheets?: string[];
  restartNeeded?: boolean;

  backend?: {
    [Key in keyof BackendProperties]: BackendProperties[Key];
  } & FeatureLifecycle<Config, BackendContext<Config>, BackendProperties>;
  preload?: {
    [Key in keyof PreloadProperties]: PreloadProperties[Key];
  } & FeatureLifecycle<Config, PreloadContext<Config>, PreloadProperties>;
  renderer?: {
    [Key in keyof RendererProperties]: RendererProperties[Key];
  } & RendererFeatureLifecycle<
    Config,
    RendererContext<Config>,
    RendererProperties
  >;
}

// Temporary source-compatibility aliases while the remaining retained modules
// are moved from the inherited plugin terminology to core features.
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
