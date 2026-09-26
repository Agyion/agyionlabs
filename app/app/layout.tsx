import type { Metadata } from "next";
import "./globals.css";
import "./orbital.css";
import { FLIGHT_BRIDGE_SCRIPT } from "../../shared/flight-handoff";

export const metadata: Metadata = {
  metadataBase: new URL("https://agyionlabs.dev"),
  title: "Agyion — Money with conditions",
  icons: { icon: "/favicon.svg" },
  description:
    "Agyion locks money, proves a condition, and the money executes itself — or comes back. Four templates on Stellar: Fade, Pod, Trigger, Envoy.",
  openGraph: {
    title: "Agyion — Money with conditions",
    description:
      "Lock money, prove a condition, and the money executes itself — or comes back.",

  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script id="agyion-flight-preload" dangerouslySetInnerHTML={{ __html: FLIGHT_BRIDGE_SCRIPT }} />
      </head>
      <body>
        <div id="agyion-flight-bridge-root" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '' }} />
        {children}
      </body>
    </html>
  );
}
