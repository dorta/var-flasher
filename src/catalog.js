const https = require('node:https');

const BASE = 'https://dev.variscite.com';
const FINDER = BASE + '/software-and-security/software-release-finder/';

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'var-flasher/0.1' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(request(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' while reading ' + url));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function clean(value) {
  return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

async function listReleases() {
  const html = await request(FINDER);
  const releases = [];
  const rowPattern = /<tr\s+data-date="([^"]+)"[\s\S]*?data-soms="([^"]+)"[\s\S]*?data-os="([^"]+)"[\s\S]*?data-os-filter="([^"]+)"[\s\S]*?data-tag="([^"]+)"[\s\S]*?>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowPattern.exec(html))) {
    const row = match[6];
    const links = [...row.matchAll(/<a href="([^"]+)"[^>]*data-som-link="[^"]+"[^>]*>([^<]+)<\/a>/g)];
    releases.push({
      date: match[1],
      soms: match[2].split('||').filter(Boolean),
      os: clean(match[3]),
      osFilter: match[4],
      tag: clean(match[5]),
      pages: links.map((link) => ({ name: clean(link[2]), url: new URL(link[1], BASE).href })),
    });
  }
  return releases;
}

async function releaseDetails(url) {
  const html = await request(url);
  let sourceHtml = html;
  let sourceUrl = url;
  let links = [...sourceHtml.matchAll(/href=\"([^\"]+)\"[^>]*>([^<]*)</gi)].map((m) => ({ href: m[1], text: clean(m[2]) }));
  let image = links.find((x) => /\.(?:img|wic)(?:\.gz)?(?:\?|$)/i.test(x.href));
  let packageLink = links.find((x) => /\.tar\.zst(?:\?|$)/i.test(x.href));
  const recovery = links.find((x) => /recovery-sd-card/i.test(x.href));
  if (!image && !packageLink && recovery) {
    sourceUrl = new URL(recovery.href, url).href;
    sourceHtml = await request(sourceUrl);
    links = [...sourceHtml.matchAll(/href=\"([^\"]+)\"[^>]*>([^<]*)</gi)].map((m) => ({ href: m[1], text: clean(m[2]) }));
    image = links.find((x) => /\.(?:img|wic)(?:\.gz)?(?:\?|$)/i.test(x.href));
    packageLink = links.find((x) => /\.tar\.zst(?:\?|$)/i.test(x.href));
  }
  const imageUrl = image ? new URL(image.href, sourceUrl).href : null;
  const downloadUrl = imageUrl || (packageLink ? new URL(packageLink.href, sourceUrl).href : null);
  const hashMatch = sourceHtml.match(/(?:sha(?:256|224)|checksum)[^a-f0-9]{0,80}([a-f0-9]{56,64})/i);
  return { pageUrl: sourceUrl, imageUrl, downloadUrl, artifactName: image?.text || packageLink?.text || null, artifactType: imageUrl ? 'image' : (packageLink ? 'package' : null), hash: hashMatch ? hashMatch[1] : null };
}
module.exports = { listReleases, releaseDetails };
