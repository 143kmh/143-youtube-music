import type {
  BackendContext,
  PreloadContext,
  RendererContext,
} from '@/types/contexts';
import type {
  FeatureDef,
  FeatureConfig,
  FeatureLifecycleExtra,
  FeatureLifecycleSimple,
  FeatureLifecycle,
  RendererFeatureLifecycle,
} from '@/types/features';

export const LoggerPrefix = '[YTMusic]';

export const createFeature = <
  BackendProperties,
  PreloadProperties,
  RendererProperties,
  Config extends FeatureConfig = FeatureConfig,
>(
  def: FeatureDef<
    BackendProperties,
    PreloadProperties,
    RendererProperties,
    Config
  > & {
    config?: Omit<Config, 'enabled'> & {
      enabled: boolean;
    };
  },
) => def;

// Temporary compatibility alias for retained modules that have not yet been
// renamed from the inherited plugin terminology.
export const createPlugin = createFeature;

export const createBackend = <
  BackendProperties,
  Config extends FeatureConfig = FeatureConfig,
>(
  back: {
    [Key in keyof BackendProperties]: BackendProperties[Key];
  } & FeatureLifecycle<Config, BackendContext<Config>, BackendProperties>,
) => back;

export const createPreload = <
  PreloadProperties,
  Config extends FeatureConfig = FeatureConfig,
>(
  preload: {
    [Key in keyof PreloadProperties]: PreloadProperties[Key];
  } & FeatureLifecycle<Config, PreloadContext<Config>, PreloadProperties>,
) => preload;

export const createRenderer = <
  RendererProperties,
  Config extends FeatureConfig = FeatureConfig,
>(
  renderer: {
    [Key in keyof RendererProperties]: RendererProperties[Key];
  } & RendererFeatureLifecycle<
    Config,
    RendererContext<Config>,
    RendererProperties
  >,
) => renderer;

type Options<Config extends FeatureConfig> =
  | { ctx: 'backend'; context: BackendContext<Config> }
  | { ctx: 'preload'; context: PreloadContext<Config> }
  | { ctx: 'renderer'; context: RendererContext<Config> };

export const startFeature = async <Config extends FeatureConfig>(
  id: string,
  def: FeatureDef<unknown, unknown, unknown, Config>,
  options: Options<Config>,
) => {
  const lifecycle =
    typeof def[options.ctx] === 'function'
      ? (def[options.ctx] as FeatureLifecycleSimple<Config, unknown>)
      : (
          def[options.ctx] as FeatureLifecycleExtra<
            Config,
            typeof options.context,
            unknown
          >
        )?.start;

  try {
    const defContext = def[options.ctx];
    if (defContext && typeof defContext !== 'function') {
      Object.entries(defContext).forEach(([key, value]) => {
        if (typeof value === 'function') {
          // oxlint-disable-next-line typescript/no-unsafe-assignment,typescript/no-unsafe-call,typescript/no-unsafe-member-access
          defContext[key as keyof typeof defContext] = value.bind(defContext);
        }
      });
    }

    const start = performance.now();
    await lifecycle?.call(
      defContext,
      options.context as Config & typeof options.context,
    );

    console.log(
      LoggerPrefix,
      `Core feature ${id}::${options.ctx} started in ${(performance.now() - start).toFixed(2)}ms`,
    );

    return lifecycle ? true : null;
  } catch (err) {
    console.error(
      LoggerPrefix,
      `Core feature ${id}::${options.ctx} failed to start`,
    );
    console.trace(err);
    return false;
  }
};

export const stopFeature = async <Config extends FeatureConfig>(
  id: string,
  def: FeatureDef<unknown, unknown, unknown, Config>,
  options: Options<Config>,
) => {
  if (!def || !def[options.ctx]) return false;
  if (typeof def[options.ctx] === 'function') return false;

  const defCtx = def[options.ctx] as
    | { stop: FeatureLifecycleSimple<Config, unknown> }
    | undefined;
  if (!defCtx?.stop) return null;

  try {
    const stop = defCtx.stop;
    const start = performance.now();
    await stop.call(
      def[options.ctx],
      options.context as Config & typeof options.context,
    );

    console.log(
      LoggerPrefix,
      `Core feature ${id}::${options.ctx} stopped in ${(performance.now() - start).toFixed(2)}ms`,
    );

    return true;
  } catch (err) {
    console.error(
      LoggerPrefix,
      `Core feature ${id}::${options.ctx} failed to stop`,
    );
    console.trace(err);
    return false;
  }
};
