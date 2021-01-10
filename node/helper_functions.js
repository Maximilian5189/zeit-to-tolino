module.exports.parseCookies = (response, existingCookies) => {
  if (!existingCookies) {
    const raw = response.headers.raw()['set-cookie'];
    return raw.map((entry) => {
      const parts = entry.split(';');
      const cookiePart = parts[0];
      return cookiePart;
    }).join(';');
  } else {
    let existingCookiesDeepArray = existingCookies.split(';');
    existingCookiesDeepArray = existingCookiesDeepArray.map((cookie) => {
      return cookie.split('=');
    });
    const raw = response.headers.raw()['set-cookie'];

    let cookieString = '';
    existingCookiesDeepArray.forEach((ExistingCookie, index) => {      
      let cookiePlacedInJar = false;
      raw.forEach((entry) => {
        const parts = entry.split(';');
        const cookieNew = parts[0];
        const CookieIdentifierNew = cookieNew.split('=');
        if (CookieIdentifierNew[0] === ExistingCookie[0]) {
          cookiePlacedInJar = true;
          cookieString += `${cookieNew};`;
        }
      })
      // existing cookie not replaced by new one, hence add old cookie back again
      if (cookiePlacedInJar === false) {
        cookieString += `${ExistingCookie[0]}=${ExistingCookie[1]};` 
      }
    })

    return cookieString;
  }
}

Date.prototype.getWeek = function() {
  var date = new Date(this.getTime());
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  // January 4 is always in week 1.
  var week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
                        - 3 + (week1.getDay() + 6) % 7) / 7);
}

module.exports.Date = Date;
