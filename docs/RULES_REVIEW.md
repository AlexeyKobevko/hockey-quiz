# Проверка хоккейных правил

Историческая проверка от 16 ноября 2026 года; дата и изученные источники сохранены ниже. Текущий справочник находится в `src/shared/content.ts`, вопросы — в `src/server/questions.ts`.

Rules review: 2026-11-16 UTC (2026-11-17 Moscow)

Primary sources inspected:
1. Official CSKA document catalogue, season 2026/27:
https://cska-hockey.ru/club/documents/
Sports regulations, amendments through 31 August 2026:
https://cska-hockey.ru/upload/iblock/752/fxj79obl81febwkrd1fa2uhu20sb6ged.pdf
Article 13: league points 2/1/0.
Articles 62-64: regular-season OT up to 5 minutes, normally 3 skaters + goalkeeper; shootout starts with THREE attempts per side (article 63.1.3), additional paired attempts if tied; playoff OT 20 minutes, normally 5 skaters + goalkeeper, unlimited periods until first goal.
The original THREE-attempt description was confirmed and retained. No five-attempt assumption was introduced.

2. Official FHR current rules catalogue:
https://vks.fhr.ru/docs/93/
Rules dated 31 July 2026, amended 16 September 2026:
https://vks.fhr.ru/upload/iblock/08f/08f0c175e9679e9a45b503fee89f6331.pdf
Reviewed periods, line crossing/goal (84), stoppages/faceoffs, substitutions, icing (95), offside (96), minor penalty (109), penalty-shot purpose (121), tripping (177).

3. Official KHL announcement of 2026/27 rule changes:
https://www.khl.ru/news/2026/06/09/563103.html
Reviewed announced changes; no additional quiz questions about hand passes, helmet handling or video-review changes were introduced.

The public handbook has 17 cards in src/shared/content.ts. Internal question.ruleId maps every one of 18 questions to a preparatory card. The public handbook contains no hidden quiz answer key. Clarified the puck freeze, offside, icing and regular-season shootout question contexts, shootout conditions and playoff explanation. General-case explanations explicitly mark important exceptions. Quiz +1 is distinguished from league 2/1/0 points.

The handbook is a concise introduction, not a complete officiating manual. Full regulations take precedence in exceptional situations.
