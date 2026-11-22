# Tryworthy — Pre-launch mode

> Extracted verbatim from `docs/positioning-pack.md` (Oct 27, 2026 · @Alexei).

## Modul de pre-lansare

Până la lansarea publică, site-ul rulează cu un singur flag `PRELAUNCH=true`: strânge conturi și makeri din traficul adus de video, iar paginile goale nu se văd. Riscul principal e ca un vizitator venit din TikTok să găsească un site gol și să nu se mai întoarcă; de aceea acțiunea principală în pre-lansare e rezervarea feed-ului, nu navigarea.

**Ce se întâmplă cu flag-ul activ**

1. **Homepage:** hero-ul de pre-lansare (etichetă „Launching soon”, CTA „Reserve your feed — free”). Blocul „this week's top” apare doar dacă există cel puțin 6 produse eligibile.
2. **Rezervarea = cont normal:** utilizatorul își face cont și alege interesele, ca după lansare. Nu există o listă de așteptare separată, deci la lansare nu e nimic de migrat.
3. **Feed-ul utilizatorului:** mesajul „Your feed opens on launch day” plus produsele deja publicate în categoriile lui, dacă există.
4. **Makerii pot publica deja:** verificare de domeniu și publicare normală; paginile de produs sunt live și indexabile. Primii makeri (număr configurabil, propunere: 100) primesc badge-ul „Founding maker”, iar produsele lor intră în digestul din ziua lansării.
5. **Categoriile cu mai puțin de 3 produse eligibile** dispar din navigație și primesc noindex, ca să nu existe pagini goale în Google.
6. **Contoare doar reale:** „\[N\] people have reserved their feed” apare doar peste un prag (propunere: 100), cu N citit din baza de date.
7. **Sursa vizitatorilor:** la înregistrare se salvează prima sursă (`utm_source`, `utm_campaign`, `utm_content`) din link-ul video, ca să știi ce clip aduce conturi. Se păstrează doar pe contul utilizatorului și se menționează în Privacy Policy.
8. **Ziua lansării:** dezactivezi flag-ul; toți cei care au rezervat primesc o singură notificare cu top-ul din categoriile lor.

**Când lansezi:** criteriile sunt decizia ta; o propunere de pornire e cel puțin 1.000 de conturi rezervate și cel puțin 5 produse eligibile în minimum 10 categorii. Dashboard-ul de admin arată aceste numere zilnic, defalcate pe sursă.
