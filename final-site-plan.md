# כמה זה עולה - Final Site Plan (Structure + Visual Design)

**Status:** APPROVED at Plan Gate (`_process/04-gatekeeper-plan-review.md`), then revised per a full team notes round (`_process/11-team-notes-round.md`, 15 notes across Researcher/Site Planner/Web Designer/Copywriter/Gatekeeper) before Builder ran. See that file for the reasoning behind every change below.

---

# חלק א: מבנה (Site Planner)

## Site Plan: כמה זה עולה

**Goal:** משחק ניחוש מחירים שמייצר 10,000 משתמשים בחודש וכ-10 דקות שהות ממוצעת, כדי לתמוך במכירת פרסומות · **Audience:** קהל רחב ישראלי, כל הגילאים, אוהבי משחקי ניחוש/ידע קלילים (וורדל, Higher Lower) וסקרנים לגבי מחירים
**Site type:** Track B - מוצר צרכני להמון רחב, לא אתר עסק. מבנה מסך (screen set), לא sitemap עסקי, כי ה-Attention→Trust→Decision funnel של אתר עסקי לא רלוונטי, אין כאן "לקוח לשכנע", יש משתמש שצריך להתחיל לשחק תוך שניות (per FCB grid ב-Researcher brief: Low-Involvement/Feel).
**Page count driver:** 9 מסכים. הליבה (Home, Play Hub, Round Loop, Set Results, Daily Challenge) = 5 מסכים שמייצרים בפועל את לולאת המשחק. Stats = השקעה/Investment (Hook). About/Data Sources = דרישת האמינות המוחלטת של הבריף (כל מחיר אמיתי, חייב עמוד שמסביר את זה). Settings + Privacy Policy = תחזוקה טכנית/רגולטורית (פרסומות דורשות מדיניות פרטיות אמיתית).
**Navigation topology:** **היברידי.** ברמה העליונה: **Tab-based** (Play / Daily / Stats, 3 יעדים קבועים, per Round 8's 3-5 ceiling), עם Home כמסך כניסה שאינו טאב. בתוך הטאב Play (וגם מ-Daily): **Hub-and-spoke** - "Play Hub" הוא המתפרר: לחיצה על "התחל סבב" שולחת למסך Round Loop אימרסיבי מסך-מלא (הטאב-בר נעלם), שחוזר ל-Hub (או ל-Set Results) בסיום הסבב. About/Settings/Privacy יושבים מאחורי כפתור overflow קטן בפינה, לא בטאב בר.

### Sitemap (Screen Set, Track B)

| מסך | Route/State | מטרה | Parent / Nav placement |
|---|---|---|---|
| Home | `/` | הבטחה תוך 5 שניות + כניסה מיידית למשחק | כניסה, לא טאב |
| Play Hub | `#/play` | בחירת מסלול (נחש מחיר / השוואת מדינות / מעורב) ואורך סבב | טאב 1 |
| Round Loop | `#/play/round` | הליבה: ניחוש -> חשיפה -> הבא, ברצף | מקונן תחת Play Hub (hub-and-spoke) |
| Set Results & Share | `#/play/results` | ציון סופי, הדגשת ניחוש הכי טוב/גרוע, כרטיס שיתוף | מוצג בסוף סבב |
| Daily Challenge | `#/daily` | סבב יומי קבוע וזהה לכולם, streak | טאב 2 |
| Stats/Progress | `#/stats` | streak, שיאים אישיים, היסטוריה | טאב 3 |
| About & Data Sources | `#/about` | שקיפות מלאה: מקורות המחיר, תאריך עדכון, מתודולוגיה | overflow + footer |
| Settings | `#/settings` | קול, אנימציה מופחתת, ניקוי נתונים | overflow menu |
| Privacy Policy | `#/privacy` | מדיניות פרטיות (נדרש לרשתות פרסום) | footer בלבד |

**הערת בנייה:** אפליקציית עמוד-יחיד (SPA) עם החלפת view ב-JS, לא ניווט בין קבצי HTML נפרדים - מעבר בין סבבים חייב להיות רציף ומיידי כדי לתמוך ביעד 10 הדקות.

### Onboarding ("jump-in, jump-out")
1. שנייה 0-3: Home, כפתור ענק "שחקו עכשיו" (מסלול מעורב כברירת מחדל).
2. שנייה 3: ישר ל-Round Loop, בלי מסך ביניים. הסבב הראשון = ה-Tutorial (הדרכה ויזואלית inline, נעלמת אחרי ניחוש ראשון, נשמרת ב-localStorage).
3. שנייה 10-15: חשיפת תוצאה ראשונה מלמדת את כל המכניקה בלי מילה.
4. אחרי 5 סבבים: Set Results, "עוד סבב" / "שתפו" / "לאתגר היומי".

### Page-by-Page Spec

#### Home
**Purpose:** להוכיח את ההבטחה תוך 5 שניות ולשלוח למשחק מיידית.
**Above-the-fold promise:** "תנחשו כמה זה עולה באמת, על מחירים אמיתיים מהחנויות והמדינות."
**כותרת (עודכנה בסבב הצוות להבליט את מקור הנתונים כבר בפתיחה):** "כמה זה עולה, באמת?" / "לא הערכות, מחירים אמיתיים. מהמחירונים שרשתות השיווק חייבות בחוק לפרסם, ומדדים כלכליים אמיתיים בין מדינות."
**Sections:** (1) כותרת+תת-כותרת+CTA ענק "שחקו עכשיו". (2) שתי כרטיסיות מסלול קופצות ישר ל-Round Loop. (3) שורת אתגר יומי (רק אם עוד לא שוחק, מ-localStorage). (4) פוטר: About + פרטיות.
**CTAs:** ראשי "שחקו עכשיו", יחס תשומת-לב כמעט 1:1, חיכוך אפס, אין חרדה (חינמי, אין סיכון).
**States:** שורת אתגר יומי בלבד דינמית (מוצג/מוסתר).
**Mobile:** עמודה אחת, כפתור בטווח אגודל.

#### Play Hub
**Purpose:** בחירה קלה, לא חסימה.
**Above-the-fold promise:** "בחרו מסלול, או פשוט תתחילו."
**Sections:** שלוש כרטיסי מסלול (מעורב/נחשו מחיר/השוואת מדינות, מעורב מודגש כברירת מחדל), בורר אורך סבב (5/10/15, ברירת מחדל 10), כפתור "התחל".
**CTAs:** "התחל", 1:1.
**Mobile:** כרטיסים נערמים אנכית.

#### Round Loop (המסך המרכזי)
**Purpose:** הליבה המוחלטת, המסך הכי מלוטש באתר.
**Above-the-fold promise:** "רק ניחוש אחד, עכשיו."
**Sections:** פס עליון דק (מספר סבב, streak+ציון, X יציאה - **יציאה מבטלת את הסבב הנוכחי וחוזרת ל-Play Hub, רק סט שהושלם במלואו נספר ב-Stats/streak**). **Precision:** תמונת מוצר גדולה + שדה קלט נומרי + כפתורי +/- + "נחשו!". **Comparison:** שם הפריט + שני כרטיסי מדינה (דגל+שם), **צד ימין/שמאל מוגרל אקראית בכל סבב** כדי שלא ילמדו דפוס מיקום. **חשיפה (אותו מסך):** מד-קרבה מונפש, מספר אמיתי, **שורת מקור+תאריך חובה בכל סבב**, ניקוד, "הבא". **שבירת streak:** דהייה עדינה כלפי מטה (200ms), לעולם לא רעד/הבזק עונשי.
**CTAs:** "נחשו!"->"הבא", חיכוך אפס בכוונה.
**States:** Loading (טעינה חד-פעמית בתחילת סשן, לא בין סבבים), Error (מסך ידידותי + כפתור רענון).
**Mobile:** תמונה/כרטיסים ~60% מהגובה, אזור פעולה בטווח אגודל.
**נגישות תנועה:** `prefers-reduced-motion` מבטל סיבוב מחט וקונפטי, שומר על אישור-פעולה (count-up + צבע).

#### Set Results & Share
**Purpose:** לסגור עם סיפוק, להניע להמשך.
**Above-the-fold promise:** "ככה שיחקתם, ומה שהכי הפתיע אתכם."
**Sections:** ציון כולל, **badge "שיא חדש!" + קונפטי נוסף אם רלוונטי**, הדגשת "הכי מדויק"/"הכי הפתיע", כרטיס שיתוף בסגנון רשת-וורדל עם טקסט שונה ל-Practice מול Daily (Daily כולל מספר יום+רצף) (Web Share API / העתקה), שלושה כפתורים ("עוד סבב" ראשי, "אתגר יומי", "לסטטיסטיקות").
**CTAs:** ראשי "עוד סבב".
**Mobile:** כרטיס שיתוף בגודל נוח לצילום מסך.

#### Daily Challenge
**Purpose:** מנגנון החזרה המרכזי (Hook).
**Above-the-fold promise:** "אותו אתגר לכולם, פעם ביום."
**Sections:** תאריך + מונה streak גדול, כפתור "שחקו את האתגר של היום" (זרע דטרמיניסטי לפי תאריך, **5 סבבים קבועים: 3 Precision + 2 Comparison, סדר קבוע, זהה לכולם**) או תוצאה+"חזרו מחר"+לוח 7 ימים.
**States:** Empty (streak=0, הסבר חם), Partial (streak קיים, היום עוד לא שוחק).
**Mobile:** מונה streak ממורכז, גדול.

#### Stats/Progress
**Purpose:** בית ל-Investment (Hook), דפוס Progress/History.
**Above-the-fold promise:** "ככה השתפרתם."
**Sections:** לוח streak חזותי (4-6 שבועות), 3-5 מספרים גדולים (שיא ציון, % קרוב מאוד, % נכון, סה"כ סבבים), שני כרטיסי "רגע" (הכי מדויק / הכי מפתיע).
**States:** Empty (first use, הודעה חמה + CTA).
**Mobile:** לוח streak נגלל אופקית אם צר.

#### About & Data Sources
**Purpose:** לממש בפועל את "כל מחיר אמיתי", בכנות מלאה כולל מגבלת תדירות עדכון.
**Above-the-fold promise:** "מאיפה המחירים באמת מגיעים."
**Sections:** הסבר על תקנות שקיפות מחירים + Big Mac Index, רשימת מקורות עם קישורים, **משפט כנות חובה** על קצב עדכון (המאגר מתעדכן מעת לעת, לא בזמן אמת, כל פריט מציג תאריך בדיקה), הסבר שיטת ניקוד.

#### Settings
**Purpose:** שליטה מינימלית.
**Above-the-fold promise:** "שליטה מהירה, בלי תפריט מסובך."
**Sections:** קול on/off, הפחתת אנימציה, "נקה את הנתונים שלי" (Error color, מבודד, דיאלוג אישור אמיתי).

#### Privacy Policy
**Purpose:** ציות לרשתות פרסום.
**Above-the-fold promise:** "מה נשמר עלינו, במשפט פשוט."
**Sections:** מה נשמר (localStorage בלבד), עוגיות פרסום, יצירת קשר.

### Global Elements
- **Nav (Tab Bar תחתון):** Play / Daily / Stats, נעלם ב-Round Loop. **Overflow** (About, Settings) מוצג בכל מסך שאינו Round Loop, כולל Home.
- **Footer** (מסכים לא-אימרסיביים): פרטיות + זכויות יוצרים.
- **Header:** אין header קלאסי עם לוגו, רק פס מצב דק בזמן משחק.

### Asset Checklist
- תמונות מוצר: Unsplash API (חינמי, מחובר), placeholder עקבי לפריט שלא נמצא.
- דגלי מדינות: ספריית SVG שטוחה.
- `data/products.json` (**נבנה בפועל עם 13 פריטי מזון/צריכה יומיומית אמיתיים**, קטן מיעד 25-30 שנקבע בסבב הצוות בגלל זמן אימות ידני אמיתי per item; מתועד בכנות ב-About, לא מוצג כגדול יותר; מתרחב בהדרגה): `{id, name, category, price_ils, source, date_checked, image, photographer, photographer_url}`.
- `data/countries.json` (מבוסס Big Mac Index בעיקר, מיקס מכוון של זוגות "מפתיעים" וזוגות "ברורים", לא זוגות אקראיים בלבד): `{id, item_name, country_a, price_a, currency_a, country_b, price_b, currency_b, source, date}`.
- לוגו: Canva Production Mode, בשלב הבנייה.

### Validation & QA Pass
- IA validation: לא בוצע טסט משתמשים אמיתי בסבב התכנון (הצהרה כנה, לא מזויף). מומלץ First-Click Test לפני שיווק.
- Cognitive walkthrough: משימת "שחקו סבב עד הסוף" עברה בכל 4 השלבים (הצג פרטים ב-`_process/02-site-planner-plan.md`).
- Content stress test: נבדק מול שם מוצר/מדינה ארוכים.

---

# חלק ב: עיצוב חזותי (Web Designer)

**Concept:** העוגן האמיתי הוא **NYT Games (וורדל/Connections)**: ריסון בגווני אפור-שחור-לבן שכל הצבע שמור לרגע החשיפה, כדי שהחשיפה תרגיש כמו התגמול היחיד, בדיוק כמו האריח הצבעוני בוורדל. זו אותה פילוסופיה שהבריף כבר בחר מכנית (streak/אתגר יומי), עכשיו גם ויזואלית. הצבע היחיד שנוסף הוא זהב/כתום, "רגע הג'קפוט".

**Differentiation:** מול "מי הכי" (סגול-כהה+צהוב, מסיבתי), ChoreWheel (טורקיז-אפרסק, utility), MealMap (לוח גיר כהה): כאן **בהיר לא כהה**, פלטה כמעט אחידת-גוון עם פרץ זהב יחיד, מסך-דבר-אחד-בזמן-נתון במקום ריבוי כרטיסים. ריסון כדרמה, לא צבעוניות כאנרגיה.

**Primary style:** מינימליסטי פרימיום · **Secondary accent (יחיד):** קריאייטיבי שובב, אך ורק בפיצוץ הקונפטי ברגע החשיפה.

**Color system:** Complementary (נייבי מול זהב) · כיסוי: Restrained.
**Interaction level:** מיקרו-אנימציות מרוסנות + juice מרוכז ברגע החשיפה בלבד.

### Visual Identity

| Role | Hex | Usage | ניגודיות |
|---|---|---|---|
| Background | #F5F7FB | רקע ראשי, קריר-כחלחל (נגזר מ-Primary, לא #F9FAFB גנרי) | - |
| Surface | #E8ECF3 | כרטיסים, פאנלים | - |
| Ink | #14171F | על Background: 16.71:1 · על Surface: 15.12:1 | AAA |
| Primary | #1B2A4A | נייבי. לבן-על-Primary: 14.22:1 | AAA |
| Accent | #E8A93D | CTA + רגע חשיפה בלבד. **תווית תמיד Ink** (לבן נכשל ב-2.06:1). Ink-על-Accent: 8.68:1 | AAA |
| Muted | #545C6B | על Background: 6.28:1 · על Surface: 5.68:1 | AA |
| Success | #1F7A45 | טקסט-על-Background: 4.98:1 · לבן-על-Success: 5.35:1 | AA |
| Warning/Error | #B23A28 | טקסט-על-Background: 5.55:1 · לבן-על-Error: 5.95:1 | AA |
| Info/Disabled | #7C8CA6 | **תווית תמיד Ink** (לבן נכשל ב-3.41:1). Ink-על-Info: 5.25:1 | AA |

**כלל בנייה קריטי:** על Accent ועל Info, תווית תמיד Ink, לעולם לא White (נבדק חישובית, לא בעין).

**Typography:** כותרות/מספרים: IBM Plex Sans Hebrew Bold 700. גוף: Heebo 400-500. ספרות טבלאיות (מחירים/ניקוד/streak): IBM Plex Mono, שמור אך ורק לספרות. H1 44px (mobile 30px) · H2 30px · H3 22px · Body 17px/1.7 · Caption 14px · מספר-חשיפה 56px Mono (mobile 40px).

**Spacing:** 8-point scale, section padding 64/32px. חצי-צעד 4px רק לריפוד פנימי צמוד.

**Breakpoints:** 375/768/1024/1440px.

**Navigation shell:** Tab Bar תחתון (Play/Daily/Stats), נעלם ב-Round Loop. Overflow -> Drawer (About, Settings, scrim, focus-trap, Escape). אין bottom sheet/swipe/pull-to-refresh (אין מקום אמיתי להם כאן).

**Iconography/Imagery:** Lucide icons. דגלים: ספריית SVG שטוחה. תמונות מוצר: Unsplash API, נבחרות בשלב הבנייה (הקטלוג הסופי עוד לא קיים), פרמטרים חובה: `fit=crop&crop=entropy`, `orientation=squarish`, `auto=format`, srcset 480/960/1440. Placeholder עקבי לפריט שלא נמצא. אין דו-טון על תמונות מוצר (נשארות בצבען האמיתי).

**Texture:** אין (הקונספט לא קורא לה).

**Signature detail:** מד-קרבה (Closeness Meter) - מד אנלוגי SVG מאויר-יד, מחט מסתובבת ברגע החשיפה, בליווי קונפטי-זרעי (יציב לפי ציון). נושא את מנגנון המשחק בפועל, לא קישוט.

**Target builder fit:** כל שלושת הפונטים ב-Google Fonts, כל הרכיבים ניתנים למימוש בקוד סטטי רגיל בלי ספריות חיצוניות.

**Brand file:** לא נכתב ל-`C-core/brand-visuals.md` - tone-override ייעודי, כמו כל בניית Track B קודמת.

**Canva-produced assets:** לוגו Wordmark, לביצוע בשלב הבנייה (לא בוצע בתכנון).

**Unsplash photos selected:** טרם, תלוי בקטלוג המוצרים הסופי. תהליך הבחירה מוגדר במלואו לביצוע ב-Builder.

### Page-by-Page Visual Spec

תמצית (המפרט המלא, כולל כל state/hover/timing, ב-`_process/03-web-designer-visual-spec.md`):
- **Home:** hero-led, כפתור Accent ענק (רדיוס 12px), LCP=טקסט הכותרת (אין תמונת רקע).
- **Play Hub:** שלוש כרטיסי Surface, בורר אורך-סבב pill.
- **Round Loop:** פס עליון 48px קבוע, תמונה/כרטיסי-מדינה ~55-60% מהגובה, חשיפה עם מד-קרבה + count-up 400ms + קונפטי מותנה-ציון, states Loading/Error מלאים.
- **Set Results & Share:** ציון 56px Mono, כרטיס שיתוף בסגנון רשת-וורדל, "עוד סבב" ראשי.
- **Daily Challenge:** מונה streak 64px בצבע Accent (היוצא-מן-הכלל היחיד ל-Accent כטקסט).
- **Stats/Progress:** דפוס Progress/History, לוח streak + 3-5 מספרים + 2 כרטיסי רגע.
- **About/Settings/Privacy:** סטטיים, טיפוגרפיה בלבד, כפתור הרסני (ניקוי נתונים) בצבע Error מבודד.

---

## Open Questions (שני התפקידים)
- קטגוריות תוכן נוספות מעבר לרשימה הראשונית - לא חוסם השקה.
- תדירות רענון מאגר הנתונים בפועל (שבועי/חודשי) - החלטה תפעולית.
- רשת פרסום ספציפית - משפיעה על נוסח מדיניות הפרטיות, לא על המבנה.
- לוגו + תמונות Unsplash בפועל - לביצוע ב-Builder כשקטלוג המוצרים הסופי קיים.
