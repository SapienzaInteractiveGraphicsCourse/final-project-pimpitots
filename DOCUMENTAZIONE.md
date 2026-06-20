# 3D Pool Game — Documentazione completa

Documento unico in due macro-sezioni: **Presentazione del Gioco** (per l'utente finale) e **Report Tecnico** (per sviluppatori). Tutto il contenuto è derivato esclusivamente dalla lettura diretta del codice presente nella cartella `final-project-pimpitots`. Dove un aspetto richiesto non risulta implementato nel codice, è indicato esplicitamente.

---

## Indice

- [SEZIONE 1 — Presentazione del Gioco](#sezione-1--presentazione-del-gioco)
  - [1.1 Come avviare il gioco](#11-come-avviare-il-gioco)
  - [1.2 Come si gioca](#12-come-si-gioca)
  - [1.3 Controlli](#13-controlli)
  - [1.4 Livelli di difficoltà](#14-livelli-di-difficoltà)
  - [1.5 Condizioni di vittoria e progressione dei livelli](#15-condizioni-di-vittoria-e-progressione-dei-livelli)
  - [1.6 Sistema di vite](#16-sistema-di-vite)
- [SEZIONE 2 — Report Tecnico](#sezione-2--report-tecnico)
  - [2.0 Panoramica dei file e dipendenze tra script](#20-panoramica-dei-file-e-dipendenze-tra-script)
  - [2.1 index.html](#21-indexhtml)
  - [2.2 source/main.js](#22-sourcemainjs)
  - [2.3 source/physics.js](#23-sourcephysicsjs)
  - [2.4 source/controls.js](#24-sourcecontrolsjs)
  - [2.5 source/textures.js](#25-sourcetexturesjs)
  - [2.6 source/sounds.js](#26-sourcesoundsjs)
  - [2.7 source/models.js](#27-sourcemodelsjs)
  - [2.8 Modelli 3D caricati da file (glTF/GLB)](#28-modelli-3d-caricati-da-file-gltfglb)
  - [2.9 libs/ (librerie di terze parti)](#29-libs-librerie-di-terze-parti)
  - [2.10 Note di fedeltà al codice](#210-note-di-fedeltà-al-codice)

---

# SEZIONE 1 — Presentazione del Gioco

Questo è un gioco di biliardo (pool) in 3D che si gioca interamente nel browser. La scena rappresenta un tavolo da biliardo in una stanza notturna arredata, illuminata da una lampada a sospensione a tre paralumi. L'obiettivo è imbucare tutte le palline colorate colpendole con la pallina bianca (cue ball).

## 1.1 Come avviare il gioco

**Versione online (GitHub Pages).** Secondo il file `README.md`, la demo è pubblicata all'indirizzo:

> https://sapienzainteractivegraphicscourse.github.io/final-project-pimpitots/

È sufficiente aprire questo URL in un browser per giocare; non serve installare nulla.

**Esecuzione in locale.** Il `README.md` indica che il progetto è un sito statico senza fase di build. Three.js (r128) è incluso localmente nella cartella `libs/`, quindi non serve accesso a internet. Per avviarlo in locale occorre servire la cartella radice del repository con un qualsiasi server statico, ad esempio:

```
npx http-server .
```

e poi aprire l'URL indicato a schermo. Il README precisa che aprire `index.html` direttamente con `file://` **non** funziona, perché gli import dei moduli ES richiedono un'origine HTTP.

Non risultano presenti nel repository script o configurazioni di build/deploy automatizzati (es. workflow di GitHub Actions): la pubblicazione su GitHub Pages avviene servendo direttamente i file statici della radice del repository.

All'avvio compare una schermata di caricamento ("Loading scene…"); appena la scena è pronta viene mostrato il menu di scelta della difficoltà, dopodiché inizia la partita.

## 1.2 Come si gioca

La meccanica è quella del biliardo: colpire la pallina bianca per imbucare le palline colorate nelle sei buche del tavolo.

Il tiro si effettua con un singolo gesto di **premi-e-rilascia** sul tavolo:

- **Mirare:** premere e trascinare ruota la stecca attorno alla pallina bianca per scegliere la direzione del tiro. In vista dall'alto, la stecca punta verso la posizione del cursore. La stecca non può attraversare un'altra pallina: la mira "scivola" automaticamente fino a sfiorarla.
- **Caricare la potenza:** premere e tenere fermo carica la barra di potenza ("Power") in basso. Più a lungo si tiene premuto, maggiore è la potenza (fino a un massimo dopo circa 2,5 secondi). La barra cambia colore dal verde al rosso e vibra mentre si carica.
- **Tirare:** rilasciare spara la pallina con la potenza accumulata. La stecca scatta in avanti e colpisce la pallina.

Nota: se si trascina (per mirare) la carica di quel gesto viene annullata, quindi un rilascio dopo un trascinamento non fa partire alcun tiro.

Quando si imbuca la pallina bianca per errore ("scratch"), questa ricompare automaticamente sul tavolo dopo un breve istante.

L'interfaccia mostra: in alto a sinistra il livello corrente, le palline rimanenti e le vite; in basso al centro la barra di potenza e i pulsanti; in basso a destra la legenda dei comandi. I pulsanti disponibili permettono di: ridisporre le palline ("Rearrange Balls"), resettare la partita ("Reset Game"), cambiare visuale ("Player POV"/"Overview"), accendere/spegnere la lampada del tavolo, accendere/spegnere la luce a soffitto e attivare/disattivare la musica.

## 1.3 Controlli

I comandi sono riepilogati nella legenda in basso a destra dello schermo. Dal codice (`index.html` e gestori in `main.js`/`controls.js`):

| Comando | Azione |
|---|---|
| Trascina (drag) | Mira la stecca |
| Tieni premuto (hold) | Carica la potenza |
| Rilascia (release) | Esegue il tiro |
| Rotellina del mouse / scroll | Zoom (solo nella visuale Player POV) |
| `L` | Accende/spegne la lampada del tavolo |
| `M` | Attiva/disattiva la musica |
| `C` o `V` | Cambia visuale (Overview ↔ Player POV) |
| `R` | Reset della partita (torna al menu difficoltà) |
| `N` | Nuova disposizione delle palline |
| `O` | Accende/spegne la luce a soffitto |

Nota: il tasto `O` (luce a soffitto) è gestito dal codice ma **non** è elencato nella legenda a schermo. Gli stessi comandi delle luci, della musica, della camera, del reset e della nuova disposizione sono disponibili anche tramite i pulsanti dell'interfaccia.

I controlli funzionano anche da **touch** (touchscreen): tocca-e-tieni per caricare, trascina per mirare, rilascia per tirare.

## 1.4 Livelli di difficoltà

Prima di iniziare, un menu permette di scegliere la difficoltà tramite uno slider con un'icona-faccia che si trasforma (da sorridente ad "arrabbiata/demoniaca" con corna) man mano che si aumenta la difficoltà. Le tre difficoltà definite nel codice differiscono **esclusivamente per il numero di vite** e per alcuni effetti audiovisivi:

| Difficoltà | Vite | Effetti specifici |
|---|---|---|
| **NORMAL** | 5 vite | Cuore rosso (❤️); musica a velocità normale |
| **HARD** | 3 vite | Cuore rosso (❤️); musica a velocità normale |
| **INSANE** | 1 vita | Cuore viola (💜); tema interfaccia viola; musica accelerata a 1,4×; animazione di perdita vita più drammatica (il cuore "vola" al centro dello schermo ed esplode, con tremolio dello schermo) |

Durante l'uso dello slider, la velocità della musica aumenta progressivamente da 1,0× (fino a "hard") fino a 1,4× (a "insane"). Il numero e la disposizione delle palline per livello **non** dipendono dalla difficoltà: sono uguali per tutte le difficoltà.

## 1.5 Condizioni di vittoria e progressione dei livelli

Il gioco è strutturato in **4 livelli**. Per superare un livello occorre **imbucare tutte le palline colorate** presenti sul tavolo. Il numero di palline colorate per livello, secondo il codice (`LEVELS_BALL_COUNT = [1, 2, 3, 4]`), è:

| Livello | Palline colorate da imbucare |
|---|---|
| Livello 1 | 1 |
| Livello 2 | 2 |
| Livello 3 | 3 |
| Livello 4 | 4 |

Completato un livello compare una schermata "Level Complete" con stelle e un messaggio; dopo circa 3 secondi inizia automaticamente il livello successivo. Completato il **Livello 4**, compare la schermata finale **"YOU WIN!"** con coriandoli e il pulsante "Play Again" (che riporta al menu di scelta difficoltà). Questa è la condizione di vittoria.

Nota di fedeltà: il commento descrittivo in cima a `main.js` riporta una progressione diversa (1 / 3 / 6 / 10 palline), ma il codice effettivamente eseguito usa la sequenza 1 / 2 / 3 / 4. Vale ciò che fa il codice.

## 1.6 Sistema di vite

Le vite rappresentano i tentativi a disposizione e sono mostrate come cuori nell'HUD in alto a sinistra.

- **Quante vite si hanno:** dipende dalla difficoltà scelta — 5 (Normal), 3 (Hard) o 1 (Insane).
- **Come si perde una vita:** si perde **una vita ogni tiro che non imbuca almeno una pallina colorata**. In pratica, dopo che le palline si fermano, se durante quel tiro non è stata imbucata alcuna pallina colorata, viene tolto un cuore (con animazione di rottura del cuore, flash rosso e scuotimento dell'HUD). Imbucare per sbaglio la sola pallina bianca non conta come pallina colorata e quindi fa comunque perdere una vita.
- **Cosa succede all'esaurimento:** quando le vite arrivano a zero compare la schermata **"GAME OVER"** ("You ran out of lives!"), la musica si ferma e si può ripartire con il pulsante "Try Again", che riporta al menu di scelta della difficoltà.

Il sistema di vite **non** azzera il progresso dei livelli al momento della perdita di una vita: si continua lo stesso livello finché restano vite. Premere "Reset" (o `R`) durante la partita riporta al menu difficoltà e quindi fa ricominciare dal Livello 1.

---

# SEZIONE 2 — Report Tecnico

## 2.0 Panoramica dei file e dipendenze tra script

Il progetto è un'applicazione WebGL basata su **Three.js r128** (incluso localmente). Il punto di ingresso HTML è `index.html`, che carica come modulo ES `source/main.js`. Tutti gli script applicativi vivono in `source/`.

```
index.html
  └─ <script type="module" src="source/main.js">
        main.js  ── importa ──► models.js    (costruzione mesh/gerarchie + caricamento glTF/GLB)
                 ── importa ──► textures.js  (generazione texture procedurali + caricamento texture PBR)
                 ── importa ──► physics.js   (simulazione fisica pura, senza Three.js)
                 ── importa ──► controls.js  (input mouse/touch: mira, carica, tira)
                 ── importa ──► sounds.js    (gestione audio: musica ed effetti)

        models.js ── importa ──► physics.js  (costanti TABLE_W, TABLE_H, BALL_RADIUS, POCKET_POSITIONS)
                  ── importa ──► three/addons/loaders/GLTFLoader.js
```

Mappa sintetica delle dipendenze (chi importa cosa):

| Script | Importa da | È importato da |
|---|---|---|
| `main.js` | `models.js`, `textures.js`, `physics.js`, `controls.js`, `sounds.js`, `three` | (entry point, nessuno) |
| `models.js` | `three`, `GLTFLoader`, `physics.js` | `main.js` |
| `physics.js` | (nessuno) | `main.js`, `models.js` |
| `controls.js` | (nessuno) | `main.js` |
| `textures.js` | `three` | `main.js` |
| `sounds.js` | (nessuno) | `main.js` |

`physics.js` e `controls.js` sono volutamente disaccoppiati da Three.js: operano su semplici oggetti dato (lo stato delle palline e lo stato di input) che `main.js` legge ogni frame.

L'`importmap` in `index.html` risolve `three` su `./libs/three.module.js` e `three/addons/loaders/GLTFLoader.js` su `./libs/GLTFLoader.js`.

---

## 2.1 index.html

Pagina di ingresso. Contiene la `<canvas id="glCanvas">` a tutto schermo, l'`importmap` dei moduli Three.js, tutto il CSS dell'interfaccia (HUD, overlay, barra potenza, pulsanti, legenda, animazioni di perdita vita) e gli elementi statici dell'interfaccia. Carica `source/main.js` come modulo ES.

Sotto-sezioni logiche del file:

- **Importmap:** mappa `three` → `./libs/three.module.js` e il `GLTFLoader` → `./libs/GLTFLoader.js`.
- **Stili / animazioni CSS:** keyframe per overlay (`bounceIn`, `spinBall`, `floatTrophy`, `pulseGlow`, `starPop`, `confettiFall`), per la perdita vita (`heartLose`, `hudShake`, `screenTremble`, `lifeFlash`, `heartFragment`, `heartFlyAndExplode`, `heartPulse`), per il tremolio della barra di potenza (`tremble`). Override dedicati al tema "insane" (`body.difficulty-insane …`).
- **Elementi DOM statici:** `#glCanvas`, `#loading-overlay`, `#hud` (con `#hud-level`, `#hud-balls`, `#hud-lives`), `#overlay`, `#bottom-ui` (con `#power-bar`/`#power-fill` e la barra pulsanti `#btn-newconfig`, `#btn-reset`, `#btn-cam`, `#btn-lamp`, `#btn-ceiling`, `#btn-music`), `#legend`.

Il commento nel CSS specifica che l'overlay di caricamento viene rimosso esclusivamente da `main.js` (non con un timer CSS), una volta che il caricamento risorse è confermato e un frame è stato disegnato.

---

## 2.2 source/main.js

È lo script principale: bootstrap del motore (renderer, scena, camere), loop di rendering, ciclo di gioco, macchina a stati, gestione livelli, vite, difficoltà, HUD e overlay.

### Ordine di inizializzazione (`init`)

`init()` è registrata su `DOMContentLoaded` ed esegue, nell'ordine esatto:

1. **Loading manager:** registra `THREE.DefaultLoadingManager.onLoad`/`onError` per tracciare il caricamento di tutte le texture/modelli; imposta un timeout di sicurezza ("fallback") a 15 s che forza la chiusura dell'overlay di caricamento.
2. **Audio:** `initSounds()`.
3. **Renderer:** crea `THREE.WebGLRenderer` (antialias, ombre `PCFSoftShadowMap`, `sRGBEncoding`, tone mapping `ACESFilmic`, esposizione 0.75, clear color blu notte) e fa un `clear()` iniziale.
4. **Scena:** crea la `Scene`, imposta uno sfondo procedurale di cielo notturno (`_buildNightSkyBackground`) e la nebbia (`Fog`).
5. **Camere:** `camera0` (Overview, FOV 52°) e `camera1` (Player POV, FOV 58°); `activeCamera = camera0`.
6. **Luci:** `HemisphereLight`, `AmbientLight`, `DirectionalLight` (intensità 0).
7. **Texture:** `texMap = generateTextures()`.
8. **Geometria scena:** nell'ordine — `createRoom`, `createTable`, `createLamp`, `createLoungeCorner`, `createDartboard`, `createCabinet`, `createStools`, `createPainting`, `createFrame2`, `createPlant`, `createPlant2`, `createCoatRack`, `createPainting3`, `createPlant2Corner`, `createFloorLamp`, `createCeilingLight`. La luce a soffitto viene inizializzata spenta (intensità 0, fixture nascosta).
9. **Stecca:** `createCueStick`.
10. **Controlli:** `new Controls(canvas)`.
11. **Environment map:** `_buildEnvMap()` (PMREM) e `scene.environment`.
12. **Clock:** `new THREE.Clock()`.
13. **HUD/UI:** `_buildHUD()`, `_bindUIButtons()`.
14. **Eventi:** `resize`, `keydown`, `wheel`.
15. **Avvio livello:** `_startLevel(0)`.
16. **Loop di rendering:** `animate()`; un `requestAnimationFrame` successivo segna `_framePainted = true` e tenta la chiusura dell'overlay di caricamento.

L'overlay di caricamento viene chiuso da `_dismissLoader()` quando entrambe le condizioni `_resourcesReady` (onLoad scattato) e `_framePainted` (un frame disegnato) sono vere; alla chiusura mostra il menu difficoltà (`_showDifficultyMenu`).

### Elementi gestiti a runtime (loop `animate`), in ordine

Ad ogni frame `animate()` esegue: (1) calcolo del delta time (con cap `DT_CAP`); (2) **input** (`controls.update()`, `consumeShot()` → eventuale `_fireShot`); (3) **fisica** (solo negli stati ROLLING/STRIKING: sub-stepping adattivo 1 o 3 passi via `stepPhysics`, gestione palline imbucate, respawn cue ball, decremento contatore, controllo fine livello, e quando il tavolo è fermo `snapToRest` + eventuale `_loseLife`); (4) **sincronizzazione** delle mesh palla con lo stato fisico e calcolo della rotazione di rotolamento; (5) **stecca** (`_updateCue`); (6) **lampada** (oscillazione, `_updateLamp`); (7) **camera** (aggiornamento Player POV se attiva); (8) **render** + aggiornamento barra di potenza.

### Macchina a stati (`gameState`)

L'oggetto `STATE` definisce tre stati:

| Stato | Significato | Cosa avviene |
|---|---|---|
| `WAITING` | In attesa del tiro | La stecca segue il cursore/mira, la barra di carica è attiva, un tiro può partire. I controlli sono abilitati. |
| `STRIKING` | Colpo in corso | La stecca scatta in avanti nella sua breve animazione (`STRIKE_FORWARD_TIME`); quando la punta tocca la superficie della pallina viene applicata la velocità al cue ball e si riproduce il suono di impatto; i controlli sono disabilitati. |
| `ROLLING` | Palline in movimento | La fisica viene integrata ogni frame, la stecca è nascosta; quando tutte le palline sono "ferme" si torna a `WAITING`. |

Transizioni:

- `WAITING → STRIKING`: in `animate`, quando `consumeShot()` restituisce un tiro (`_fireShot` imposta `gameState = STRIKING`, disabilita i controlli, registra angolo/potenza pendenti).
- `STRIKING → ROLLING`: in `_updateCue`, quando `strikeTimer ≥ STRIKE_SHOW_TIME` (nasconde la stecca).
- `ROLLING → WAITING`: in `animate`, quando `isReadyForNextShot(balls)` è vero e il cue ball non è imbucato (`snapToRest`, riabilita i controlli, rimostra la stecca; se non è stata imbucata alcuna colorata in quel tiro chiama `_loseLife`).
- `ROLLING/STRIKING → WAITING` anticipata: quando l'ultima pallina colorata viene imbucata (`ballsRemaining ≤ 0`), si imposta `WAITING` e si programma `_onLevelComplete`.

Stati aggiuntivi non rappresentati in `gameState` ma gestiti tramite flag: `gameWon`, `gameOver`, `difficultyChosen` (controllano overlay di vittoria, game over e menu difficoltà).

### Funzioni principali di main.js

| Nome | Descrizione (breve) |
|---|---|
| `init` | Bootstrap completo: renderer, scena, camere, luci, geometria, controlli, HUD, eventi, avvio loop. |
| `_maybeDismissLoader` / `_dismissLoader` | Chiudono l'overlay di caricamento quando risorse e primo frame sono pronti; idempotente. |
| `_buildNightSkyBackground` | Genera via canvas la texture equirettangolare del cielo notturno (stelle, luna, alone) usata come sfondo. |
| `_buildEnvMap` | Crea una environment map PMREM da un gradiente canvas per i riflessi speculari delle palline. |
| `_onResize` | Aggiorna aspect ratio delle camere e dimensione del renderer al ridimensionamento finestra. |
| `_onKeyDown` | Mappa i tasti L/O/C/V/R/N/M alle rispettive azioni (luci, camera, reset, nuova config, musica). |
| `_onWheel` | Zoom della camera Player POV variando `camDistBehind` (clamp 1.5–6.0). |
| `_startLevel` | Avvia/riavvia un livello: rimuove le vecchie palline, ne genera di nuove, resetta stecca e stato → WAITING. |
| `_spawnBall` | Crea la mesh di una pallina (colore/numero) e ne registra lo stato fisico nell'array `balls`. |
| `_newConfiguration` | Ridispone le palline del livello corrente (pulsante "Rearrange" / tasto N), se lo stato lo consente. |
| `_resetGame` | Annulla transizioni pendenti e riporta al menu difficoltà (pulsante "Reset" / tasto R). |
| `_respawnCueBall` | Riposiziona la pallina bianca dopo uno "scratch" (imbucata accidentale). |
| `_fireShot` | Avvia il colpo: registra angolo e potenza pendenti e passa allo stato STRIKING. |
| `_wrapPi` | Riconduce un angolo all'intervallo (−π, π]. |
| `_resolveAimAngle` | Calcola un angolo di mira privo di collisioni, facendo "scivolare" la stecca attorno alle altre palline. |
| `_updateCue` | Aggiorna posizione/rotazione della stecca per stato; in STRIKING applica la velocità al cue ball al contatto. |
| `_updateBallRotation` | Applica la rotazione di rotolamento alla mesh di una pallina in base alla sua velocità. |
| `_updateLamp` | Fa oscillare la lampada a sospensione (rotazione sinusoidale dell'anchor). |
| `_toggleMusic` / `_toggleLamp` / `_toggleCeiling` | Attivano/disattivano rispettivamente musica, lampada del tavolo e luce a soffitto, aggiornando l'HUD. |
| `_switchCamera` | Alterna tra camera Overview e Player POV; mostra/nasconde la fixture del soffitto di conseguenza. |
| `_updatePlayerCamera` | Posiziona la camera Player POV dietro la pallina bianca, in funzione dell'angolo della stecca. |
| `animate` | Loop di rendering principale: timing, input, fisica, sync mesh, stecca, lampada, camera, render. |
| `_onLevelComplete` | Decide se mostrare schermata di livello completato (e avanzare) o la schermata di vittoria finale. |
| `_showLevelComplete` | Mostra l'overlay "Level Complete" con stelle e battuta; riproduce il suono di successo. |
| `_showWinScreen` | Mostra l'overlay finale "YOU WIN!" con coriandoli e pulsante "Play Again". |
| `_buildHUD` | Memorizza i riferimenti DOM dell'HUD e crea l'elemento del flash di perdita vita. |
| `_bindUIButtons` | Collega i pulsanti dell'interfaccia alle azioni e il suono di click. |
| `_updateHUD` | Aggiorna testo di livello, palline rimanenti, etichette pulsanti e cuori delle vite. |
| `_updatePowerBar` | Aggiorna larghezza/colore/glow della barra di potenza in base alla carica. |
| `_showDifficultyMenu` | Costruisce e mostra il menu di scelta difficoltà con slider e faccia SVG animata. |
| `_selectDifficulty` | Applica la difficoltà scelta (vite, tema, velocità musica) e avvia il Livello 1. |
| `_loseLife` | Gestisce la perdita di una vita con animazioni (diverse per "insane") e l'eventuale game over. |
| `_spawnHeartFragments` | Genera i frammenti animati (💔/💜/✨) all'esplosione del cuore. |
| `_showGameOver` | Mostra l'overlay "GAME OVER", ferma la musica e offre il "Try Again". |

### Costanti notevoli

`LEVELS_BALL_COUNT = [1,2,3,4]` (numero palline per livello), `NUM_LEVELS = 4`, parametri di oscillazione lampada, distanza/altezza camera POV, tempi di strike, `BALL_COLORS` (palette dalla pallina bianca + 8 colori solidi; le voci 9–15 per le palline a riga sono presenti ma **commentate**, quindi inattive).

---

## 2.3 source/physics.js

Simulazione fisica in puro JavaScript, **senza dipendenze da Three.js**. Opera su oggetti-stato pallina `{ id, isCueBall, x, z, vx, vz, pocketed, mesh }` nel piano XZ.

Sotto-sezioni logiche:

- **Costanti tunabili:** dimensioni tavolo (`TABLE_W = 9.0`, `TABLE_H = 4.5`), `BALL_RADIUS = 0.18`, `POCKET_RADIUS = 0.32`, attrito (`FRICTION_60FPS`), restituzione cuscini/palline, soglie di velocità minima e "pronto per il prossimo tiro".
- **Geometria di gioco:** bordi interni dei cuscini, posizioni delle 6 buche (`POCKET_POSITIONS`: 4 angoli + 2 laterali), zone di esclusione attorno alle buche.
- **Rilevamento buche / cuscini / collisioni palla-palla.**
- **Step principale e utilità di stato.**

| Nome | Descrizione (breve) |
|---|---|
| `_isInPocket` | Indica se il centro pallina è dentro la zona di cattura di una buca (cattura diretta o "in gola"). |
| `_nearPocketOpening` | Indica se la pallina è abbastanza vicina a una buca da sopprimere il rimbalzo sul cuscino. |
| `_resolveCushion` | Riflette la velocità sui bordi rettangolari e ricolloca la pallina; salta il check vicino alle buche. |
| `_resolveBallBall` | Risolve la collisione elastica tra due palline di massa uguale (correzione di compenetrazione + impulso). |
| `stepPhysics` | Avanza la simulazione di un dt: integra posizioni, applica attrito, risolve collisioni, rileva imbucate; ritorna le palline appena imbucate. |
| `isAllStopped` | Vero quando ogni pallina non imbucata ha velocità esattamente zero. |
| `isReadyForNextShot` | Vero quando ogni pallina è sotto la soglia percettiva di "ferma" (più permissiva di `isAllStopped`). |
| `snapToRest` | Azzera vx/vz su tutte le palline non imbucate (chiamata all'uscita da ROLLING). |
| `randomizeBalls` | Genera posizioni di partenza valide e non sovrapposte (indice 0 = cue ball sul lato giocatore; gli altri = colorate). |

`stepPhysics` riceve callback opzionali (`onBallBall`, `onCushion`) usate da `main.js` per riprodurre i suoni di impatto in funzione della velocità. La collisione palla-palla è O(n²), adeguata per il numero ridotto di palline.

---

## 2.4 source/controls.js

Gestione input mouse/touch per mira, carica e tiro. Nessuna dipendenza da Three.js: espone stato pubblico che `main.js` legge ogni frame.

Modello del gesto (un premi-e-rilascia sul canvas): tenere fermo carica la potenza (rilascio = tiro); trascinare oltre una tolleranza commuta il gesto in "mira" e annulla la carica.

Stato pubblico esposto dalla classe `Controls`: `aimAngle`, `mouseX`/`mouseY`, `chargeAmount` (0–1), `pullback`, `enabled`, e i getter `isCharging`/`isAiming`.

| Nome | Descrizione (breve) |
|---|---|
| `constructor` | Inizializza lo stato pubblico e interno e collega i listener al canvas. |
| `_bindEvents` | Registra i listener mouse (down/move/up/leave), touch (start/move/end) e disabilita il menu contestuale. |
| `_onMouseDown` | Inizia una pressione: avvia la carica e memorizza il punto di partenza del possibile drag. |
| `_onMouseMove` | Aggiorna la posizione del cursore; oltre la tolleranza di drag passa in modalità mira e ruota `aimAngle`. |
| `_onMouseUp` | Termina la pressione: se stava caricando calcola la potenza dalla durata e mette in coda il tiro. |
| `_onMouseLeave` | Annulla la pressione corrente senza sparare (il cursore esce dal canvas). |
| `_onTouchStart` / `_onTouchMove` / `_onTouchEnd` | Versioni touch dei gestori mouse, con `preventDefault`. |
| `update` | Ricalcola `chargeAmount` e `pullback` dalla durata della pressione (chiamata ogni frame). |
| `consumeShot` | Restituisce il tiro in sospeso e lo azzera, così ogni tiro è consumato una sola volta. |

Costanti: `AIM_SENSITIVITY`, `MAX_CHARGE_TIME = 2.5 s`, `MAX_POWER = 14.0`, `MIN_POWER = 0.5`, `MAX_PULLBACK = 1.4`, tolleranze di drag mouse/touch. La potenza del tiro è `MIN_POWER + (frazione di carica) × (MAX_POWER − MIN_POWER)`.

---

## 2.5 source/textures.js

Generazione di texture procedurali (canvas) e caricamento di set di texture PBR da file. Nessun codice di geometria o scena.

Sotto-sezioni / superfici gestite:

- **Felt (panno tavolo) — procedurale:** colore (verde baize con rumore di fibra), normal map (campo d'altezza ad alta frequenza tipo Sobel), roughness map.
- **Wood (rail/legs) — file PBR:** `textures/wood/color.jpg`, `normal.jpg`, `roughness.jpg` (repeat 6×1).
- **Leg (gambe del tavolo) — file PBR:** carica separatamente `textures/wood/color.jpg` e `roughness.jpg` con repeat 1×2.
- **Floor — file PBR:** `textures/floor/color.jpg`, `normal.jpg`, `roughness.jpg`, `ao.jpg` (repeat 10×8).
- **Wall — file PBR:** `textures/wall/color.jpg`, `normalgl.jpg`, `roughness.jpg` (repeat 4×2).
- **Wood020 (cornice finestra + battiscopa) — file PBR:** `textures/wood020/color.jpg`, `normal.jpg`, `roughness.jpg` (repeat 3×1).
- **Ball — procedurale:** factory di texture per-pallina + una roughness map condivisa.

| Nome | Descrizione (breve) |
|---|---|
| `generateTextures` | Crea/carica tutte le texture e ritorna l'oggetto `texMap` con le voci felt, wood, leg, wood020, floor, wall, ball e la factory `createBallTex`. |
| `_createFeltColorTexture` | Genera la texture colore del panno (base verde + speckling di fibra + venatura fine). |
| `_createFeltNormalMap` | Genera la normal map del panno da un campo d'altezza ad alta frequenza. |
| `_createFeltRoughnessMap` | Genera una roughness map del panno prevalentemente ruvida con leggera variazione. |
| `_createBallTexture` | Genera la texture di una pallina: colore base, eventuale fascia bianca (palle 9–15) ed etichetta col numero (esclusa la cue ball). |
| `_createBallRoughnessMap` | Genera la roughness map condivisa delle palline (resina lucida con rari "scuff"). |

Nota: la fascia per le palline a riga (numeri 9–15) è implementata in `_createBallTexture`, ma nel gioco si usano solo palline 0–4 (vedi `BALL_COLORS` e `LEVELS_BALL_COUNT`), quindi quella ramificazione non viene mai attivata in partita.

---

## 2.6 source/sounds.js

Gestione dell'audio: una musica di sottofondo (elemento `Audio`) e gli effetti sonori riprodotti tramite Web Audio API (`AudioContext` + buffer decodificati). I percorsi dei file sono risolti rispetto al modulo (`../sounds/`).

Effetti caricati: `hitEffect.mp3`, `ballHit.mp3`, `ballWall.mp3`, `ballDrop.mp3`, `success.mp3`, `fail.mp3`, `win.mp3`, `error.mp3`, `heartBroken.mp3`, `click.mp3`; musica: `background.mp3` (in loop, volume 0.15).

| Nome | Descrizione (breve) |
|---|---|
| `initSounds` | Inizializza la musica e l'`AudioContext`, predispone lo "sblocco" audio al primo gesto utente e carica tutti i buffer. |
| `_loadBuffer` | Scarica e decodifica un file audio in un AudioBuffer (ritorna null in caso di errore). |
| `startBgMusic` / `stopBgMusic` | Avviano/fermano la musica di sottofondo (con ripristino su gesto utente se bloccata). |
| `setMusicRate` | Imposta la velocità di riproduzione della musica. |
| `setMusicDifficulty` | Imposta la velocità musica in base alla difficoltà (1,4× per "insane", altrimenti 1,0×). |
| `_playBuffer` | Riproduce un buffer con guadagno proporzionale alla velocità passata, attendendo che il contesto sia attivo. |
| `playBallHitSound` / `playBallWallSound` / `playBallDropSound` | Effetti per collisione palla-palla, palla-cuscino e imbucata. |
| `playErrorSound` / `playSuccessSound` / `playFailSound` / `playWinSound` / `playHeartBrokenSound` / `playClickSound` | Effetti per errore, livello superato, game over, vittoria, cuore spezzato e click pulsanti. |
| `playHitSound` | Effetto del colpo di stecca, con guadagno proporzionale alla potenza del tiro. |

---

## 2.7 source/models.js

Costruzione di mesh, gerarchie e materiali Three.js, più il caricamento dei modelli glTF/GLB. Nessuna logica di gioco. Importa da `physics.js` le costanti `TABLE_W`, `TABLE_H`, `BALL_RADIUS`, `POCKET_POSITIONS`. Sistema di coordinate Y-up: pavimento a Y=0, superficie del tavolo a `TABLE_SURFACE_Y = 0.76`.

Costanti esportate: `TABLE_SURFACE_Y`, `BALL_Y` (centro pallina a riposo), `CUE_REACH` (lunghezza della stecca, usata da `main.js` per la collisione di mira), `CUE_CLEAR_R` (semi-spessore effettivo della stecca).

| Nome (export) | Descrizione (breve) |
|---|---|
| `createRoom` | Costruisce la stanza chiusa: pavimento, soffitto, 4 pareti (box renderizzato all'interno), battiscopa, finestra con foro/vetro/cornice/luce lunare, e carica la porta (`door.glb`). |
| `createTable` | Costruisce il tavolo: panno, corpo in legno, rail/cuscini, 6 buche, 4 gambe tornite (LatheGeometry). |
| `_buildRails` | Costruisce i quattro tratti di rail/cuscino lasciando i varchi per le buche. |
| `_buildPockets` | Costruisce per ogni buca il disco scuro, il cilindro aperto rastremato e il fondo. |
| `createCueStick` | Crea la stecca come gerarchia padre-figlio (root → group → tip/shaft/grip). |
| `createBallMesh` | Crea la mesh di una pallina con `MeshPhysicalMaterial` (clearcoat lucido) e texture per-pallina. |
| `createLamp` | Crea la lampada a sospensione: barra orizzontale su due catene con tre paralumi, lampadine emissive e SpotLight con ombre. |
| `_createChainLinks` | Costruisce una catena verticale come pila di anelli alternati (torus). |
| `createFloorLamp` | Crea una piantana nell'angolo lounge (base, palo, paralume conico, lampadina, PointLight caldo). |
| `createCeilingLight` | Crea il plafoniera a soffitto commutabile (lente emissiva + anello + PointLight con ombre). |
| `createLoungeCorner` | Carica `lounge_corner.glb` (divano + tavolino) nell'angolo posteriore sinistro. |
| `createPainting` | Carica `painting1.glb` (quadro incorniciato) sulla parete frontale, sopra il divano. |
| `createDartboard` | Carica il bersaglio per freccette (`dartboard_1k.gltf`) sulla parete posteriore. |
| `createCabinet` | Carica la credenza vintage (`vintage_cabinet_01_1k.gltf`) contro la parete frontale. |
| `createStools` | Carica lo sgabello metallico (`metal_stool_01_1k.gltf`) e ne dispone 4 cloni lungo la parete posteriore. |
| `createFrame2` | Carica la cornice ornata (`fancy_picture_frame_01_1k.gltf`) sulla parete posteriore. |
| `createPlant` | Carica `potted_plant_01_1k.gltf` sul pavimento contro la parete frontale. |
| `createPlant2` | Carica `potted_plant_02_1k.gltf` sul pavimento contro la parete frontale, a destra della credenza. |
| `createCoatRack` | Carica `coat_rack.glb` e ne fissa 2 cloni affiancati sulla parete posteriore. |
| `createPainting3` | Carica `painting4.glb` (vedi nota sotto) sulla parete destra, accanto alla porta. |
| `createPlant2Corner` | Carica `potted_plant_02_1k.gltf` nell'angolo posteriore destro. |

Nota di fedeltà: la funzione `createPainting3` carica il file `./blender_assets/painting4.glb` (non `painting3.glb`). Il file `painting3.glb` è presente nella cartella ma **non risulta caricato da alcuna funzione** del progetto.

### Gerarchie costruite proceduralmente in models.js

**Stecca (`createCueStick`)** — gerarchia padre-figlio:

```
cueRoot (Object3D, pivot sul centro della pallina bianca; rotazione Y = mira)
└─ cueGroup (Object3D, traslazione locale X per pullback/strike)
   ├─ tipMesh   (cilindro, materiale punta in cuoio rossastro 0xcc4400)
   ├─ shaftMesh (cilindro rastremato, legno biondo 0xf5e8c0)
   └─ gripMesh  (cilindro rastremato, mogano scuro 0x3b1a0a)
```

Tutte le sezioni si estendono lungo l'asse +X locale; non sono presenti animazioni a keyframe (lo "scatto" della stecca è animato proceduralmente in `main.js`, non con clip di animazione).

**Lampada a sospensione (`createLamp`)** — gerarchia (tutto figlio dell'`anchor`, che ruota per oscillare):

```
anchor (Group, pivot al soffitto)
├─ 2 × mount (cilindro, ottone)          — sull'asse di rotazione
├─ 2 × chain (Group di 8 anelli torus alternati)
├─ bar (cilindro orizzontale, ottone)
├─ 2 × finial (sfera decorativa alle estremità)
└─ per ciascuno dei 3 paralumi (x = −, 0, +):
   ├─ socket (cilindro)
   ├─ shade  (semisfera verde esterna)
   ├─ liner  (semisfera bianca interna emissiva)
   ├─ trim   (anello torus dorato)
   ├─ bulb   (sfera emissiva)
   ├─ SpotLight (cono verso il basso, con ombre)
   └─ target (Object3D, bersaglio dello SpotLight)
```

Materiali della lampada: `goldMat` (ottone), `shadeOuterMat` (verde baize), `shadeInnerMat` (bianco emissivo), `bulbMat` (emissivo ambra). `createLamp` ritorna `{ anchor, bulbMeshes, linerMeshes, lights }`, usati dal toggle della lampada in `main.js`.

**Tavolo (`createTable`)**: panno (`PlaneGeometry`), corpo (`BoxGeometry`), rail (4 box via `_buildRails`), buche (disco + cilindro + fondo via `_buildPockets`), 4 gambe (`LatheGeometry` da un profilo tornito). Materiali da `texMap`: felt, wood (corpo/rail), leg (gambe).

**Stanza (`createRoom`)**: box stanza con facce interne, pavimento separato (`PlaneGeometry` con `uv2` per l'AO), battiscopa, finestra ricostruita con 4 pannelli forati + 4 facce di "reveal" + vetro (`MeshPhysicalMaterial`) + cornice in legno, una `PointLight` di luce lunare; carica inoltre la porta da `door.glb`.

**Palline (`createBallMesh`)**: `SphereGeometry(BALL_RADIUS, 32, 32)` con `MeshPhysicalMaterial` (roughness 0.15, clearcoat 1.0, envMap). La texture colore/numero è generata per-istanza da `createBallTex`.

---

## 2.8 Modelli 3D caricati da file (glTF/GLB)

Per ogni modello caricato sono riportati, **come effettivamente presenti nei file**, la gerarchia dei nodi/mesh, i materiali e le texture associate. **Nessuno dei modelli contiene animazioni** (array `animations` vuoto in tutti i file).

### door.glb — Porta (in `createRoom`)
```
Door classic (nodo vuoto)
└─ dors6  → mesh Mesh.090
            ├─ materiale "vray Wod1.001"
            └─ materiale "vray HR1.002"
```
Texture (immagini incorporate): `k_715_t_cherry_0000` (legno ciliegio). In `createRoom` i materiali vengono schiariti (colore ×1.8, envMapIntensity 2.0, leggera auto-illuminazione dalla mappa). Nessuna animazione.

### lounge_corner.glb — Angolo lounge (divano + tavolino) (in `createLoungeCorner`)
```
round_wooden_table_01 → mesh Cylinder        (mat round_wooden_table_01)
espaldar sofa         → mesh Plane.003        (mat Material)
sofa-base             → mesh Cube.007         (mat Material, Material.001, negro)
sofa-brazos           → mesh Plane.002        (mat Material)
sofa-cojin            → mesh Plane.001        (mat Material)
```
Texture del tavolino: `round_wooden_table_01_diff_1k`, `round_wooden_table_01_nor_gl`, `round_wooden_table_01_metal-…_rough` (incorporate). Nessuna animazione.

### painting1.glb — Quadro incorniciato (in `createPainting`)
```
Historical Painting in Wooden Frame (nodo vuoto)
└─ Bfx.Painting.img.001  → mesh Bfx.Painting.img.001 (mat "Black wood.002")
   ├─ Bfx.Painting.img.002 → mesh (mat "Bfx.Painting.img.001" — l'immagine del dipinto)
   └─ Bfx.Painting.img.003 → mesh (mat "Bfx.Mat.glass.001" — vetro)
```
Texture: `Bfx.Painting.img.001` (immagine del dipinto), `wood03_diffuse`, `wood03_normal_opengl`, `wood03_roughness` (cornice). In `createPainting` la mesh del vetro (materiale "glass") viene nascosta e all'immagine viene applicato `polygonOffset` per evitare lo z-fighting. Nessuna animazione.

### dartboard/dartboard_1k.gltf — Bersaglio freccette (in `createDartboard`)
```
dartboard → mesh Circle.002 (mat "dartboard")
```
Texture (file separati in `dartboard/textures/`): `dartboard_diff_1k.jpg`, `dartboard_nor_gl_1k.jpg`, `dartboard_arm_1k.jpg` (ARM = AO/Roughness/Metalness). Nessuna animazione.

### cabinet/vintage_cabinet_01_1k.gltf — Credenza vintage (in `createCabinet`)
```
vintage_cabinet_01_body    → mesh Plane.056 (mat vintage_cabinet_01_a, vintage_cabinet_01_b)
vintage_cabinet_01_door_01 → mesh Plane.001 (mat vintage_cabinet_01_a, vintage_cabinet_01_glass)
vintage_cabinet_01_door_02 → mesh Plane.004 (mat vintage_cabinet_01_a)
vintage_cabinet_01_door_03 → mesh Plane.002 (mat vintage_cabinet_01_a, vintage_cabinet_01_glass)
vintage_cabinet_01_door_04 → mesh Plane.003 (mat vintage_cabinet_01_a, vintage_cabinet_01_glass)
vintage_cabinet_01_door_05 → mesh Plane.005 (mat vintage_cabinet_01_a)
vintage_cabinet_01_door_06 → mesh Plane.006 (mat vintage_cabinet_01_a)
vintage_cabinet_01_door_07 → mesh Plane.007 (mat vintage_cabinet_01_a)
```
Materiali: `vintage_cabinet_01_a`, `vintage_cabinet_01_b`, `vintage_cabinet_01_glass`. Texture (in `cabinet/textures/`): set "a" (`_a_diff_1k`, `_a_nor_gl_1k`, `_a_arm_1k`, `_a_rough_1k`) e set "b" (`_b_diff_1k`, `_b_nor_gl_1k`, `_b_rough_1k`). I nodi/door sono fratelli (nessuna gerarchia padre-figlio interna). Nessuna animazione.

### stool/metal_stool_01_1k.gltf — Sgabello metallico (in `createStools`, 4 cloni)
```
metal_stool_01 → mesh Cylinder.010 (mat "metal_stool_01")
```
Texture (in `stool/textures/`): `metal_stool_01_diff_1k.jpg`, `_nor_gl_1k.jpg`, `_arm_1k.jpg`. In `createStools` l'`envMapIntensity` è alzato a 2.0. Nessuna animazione.

### frame2/fancy_picture_frame_01_1k.gltf — Cornice ornata (in `createFrame2`)
```
fancy_picture_frame_01        → mesh Plane.004 (mat fancy_picture_frame_01)
fancy_picture_frame_01_canvas → mesh Plane.005 (mat fancy_picture_frame_01_canvas)
```
Texture (in `frame2/textures/`): cornice (`_diff_1k`, `_nor_gl_1k`, `_rough_1k`) e tela/canvas (`_canvas_diff_1k`, `_canvas_nor_gl_1k`, `_canvas_rough_1k`). Nessuna animazione.

### plant/potted_plant_01_1k.gltf — Pianta in vaso 1 (in `createPlant`)
```
potted_plant_01_stem    → mesh potted_plant_01_base_low (mat potted_plant_01_pot)
potted_plant_01_pebbles → mesh Circle.008                (mat potted_plant_01_pot)
potted_plant_01_pot     → mesh Circle.002                (mat potted_plant_01_pot)
potted_plant_01_leaves  → mesh Plane.070                 (mat potted_plant_01_leaves)
```
Texture (in `plant/textures/`): vaso (`_pot_diff_1k`, `_pot_nor_gl_1k`, `_pot_rough_1k`) e foglie (`_leaves_diff_1k`, `_leaves_nor_gl_1k`, `_leaves_rough_1k`). Nessuna animazione.

### plant2/potted_plant_02_1k.gltf — Pianta in vaso 2 (in `createPlant2` e `createPlant2Corner`)
```
potted_plant_02_pot    → mesh Circle      (mat potted_plant_02_pot)
potted_plant_02_leaves → mesh Circle.001  (mat potted_plant_02_leaves)
potted_plant_02_dirt   → mesh low.008     (mat potted_plant_02_pot)
```
Texture (in `plant2/textures/`): vaso (`_pot_diff_1k`, `_pot_nor_gl_1k`, `_pot_rough_1k`) e foglie (`_leaves_diff_1k`, `_leaves_nor_gl_1k`, `_leaves_rough_1k`). Lo stesso file è usato per due collocazioni distinte. Nessuna animazione.

### coat_rack.glb — Appendiabiti (in `createCoatRack`, 2 cloni)
```
Coat rack (nodo vuoto)
├─ Bolt 014.003   → mesh Bolt 014    (mat Material.003)
├─ Cube           → mesh Cube.001    (mat Material.002)
└─ Cylinder.003   → mesh Cylinder.002 (mat Material.001)
```
Texture incorporate: `vrb32f3`, `vrb32f3000`. Nessuna animazione.

### painting4.glb — Quadro "Mona Lisa" (caricato da `createPainting3`)
```
Mona Lisa (nodo vuoto)
├─ Backing  → mesh Cube.001  (mat Plywood_Backing_Material)
├─ Frame    → mesh Cube.002  (mat Wood_Material)
├─ Glass    → mesh Plane.001 (mat Glass_Material)
└─ Painting → mesh Plane     (mat Mona_Lisa)
```
Texture: backing `Chipboard006_4K-JPG_Color/_NormalGL/_Roughness`; cornice `Wood026_4K-JPG_Color/_NormalGL/_Roughness`; immagine `370775_poster`. In `createPainting3` la mesh "Glass" è nascosta, la "Painting" è ingrandita (×1.09) con `polygonOffset` e il backing è sostituito con un materiale nero ingrandito. Nessuna animazione.

### painting3.glb — (PRESENTE MA NON USATO)
Il file esiste in `blender_assets/` con gerarchia `Fancy Picture Frame 01 → { fancy_picture_frame_01 (Plane.062), fancy_picture_frame_01_canvas (Plane.063) }` e texture 8k della famiglia `fancy_picture_frame_01`, ma **non è referenziato da alcuna funzione** del codice e quindi non viene caricato nella scena.

---

## 2.9 libs/ (librerie di terze parti)

La cartella `libs/` contiene le dipendenze di terze parti incluse localmente, **non scritte come parte del progetto**:

- `three.module.js` — la libreria Three.js (r128), motore di rendering WebGL usato da tutti gli script.
- `GLTFLoader.js` — il loader glTF/GLB ufficiale di Three.js, usato in `models.js` per importare i modelli `.glb`/`.gltf`.

Questi file non sono documentati funzione per funzione perché sono codice esterno; il loro uso nel progetto è descritto nelle sezioni precedenti (importmap in `index.html`, import in `main.js`/`models.js`).

---

## 2.10 Note di fedeltà al codice

Punti in cui la documentazione segue il **codice eseguito** anziché eventuali commenti o nomi fuorvianti:

- **Palline per livello:** il codice usa `LEVELS_BALL_COUNT = [1, 2, 3, 4]`. Il commento iniziale di `main.js` cita invece "1 / 3 / 6 / 10" palline: questa progressione **non** corrisponde al codice e non è ciò che viene eseguito.
- **`createPainting3` carica `painting4.glb`**, non `painting3.glb`. Il file `painting3.glb` è presente ma inutilizzato.
- **Palline a riga (9–15):** la palette `BALL_COLORS` ha le voci 9–15 commentate e la logica della fascia bianca in `textures.js` non viene mai attivata in partita (si usano solo le palline 0–4).
- **Tasto `O`** (luce a soffitto): gestito nel codice ma assente dalla legenda a schermo.
- **Animazioni dei modelli 3D:** nessuno dei file glTF/GLB contiene clip di animazione. L'unico movimento animato della scena è procedurale (oscillazione della lampada in `_updateLamp`, scatto della stecca in `_updateCue`, rotazione di rotolamento delle palline in `_updateBallRotation`) e gli effetti dell'interfaccia sono animazioni CSS in `index.html`.
