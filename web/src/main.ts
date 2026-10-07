import './ui/style.css';
import { detectLocale, setLocale, t } from './i18n';
import { createMap } from './ui/map';

const locale = detectLocale(navigator.languages ?? [navigator.language]);
setLocale(locale);
document.documentElement.lang = locale;
document.title = t('app.title');

const el = document.getElementById('map');
if (el) createMap(el);
