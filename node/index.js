require('dotenv').config()
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { parseCookies, Date } = require('./helper_functions');

const formZeitLogin = new URLSearchParams();
formZeitLogin.append('email', process.env.ZEIT_EMAIL);
formZeitLogin.append('pass', process.env.ZEIT_PW);

const optionsZeitLogin = {
  method: 'POST',
  headers: {},
  body: formZeitLogin,
  redirect: 'manual'
}

const optionsDownloadEpub = {
  'method': 'GET',
  'headers': {}
}

const formTolinoLogin = new URLSearchParams();
formTolinoLogin.append('j_username', process.env.TOLINO_EMAIL);
formTolinoLogin.append('j_password', process.env.TOLINO_PW);
formTolinoLogin.append('login', '');

const optionsTolinoLogin = {
  headers: {},
  body: formTolinoLogin,
  method: 'POST'
}

const formRequestTolinoToken= new URLSearchParams();
formRequestTolinoToken.append('client_id', 'webreader');
formRequestTolinoToken.append('grant_type', 'authorization_code');
formRequestTolinoToken.append('scope', 'SCOPE_BOSH');
formRequestTolinoToken.append('redirect_uri', 'https://webreader.mytolino.com/library/');
formRequestTolinoToken.append('x_buchde.skin_id', '17');
formRequestTolinoToken.append('x_buchde.mandant_id', '2');

const getCurrentEdition = () => {
  const today = new Date();
  const currentWeek = today.getWeek();
  // edition number is one ahead of week number in 2021
  // todo: implement generic logic to identify gap of week and edition number
  let currentEdition = today.getDay() === 1 || today.getDay() === 2 ? currentWeek : currentWeek + 1;
  return currentEdition.toString();
}

const buildLinkAndFileName = (edition) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentWeek = today.getWeek();
  // new edition is released on Wednesday, therefore on Monday and Tuesday the edition of last week has to be fetched
  let weekWithLatestEdition = today.getDay() === 1 || today.getDay() === 2 ? currentWeek - 1 : currentWeek;
  weekWithLatestEdition = weekWithLatestEdition.toString();
  weekWithLatestEdition = weekWithLatestEdition.length === 1 ? `0${weekWithLatestEdition}` : weekWithLatestEdition;

  const fileName = `die_zeit_${currentYear}_${edition}.epub`;
  const link = `https://premium.zeit.de/system/files/${currentYear}-${weekWithLatestEdition}/epub/die_zeit_${currentYear}_${edition}.epub`

  // todo: work on edge case where first version of new year is published in old year
  // e.g. https://premium.zeit.de/system/files/2020-52/epub/die_zeit_2020_54_1.epub
  return {
    link,
    fileName
  }
}

const downloadEpub = async (epubUrl, fileName) => {
  try {
  const responseZeitLogin = await fetch('https://meine.zeit.de/anmelden', optionsZeitLogin);

  optionsDownloadEpub.headers.cookie = parseCookies(responseZeitLogin);
  const responseDownloadEpub = await fetch(epubUrl, optionsDownloadEpub);

  if (responseDownloadEpub.headers.raw()['content-type'][0].includes('text/html')) return 'error';
  let file = fs.createWriteStream(fileName);
  responseDownloadEpub.body
    .pipe(file)
    .on('finish', () => {
      file.close()
      return 'success'
    })
    } catch (e) {
      console.log(e)
      return 'error'
    }
}

const downloadAndFileName = async (currentEdition) => {
  const { link, fileName } = buildLinkAndFileName(currentEdition);
  const downloadResponse = await downloadEpub(link, fileName);
  return { downloadResponse, fileName };
}

const uploadEpub = async (fileName) => {
  // GET Login page, obtain OAUTH-JSESSIONID
  const loginFormUrl = 'https://www.thalia.de/auth/oauth2/authorize?client_id=webreader&response_type=code&scope=SCOPE_BOSH&redirect_uri=https://webreader.mytolino.com/library/&x_buchde.skin_id=17&x_buchde.mandant_id=2';
  const responseLoginForm = await fetch(loginFormUrl, { redirect: 'manual' });
  const responseLoginFormCookies = parseCookies(responseLoginForm);

  const urlRedirectLoginForm = responseLoginForm.headers.raw()['location'][0];
  // answer not needed, but url has to be called in order for auth to work
  const responseLoginFormRedirect = await fetch(urlRedirectLoginForm, { headers: { cookie: responseLoginFormCookies, Referer: loginFormUrl } })

  // actual POST login
  // will return new OAUTH-JSESSIONID and then redirect and then return code, which is needed for final token 
  optionsTolinoLogin.headers.cookie = responseLoginFormCookies;
  optionsTolinoLogin.redirect = 'manual';
  const responseLogin = await fetch('https://www.thalia.de/de.thalia.ecp.authservice.application/login.do', optionsTolinoLogin)

  const urlRedirectLogin = responseLogin.headers.raw()['location'][0];
  const responseLoginCookies = parseCookies(responseLogin, responseLoginFormCookies);

  const responseLoginRedirect = await fetch(urlRedirectLogin, {  redirect: 'manual', headers: { cookie: responseLoginCookies } })
  const responseLoginRedirectUrl = responseLoginRedirect.headers.raw()['location'][0];

  // answer not needed, but url has to be called in order for auth to work
  const responseLoginSecondRedirect = await fetch(responseLoginRedirectUrl, { headers: { cookie: responseLoginCookies } });

  const partsLoginRedirectUrl = responseLoginRedirectUrl.split('?');
  let code;
  partsLoginRedirectUrl.forEach(part => {
    part = part.split('=');
    if (part[0] === 'code') {
      code = part[1];
    }
  });

  formRequestTolinoToken.append('code', code);

  const responseToken = await fetch('https://www.thalia.de/auth/oauth2/token',
  {
    body: formRequestTolinoToken,
    method: 'POST',
    redirect: 'manual'
  });

  const token = await responseToken.json();

  // register combination of hardware_id and token
  const registerHardwareResponse = await fetch('https://bosh.pageplace.de/bosh/rest/v2/registerhw',
  {
    headers: {
      t_auth_token: token.access_token,
      hardware_type: 'TOLINO_WEBREADER',
      hardware_id: process.env.HARDWARE_ID,
      client_type: 'TOLINO_WEBREADER',
      reseller_id: '3',
      client_version: '5.2.4',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      hardware_name: 'tolino Webreader 5.2.4',
    }), 
    method: 'POST',
    redirect: 'manual'
  });

  const formUpload = new FormData();
  formUpload.append('file', fs.createReadStream(fileName));
  const uploadHeaders = formUpload.getHeaders();
  uploadHeaders.t_auth_token = token.access_token;

  // todo: how can the hardware_id be obtained automatically?
  uploadHeaders.hardware_id = process.env.HARDWARE_ID;
  uploadHeaders.reseller_id = '3';

  const uploadResponse = await fetch('https://bosh.pageplace.de/bosh/rest/upload',
  {
    body: formUpload,
    headers: uploadHeaders,
    method: 'POST'
  })

  return await uploadResponse.json();
}

const distributeLatestEpub = async () => {
  // todo: allow desired version via stdin 
  const currentEdition = getCurrentEdition();

  const possibleEditions = [currentEdition, `${currentEdition}_0`, '1'];
  if (currentEdition.length === 1) {
    possibleEditions.push(`0${currentEdition}`);
    possibleEditions.push(`0${currentEdition}_0`);
  }

  let downloadResponse;
  let fileName;
  for (const edition of possibleEditions) {
    ({ downloadResponse, fileName } = await downloadAndFileName(edition));
    if (downloadResponse !== 'error') break;
  }

  if (downloadResponse === 'error') {
    throw new Error ('Cannot get epub');
  }

  const responseUpload = await uploadEpub(fileName);

  if (responseUpload.metadata) {
    console.log(`success, uploaded: ${fileName}`)
    fs.unlink(fileName, (err) => {
      console.log(err)
    });
  }
}

distributeLatestEpub();