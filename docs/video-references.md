# Note din referințele video

Cele 3 video-uri din `apps/videos/refs/` sunt doar pentru studiu: nu sunt în git și nu ajung în render-uri. Nu preluăm texte, sloganuri, nume, litere sau personaje. Foile de contact și spectrogramele se fac cu `npm run refs:sheets` în `out/refs/`.

Timpii sunt măsurați din cadre și spectrograme. Ultimele circa 2 s din fiecare fișier sunt outro-ul adăugat de TikTok la export, nu parte din video. Numărătoarea automată a tăieturilor ratează tranzițiile moi, deci ritmul de mai jos vine din foile de contact.

## Ref. 1: poveste cinematică (38,5 s fără outro)

- **Timp:** actul 1 ține 20,5 s, cu un singur obiect pe ecran; actul 2 ține 16 s.
- **Mișcare:** un simbol mic scris cu cursor în centru, pe negru complet, care crește foarte lent și capătă o aură; aproape nicio tăietură până la drop. După drop, litera crom stă 2–3 s, cu o bandă de lumină care o traversează și o reflexie care alunecă. Urmează logo-ul crom cu motion blur, titluri editoriale și rânduri de interfață.
- **Sunet:** voce și efecte pe porțiuni separate, cu goluri clare între fraze. Vocea se oprește la 18,3 s, apoi un ton susținut ține până la 20,5 s, când intră drop-ul cu bas plin, aproape constant. Finalul e un impact la 36,8 s și o coadă de zgomot de circa 1,5 s.

## Ref. 2: raport de incident (38,5 s fără outro)

- **Timp:** actul 1 ține 21 s; actul 2 ține 16 s, cu plane de 1–1,5 s.
- **Mișcare:** titluri editoriale pe marginea stângă, cuvânt cu cuvânt, cu antet HUD și etichete mici. Înainte de drop, un rând scurt monospace pe negru pregătește întorsătura. Actul 2 alternează cifre crom, un grafic care se desenează, loguri și o diagramă radială; fiecare plan are propriul titlu.
- **Sunet:** titlul de pe ecran e chiar fraza rostită, deci nu există subtitrare separată. Riserul pornește la 18,5 s, urmează circa 0,5 s de aproape liniște, apoi drop-ul la 21 s. Basul ține constant până la impactul final de la 37 s.

## Ref. 3: fake-out cu umor (21,5 s fără outro)

- **Timp:** actul 1 ține 10,7 s; actul 2 ține 9 s, cu plane de 0,5–1 s, cel mai rapid dintre cele trei.
- **Mișcare:** titlu mare cuvânt cu cuvânt, grafic, interfață care se descompune în wireframe și se strânge într-un singur pătrat. Întorsătura e un cadru alb cu text negru, care stă circa 0,5 s; apoi tăietură pe negru și logo crom cu sclipiri.
- **Sunet:** vocea e mai rapidă și se termină la circa 7 s; un ton crește până la drop. Bas constant, apoi impactul final la 19,7 s.

## Ce schimbă asta pentru video-urile noastre

- Actul 1 poate fi mult mai gol decât pare: ref. 1 ține 20 s aproape fără tăieturi, cu un singur obiect și o subtitrare.
- La întorsătură se oprește vocea, nu doar efectele. La noi, cuvântul întorsăturii cade chiar pe drop și muzica e coborâtă sub el, deci impactul se simte complet abia după acel cuvânt.
- Muzica potrivită e un zid de bas fără goluri mari după drop: toate trei arată așa în spectrogramă.
- Finalul lor e un impact cu o coadă scurtă. Noi cerem în plus CTA rostit peste muzică, iar cele 2 s de outro TikTok nu trebuie imitate.
