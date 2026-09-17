import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.beaumontglobal.meridian',
  appName: 'Meridian',
  webDir: 'dist',
  backgroundColor: '#08090c',
  ios: {
    contentInset: 'always',
    backgroundColor: '#08090c',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#08090c',
    },
  },
}

export default config
