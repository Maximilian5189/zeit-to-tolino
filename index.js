import "dotenv/config";
import { readdirSync } from "fs";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import { extname, dirname } from "path";
import delay from "delay";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const downloadPath = `${__dirname}/download`;
let fileName;

const awaitClosingBrowser = async (browser) => {
  let files;
  try {
    files = readdirSync(downloadPath);
  } catch {
    setTimeout(async () => {
      await awaitClosingBrowser(browser);
    }, 500);
    return;
  }

  for (const i in files) {
    if (extname(files[i]) === ".crdownload") {
      setTimeout(async () => {
        await awaitClosingBrowser(browser);
      }, 500);
      return;
    } else {
      fileName = files[i];
    }
  }
  await browser.close();
};

const downloadEpub = async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page._client().send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath,
  });

  await page.goto("https://meine.zeit.de/anmelden");
  await page.focus("#login_email");
  await page.keyboard.type(process.env.ZEIT_EMAIL);
  await page.focus("#login_pass");
  await page.keyboard.type(process.env.ZEIT_PW);

  await Promise.all([
    page.click('input[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  await page.goto("https://epaper.zeit.de/abo/diezeit");

  const navButton = await page.$x("//a[contains(., 'ZUR AKTUELLEN AUSGABE')]");
  await navButton[0].click();
  await page.waitForNavigation();

  const downloadButton = await page.$x("//a[contains(., 'E-READER LADEN')]");
  await downloadButton[0].click();

  await awaitClosingBrowser(browser);
};

const uploadEpub = async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36"
  );

  const loginFormUrl =
    "https://www.thalia.de/auth/oauth2/authorize?client_id=webreader&response_type=code&scope=SCOPE_BOSH&redirect_uri=https://webreader.mytolino.com/library/&x_buchde.skin_id=17&x_buchde.mandant_id=2";
  await page.goto(loginFormUrl);
  await page.focus("#j_username");
  await page.keyboard.type(process.env.TOLINO_EMAIL);
  await page.focus("#j_password");
  await page.keyboard.type(process.env.TOLINO_PW);

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  await page.waitForSelector("div._1ri68zh", { visible: true, timeout: 0 });

  // fixme
  await delay(500);

  let elementsCountry = await page.$$("div._1ri68zh");
  await elementsCountry[0].click();

  await page.waitForSelector("._fcef1e", {
    visible: true,
    timeout: 0,
  });

  let elementsReseller = await page.$$("._fcef1e");
  await elementsReseller[2].click();

  await page.waitForSelector("._24nnq9._4df06s._fvmczj._6qmloc._8ag69r", {
    visible: true,
    timeout: 0,
  });

  const openLibraryButton = await page.$$(
    "._24nnq9._4df06s._fvmczj._6qmloc._8ag69r"
  );
  await openLibraryButton[0].click();

  const toLibraryButton = await page.$$("._1ot1t5f");
  await toLibraryButton[4].click();

  await page.waitForSelector("._y4tlgh", {
    visible: true,
    timeout: 0,
  });
  const contextMenu = await page.$$("._y4tlgh");
  await contextMenu[1].click();

  const uploadButton = await page.$$("._z1ovxu");

  const [fileInput] = await Promise.all([
    page.waitForFileChooser(),
    uploadButton[2].click("#file-input"),
  ]);
  await fileInput.accept([`${downloadPath}/${fileName}`]);

  // fixme
  await delay(30000);

  await awaitClosingBrowser(browser);
};

(async () => {
  await downloadEpub();
  await uploadEpub();
})();
