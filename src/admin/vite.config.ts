import { mergeConfig } from 'vite';
import type { UserConfig } from 'vite';

const config = (userConfig: UserConfig) => {
  return mergeConfig(userConfig, {
    build: {
      target: 'esnext',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
  });
};

export default config; 