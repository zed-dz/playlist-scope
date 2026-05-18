export const LANG_LABELS = {
  en: { label: 'English', flag: 'EN', native: 'English' },
  'en-GB': { label: 'English (UK)', flag: 'EN', native: 'English' },
  'en-US': { label: 'English (US)', flag: 'EN', native: 'English' },
  ar: { label: 'Arabic', flag: 'AR', native: 'العربية' },
  fr: { label: 'French', flag: 'FR', native: 'Français' },
  es: { label: 'Spanish', flag: 'ES', native: 'Español' },
  de: { label: 'German', flag: 'DE', native: 'Deutsch' },
  pt: { label: 'Portuguese', flag: 'PT', native: 'Português' },
};

export const langKey = (l) => (l || 'en').split('-')[0];
export const isRTL = (l) => ['ar', 'he', 'fa', 'ur'].includes(langKey(l));
export const isArabic = (l) => langKey(l) === 'ar';
