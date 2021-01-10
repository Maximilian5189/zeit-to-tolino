import { ServerRequest, Response } from "https://deno.land/std@0.80.0/http/server.ts";
import { setCookie } from "https://deno.land/std@0.80.0/http/cookie.ts";
// import { serve } from 'https://deno.land/std/http/server.ts';

// const s = serve({ port: 8000 });
// console.log('http://localhost:8000/');
// for await (const req of s) {
//   req.respond({ body: 'Hello World\n' });
// }

const data = Deno.readTextFileSync('state');
let [weekString, editionString] = data.split(',')
const week = Number(weekString) + 1
const edition = Number(editionString) + 1
Deno.writeTextFileSync('state', `${week}, ${edition}`);

const loginResponse = await fetch('https://meine.zeit.de/anmelden?email=XXXX&pass=XXXX', {
  method: 'POST',
  credentials: 'include',
  mode: 'cors',
  redirect: 'follow',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Host: 'meine.zeit.de',
    // Origin: 'https://meine.zeit.de',
    'Accept-Encoding': 'gzip, deflate, br',
    // 'Accept-Language': 'de,en-US;q=0.7,en;q=0.3',
    Accept: '*/*'
  },
})

console.log(loginResponse)

// https://deno.land/std@0.80.0/http
const cookie = loginResponse.headers.get('set-cookie')
console.log(cookie)
let headers = new Headers
cookie && headers.set('Cookie', cookie)
console.log(headers)

// const response = await fetch('https://premium.zeit.de/system/files/2020-47/epub/die_zeit_2020_48_1.epub', {
//   credentials: 'include',
// })

// console.log(response)
