const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  const html = fs.readFileSync('due_diligence_report.html', 'utf8');
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: 'due_diligence_report.pdf',
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      right: '15mm',
      bottom: '20mm',
      left: '15mm'
    }
  });
  
  await browser.close();
  console.log('PDF generated successfully: due_diligence_report.pdf');
})();
