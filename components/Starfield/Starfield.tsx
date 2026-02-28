'use client'

import { useEffect } from 'react'

const PALETTES: [number, number, number][] = [
  [220, 245, 255],  // silver-white
  [56,  184, 208],  // cyan
  [160, 225, 245],  // pale aqua
  [190, 215, 255],  // soft blue-white
  [200, 195, 255],  // light lavender
]

export default function Starfield() {
  useEffect(() => {
    const field = document.createElement('div')
    field.setAttribute('aria-hidden', 'true')
    field.style.cssText =
      'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;'
    document.body.prepend(field)

    function spawn() {
      const s   = document.createElement('span')
      const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)]
      const op  = (0.35 + Math.random() * 0.65).toFixed(2)
      const col = `rgba(${pal[0]},${pal[1]},${pal[2]},${op})`

      const tier = Math.random()
      let len: number, h: number
      if (tier < 0.35) {
        len = 25 + Math.random() * 40    // small  25-65 px
        h   = 0.4 + Math.random() * 0.7
      } else if (tier < 0.72) {
        len = 65 + Math.random() * 65    // medium 65-130 px
        h   = 0.9 + Math.random() * 1.0
      } else {
        len = 130 + Math.random() * 90   // large  130-220 px
        h   = 1.6 + Math.random() * 1.2
      }

      const y    = Math.random() * 94
      const dur  = 7 + Math.random() * 9   // slow: 7-16 s
      const del  = Math.random() * dur
      const ang  = -(4 + Math.random() * 18)
      const glow = Math.random() > 0.5
        ? `filter:blur(${(0.3 + Math.random() * 0.8).toFixed(1)}px);`
        : ''

      s.style.cssText =
        'position:absolute;' +
        `top:${y}vh;` +
        `left:-${len + 20}px;` +
        `width:${len}px;` +
        `height:${h}px;` +
        `background:linear-gradient(to right,transparent,${col});` +
        `border-radius:${h * 2}px;` +
        `rotate:${ang}deg;` +
        glow +
        `animation:starFly ${dur.toFixed(2)}s ${del.toFixed(2)}s linear infinite;`
      field.appendChild(s)
    }

    for (let i = 0; i < 22; i++) spawn()

    return () => { field.remove() }
  }, [])

  return null
}
