'use client';

import { useEffect } from 'react';

export default function NonceScript({ nonce }: { nonce: string | null }) {
  useEffect(() => {
    // Store nonce for any dynamic script injection
    if (nonce && typeof window !== 'undefined') {
      (window as any).__webpack_nonce__ = nonce;
    }

    // Helper to recursively remove Vercel toolbar and feedback elements
    const removeVercelNodes = (node: Node) => {
      if (node.nodeType !== 1) return;
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();
      const src = el.getAttribute?.('src') || '';
      const id = el.id || '';

      if (
        src.includes('vercel.live') ||
        src.includes('feedback') ||
        (tagName === 'iframe' && src.includes('vercel')) ||
        id.includes('vercel-toolbar')
      ) {
        el.remove();
        return;
      }

      if (el.children) {
        const children = Array.from(el.children);
        for (let i = 0; i < children.length; i++) {
          removeVercelNodes(children[i]);
        }
      }
    };

    // Clean existing elements immediately
    removeVercelNodes(document.documentElement);

    // Watch for future injections and clean them recursively
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          removeVercelNodes(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [nonce]);

  return null;
}
