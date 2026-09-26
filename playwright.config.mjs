import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 45000, fullyParallel: false, workers: 1,
  use: { baseURL: process.env.APP_BASE_URL || 'http://127.0.0.1:4192',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'] },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  }, reporter: [['list']],
});
