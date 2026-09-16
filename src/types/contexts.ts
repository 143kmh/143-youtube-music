import type { FeatureConfig } from '@/types/features';
import type {
  IpcMain,
  IpcRenderer,
  WebContents,
  BrowserWindow,
} from 'electron';

export interface BaseContext<Config extends FeatureConfig> {
  getConfig: () => Promise<Config> | Config;
  setConfig: (conf: Partial<Omit<Config, 'enabled'>>) => Promise<void> | void;
}

export interface BackendContext<
  Config extends FeatureConfig,
> extends BaseContext<Config> {
  ipc: {
    send: WebContents['send'];
    handle: (event: string, listener: CallableFunction) => void;
    on: (event: string, listener: CallableFunction) => void;
    removeHandler: IpcMain['removeHandler'];
  };

  window: BrowserWindow;
}

export interface MenuContext<
  Config extends FeatureConfig,
> extends BaseContext<Config> {
  window: BrowserWindow;
  refresh: () => Promise<void> | void;
}

/* oxlint-disable typescript/no-empty-object-type */
export interface PreloadContext<
  Config extends FeatureConfig,
> extends BaseContext<Config> {}
/* oxlint-enable typescript/no-empty-object-type */

export interface RendererContext<
  Config extends FeatureConfig,
> extends BaseContext<Config> {
  ipc: {
    send: IpcRenderer['send'];
    invoke: IpcRenderer['invoke'];
    on: (event: string, listener: CallableFunction) => void;
    removeAllListeners: (event: string) => void;
  };
}
