# BiteWise 2.0 — الذكاء الغذائي المصري ومخطط الوجبات

تطبيق ويب متكامل لحساب **BMI / BMR / TDEE** والسعرات اليومية (تلقائي أو يدوي)، مع قاعدة بيانات تضم **212 أكلة مصرية** بصور فريدة، ومخطط دايت ذكي يضمن **60g+ بروتين في وجبة الغداء**، وتسجيل دخول حقيقي عبر **Google OAuth** وتأكيد **Gmail OTP**، وحفظ تلقائي لبيانات المستخدمين في `users_database.txt`.

## التشغيل محلياً (مع حفظ تلقائي في `users_database.txt` وإرسال Gmail OTP)
1. شغّل ملف `start_bitewise.bat` (دبل كليك).
2. هيفتح تلقائياً على `http://localhost:8765/`.
3. كل مستخدم يسجل بيتخزن تلقائياً في `users_database.txt`.

## تفعيل Sign in with Google الحقيقي (دقيقتين)
1. افتح [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. أنشئ **OAuth Client ID** من نوع **Web application**.
3. أضف في **Authorized JavaScript origins**:
   - `http://localhost:8765`
   - رابط GitHub Pages بتاعك (مثال: `https://YOUR_USERNAME.github.io`)
4. انسخ الـ **Client ID** والصقه داخل زر **الإعدادات (⚙️)** في الموقع أو داخل `config.js`.

## تفعيل إرسال كود OTP حقيقي على Gmail
- **محلياً:** من زر **الإعدادات (⚙️)** في الموقع، أدخل إيميل Gmail الخاص بك + **Google App Password** (من `myaccount.google.com/apppasswords`).
- **على GitHub Pages:** اربط حسابك المجاني على [EmailJS](https://www.emailjs.com/) وأدخل المفاتيح في الإعدادات أو `config.js`.

## الرفع على GitHub Pages (للحصول على لينك مباشر للموقع)
1. أنشئ Repository جديد على GitHub باسم `BiteWise`.
2. ارفع ملفات المشروع (ملف `.gitignore` بيحمي بيانات المستخدمين تلقائياً).
3. من **Settings → Pages → Branch: main → Save** وهيظهر لك اللينك المباشر فوراً!
