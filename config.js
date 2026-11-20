/* =========================================================================
   BiteWise 2.0 — Public Integration Config (GitHub Pages + Local Compatible)
   Paste your free Google OAuth Client ID, EmailJS keys, Admin Phone, and Gemini API key here,
   OR set them directly from the "الإعدادات" (Integrations Settings) modal inside the app.
   ========================================================================= */
window.BITEWISE_CONFIG = {
  // 1. Real Google Sign-In OAuth 2.0 Client ID (from Google Cloud Console)
  //    Authorized JS origins: http://localhost:8765 and https://YOUR_USERNAME.github.io
  googleClientId: "649984322250-egrc9tlsc139ig5kh36tj97th01iho7j.apps.googleusercontent.com",

  // 2. EmailJS keys (REQUIRED for sending real Gmail OTP on GitHub Pages 24/7)
  //    Connected to your Gmail:
  emailjsServiceId: "service_igtx7d5",
  emailjsTemplateId: "template_4dqi3kq",
  emailjsPublicKey: "f-4VWAVuPnR4HTGEC",

  // 3. Official Admin Phone Number for OTP & Customer Support (WhatsApp Hotline)
  adminPhone: "01009864154",
  adminPhoneIntl: "+201009864154",

  // 4. WhatsApp Automation Gateway (Optional: UltraMsg / Wasapi / Twilio)
  //    Leave empty to use 1-click direct WhatsApp web / app integration
  whatsappApiUrl: "",
  whatsappToken: "",

  // 5. Google Gemini AI API Key (for BiteWise AI Nutritionist & Smart Assistant)
  //    Active official key:
  geminiApiKey: "",

  // 6. OpenFoodFacts Barcode API Base URL (Free, global & Egyptian products)
  barcodeApiBase: "https://world.openfoodfacts.org/api/v2/product",

  // 7. Optional Cloud Webhook URL (e.g. Google Sheets Apps Script / Formspree)
  //    Receives every new user signup automatically when hosted on GitHub Pages
  cloudWebhookUrl: "",
};
