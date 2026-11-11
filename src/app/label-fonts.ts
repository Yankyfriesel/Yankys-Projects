import {
  Alef,
  Amatic_SC,
  Arimo,
  Assistant,
  Bellefair,
  David_Libre,
  Fredoka,
  Gveret_Levin,
  IBM_Plex_Sans_Hebrew,
  Karantina,
  Miriam_Libre,
  Noto_Sans_Hebrew,
  Noto_Serif_Hebrew,
  Open_Sans,
  Playpen_Sans_Hebrew,
  Rubik,
  Secular_One,
  Suez_One,
  Tinos,
  Varela_Round,
} from "next/font/google";

/**
 * The typefaces offered for labels (see src/lib/labels/fonts.ts), all with Hebrew. They are not
 * preloaded: a font is fetched only when a label on the page uses it. Each one sets its CSS
 * variable on the page through its class. (Font loaders need plain literal options, so each
 * one is written out.)
 */
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-assistant",
});
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-rubik",
});
const alef = Alef({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-label-alef",
});
const openSans = Open_Sans({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-open-sans",
});
const notoSans = Noto_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-noto-sans",
});
const notoSerif = Noto_Serif_Hebrew({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-noto-serif",
});
const plex = IBM_Plex_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-label-plex",
});
const arimo = Arimo({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-arimo",
});
const tinos = Tinos({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-label-tinos",
});
const david = David_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-label-david",
});
const miriam = Miriam_Libre({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-miriam",
});
const secular = Secular_One({
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-label-secular",
});
const suez = Suez_One({
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-label-suez",
});
const varela = Varela_Round({
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-label-varela",
});
const fredoka = Fredoka({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-fredoka",
});
const karantina = Karantina({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-label-karantina",
});
const amatic = Amatic_SC({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-label-amatic",
});
const bellefair = Bellefair({
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-label-bellefair",
});
const playpen = Playpen_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
  variable: "--font-label-playpen",
});
const gveret = Gveret_Levin({
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-label-gveret",
});

/** The classes that put every label typeface's CSS variable on the page. */
export const LABEL_FONT_CLASSES = [
  assistant.variable,
  rubik.variable,
  alef.variable,
  openSans.variable,
  notoSans.variable,
  notoSerif.variable,
  plex.variable,
  arimo.variable,
  tinos.variable,
  david.variable,
  miriam.variable,
  secular.variable,
  suez.variable,
  varela.variable,
  fredoka.variable,
  karantina.variable,
  amatic.variable,
  bellefair.variable,
  playpen.variable,
  gveret.variable,
].join(" ");
