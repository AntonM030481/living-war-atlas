// Optional real-browser smoke test. Install Playwright separately; excluded from ordinary CI.
const { chromium } = require('playwright');
(async () => {
 const {createServer}=await import('vite');
 const {resolve}=require('node:path');
 const {mkdirSync}=require('node:fs');
 const root=resolve(__dirname,'../..');
 const output=resolve(root,'bench-results/conquest/ui');
 mkdirSync(output,{recursive:true});
 const server=await createServer({root,server:{port:0,host:'127.0.0.1'}});
 await server.listen();
 const browser = await chromium.launch({headless:true,executablePath:process.env.CONQUEST_CHROMIUM_PATH,args:['--no-sandbox']});
 const page = await browser.newPage({viewport:{width:1365,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  sessionStorage.setItem('living-war-atlas:new-game-map','theatre');
  sessionStorage.setItem('living-war-atlas:new-game-mode','conquest');
  localStorage.setItem('living-war-atlas:about-hidden','1');
  localStorage.setItem('living-war-atlas:mode-instructions-hidden:conquest:v2','1');
 });
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
 await page.locator('.city-power-label.secret-ally').first().waitFor();
 await page.locator('#pause').click();
 if(await page.locator('.city-power-label.secret-ally').first().evaluate(el=>getComputedStyle(el).borderTopStyle)!=='dashed') {
  throw Error('Secret ally lost its dashed border');
 }

 const ally=await page.locator('.city-power-label.secret-ally').first().boundingBox();
 await page.mouse.click(ally.x+ally.width/2,ally.y+ally.height/2);
 await page.getByRole('button',{name:'Reveal ally',exact:true}).waitFor();
 const before=await page.locator('.conquest-panel ol').innerText();
 await page.screenshot({path:resolve(output,'selection.png'),fullPage:true});
 await page.getByRole('button',{name:'Reveal ally',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.conquest-panel ol')?.textContent.includes('revealed'));
 const target=await page.locator('.city-power-label.unknown.actionable').first().boundingBox();
 await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
 await page.getByRole('button',{name:'Invade — raise enemy resistance',exact:true}).waitFor();
 const afterSelection=await page.locator('.conquest-panel ol').innerText();
 if(afterSelection.includes('resistance raised')) throw Error('Selection invaded without confirmation');
 await page.getByRole('button',{name:'Invade — raise enemy resistance',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.conquest-panel ol')?.textContent.includes('resistance raised'));
 await page.screenshot({path:resolve(output,'invasion.png'),fullPage:true});
 const unknownCount=await page.locator('.city-power-label.unknown').count();
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(100);
 if(await page.locator('.city-power-label.unknown').count()!==unknownCount) throw Error('Resize lost unknown-country masking');
 await page.locator('.conquest-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:resolve(output,'mobile.png'),fullPage:true});
 console.log(JSON.stringify({errors,before,events:await page.locator('.conquest-panel ol').innerText()}));
 await browser.close();
 await server.close();
 if(errors.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
