import { NextRequest, NextResponse } from 'next/server'

const PROXY_BASE = '/api/proxy?url='

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) return htmlError('Missing url parameter')

  let targetUrl: URL
  try {
    targetUrl = new URL(url)
  } catch {
    return htmlError('Invalid URL')
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    })

    clearTimeout(timeoutId)

    const contentType = res.headers.get('content-type') ?? ''

    // Pass non-HTML resources straight through (images, CSS, JS, fonts…)
    if (!contentType.includes('text/html')) {
      const body = await res.arrayBuffer()
      return new NextResponse(body, {
        status: res.status,
        headers: { 'Content-Type': contentType },
      })
    }

    let html = await res.text()

    // <base> tag makes all relative paths (CSS, images, JS) resolve against
    // the original domain directly — no need to proxy resources.
    // The click interceptor routes anchor navigation through the proxy.
    const injection = `<base href="${targetUrl.origin}/">
<script>
(function(){
  var base = ${JSON.stringify(targetUrl.href)};
  var proxy = ${JSON.stringify(PROXY_BASE)};
  document.addEventListener('click', function(e){
    if (e.defaultPrevented) return;
    var el = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:') ||
        href.startsWith(proxy)) return;
    try {
      var abs = new URL(el.href || href, base).href;
      if (!abs.startsWith('http')) return;
      e.preventDefault();
      window.parent.postMessage({ type: 'proxy-navigate' }, '*');
      window.location.href = proxy + encodeURIComponent(abs);
    } catch(e){}
  });
})();
</script>`

    if (/<head(\s[^>]*)?>/.test(html)) {
      html = html.replace(/<head(\s[^>]*)?>/, `$&${injection}`)
    } else {
      html = injection + html
    }

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return htmlError(msg)
  }
}

function htmlError(msg: string) {
  return new NextResponse(
    `<html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#888">
      <p style="margin:0">Could not load this website.</p>
      <p style="font-size:0.8rem;margin-top:0.5rem;opacity:0.5">${msg}</p>
    </body></html>`,
    { status: 502, headers: { 'Content-Type': 'text/html' } }
  )
}
