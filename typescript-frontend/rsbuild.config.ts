import { defineConfig } from '@rsbuild/core';
import { pluginSass } from '@rsbuild/plugin-sass';
import prefixSelector from 'postcss-prefix-selector';

const assetPrefix = process.env.RSBUILD_BASE_URL;
const corsOrigin = process.env.RSBUILD_CORS_ORIGIN;
const hmrHost = process.env.RSBUILD_HMR_HOST;

// Docs: https://rsbuild.rs/config/
export default defineConfig(({ env }) => {
  const isDevelopment = env === 'development';

  return {
  plugins: [pluginSass()],
  dev: {
    // Django serves the HTML, so hot-update assets must keep the Rsbuild origin.
    assetPrefix: assetPrefix || true,
    client: {
      ...(hmrHost ? { host: hmrHost } : {}),
      port: '<port>',
    },
    // Django reads manifests and the parallel launcher watches emitted JavaScript in development.
    writeToDisk: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    cors: corsOrigin ? { origin: corsOrigin } : false,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  output: {
    manifest: true,
    filenameHash: !isDevelopment,
  },
  splitChunks: isDevelopment ? false : undefined,
  environments: {
    app: {
      source: {
        entry: {
          index: './src/app.ts',
        },
      },
    },
    editor: {
      dev: {
        hmr: false,
        liveReload: false,
      },
      source: {
        entry: {
          editor: './src/editor.ts',
        },
      },
      output: {
        distPath: {
          root: 'dist/editor',
        },
        manifest: 'editor-manifest.json',
      },
      tools: {
        postcss: (_, { addPlugins }) => {
          addPlugins(
            prefixSelector({
              prefix: '.editor',
              transform(prefix, selector) {
                if (selector === ':root') {
                  return prefix;
                }
                if (/^(?:\*|::?|[a-z])/i.test(selector)) {
                  return `${prefix} ${selector}`;
                }
                return selector;
              },
            }),
            { order: 'pre' },
          );
        },
      },
    },
  },
  tools: {
    rspack: {
      output: isDevelopment
        ? {
            chunkFilename: 'static/js/[name].js',
          }
        : undefined,
      optimization: {
        runtimeChunk: 'single',
      },
    },
  },
  };
});
