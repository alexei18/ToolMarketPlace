# ToolMarketPlace — Legal

> Extracted verbatim from `docs/positioning-pack.md` (Oct 27, 2026 · @Alexei).

## Cerințe legale

Site-ul are nevoie de 7 pagini legale, de link-uri spre ele în footer pe fiecare pagină și de 5 funcții în produs (consimțământ, ștergere cont, export date, raportare conținut, motivarea eliminărilor). Nu sunt jurist; textele generate sunt un punct de plecare și trebuie revizuite de un avocat înainte de lansare.

**Ce legi se aplică**

| Cadru | De ce se aplică | Ce cere în practică |
| --- | --- | --- |
| Legea Moldovei nr. 195/2024 privind protecția datelor | Operatorul e în Moldova; e în vigoare din 23 august 2026 și transpune GDPR ([sursă](https://ecom.md/en/blog/protectia-datelor-lege-195-2024)) | Politică de confidențialitate, temei legal pentru fiecare prelucrare, drepturile persoanei, notificarea incidentelor către Centrul Național pentru Protecția Datelor |
| Legea Moldovei nr. 284/2004 (servicii ale societății informaționale) | Obligațiile despre cookie-uri vin din această lege, nu din 195/2024 ([sursă](https://ecom.md/en/blog/protectia-datelor-lege-195-2024)) | Informare și consimțământ pentru cookie-urile neesențiale |
| GDPR (UE) | Site global, care oferă servicii utilizatorilor din UE | Aceleași drepturi; probabil un reprezentant în UE (Art. 27) — de verificat cu juristul |
| Digital Services Act (UE) | Platformă unde makerii publică conținut, accesibilă din UE | Punct de contact, reprezentant legal în UE pentru furnizorii fără sediu în UE (Art. 13), mecanism de raportare a conținutului ilegal, motivarea eliminărilor; micro și micile întreprinderi sunt scutite de o parte din obligațiile pentru platforme ([sursă](https://www.ancom.ro/?p=378070)) |
| Google OAuth | Login cu Google | Politica de confidențialitate trebuie să fie pe același domeniu ca homepage-ul și legată în ecranul de consimțământ; homepage-ul trebuie să descrie aplicația și să aibă link spre politică ([sursă](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)) |

**Paginile necesare**

| Pagină | Rută | Ce trebuie să conțină |
| --- | --- | --- |
| Terms of Service | `/terms` | Cine operează serviciul, vârsta minimă, reguli de cont, ce pot publica makerii, licența pe care ne-o dau pentru conținut, perks oferite de makeri (noi nu suntem parte la ofertă), moderare și eliminare, limitarea răspunderii, încetarea contului, legea aplicabilă, modificarea termenilor |
| Privacy Policy | `/privacy` | Operatorul și contactul, ce date colectăm (cont, interese, feedback, domenii, push, loguri), scopul și temeiul legal pentru fiecare, cât le păstrăm, cui le dăm (Cloudflare, Google, serviciul de email), transferuri internaționale, drepturile utilizatorului și cum le exercită, autoritatea de supraveghere, vârsta minimă |
| Cookie Policy | `/cookies` | Lista cookie-urilor (sesiune, preferințe), durata, dacă există analytics; banner doar dacă folosim cookie-uri neesențiale |
| Community Guidelines | `/guidelines` | Ce nu se acceptă la listări și feedback: spam, înșelătorii, malware, conținut ilegal, produse copiate, recenzii false, abuz de report |
| Maker Terms | `/terms/makers` | Verificarea domeniului, garanția că produsul e al lor, reguli pentru perks (trebuie onorate), răspunderea pentru produs, limite de publicare, motivele de eliminare |
| Report content | `/report` | Formular de raportare a conținutului ilegal, accesibil și fără cont (DSA): link-ul, motivul, explicația, date de contact, declarație de bună-credință |
| Legal & contact | `/legal` | Numele operatorului, adresa, email-ul de contact, punctul de contact DSA, reprezentantul în UE (dacă e cazul), email-ul pentru drepturi GDPR, link-uri spre toate paginile de mai sus |

**Funcții în produs**

1. **Consimțământ la înregistrare:** text sub butonul de signup cu link spre Terms și Privacy; confirmare de vârstă (minim 16 ani — de confirmat).
2. **Ștergere cont:** din `/settings`, cu confirmare; șterge datele personale, anonimizează feedback-ul public.
3. **Export date:** din `/settings`, un fișier JSON cu profilul, interesele, salvările, feedback-ul și perks-urile revendicate.
4. **Raportare și motivare:** când un produs e ascuns sau șters, makerul primește motivul și calea de contestare.
5. **Cookie-uri:** doar cookie-ul de sesiune și preferințe; analytics fără cookie-uri (ex. Cloudflare Web Analytics), ca să nu fie nevoie de banner. Dacă adaugi mai târziu analytics cu cookie-uri, apare bannerul.

**Footer (pe fiecare pagină):** About · Makers · How ranking works · Guidelines · Terms · Privacy · Cookies · Report content · Legal · Contact · © 2026 \[Operator\].
