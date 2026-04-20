/**
 * Build the injectedJavaScript string for the WebView that applies
 * a user-configured font scale preference.
 */

export function buildFontScaleInject(fontScale: number): string {
  // Clamp to reasonable range
  const clamped = Math.max(0.8, Math.min(2.0, fontScale));
  return `
(function() {
  document.documentElement.style.fontSize = '${clamped}rem';
  document.documentElement.style.setProperty('--ws-font-scale', '${clamped}');
  true;
})();
`.trim();
}
