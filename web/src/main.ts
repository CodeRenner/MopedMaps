import './ui/style.css';
import { startApp } from './app';
import { detectLocale, setLocale, t } from './i18n';
import { createMap } from './ui/map';

const locale = detectLocale(navigator.languages ?? [navigator.language]);
setLocale(locale);
document.documentElement.lang = locale;
document.title = t('app.title');

const mapEl = document.getElementById('map');
const uiEl = document.getElementById('ui');
if (mapEl && uiEl) {
  const map = createMap(mapEl);
  map.once('load', () => {
    startApp(map, uiEl).catch((err) => console.error('startup failed', err));
  });
}
