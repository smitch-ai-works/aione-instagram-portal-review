import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',timeout:45000,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:3467/aione-instagram',headless:true,channel:'chrome',viewport:{width:390,height:844}},
  webServer:{command:'npm run start -- --port 3467',url:'http://127.0.0.1:3467/aione-instagram',reuseExistingServer:!process.env.CI,env:{PORTAL_PUBLIC_ORIGIN:'http://127.0.0.1:3467',PORTAL_TOP5_DOWNLOAD_KEY:'synthetic-top5-key-for-browser-tests-123456',PORTAL_SCHEDULER_SECRET:'synthetic-scheduler-secret-for-tests-123456',PORTAL_JOBS_ENABLED:'false'}},
  reporter:'list'
});
