export function setMyStuffCookie(items: {id: string, type: 'movie'|'tv'}[]) {
  const d = new Date();
  d.setTime(d.getTime() + (365*24*60*60*1000)); // 1 year expiration
  document.cookie = `mystuff=${JSON.stringify(items)};expires=${d.toUTCString()};path=/;SameSite=None;Secure`;
}

export function getMyStuffCookie(): {id: string, type: 'movie'|'tv'}[] {
  const name = "mystuff=";
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      try {
        return JSON.parse(c.substring(name.length, c.length));
      } catch (e) {
        return [];
      }
    }
  }
  return [];
}
