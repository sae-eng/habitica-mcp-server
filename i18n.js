// Simple i18n helper for Habitica MCP Server
// Supports: English (en), Chinese (zh), Japanese (ja)
const DEFAULT_LANG = 'en';
let currentLang = DEFAULT_LANG;

export function setLanguage(lang) {
  currentLang = (lang || '').toLowerCase();
}

export function getLanguage() {
  return currentLang;
}

export function t(en, zh, ja) {
  if (currentLang.startsWith('ja')) return ja || en;
  if (currentLang.startsWith('zh')) return zh || en;
  return en;
} 