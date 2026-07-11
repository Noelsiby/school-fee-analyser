const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\sibyn\\.gemini\\antigravity\\brain\\52f1a2aa-4c40-4186-a1b7-35f5ca1e0ffe';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Allow downloads
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
  });

  try {
    console.log('--- TEST 1: Subject Teacher ---');
    await page.goto('http://localhost:5173/login');
    await page.type('input[type="email"]', 'noel@matha.school');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await delay(3000);

    // Noel has both ClassTeacher and SubjectTeacher roles, so it should go to /role-select
    if (page.url().includes('role-select')) {
      await page.waitForSelector('button');
      const buttons = await page.$$('button');
      // Click SubjectTeacher
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('SubjectTeacher')) {
          await btn.click();
          break;
        }
      }
      await delay(3000);
    }

    console.log('Logged in as Subject Teacher');
    await delay(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'subject_teacher_dashboard.png') });
    
    // Click exam
    await page.waitForSelector('h3'); // Assuming exam card has h3
    const exams = await page.$$('h3');
    for (const exam of exams) {
      const text = await page.evaluate(el => el.textContent, exam);
      if (text.includes('Term 1 Exam')) {
        await exam.click();
        break;
      }
    }
    
    // Select Math subject if prompted or wait for students list
    await delay(2000);
    // Might need to click "Math" if there are multiple subjects for Noel
    const subBtns = await page.$$('button');
    for (const btn of subBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text === 'Math') {
        await btn.click();
        await delay(1000);
        break;
      }
    }

    // Capture marks entry page
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'marks_entry_page.png') });

    // Enter marks
    const inputs = await page.$$('input[type="number"]');
    for (let i = 0; i < inputs.length; i++) {
      await inputs[i].type('85'); // type 85 for everyone
    }
    
    const submitBtns = await page.$$('button');
    for (const btn of submitBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Submit to Class Teacher')) {
        await btn.click();
        break;
      }
    }
    await delay(2000); // wait for success
    console.log('Subject Teacher submitted marks.');

    // --- TEST 2: Class Teacher ---
    console.log('--- TEST 2: Class Teacher ---');
    await page.goto('http://localhost:5173/class-teacher/dashboard'); // Switch via URL directly
    await delay(2000);
    
    // Find Review button
    const reviewLinks = await page.$$('a, button');
    for (const link of reviewLinks) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text.includes('Review Marks')) {
        await link.click();
        break;
      }
    }
    await delay(2000);
    
    // Capture Class Teacher Approval Screen
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'class_teacher_approval.png') });

    // Approve Marks
    const cBtns = await page.$$('button');
    for (const btn of cBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Approve Subject')) {
        await btn.click();
        await delay(1000);
      }
    }
    
    // Finalize
    const finalizeBtns = await page.$$('button');
    for (const btn of finalizeBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Finalize & Send to Admin')) {
        await btn.click();
        break;
      }
    }
    await delay(2000);
    console.log('Class Teacher finalized exam.');

    // --- TEST 3: Admin ---
    console.log('--- TEST 3: Admin ---');
    // We need to login as Admin. First logout
    await page.goto('http://localhost:5173/');
    await page.evaluate(() => {
      // Find logout button
      const btns = Array.from(document.querySelectorAll('button'));
      const logout = btns.find(b => b.textContent.includes('Logout'));
      if(logout) logout.click();
    });
    await delay(1000);
    
    await page.goto('http://localhost:5173/login');
    await page.type('input[type="email"]', 'admin@matha.school');
    // assuming password123 or admin123
    await page.type('input[type="password"]', 'admin123'); 
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    
    await page.goto('http://localhost:5173/admin/exams');
    await delay(2000);

    const examLinks = await page.$$('a');
    for (const link of examLinks) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text.includes('View Results')) {
        await link.click();
        break;
      }
    }
    await delay(2000);
    
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_final_marksheet.png') });
    
    // Download Excel
    const dBtns = await page.$$('button');
    for (const btn of dBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Excel')) {
        await btn.click();
        break;
      }
    }
    await delay(3000);
    console.log('Admin tests done.');

    // --- TEST 4: Refresh Test ---
    console.log('--- TEST 4: Refresh Test ---');
    await page.reload({ waitUntil: 'networkidle0' });
    await delay(1000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.includes('Login')) {
      console.log('Refresh Test: SUCCESS, did not redirect to Login');
    } else {
      console.log('Refresh Test: FAILED, redirected to Login');
    }

  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

run();
