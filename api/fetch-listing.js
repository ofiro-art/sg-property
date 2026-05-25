export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!url) return new Response(JSON.stringify({ error: 'No URL' }), { status: 400, headers });

  const allowed = ['propertyguru.com.sg', '99.co'];
  if (!allowed.some(d => url.includes(d)))
    return new Response(JSON.stringify({ error: 'Only PropertyGuru and 99.co supported' }), { status: 400, headers });

  const source = url.includes('propertyguru') ? 'PropertyGuru' : '99.co';
  const slug = decodeURIComponent(url).toLowerCase();

  // ── Rooms ──────────────────────────────────────────────────────
  let rooms = 3;
  const roomM = slug.match(/(\d+)-bed(?:room)?s?/) || slug.match(/(\d+)br/) || slug.match(/(\d+)-bedrooms?/);
  if (roomM) rooms = parseFloat(roomM[1]);

  // ── Type ───────────────────────────────────────────────────────
  let type = 'Condo';
  if (/\bhdb\b/.test(slug))                               type = 'HDB';
  else if (/landed|terrace|bungalow|semi-det/.test(slug)) type = 'Landed';
  else if (/studio/.test(slug))                           type = 'Studio';
  else if (/serviced/.test(slug))                         type = 'Serviced Apt';

  // ── Property name from slug ────────────────────────────────────
  let clean = '';
  if (url.includes('propertyguru')) {
    clean = slug.replace(/.*\/listing\//, '').replace(/^for-(?:rent|sale)-/, '')
      .replace(/-\d{6,}$/, '').replace(/-\d+-bedrooms?.*$/, '').replace(/-\d+-(?:bedroom|room).*$/, '');
  } else {
    clean = slug.replace(/.*\/rentals?\//, '').replace(/.*\/property\//, '')
      .replace(/-\d{5,}$/, '').replace(/-\d+-bedrooms?.*$/, '');
  }
  const noise = new Set(['the','a','at','in','on','of','and','for','to','by','with','near','no','new','d','s','singapore','rent','sale']);
  const nameParts = clean.split('-').filter(w => w.length > 1 && !noise.has(w) && isNaN(w));
  const propertyName = nameParts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const title = propertyName ? `${rooms}BR ${type} at ${propertyName}` : `${rooms}BR ${type} · Singapore`;

  // ── District ───────────────────────────────────────────────────
  const distM = slug.match(/\bd(\d{2})\b/) || slug.match(/district-(\d{1,2})/);
  let district = distM ? `D${distM[1].padStart(2,'0')}` : '';
  const knownDistricts = {
    'orchard':'D09','newton':'D11','novena':'D11','bukit-timah':'D10','holland':'D10',
    'tanglin':'D10','river-valley':'D09','robertson':'D09','tanjong-pagar':'D02',
    'raffles':'D01','marina':'D01','sentosa':'D04','east-coast':'D15','katong':'D15',
    'bedok':'D16','tampines':'D18','punggol':'D19','sengkang':'D19','hougang':'D19',
    'bishan':'D20','ang-mo-kio':'D20','clementi':'D05','jurong':'D22','woodlands':'D25',
    'yishun':'D27','buona-vista':'D05','one-north':'D05','queenstown':'D03',
    'commonwealth':'D03','tiong-bahru':'D03','kallang':'D12','geylang':'D14',
    'pasir-ris':'D18','serangoon':'D19','little-india':'D08','bugis':'D07',
    'chinatown':'D02','alexandra':'D03','high-point':'D10','great-world':'D09',
  };
  if (!district) {
    for (const [name, d] of Object.entries(knownDistricts)) {
      if (slug.includes(name)) { district = d; break; }
    }
  }
  const address = propertyName
    ? `${propertyName}${district ? ', ' + district : ''}, Singapore`
    : `Singapore${district ? ' ' + district : ''}`;

  const data = {
    title, address, price: 0, type, rooms,
    baths: rooms >= 4 ? 3 : rooms >= 3 ? 2 : 1,
    size: 0, floor: '-', mrt: '—', available: 'Immediate',
    furnishing: 'Fully Furnished', tags: [], source, ok: true,
  };

  return new Response(JSON.stringify(data), { status: 200, headers });
}
