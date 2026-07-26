import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sputnikworkshop.stormpost',
  appName: 'Stormpost',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
