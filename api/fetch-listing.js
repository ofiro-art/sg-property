export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return new Response(JSON.stringify({ error: 'No URL provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Only allow PropertyGuru and 99.co
  const allowed = ['propertyguru.com.sg', '99.co'];
  const isAllowed = allowed.some(d => url.includes(d));
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: 'Only PropertyGuru and 99.co are supported' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-SG,en;q=0.9',
      }
    });

    const html = await res.text();

    // Extract structured data from PropertyGuru / 99.co
    const extract = (html, url) => {
      const isPG = url.includes('propertyguru');

      const get = (patterns) => {
        for (const p of patterns) {
          const m = html.match(p);
          if (m) return m[1]?.trim();
        }
        return null;
      };

      // Title
      const title = get([
        /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
        /<h1[^>]*>([^<]{10,100})</i,
        /<title>([^|<]{10,80})/i,
        /"name"\s*:\s*"([^"]{10,100})"/,
      ]) || 'Singapore Property';

      // Price
      const priceRaw = get([
        /\$\s*([\d,]+)\s*(?:\/\s*mo|per month|\/month)/i,
        /"price"\s*:\s*"?\$?\s*([\d,]+)/,
        /listing[_-]?price[^>]*>\s*\$?\s*([\d,]+)/i,
        /S\$\s*([\d,]+)/,
        /([\d,]{4,7})\s*\/\s*(?:mo|month)/i,
      ]);
      const price = priceRaw ? parseInt(priceRaw.replace(/,/g, '')) : 0;

      // Bedrooms
      const roomsRaw = get([
        /(\d+(?:\.\d)?)\s*(?:Bed(?:room)?s?|BR)\b/i,
        /"bedroom[s]?"\s*:\s*"?(\d+)/i,
        /bedrooms?[^>]*>\s*(\d+)/i,
      ]);
      const rooms = roomsRaw ? parseFloat(roomsRaw) : 3;

      // Bathrooms
      const bathsRaw = get([
        /(\d+)\s*(?:Bath(?:room)?s?|toilet)\b/i,
        /"bathroom[s]?"\s*:\s*"?(\d+)/i,
      ]);
      const baths = bathsRaw ? parseInt(bathsRaw) : 2;

      // Size
      const sizeRaw = get([
        /([\d,]+)\s*(?:sqft|sq\.?\s*ft|square feet)/i,
        /"floor[_-]?area"\s*:\s*"?([\d,]+)/i,
      ]);
      const size = sizeRaw ? parseInt(sizeRaw.replace(/,/g, '')) : 0;

      // Floor
      const floorRaw = get([
        /(?:floor|level|storey)\s*:?\s*(\d+)/i,
        /#(\d+)[\-\/]\d+/,
        /"floor[^"]*"\s*:\s*"?(\d+)/i,
      ]);
      const floor = floorRaw ? parseInt(floorRaw) : '-';

      // Address
      const address = get([
        /"streetAddress"\s*:\s*"([^"]+)"/,
        /"address"\s*:\s*"([^"]+)"/,
        /class="[^"]*address[^"]*"[^>]*>([^<]{5,80})</i,
        /property[_-]?address[^>]*>([^<]{5,80})</i,
      ]) || '';

      // District
      const distM = (address + html).match(/\b(D\d{2}|District\s*\d{1,2})\b/i);
      const district = distM ? distM[1].toUpperCase().replace('DISTRICT ', 'D0') : '';
      const fullAddress = address + (district && !address.includes(district) ? ', ' + district : '');

      // Property type
      const typeRaw = get([
        /"propertyType"\s*:\s*"([^"]+)"/i,
        /property[_-]?type[^>]*>([^<]{3,30})</i,
      ]);
      let type = 'Condo';
      if (typeRaw) {
        if (/hdb/i.test(typeRaw)) type = 'HDB';
        else if (/land/i.test(typeRaw)) type = 'Landed';
        else if (/studio/i.test(typeRaw)) type = 'Studio';
        else if (/serviced/i.test(typeRaw)) type = 'Serviced Apt';
      } else if (/\bhdb\b/i.test(html)) type = 'HDB';

      // Furnishing
      let furnishing = 'Fully Furnished';
      if (/unfurnish/i.test(html)) furnishing = 'Unfurnished';
      else if (/partial/i.test(html)) furnishing = 'Partially Furnished';

      // MRT
      const mrtM = html.match(/([A-Z][a-zA-Z\s]+MRT)[^\n<]*?(\d+\s*min(?:utes?)?)?/);
      const mrt = mrtM ? mrtM[1].trim() + (mrtM[2] ? ' · ' + mrtM[2].trim() : '') : '—';

      // Available
      let available = 'Immediate';
      const avM = html.match(/available\s*(?:from|:)?\s*([A-Z][a-z]+\s+\d{4}|\d+\s+[A-Z][a-z]+\s+\d{4})/i);
      if (avM) available = avM[1];

      // Tags
      const tagPatterns = {
        'Pool': /\bpool\b/i, 'Gym': /\bgym\b/i, 'BBQ': /\bbbq\b/i,
        'Playground': /\bplayground\b/i, 'Security': /\bsecurity\b|\bguard\b/i,
        'Balcony': /\bbalcon/i, 'Sea View': /sea view/i, 'City View': /city view/i,
        'Carpark': /\bcarpark\b|\bparking\b/i, 'Pet Friendly': /\bpet\b/i,
        'Near MRT': /near mrt|\bwalk.*mrt\b/i, 'Air Con': /air[\s-]?con/i,
      };
      const tags = Object.entries(tagPatterns)
        .filter(([, re]) => re.test(html))
        .map(([t]) => t)
        .slice(0, 5);

      return { title: title.replace(/\s+/g, ' '), address: fullAddress, price, type, rooms, baths, size, floor, mrt, available, furnishing, tags };
    };

    const data = extract(html, url);
    const source = url.includes('propertyguru') ? 'PropertyGuru' : '99.co';

    return new Response(JSON.stringify({ ...data, source, ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
