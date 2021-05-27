import { ServerRequest, Response } from "https://deno.land/std@0.80.0/http/server.ts";
import { setCookie } from "https://deno.land/std@0.80.0/http/cookie.ts";
import "https://deno.land/x/dotenv/load.ts";
import axiod from "https://deno.land/x/axiod/mod.ts";

// currently using old debugger: https://github.com/denoland/vscode_deno/issues/12

// const data = Deno.readTextFileSync('state');
// let [weekString, editionString] = data.split(',')
// const week = Number(weekString) + 1
// const edition = Number(editionString) + 1
// Deno.writeTextFileSync('state', `${week}, ${edition}`);

// const formZeitLogin = new URLSearchParams();
const formZeitLogin = new FormData();
formZeitLogin.append('email', Deno.env.get('ZEIT_EMAIL') || '');
formZeitLogin.append('pass', Deno.env.get('ZEIT_PW') || '');

enum Redirect {
  MANUAL = 'manual'
}

const optionsZeitLogin = {
  method: 'POST',
  headers: {},
  body: formZeitLogin,
  redirect: Redirect.MANUAL
}

const loginResponse = await fetch('https://meine.zeit.de/anmelden', optionsZeitLogin)

console.log(loginResponse)

// https://deno.land/std@0.80.0/http
const cookie = loginResponse.headers.get('set-cookie')
// console.log(cookie)
let headers = new Headers
cookie && headers.set('Cookie', cookie)
// console.log(headers)

// const response = await fetch('https://premium.zeit.de/system/files/2020-47/epub/die_zeit_2020_48_1.epub', {
//   credentials: 'include',
// })

// console.log(response)
