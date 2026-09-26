import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{window.__records=[];window.addEventListener('agyion:record',e=>window.__records.push(e.detail))});
 await page.goto(new URL('/app/?tab=pod',process.env.MOCK_BASE_URL || 'http://127.0.0.1:4193').href,{waitUntil:'domcontentloaded'});
 await expect(page.locator('#panel-pod')).toBeVisible();
 // Refuse a production-config candidate before any simulated transaction action.
 await expect(page.locator('.station-mode-note')).toContainText('Instrument simulation stays in this browser.');
 await expect(page.getByRole('button',{name:/^(Pause motion|Resume motion|Motion reduced)$/})).toHaveCount(0);
 await page.getByLabel('Unlock in (minutes)').fill('0.01');
 await page.getByRole('button',{name:'Prepare pod secret',exact:true}).click();
 await page.getByLabel('I saved this secret outside this page.',{exact:true}).check();
 await page.getByRole('button',{name:'Bury the pod',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Pod #1',exact:true})).toBeVisible();
 const secret=await page.getByLabel('Generated Pod secret',{exact:true}).inputValue();
 await page.getByLabel('Preimage',{exact:false}).fill(secret);
 await page.getByRole('button',{name:'Commit claim',exact:true}).click();
 await expect(page.getByText(/Claim committed for Pod #1/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Open capsule',exact:true})).toBeEnabled({timeout:20000});
 await page.getByRole('button',{name:'Open capsule',exact:true}).click();
 await expect(page.getByText('opened',{exact:true})).toBeVisible();
 await page.locator('#tab-ledger').click();await expect(page.locator('#panel-ledger')).toBeVisible();await expect(page.getByRole('cell',{name:'claim_pod',exact:true})).toBeVisible();
 const records=await page.evaluate(()=>window.__records.map(r=>({action:r.action,status:r.status})));
 console.log(JSON.stringify({flow:'mock Pod create → commit → later ledger reveal → history',errors,records}));
 expect(errors).toEqual([]);expect(records.map(r=>r.action)).toContain('claim_pod');
} finally {await browser.close()}
