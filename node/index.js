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
  // redirect: 'manual'
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

const getLastEdition = () => {
  let lastEdition;
  try {
    lastEdition = fs.readFileSync('./state').toString();
  } catch (e) {
    // write new state file, if non exists currently
    const today = new Date();
    lastEdition = today.getWeek();
    lastEdition = today.getDay() === 1 || today.getDay() === 2 ? lastEdition - 1 : lastEdition;
    lastEdition = lastEdition.toString();
    fs.writeFileSync('./state', lastEdition)
  }
  return lastEdition;
}

const buildLinkAndFileName = (edition) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  let currentWeek = today.getWeek();
  // new edition is released on Wednesday, therefore on Monday and Tuesday the edition of last week has to be fetched
  currentWeek = today.getDay() === 1 || today.getDay() === 2 ? currentWeek - 1 : currentWeek;
  currentWeek = currentWeek.toString();
  currentWeek = currentWeek.length === 1 ? `0${currentWeek}` : currentWeek;

  // To-do: better solution without side effect?
  fileName = `die_zeit_${currentYear}_${edition}.epub`

  // todo: work on edge case where first version of new year is published in old year
  // e.g. https://premium.zeit.de/system/files/2020-52/epub/die_zeit_2020_54_1.epub
  return {
    link: `https://premium.zeit.de/system/files/${currentYear}-${currentWeek}/epub/die_zeit_${currentYear}_${edition}.epub`,
    fileName
  }
}

const downloadEpub = async (epubUrl, fileName) => {
  try {
  const responseZeitLogin = await fetch('https://meine.zeit.de/anmelden', optionsZeitLogin);

  optionsDownloadEpub.headers.cookie = parseCookies(responseZeitLogin);
  const responseDownloadEpub = await fetch(epubUrl, optionsDownloadEpub)

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
  const lastEdition = getLastEdition();

  let currentEdition = Number(lastEdition) + 1;
  let { link, fileName } = buildLinkAndFileName(currentEdition);

  let downloadResponse = await downloadEpub(link, fileName);
  
  // if currentEdition is < 10, sometimes link is written with leading zero, sometimes without
  // therefore both scenarios have to be tried
  currentEdition = currentEdition.toString();
  if (downloadResponse === 'error' && currentEdition.length === 1) {
    currentEdition = `0${currentEdition}`;
    ({ link, fileName } = buildLinkAndFileName(currentEdition));
    downloadResponse = await downloadEpub(link, fileName);

    // for writing the state file, delete leading zero again
    if (downloadResponse !== 'error') {
      currentEdition = currentEdition.replace('0', '')
    }
  }

  // try again with new year version
  if (downloadResponse === 'error') {
    currentEdition = 1;
    ({ link, fileName } = buildLinkAndFileName(currentEdition));
    downloadResponse = await downloadEpub(link, fileName);
  }

  // Maybe script called too early, when edition was not published. State will not be changed.
  if (downloadResponse === 'error') {
    throw new Error ('Cannot get epub');
  }

  fs.writeFileSync('./state', currentEdition.toString());

  const responseUpload = await uploadEpub(fileName);

  if (responseUpload.metadata) {
    fs.unlink(fileName, (err) => {
      console.log(err)
    });
  }
}

distributeLatestEpub();