import { defineConfig } from '@rsbuild/core';
import { pluginSass } from '@rsbuild/plugin-sass';
import { generateCustomStylingClasses } from './scripts/generate-custom-styling-classes.mjs';
import { pluginDjangoReload } from './scripts/django-reload.mjs';

const assetPrefix = process.env.RSBUILD_BASE_URL;
const corsOrigin = process.env.RSBUILD_CORS_ORIGIN;
const hmrHost = process.env.RSBUILD_HMR_HOST;

function environmentAssetPrefix(path: string) {
  return assetPrefix ? `${assetPrefix}${path}` : path;
}

const customStylingClassListPlugin = {
  apply(compiler: {
    hooks: {
      beforeCompile: {
        tap: (name: string, callback: () => void) => void;
      };
    };
  }) {
    compiler.hooks.beforeCompile.tap(
      'generate-custom-styling-classes',
      generateCustomStylingClasses,
    );
  },
};

// Docs: https://rsbuild.rs/config/
export default defineConfig(({ env }) => {
  const isDevelopment = env === 'development';

  return {
  plugins: [pluginSass(), pluginDjangoReload()],
  dev: {
    // Django serves the HTML, so hot-update assets must keep the Rsbuild origin.
    assetPrefix: assetPrefix || true,
    client: {
      ...(hmrHost ? { host: hmrHost } : {}),
      port: '<port>',
    },
    // Django reads the development manifests from disk.
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
      output: {
        copy: [{ from: './src/fonts/OFL.txt', to: 'static/font/Shrikhand-OFL.txt' }],
      },
      source: {
        entry: {
          index: './src/app.ts',
        },
      },
      tools: {
        cssExtract: {
          loaderOptions: { publicPath: '../../' },
        },
        rspack: {
          output: {
            uniqueName: 'prosango_app',
          },
        },
      },
    },
    editor: {
      dev: {
        // Each environment owns its runtime and HMR update namespace.
        assetPrefix: environmentAssetPrefix('/editor'),
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
        rspack: {
          output: {
            uniqueName: 'prosango_editor',
          },
        },
      },
    },
    playground: {
      dev: {
        // Do not load the app environment's runtime at /static/js/runtime.js.
        assetPrefix: environmentAssetPrefix('/playground'),
      },
      html: {
        template: './src/playground.html',
      },
      source: {
        entry: {
          playground: './src/playground.ts',
        },
      },
      output: {
        distPath: {
          root: 'dist/playground',
        },
        manifest: 'playground-manifest.json',
      },
      tools: {
        rspack: {
          output: {
            uniqueName: 'prosango_playground',
          },
        },
      },
    },
  },
  tools: {
    rspack: {
      plugins: [customStylingClassListPlugin],
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
