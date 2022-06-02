require("dotenv").config();
const fs = require("fs");
const fetch = require("node-fetch");
const FormData = require("form-data");
const puppeteer = require("puppeteer");
const path = require("path");
const { parseCookies, Date } = require("./helper_functions");

const formTolinoLogin = new URLSearchParams();
formTolinoLogin.append("j_username", process.env.TOLINO_EMAIL);
formTolinoLogin.append("j_password", process.env.TOLINO_PW);
formTolinoLogin.append("login", "");

const optionsTolinoLogin = {
  headers: {},
  body: formTolinoLogin,
  method: "POST",
};

const formRequestTolinoToken = new URLSearchParams();
formRequestTolinoToken.append("client_id", "webreader");
formRequestTolinoToken.append("grant_type", "authorization_code");
formRequestTolinoToken.append("scope", "SCOPE_BOSH");
formRequestTolinoToken.append(
  "redirect_uri",
  "https://webreader.mytolino.com/library/"
);
formRequestTolinoToken.append("x_buchde.skin_id", "17");
formRequestTolinoToken.append("x_buchde.mandant_id", "2");

const downloadPath = `${__dirname}/download`;
const fileName = "zeit";

const awaitClosingBrowser = async (browser) => {
  let files;
  try {
    files = fs.readdirSync(downloadPath);
  } catch {
    setTimeout(async () => {
      await awaitClosingBrowser(browser);
    }, 500);
    return;
  }

  for (const i in files) {
    if (path.extname(files[i]) === ".crdownload") {
      setTimeout(async () => {
        await awaitClosingBrowser(browser);
      }, 500);
      return;
    }
  }
  await browser.close();
};

const downloadEpub = async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36"
  );
  await page._client.send("Page.setDownloadBehavior", {
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

  console.log("downloaded");
};

const uploadEpub = async () => {
  // GET Login page, obtain OAUTH-JSESSIONID
  const loginFormUrl =
    "https://www.thalia.de/auth/oauth2/authorize?client_id=webreader&response_type=code&scope=SCOPE_BOSH&redirect_uri=https://webreader.mytolino.com/library/&x_buchde.skin_id=17&x_buchde.mandant_id=2";
  const responseLoginForm = await fetch(loginFormUrl, { redirect: "manual" });
  const responseLoginFormCookies = parseCookies(responseLoginForm);

  const urlRedirectLoginForm = responseLoginForm.headers.raw()["location"][0];
  // content of answer not needed, but url has to be called in order for auth to work
  await fetch(urlRedirectLoginForm, {
    headers: { cookie: responseLoginFormCookies, Referer: loginFormUrl },
  });

  // actual POST login
  // will return new OAUTH-JSESSIONID and then redirect and then return code, which is needed for final token
  optionsTolinoLogin.headers.cookie = responseLoginFormCookies;
  optionsTolinoLogin.redirect = "manual";
  const responseLogin = await fetch(
    "https://www.thalia.de/de.thalia.ecp.authservice.application/login.do",
    optionsTolinoLogin
  );

  const urlRedirectLogin = responseLogin.headers.raw()["location"][0];
  const responseLoginCookies = parseCookies(
    responseLogin,
    responseLoginFormCookies
  );

  const responseLoginRedirect = await fetch(urlRedirectLogin, {
    redirect: "manual",
    headers: { cookie: responseLoginCookies },
  });
  const responseLoginRedirectUrl =
    responseLoginRedirect.headers.raw()["location"][0];

  // content of answer not needed, but url has to be called in order for auth to work
  await fetch(responseLoginRedirectUrl, {
    headers: { cookie: responseLoginCookies },
  });

  const partsLoginRedirectUrl = responseLoginRedirectUrl.split("?");
  let code;
  partsLoginRedirectUrl.forEach((part) => {
    part = part.split("=");
    if (part[0] === "code") {
      code = part[1];
    }
  });

  formRequestTolinoToken.append("code", code);

  const responseToken = await fetch("https://www.thalia.de/auth/oauth2/token", {
    body: formRequestTolinoToken,
    method: "POST",
    redirect: "manual",
  });

  const token = await responseToken.json();

  // register combination of hardware_id and token
  await fetch("https://bosh.pageplace.de/bosh/rest/v2/registerhw", {
    headers: {
      t_auth_token: token.access_token,
      hardware_type: "TOLINO_WEBREADER",
      hardware_id: process.env.HARDWARE_ID,
      client_type: "TOLINO_WEBREADER",
      reseller_id: "3",
      client_version: "5.2.4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      hardware_name: "tolino Webreader 5.2.4",
    }),
    method: "POST",
    redirect: "manual",
  });

  const formUpload = new FormData();
  formUpload.append("file", fs.createReadStream(fileName));
  const uploadHeaders = formUpload.getHeaders();
  uploadHeaders.t_auth_token = token.access_token;

  // todo: how can the hardware_id be obtained automatically?
  uploadHeaders.hardware_id = process.env.HARDWARE_ID;
  uploadHeaders.reseller_id = "3";

  const uploadResponse = await fetch(
    "https://bosh.pageplace.de/bosh/rest/upload",
    {
      body: formUpload,
      headers: uploadHeaders,
      method: "POST",
    }
  );

  return await uploadResponse.json();
};

const distributeLatestEpub = async () => {
  await downloadEpub();

  // const responseUpload = await uploadEpub();

  // if (responseUpload.metadata) {
  //   console.log(`success, uploaded: ${fileName}`)
  //   fs.unlink(fileName, (err) => {
  //     console.log(err)
  //   });
  // }
};

distributeLatestEpub();
