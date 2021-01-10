require('dotenv').config()
const request = require('request');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { parseCookies, Date } = require('./helper_functions');

const optionsZeitLogin = {
  'method': 'POST',
  'url': 'https://meine.zeit.de/anmelden',
  'headers': {},
  form: {
    'email': process.env.ZEIT_EMAIL,
    'pass': process.env.ZEIT_PW
  }
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

const formToken= new URLSearchParams();
formToken.append('client_id', 'webreader');
formToken.append('grant_type', 'authorization_code');
formToken.append('scope', 'SCOPE_BOSH');
formToken.append('redirect_uri', 'https://webreader.mytolino.com/library/');
formToken.append('x_buchde.skin_id', '17');
formToken.append('x_buchde.mandant_id', '2');

let fileName;

const buildLink = (edition) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  let currentWeek = today.getWeek().toString()
  currentWeek = currentWeek.length === 1 ? `0${currentWeek}` : currentWeek;

  // Careful with side effect!
  fileName = `die_zeit_${currentYear}_${edition}.epub`

  // todo: work on edge case where first version of new year is published in old year
  // e.g. https://premium.zeit.de/system/files/2020-52/epub/die_zeit_2020_54_1.epub
  return `https://premium.zeit.de/system/files/${currentYear}-${currentWeek}/epub/die_zeit_${currentYear}_${edition}.epub`
}

const downloadEpub = (epubUrl) => {
  // todo: use node-fetch
  return new Promise (resolve => request(optionsZeitLogin, (error, response) => {
    if (error) throw new Error(error);
    optionsDownloadEpub.headers['Cookie'] = response.headers['set-cookie'];
    optionsDownloadEpub.url = epubUrl;

    let file = fs.createWriteStream(fileName);
    request(optionsDownloadEpub, (error, response) => {
      if (error) throw new Error(error);
      if (response.body.includes('<!DOCTYPE html>')) resolve('NOT FOUND')
      })
      .pipe(file)
      .on('finish', () => {
        file.close()
        resolve('resolved')
      })
  }));
}

const uploadEpub = async () => {
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

  formToken.append('code', code);

  const responseToken = await fetch('https://www.thalia.de/auth/oauth2/token',
  {
    body: formToken,
    method: 'POST',
    redirect: 'manual'
  });

  const token = await responseToken.json();

  const formUpload = new FormData();
  formUpload.append('file', fs.createReadStream(fileName));
  const uploadHeaders = formUpload.getHeaders();
  uploadHeaders.t_auth_token = token.access_token;
  uploadHeaders.hardware_id = '5285356b-a469-4bbc-bb5c-f4ae67f7537b';
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
  const lastEdition = fs.readFileSync('./state').toString();
  let currentEdition = Number(lastEdition) + 1;
  let link = buildLink(currentEdition);

  let downloadResponse = await downloadEpub(link);

  // try again with new year version
  if (downloadResponse === 'NOT FOUND') {
    // todo: once downloadEpub uses fetch, can be moved directly to function
    fs.unlink(fileName, (err) => console.log(err));

    currentEdition = 1;
    link = buildLink(currentEdition);
    downloadResponse = await downloadEpub(link);
  }

  // Maybe script called too early, when edition was not published. State will not be changed.
  if (downloadResponse !== 'resolved') {
    // todo: once downloadEpub uses fetch, can be moved directly to function
    fs.unlink(fileName, (err) => console.log(err));

    throw new Error ('Cannot get epub');
  }

  fs.writeFileSync('./state', currentEdition.toString());

  const responseUpload = await uploadEpub();

  if (responseUpload.metadata) {
    fs.unlink(fileName, (err) => {
      console.log(err)
    });
  }
}

distributeLatestEpub();