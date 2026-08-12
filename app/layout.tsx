import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NexusFlow AI — Autonomous AI Pipelines & Enterprise Workflows",
  description:
    "We build production-ready autonomous AI pipelines that auto-screen candidates, sync multi-app tech stacks, and route high-value leads in seconds. Deploy in 24 hours.",
  keywords: [
    "NexusFlow AI",
    "AI automation",
    "autonomous AI pipelines",
    "n8n workflows",
    "candidate screening",
    "smart scheduling",
    "enterprise automation",
    "workflow automation",
    "secure AI systems",
  ],
  authors: [{ name: "Shakibul Bokhtiar", url: "https://shakibul.com" }],
  openGraph: {
    title: "NexusFlow AI — Autonomous AI Pipelines",
    description:
      "Eliminate 15+ hours of manual admin work per week with autonomous AI pipelines. Deploy in 24 hours.",
    type: "website",
    locale: "en_US",
    siteName: "NexusFlow AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexusFlow AI — Autonomous AI Pipelines",
    description:
      "Production-ready AI pipelines that auto-screen candidates & sync your tech stack.",
  },
  robots: { index: true, follow: true },
};

import { headers } from "next/headers";
import NonceScript from "./components/NonceScript";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce');

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head suppressHydrationWarning>
        <meta name="theme-color" content="#030712" />
        <link rel="icon" href="/favicon.ico" />

        {/* Critical inline styles with nonce */}
        {nonce && (
          <style nonce={nonce} suppressHydrationWarning>
            {`
              body { 
                margin: 0; 
                padding: 0; 
                overflow-x: hidden;
              }
              * { 
                box-sizing: border-box; 
              }
            `}
          </style>
        )}

        {/* Dynamic script & style nonce injection patch */}
        {nonce && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  var originalCreateElement = document.createElement;
                  document.createElement = function(tagName, options) {
                    var el = originalCreateElement.call(document, tagName, options);
                    var tag = tagName.toLowerCase();
                    if (tag === 'style' || tag === 'script') {
                      el.setAttribute('nonce', '${nonce}');
                    } else if (tag === 'iframe') {
                      Object.defineProperty(el, 'src', {
                        get: function() { return this.getAttribute('src') || ''; },
                        set: function(val) {
                          if (val && (val.indexOf('vercel.live') > -1 || val.indexOf('vercel') > -1)) {
                            val = 'about:blank';
                          }
                          this.setAttribute('src', val);
                        },
                        configurable: true
                      });
                    }
                    return el;
                  };

                  var originalSetAttribute = Element.prototype.setAttribute;
                  Element.prototype.setAttribute = function(name, value) {
                    if (name && name.toLowerCase() === 'style') {
                      var cssRules = (value || '').split(';');
                      for (var i = 0; i < cssRules.length; i++) {
                        var rule = cssRules[i].trim();
                        if (!rule) continue;
                        var colonIndex = rule.indexOf(':');
                        if (colonIndex > -1) {
                          var prop = rule.substring(0, colonIndex).trim();
                          var val = rule.substring(colonIndex + 1).trim();
                          this.style.setProperty(prop, val);
                        }
                      }
                      return;
                    }
                    return originalSetAttribute.call(this, name, value);
                  };
                })();
              `
            }}
          />
        )}
      </head>
      <body className="min-h-full w-full antialiased" suppressHydrationWarning>
        <NonceScript nonce={nonce} />
        {children}
      </body>
    </html>
  );
}
