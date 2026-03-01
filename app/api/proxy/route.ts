import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timer)

    const contentType = res.headers.get('content-type') || ''

    // Non-HTML resources: pass through as-is
    if (!contentType.includes('text/html')) {
      const body = await res.arrayBuffer()
      return new NextResponse(body, {
        headers: { 'Content-Type': contentType },
      })
    }

    let html = await res.text()
    const origin = new URL(url).origin

    // Inject <base> tag so relative URLs resolve against the original domain
    const baseTag = `<base href="${origin}/">`
    if (html.includes('<head')) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
    } else {
      html = baseTag + html
    }

    // Inject scroll-to support and heading ID tagging for Ditto analysis
    const dittoScript = `
<script>
(function(){
  // Tag all headings with data-ditto-id
  var headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
  for(var i=0;i<headings.length;i++){
    headings[i].setAttribute('data-ditto-id','ditto-h-'+i);
  }
  // Listen for scroll commands from parent
  window.addEventListener('message',function(e){
    if(e.data && e.data.type==='scrollTo'){
      var el=document.querySelector('[data-ditto-id="'+e.data.id+'"]');
      if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });
  // Intercept link clicks to prevent navigation away
  document.addEventListener('click',function(e){
    var a=e.target.closest('a');
    if(!a) return;
    var href=a.getAttribute('href');
    if(!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    e.preventDefault();
  },true);
})();
</script>`

    // Inject before </body> or at end
    if (html.includes('</body>')) {
      html = html.replace('</body>', dittoScript + '</body>')
    } else {
      html += dittoScript
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
