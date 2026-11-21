import { Be_Vietnam_Pro, Charm, Ma_Shan_Zheng } from "next/font/google";
import localFont from "next/font/local";

/**
 * Typography (CLAUDE.md §9). All fonts below were render-tested with
 * "Tiên Hiệp Đạo Môn – ă â ê ô ơ ư đ ỹ ặ ợ ữ Ầ Ỗ" before being chosen.
 * next/font self-hosts them at build time (no runtime request to Google).
 */

/** Calligraphy — logo, hero, banners, collection names. */
export const fontDisplay = Charm({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "700"],
  variable: "--font-charm",
  display: "swap",
});

/**
 * Classical serif — section headings: Noto Serif Display (variable, 500–700), self-hosted since GĐ7.3.
 * Same files Google serves for its `latin` and `vietnamese` subsets (frontend/src/fonts/README.md), declared as ONE family
 * with Google's unicode ranges. Through next/font/google the CSS also listed Google's `latin-ext` file (170 KB),
 * declared after the Vietnamese one and overlapping it (ă, đ, ơ, ư…), so every Vietnamese page downloaded it
 * instead of the 16 KB Vietnamese file. Characters outside both ranges (rare: ā, ş…) are drawn with the size-adjusted
 * fallback ("fontHeading Fallback", Times New Roman).
 * Both calls name the family "fontHeading": Next builds the CSS variable from the exported constant's name, so the
 * family must be that name (Next docs, next/font "declarations"); the Vietnamese file joins the same family.
 * (Font loader options must be written literally: the name is repeated in both calls.)
 */
export const fontHeading = localFont({
  src: [{ path: "../fonts/noto-serif-display-latin.woff2", weight: "500 700", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "fontHeading" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-noto-serif-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
/** The Vietnamese letters of the same family (only downloaded when a heading has them). */
export const fontHeadingVietnamese = localFont({
  src: [{ path: "../fonts/noto-serif-display-vietnamese.woff2", weight: "500 700", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "fontHeading" },
    {
      prop: "unicode-range",
      value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
  variable: "--font-noto-serif-display-vi",
  display: "swap",
  adjustFontFallback: false,
});

/** Readable sans — body, prices, buttons, transactions. */
export const fontSans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

/** Han calligraphy subset (Ma Shan Zheng) — decorative Chinese glyphs ONLY, never Vietnamese text. */
export const fontHan = localFont({
  src: "../fonts/ma-shan-zheng-decor.woff2",
  variable: "--font-ma-shan-zheng",
  display: "block",
  preload: false,
});

/**
 * Full Ma Shan Zheng — calligraphy for CHINESE text in display headings (zh locale).
 * It sits after Charm in the display stack, so Latin/Vietnamese glyphs still use Charm and only
 * Han glyphs fall through to it. Google serves it split by unicode-range: browsers download only the
 * chunks for characters actually on the page. Not preloaded (vi/en pages never need it).
 */
export const fontHanText = Ma_Shan_Zheng({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-ma-shan-zheng-text",
  display: "swap",
  preload: false,
});

export const fontVariables = [fontDisplay, fontHeading, fontHeadingVietnamese, fontSans, fontHan, fontHanText].map((f) => f.variable).join(" ");
