// Which copy of the site this is. The deploy step (scripts/build-site.mjs) overwrites this file:
//   'dev'      running locally from public/ — every flag works
//   'public'   ephemeralgame.com — only today's game and the archive; ?preview and ?dev are ignored
//   'preview'  the private preview copy — ?preview and ?dev work, upcoming games included
export const CHANNEL = 'dev';
