export function parseUa(ua: string | null | undefined) {
  const s = ua ?? "";
  const os = /Windows/i.test(s)
    ? "Windows"
    : /Android/i.test(s)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(s)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(s)
          ? "macOS"
          : /Linux/i.test(s)
            ? "Linux"
            : "Outro";
  const browser = /Edg\//i.test(s)
    ? "Edge"
    : /OPR\/|Opera/i.test(s)
      ? "Opera"
      : /SamsungBrowser/i.test(s)
        ? "Samsung"
        : /Chrome\//i.test(s)
          ? "Chrome"
          : /Firefox\//i.test(s)
            ? "Firefox"
            : /Safari\//i.test(s)
              ? "Safari"
              : /bot|crawl|spider|curl|python|node/i.test(s)
                ? "Bot"
                : "Outro";
  const device = /iPad|Tablet/i.test(s) ? "Tablet" : /Mobi|Android|iPhone/i.test(s) ? "Celular" : "Computador";
  return { os, browser, device };
}
