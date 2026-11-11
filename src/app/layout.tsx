import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Frank_Ruhl_Libre, Geist_Mono, Heebo } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { directionOf, type Locale } from "@/lib/i18n/config";
import "./globals.css";
import { LABEL_FONT_CLASSES } from "./label-fonts";

// Heebo covers Hebrew and Latin in one family; Geist Mono is kept for digits and barcodes.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-sans",
  display: "swap",
});

// Frank Ruhl Libre is a classic Hebrew and Latin serif: titles and the big numbers.
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-serif",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    // Link previews need a full address for the picture; the app's own address comes from the environment.
    metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const dir = directionOf(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${heebo.variable} ${frankRuhl.variable} ${geistMono.variable} ${LABEL_FONT_CLASSES} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <DirectionProvider direction={dir}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
