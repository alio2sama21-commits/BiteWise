/* =========================================================================
   BiteWise 2.0 — Public Integration Config (GitHub Pages + Local Compatible)
   Paste your free Google OAuth Client ID and/or EmailJS keys here, OR set them
   directly from the "الإعدادات" (Integrations Settings) button inside the app.
   ========================================================================= */
window.BITEWISE_CONFIG = {
  // 1. Real Google Sign-In OAuth 2.0 Client ID (from Google Cloud Console)
  //    Authorized JS origins: http://localhost:8765 and https://YOUR_USERNAME.github.io
  googleClientId: "649984322250-egrc9tlsc139ig5kh36tj97th01iho7j.apps.googleusercontent.com",

  // 2. EmailJS keys (REQUIRED for sending real Gmail OTP on GitHub Pages 24/7)
  //    Create free account at https://www.emailjs.com/ -> connect your Gmail -> paste keys below:
  emailjsServiceId: "service_igtx7d5",
  emailjsTemplateId: "template_4dqi3kq",
  emailjsPublicKey: "f-4VWAVuPnR4HTGEC",

  // 3. Optional Cloud Webhook URL (e.g. Google Sheets Apps Script / Formspree)
  //    Receives every new user signup automatically when hosted on GitHub Pages
  cloudWebhookUrl: "",
};
