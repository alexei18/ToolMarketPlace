# Tryworthy — Ranking

> Extracted verbatim from `docs/positioning-pack.md` (Oct 27, 2026 · @Alexei).

## Clasament și filtrare (funcționalitate nouă)

Clasamentul face promisiunea reală: fiecare produs primește un scor din acțiunile unor conturi reale, iar utilizatorul alege între Top, Trending și New. Publicarea rămâne automată; clasamentul decide doar cine apare sus.

**Vederile**

| Vedere | Ce arată | Unde e folosită |
| --- | --- | --- |
| Top this week | Scorul din ultimele 7 zile | Implicit în feed și pe categorii; sursa digestului |
| Trending | Semnalele din ultimele 48 de ore, raportate la vârsta produsului | Tab separat; pentru creatori |
| New | Toate produsele live, cronologic | Tab separat; pentru entuziaști |
| Staff picks | Alegeri manuale, cu notă scurtă | Badge pe card și bonus în Top |

**Semnalele și ponderile de pornire** (se ajustează după prima lună, dintr-un singur fișier de config)

| Semnal | Pondere | Regulă |
| --- | --- | --- |
| Salvare | 3 | O dată per utilizator per produs |
| Perk revendicat | 4 | O dată per utilizator per perk |
| Click spre site-ul produsului | 1 | Maxim o dată pe zi per utilizator per produs |
| Feedback | 3 | Doar texte de minim 30 de caractere |
| Vot pe roadmap | 1 | O dată per item |
| Staff pick | +15 | Doar pentru Top this week, cât e activ |
| Report valid | −10 | Fiecare report numărat de regulile de moderare |

**Formulele**

- Top this week = suma (pondere × semnal) din ultimele 7 zile + bonus staff pick − penalizări din report-uri.
- Trending = suma (pondere × semnal) din ultimele 48 de ore ÷ (orele de la publicare + 2)^1,5.
- Scorurile se recalculează la 30 de minute de un job programat, din agregate zilnice, ca să nu consume scrieri D1 la fiecare request.

**Protecție împotriva trișatului**

- Contează doar conturile cu email confirmat, mai vechi de 3 zile.
- Acțiunile makerului și ale conturilor care dețin domeniul produsului nu contează.
- Fiecare persoană contează o singură dată per produs și tip de semnal.
- Un salt brusc de semnale venite din conturi noi trimite produsul în review, fără să-l ascundă.
- Nimeni nu poate plăti pentru loc în Top sau Trending; eventualele listări sponsorizate vor fi separate și marcate „Sponsored”.

**Șansă pentru produsele noi:** în Top, fiecare al 5-lea card e un produs eligibil lansat în ultimele 48 de ore, marcat „Just launched”, ca să poată strânge primele semnale.

**Condiții minime pentru Top, Trending și digest** (nu pentru publicare): link-ul răspunde, are cel puțin o imagine, descriere de minim 80 de caractere, tagline, nicio investigație de moderare deschisă. Makerul vede în dashboard ce îi lipsește, dar nu vede scorul numeric.

**Filtre:** AI-powered (declarat de maker), preț (free, freemium, paid), stadiu (pre-lansare, lansat), are perk, platformă (web, iOS, Android, extensie, desktop, API). Produsele primesc două câmpuri noi la publicare: „Includes AI features” și platformele.

**Transparență:** pagina publică `/ranking` explică regulile pe înțelesul tuturor (textul e în copy deck).
