import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Project } from 'ts-morph';

// HACK: DO NOT USE @ ALIAS IN THIS FILE, IT WILL CAUSE PROBLEMS
import { Platform } from '../src/types/plugins';

const __dirname = dirname(fileURLToPath(import.meta.url));
const globalProject = new Project({
  tsConfigFilePath: resolve(__dirname, '..', 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  skipFileDependencyResolution: true,
});

// 143 Music no longer discovers the inherited Pear plugin directory. These are
// the only two feature modules that are part of the application runtime.
const features = [
  { name: '143-ui', path: 'src/plugins/143-ui/index.ts' },
  {
    name: 'force-high-audio-quality',
    path: 'src/plugins/force-high-audio-quality/index.ts',
  },
] as const;

const kebabToCamel = (text: string) => {
  const camel = text.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
  return /^\d/.test(camel) ? `_${camel}` : camel;
};

export const pluginVirtualModuleGenerator = (
  mode: 'main' | 'preload' | 'renderer',
) => {
  const root = resolve(__dirname, '..');
  const src = globalProject.createSourceFile(
    'vm:coreFeatures',
    (writer) => {
      for (const { name, path } of features) {
        const absolutePath = resolve(root, path).replace(/\\/g, '/');
        if (mode === 'main') {
          writer.writeLine(
            `const ${kebabToCamel(name)}PluginImport = () => import('${absolutePath}');`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}Plugin = async () => (await ${kebabToCamel(name)}PluginImport()).default;`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}PluginStub = async () => (await ${kebabToCamel(name)}PluginImport()).pluginStub;`,
          );
        } else {
          writer.writeLine(
            `import ${kebabToCamel(name)}PluginImport, { pluginStub as ${kebabToCamel(name)}PluginStubImport } from "${absolutePath}";`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}Plugin = () => Promise.resolve(${kebabToCamel(name)}PluginImport);`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}PluginStub = () => Promise.resolve(${kebabToCamel(name)}PluginStubImport);`,
          );
        }
      }

      writer.blankLine();
      if (mode === 'main' || mode === 'preload') {
        writer.writeLine("import is from 'electron-is';");
        writer.writeLine('globalThis.electronIs = is;');
      }
      writer.write(supportsPlatform.toString());
      writer.blankLine();

      writer.writeLine(`let ${mode}PluginsCache = null;`);
      writer.writeLine(`export const ${mode}Plugins = async () => {`);
      writer.writeLine(
        `  if (${mode}PluginsCache) return await ${mode}PluginsCache;`,
      );
      writer.writeLine('  const { promise, resolve } = Promise.withResolvers();');
      writer.writeLine(`  ${mode}PluginsCache = promise;`);
      writer.writeLine('  const featureEntries = await Promise.all([');
      for (const { name } of features) {
        const checkMode = mode === 'main' ? 'backend' : mode;
        writer.writeLine(
          `    ${kebabToCamel(name)}Plugin().then((feature) => feature['${checkMode}'] ? ["${name}", feature] : null),`,
        );
      }
      writer.writeLine('  ]);');
      writer.writeLine(
        '  resolve(featureEntries.filter((entry) => entry && supportsPlatform(entry[1])).reduce((acc, [name, feature]) => { acc[name] = feature; return acc; }, {}));',
      );
      writer.writeLine(`  return await ${mode}PluginsCache;`);
      writer.writeLine('};');
      writer.blankLine();

      writer.writeLine('let allPluginsCache = null;');
      writer.writeLine('export const allPlugins = async () => {');
      writer.writeLine('  if (allPluginsCache) return await allPluginsCache;');
      writer.writeLine('  const { promise, resolve } = Promise.withResolvers();');
      writer.writeLine('  allPluginsCache = promise;');
      writer.writeLine('  const stubEntries = await Promise.all([');
      for (const { name } of features) {
        writer.writeLine(
          `    ${kebabToCamel(name)}PluginStub().then((stub) => ["${name}", stub]),`,
        );
      }
      writer.writeLine('  ]);');
      writer.writeLine(
        '  resolve(stubEntries.filter((entry) => entry && supportsPlatform(entry[1])).reduce((acc, [name, feature]) => { acc[name] = feature; return acc; }, {}));',
      );
      writer.writeLine('  return await promise;');
      writer.writeLine('};');
    },
    { overwrite: true },
  );

  return src.getText();
};

function supportsPlatform({ platform }: { platform: string }) {
  if (typeof platform !== 'number') return true;

  const is = (globalThis as typeof globalThis & {
    electronIs: typeof import('electron-is');
  }).electronIs;

  if (is.windows()) return (platform & Platform.Windows) !== 0;
  if (is.macOS()) return (platform & Platform.macOS) !== 0;
  if (is.linux()) return (platform & Platform.Linux) !== 0;
  if (is.freebsd()) return (platform & Platform.Freebsd) !== 0;

  return false;
}
