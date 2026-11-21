# Fonts

`ma-shan-zheng-decor.woff2` — subset of **Ma Shan Zheng** (SIL Open Font License 1.1), containing only
these decorative Han glyphs:

仙 道 剑 侠 武 龙 凤 宝 阁 天 地 灵 符 印 气 修 真 魔 神 玄 幻 云 山

It is used ONLY for Chinese decorative characters (seals, ornaments). It has no Vietnamese glyphs —
never use it for Vietnamese text (docs/DESIGN.md, "Nền tảng thiết kế"). To add glyphs, re-download the subset from
`https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&text=<glyphs>` and update this list.

`noto-serif-display-latin.woff2` and `noto-serif-display-vietnamese.woff2` — **Noto Serif Display** (SIL Open Font
License 1.1), variable weight 500–700: the exact files Google Fonts serves for its `latin` and `vietnamese` subsets
(taken from the `next/font/google` build output, 2026-11-20). Self-hosted since GĐ7.3 with Google's unicode ranges
(`frontend/src/styles/fonts.ts`), so Vietnamese pages no longer download Google's 170 KB `latin-ext` file. To refresh them,
build once with `Noto_Serif_Display` from `next/font/google` (subsets latin + vietnamese) and copy the two files
from `.next/static/media/` (match them by the unicode-range in the generated CSS).

Other fonts (Charm, Be Vietnam Pro) are loaded with `next/font/google`
(self-hosted at build time) with the `vietnamese` subset — see `frontend/src/styles/fonts.ts`.
