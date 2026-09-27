import type { Metadata } from "next";
import "./globals.css";
import "./orbital.css";
import "./console-surface.css";
import "./instrument-workspaces.css";
import "leaflet/dist/leaflet.css";
import "./market-map.css";
import "./market.css";
import { FLIGHT_BRIDGE_SCRIPT } from "../../shared/flight-handoff";

export const metadata: Metadata = {
  metadataBase: new URL("https://agyionlabs.dev"),
  title: "Agyion: Money with conditions",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  },
  description:
    "Conditional payments on Stellar testnet. Explore Fade, Pod, Trigger and Envoy, with explicit transactions to settle each instrument.",
  openGraph: {
    title: "Agyion: Money with conditions",
    description:
      "Conditional payments on Stellar testnet: Fade, Pod, Trigger and Envoy.",

  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The browser replaces the landing document before external CSS and the
    // saved flight frame are ready. Set the canvas color in the opening tag.
    <html lang="en" style={{ backgroundColor: "#07090d", colorScheme: "dark" }}>
      <head>
        <meta name="color-scheme" content="dark" />
        <script id="agyion-flight-preload" dangerouslySetInnerHTML={{ __html: FLIGHT_BRIDGE_SCRIPT }} />
      </head>
      <body>
        <div id="agyion-flight-bridge-root" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '' }} />
        {children}
      </body>
    </html>
  );
}
