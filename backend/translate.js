import { Translate } from "@google-cloud/translate/build/src/v2/index.js";

const translate = new Translate({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export async function translateText(text, targetLangs = ["en", "fr", "pa", "hi"]) {
  const translations = {};

  for (const lang of targetLangs) {
    try {
      const [translation] = await translate.translate(text, lang);
      translations[lang] = translation;
    } catch (err) {
      console.error(`Translation error for ${lang}:`, err.message);
      translations[lang] = `[${lang.toUpperCase()}] ${text}`; // fallback
    }
  }

  return translations;
}