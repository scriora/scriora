# تقرير مراجعة Scriora الشاملة

**التاريخ:** 2026-09-12  
**النطاق:** الفرع `main` عند الالتزام `2f91467`، سجل Pull Requests، تطبيقات API/Web/Worker، الحزم المشتركة، Prisma/PostgreSQL، CI، Docker، ونتائج GitHub الأمنية.

## الخلاصة التنفيذية

المشروع مترابط معمارياً على مستوى الحزم والبناء والاختبارات، لكنه **غير جاهز للإنتاج بعد**. لا توجد ثغرات تبعيات معروفة في `pnpm audit --prod`، وتنجح اختبارات الوحدة/التكامل المعتمدة حالياً، إلا أن المراجعة اليدوية كشفت أربع مشاكل أمنية عالية الأولوية، ومشكلة بنيوية مهمة في فرض عزل مساحات العمل داخل قاعدة البيانات، إضافة إلى مسار E2E وملفات Docker غير صالحة كما هي حالياً.

أهم ما يجب معالجته قبل أي نشر:

1. منع ربط منشور بملف MediaAsset تابع لمساحة عمل أخرى.
2. جعل استهلاك رموز الموافقة وMagic Link وتدوير Refresh Token عمليات CAS ذرّية.
3. منع تجاوز Rate Limit بتغيير ترويسات `Authorization` أو `x-api-key` غير الموثقة.
4. فرض اتساق `workspace_id` بالعلاقات المركبة داخل PostgreSQL، وليس في كود التطبيق فقط.
5. إصلاح E2E وDocker وحماية فرع `main` قبل اعتبار بوابة CI موثوقة.

## الحالة المثبتة

- Git: الشجرة كانت نظيفة، و`main` مطابق لـ `origin/main` عند `2f91467`.
- PRs: 20 إجمالاً؛ 13 مدمجة و7 مغلقة دون دمج مباشر. PRs رقم 4–6 جُمعت في #7، و9–12 جُمعت في #13.
- لا توجد Pull Requests مفتوحة حالياً.
- آخر PRs من #14 إلى #20 أظهرت 31 فحصاً ناجحاً لكل PR. PR #13 دُمج مع فشل CodeQL واحد، ثم جاءت #14 لمعالجة بقايا CodeQL.
- لا توجد مراجعات بشرية مسجلة (`reviewDecision` فارغ)، وPR #1 دُمج وهو Draft.
- فرع `main` غير محمي حالياً؛ لا توجد required checks أو required reviews مفروضة من GitHub.
- GitHub Code Scanning يعرض 8 تنبيهات مفتوحة: 3 مصنفة High، و5 جودة/صيانة.
- Dependabot: لا توجد تنبيهات مفتوحة.
- Secret scanning: معطل على المستودع.

## نتائج التحقق المحلي

| البوابة | النتيجة |
|---|---|
| `pnpm typecheck` | نجح: 14/14 |
| `pnpm test` | نجح: 13 مهام، 475 اختباراً |
| `pnpm build` | نجح تسلسلياً: 10/10 |
| `pnpm db:validate` | Prisma schema صالح |
| `pnpm verify:architecture` | نجح |
| `pnpm audit --prod --audit-level high` | لا توجد ثغرات معروفة |
| `pnpm lint` | فشل محلياً بسبب تنسيق/CRLF على Windows (`core.autocrlf=true`) |
| Playwright E2E | فشل قبل تشغيل الاختبارات بسبب مسار standalone خاطئ |
| Docker build | لم يكتمل؛ context تجاوز 1.46GB لعدم وجود `.dockerignore`، مع عوائق ثابتة إضافية في Dockerfiles |

نجاح الاختبارات الحالية لا يغطي سباقات المعاملات المذكورة أدناه، ولا يغطّي E2E أو صور Docker.

## الثغرات والمخاطر الأمنية

### SEC-01 — High — وصول أفقي إلى MediaAsset بين مساحات العمل

**المكان:** `packages/core/src/domain/publishing/create-post.service.ts:215-227`، وتعريف الأصل في `packages/core/prisma/schema.prisma:643-661`.

**الدليل:** خدمة إنشاء المنشور تستخرج `mediaAssetId` من طلب المستخدم ثم تستعلم بـ `id in (...)` فقط، دون `workspaceId` أو `deletedAt` أو حالة المعالجة، ودون التأكد من رجوع كل الأصول المطلوبة.

**الأثر:** مستخدم لديه صلاحية كتابة في مساحة A ويمكنه معرفة UUID لأصل في مساحة B يستطيع إرفاق `storageKey` الخاص به بمنشور مساحته. صعوبة تخمين UUID ليست بديلاً عن التفويض.

**الإصلاح:** إضافة `workspaceId` و`deletedAt: null` والحالة المسموحة إلى الاستعلام، والتحقق من العدد والملكية لكل أصل، وإلغاء fallback الذي يستخدم IDs كروابط. أضف اختباراً عابراً للمستأجرين.

### SEC-02 — High — رمز الموافقة أحادي الاستخدام ليس أحادياً تحت التزامن

**المكان:** `apps/api/src/routes/v1/approvals/index.ts:123-188` و`apps/api/src/lib/telegram-c2-create-post.ts:163-197`.

**الدليل:** المساران يقرآن `usedAt` خارج المعاملة، ثم ينفذان `update({ where: { id } })` غير مشروط داخل المعاملة. طلبان متزامنان يستطيعان اجتياز الفحص ثم كتابة قرارين متعارضين. CAS الموجود على حالة Publication لا يمنع القرار الثاني من استبدال حالة Approval قبل أن يرجع Conflict.

**الأثر:** سجل الحوكمة قد يقول Rejected بينما Publication أصبحت Ready، أو العكس؛ كما لا يتحقق ضمان one-time token فعلياً.

**الإصلاح:** داخل معاملة واحدة استخدم `updateMany` بشرط `id + usedAt:null + expiresAt>now` وتحقق أن `count === 1`، واشترط `Approval.status=PENDING`، ثم طبّق انتقال Publication. ينبغي أن يفشل الطلب الخاسر دون أي تغيير.

### SEC-03 — High — تجاوز Rate Limit بترويسات يختارها العميل

**المكان:** `apps/api/src/plugins/rate-limit.ts:5-14`.

**الدليل:** مفتاح الحد يُشتق من أي قيمة خام في `x-api-key` أو أول 32 حرفاً من `Authorization` قبل التحقق منها. يستطيع المهاجم تغيير الترويسة في كل طلب إلى `/login` أو `/register` أو `/magic-link` والحصول على bucket جديد.

**الأثر:** إضعاف حماية brute-force وإغراق إنشاء الحسابات/الروابط السحرية.

**الإصلاح:** نقاط المصادقة العامة تُحد حسب IP/شبكة موثوقة. بعد نجاح المصادقة فقط يمكن استخدام userId أو بصمة server-side لمفتاح API موثق. لا تستخدم credential الخام كمفتاح تخزين.

### SEC-04 — High — سباق في تدوير Refresh Token

**المكان:** `apps/api/src/routes/v1/auth/index.ts:430-466`.

**الدليل:** يُفحص `revokedAt`، ثم تُنشأ جلسة بديلة، ثم تُلغى القديمة في عمليات منفصلة وغير مشروطة. طلبان متزامنان بنفس الرمز يستطيعان إنشاء بديلين صالحين، كما أن فشلاً بين الإنشاء والإلغاء يترك الجلستين صالحتين.

**الإصلاح:** نفّذ CAS لإلغاء الجلسة القديمة وإنشاء البديل في transaction واحدة، واجعل نجاح الإلغاء المشروط شرطاً لإنشاء البديل. أضف refresh-token family/reuse detection إن كان نموذج التهديد يتطلب ذلك.

### SEC-05 — High — قاعدة البيانات لا تفرض اتساق المستأجر عبر العلاقات

**المكان:** `packages/core/prisma/schema.prisma:480-586`، ويتكرر النمط في نماذج Mission/Strategy/Experiment/Analytics/Approval.

**الدليل:** نماذج مثل `ContentVariant` و`Publication` و`PublishAttempt` و`OutboxCommand` تحمل `workspaceId` مع مفاتيح أبناء، لكن كل FK يشير إلى `id` وحده. يمكن لقاعدة البيانات قبول Publication بمساحة A مع ContentVariant أو SocialAccount من مساحة B، وOutbox بمساحة/Publication/Attempt غير متطابقة.

**الأثر:** أي استعلام تطبيق ينسى مرشح workspace قد يتحول إلى تسريب أو تعديل عابر للمستأجرين، كما يمكن أن تتلف سلسلة النشر حتى لو نجحت Prisma validation.

**الإصلاح:** أضف مفاتيح فريدة مركبة `(workspaceId,id)` وعلاقات FK مركبة حيث تدعمها Prisma، أو أزل `workspaceId` المكرر واشتقه عبر الأب. للعلاقات polymorphic استخدم trigger/check أو جداول متخصصة. قيّم PostgreSQL RLS كطبقة دفاع إضافية.

### SEC-06 — Medium — سباق استهلاك Magic Link

**المكان:** `apps/api/src/routes/v1/auth/index.ts:168-201`.

**الدليل:** يتم `findFirst` للرمز ثم مسحه بـ `update({id})` غير مشروط. طلبان متزامنان قد يصدران جلستي Refresh من الرابط نفسه.

**الإصلاح:** استهلاك ذري مشروط بالـ hash والصلاحية داخل transaction، ولا تُصدر الجلسة إلا إذا عدّل الاستعلام صفاً واحداً.

### SEC-07 — Medium — Discord bot token مقبول في Query String

**المكان:** `apps/api/src/routes/v1/connect/index.ts:1049-1057`.

**الدليل:** `query.botToken` له أولوية على الترويسة.

**الأثر:** قد يظهر السر في access logs، وسجل المتصفح، والـ proxies وAPM.

**الإصلاح:** اقبل السر في body أو ترويسة فقط، مع redaction صريح في السجلات.

### SEC-08 — Medium — تنبيه CodeQL ReDoS مفتوح

**المكان:** `packages/social/src/platforms/x/x.adapter.ts:117`، GitHub alert #5.

**الدليل:** regex تقسيم الجمل `/[^.!?]+[.!?]+|\S+/g` يعمل على نص يتحكم به المستخدم. الحد الحالي للنص 10,000 حرف يقلل الأثر لكنه لا يلغي التحذير.

**الإصلاح:** استخدم parser خطي أو تقسيم يدوي محدود، وأضف اختبار worst-case.

### SEC-09 — Low/Defense in depth — ترويسات HTTP الأمنية غير ظاهرة في التطبيق

**المكان:** `apps/api/src/app.ts:44-67` و`apps/web/next.config.ts:3-15`.

لا يوجد Helmet في Fastify ولا `headers()` في Next لضبط CSP و`frame-ancestors` و`nosniff` وReferrer/Permissions Policy. قد تكون هذه مفروضة عند CDN/ingress؛ يجب التحقق قبل اعتبارها فجوة فعلية في الإنتاج.

### تنبيهات CodeQL الأخرى

- Alerts #6 و#7 في `telegram-bot.service.ts:364,406` تبدو false positives بعد المراجعة: webhook يتحقق من السر في `apps/api/src/routes/v1/webhooks/telegram.ts:99-107`، ثم تتحقق الخدمة من `adminChatId` الثابت في `telegram-bot.service.ts:191-194,369,434`.
- خمسة تنبيهات أخرى جودة/متغيرات غير مستخدمة، وليست ثغرات أمنية مباشرة.
- ينبغي إغلاق/توثيق false positives في GitHub حتى لا تصبح لوحة CodeQL مضللة.

## الجداول والعلاقات

- Prisma يحتوي 31 model و3 migrations.
- `OAuthConnectNonce` في `schema.prisma:404-414` يحمل `userId` و`workspaceId` بلا علاقات/FKs؛ يسمح بسجلات orphan بعد حذف المستخدم/المساحة.
- `Approval.resourceId` علاقة polymorphic بلا FK، لذلك يجب دائماً التحقق من أن المورد ينتمي إلى `Approval.workspaceId`. preview الحالي يجلب Publication بـ id فقط في `approvals/index.ts:67-89`.
- `OutboxCommand` لا يملك قيداً فريداً يمنع أكثر من أمر نشط لنفس Publication/Attempt؛ من الأفضل فرض invariant مناسب في SQL، خصوصاً مع مسارات موافقة متزامنة.
- الفهارس الأساسية موجودة، وكذلك partial unique لموافقة Pending وفق تعليق schema، لكن الاختبارات الحالية لا تثبت invariants العابرة للجداول تحت التزامن.

## ترابط المشروع ومشكلات التشغيل

### OPS-01 — High — E2E غير قابل للتشغيل وغير موجود في CI

`apps/web/playwright.config.ts:23-28` يشغّل `.next/standalone/server.js`، بينما البناء يولّد `apps/web/.next/standalone/apps/web/server.js`. الاختبار يفشل قبل بدء Playwright. Workflow الاختبارات في `.github/workflows/test.yml:18-80` يشغّل Vitest فقط ولا يشغّل `test:e2e`.

### OPS-02 — High — صور Docker غير جاهزة

- لا يوجد `.dockerignore`، فبلغ build context أكثر من 1.46GB.
- `apps/api/Dockerfile:6-24` لا ينسخ manifest/source لحزمة `scriora-media` رغم اعتماد API عليها في `apps/api/package.json:28-30`.
- `apps/web/Dockerfile:27-29` ينسخ من `/app/.next/...` بينما ناتج monorepo تحت `/app/apps/web/.next/...`، كما لا يوجد `apps/web/public` حالياً.
- `apps/web/Dockerfile:15-16` يثبت public URLs على localhost وقت البناء؛ Next يضمّن `NEXT_PUBLIC_*` في bundle.
- عدة Dockerfiles تثبت pnpm دون version وتستخدم `--no-frozen-lockfile`، ما يضعف reproducibility.
- `docker-compose.yml` يشغّل PostgreSQL بكلمة `postgres` وRedis بلا auth ويعرض 5432/6379 على جميع الواجهات؛ صالح للتطوير المحلي فقط، وليس للنشر.

**خيار إعادة البناء:** يمكن حذف حاويات وصور Docker الحالية وإعادة إنشائها من الصفر بعد إصلاح Dockerfiles وإضافة `.dockerignore`. يُفضّل تنفيذ `docker compose down` دون الخيار `-v` للاحتفاظ ببيانات PostgreSQL وRedis، ثم حذف صور التطبيق القديمة وبناؤها مجدداً باستخدام `docker compose build --no-cache` وتشغيلها عبر `docker compose up -d`. لا ينبغي استخدام `docker compose down -v` إلا إذا كان حذف بيانات قواعد البيانات والـ volumes مقصوداً ومقبولاً. إعادة إنشاء الصور قبل إصلاح المسارات والاعتماديات المذكورة أعلاه ستعيد إنتاج نفس الأعطال.

### OPS-03 — Medium — أمثلة البيئة لا تطابق التطبيق

- `apps/api/.env.example:14-16` يوثق `AUTH_JWT_PUBLIC_KEY`/RS256، بينما التطبيق يستخدم `JWT_SECRET` مشتركاً في `apps/api/src/app.ts:24-64`.
- المثال يوثق `CORS_ALLOWED_ORIGINS` بينما التطبيق يقرأ `CORS_ORIGINS`.
- جذر `.env.example` لا يعرّف `APP_URL` الذي يبني منه API رابط Magic Link في `auth/index.ts:141`؛ القيمة الافتراضية تشير إلى Web على المنفذ 3000، ولا يوجد route أمامي `/v1/auth/verify`.
- المثال يوثق Resend، بينما التنفيذ الفعلي يعتمد `MAGIC_LINK_MAILER_URL` webhook.

### OPS-04 — Medium — platform في الطلب غير مربوط بالـ SocialAccount

`create-post.service.ts:196-205` يتحقق من IDs والمساحة فقط، ثم يبني payload من `target.platform` في السطر 311، بينما Worker يختار adapter من `account.platform` في `apps/worker/src/jobs/publish.job.ts:167-178`. يمكن إنشاء payload/options غير متسقة.

**الإصلاح:** اجلب `platform` مع الحساب، وارفض أي target لا تتطابق منصته، وامنع تكرار `socialAccountId` في payload.

### OPS-05 — Medium — عقد API والوثائق غير مكتمل

OpenAPI يحتوي 26 path، لكنه لا يتضمن على الأقل media carousel، Telegram webhook، مسار publications ذي prefix المختلف `/api/v1/publications`، وعمليات posts الإضافية مثل schedule/optimize. بناء docs نجح مع تحذيرات i18n/404/sitemap، وهناك شجرتا محتوى docs متوازيتان قد تنحرفان عن بعضهما.

### OPS-06 — Medium — CI وGitHub governance أضعف من النتائج الظاهرة

- `main` غير محمي، لذلك نجاح checks في PRs لا يمنع push مباشر أو merge دون review.
- Workflow يستخدم `pnpm install --no-frozen-lockfile`.
- لا توجد required reviews، ولا توجد مراجعات بشرية مسجلة في PRs الحالية.
- Secret scanning معطل.

### OPS-07 — Low — ترابط وظيفي غير مكتمل

- `missionId` مقبول في `PublishPayloadSchema` عند `packages/core/src/schemas/publish.schema.ts:304` ولا يستخدمه أي كود إنشاء نشر، لذلك لا تُسجل صلة المنشور بالمهمة.
- واجهة Web ما زالت placeholder صريحاً في `apps/web/app/(app)/dashboard/page.tsx:1-8`، ولا يوجد flow مستخدم متكامل للمصادقة/النشر.
- `pnpm lint` غير قابل لإعادة الإنتاج على Windows بسبب CRLF مع `core.autocrlf=true`، رغم نجاح CI على Linux؛ يلزم توحيد `.gitattributes`/Biome policy.

## ترتيب الإصلاح المقترح

1. PR-S7: إصلاح SEC-01 وSEC-03 مع اختبارات cross-tenant وrate-limit bypass.
2. PR-A3: توحيد CAS لرموز الموافقة وMagic Link وRefresh rotation مع اختبارات تنافسية حقيقية على PostgreSQL.
3. PR-D3: migration لاتساق tenant FKs وOAuthConnectNonce FKs وoutbox invariants.
4. PR-CI1: حماية `main`، required checks/reviews، frozen lockfile، تفعيل secret scanning، وإغلاق/تصنيف تنبيهات CodeQL.
5. PR-OPS1: إصلاح Playwright ثم إضافته إلى CI؛ إصلاح Dockerfiles وإضافة `.dockerignore` واختبارات image smoke.
6. PR-CONTRACT1: توحيد env contract وMagic Link origin وOpenAPI prefixes/paths.
7. بعد ذلك فقط: إكمال Web UI وربط missionId وتنظيف مسار worker القديم والوثائق المكررة.

## قرار الجاهزية

**الحالة الحالية: No-Go للإنتاج العام.**  
صالحة للاستمرار كبيئة تطوير بعد معالجة أسرار/منافذ compose محلياً، لكن SEC-01 إلى SEC-05 وOPS-01/02 تمنع اعتمادها كنسخة إنتاجية آمنة ومتصلة من طرف إلى طرف.
