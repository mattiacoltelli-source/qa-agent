---
name: nuova-feature
description: Il flusso completo da seguire quando l'utente chiede una modifica reale (non un'esplorazione o una domanda) a CineFighi, CineTracker o Spot — dall'idea alla produzione, passando da un mockup quando la modifica è visiva, con verifica locale e sicurezza dati prima di spedire. Usa questo Skill come punto di partenza ogni volta che l'utente chiede di aggiungere, cambiare o togliere qualcosa in una di queste tre app — orchestra le Skill verifica-locale e sicurezza-dati invece di farti ricordare da solo l'ordine giusto dei passaggi.
---

# Dall'idea alla produzione: il flusso per una modifica reale

Questo Skill non sostituisce **verifica-locale** e **sicurezza-dati** —
li mette in ordine. Segui i passaggi in sequenza, senza saltarne uno per
andare più veloce: ogni salto qui è esattamente il tipo di errore già
capitato (implementare prima di aver capito bene cosa si vuole, inventare
uno stile invece di riusare quello vero, dimenticare di aggiornare i
test).

## 1. Capisci bene cosa vuole, prima di scrivere qualunque cosa

Se la richiesta è ambigua su un punto che cambia l'implementazione
(dove va un pulsante, cosa succede in un caso limite, quale delle tre
app), chiedilo — non indovinare e scoprirlo tre iterazioni dopo. Se la
richiesta è già precisa e non ambigua, non serve fare domande solo per
scrupolo: si passa avanti.

## 2. È visiva? Prima un mockup, non il codice vero

Se la modifica cambia qualcosa che si vede o si tocca (una nuova
sezione, un pulsante, un layout diverso) — **prima** un Artifact HTML
autosufficiente che riusa i VERI colori/font/classi dell'app (leggi
`styles.css` del repo giusto, non inventare una palette nuova — è
l'errore fatto e poi disfatto in questa sessione con un podio
"oro/argento/bronzo" mai esistito nell'app). Se ci sono dati reali
coinvolti, leggili in sola lettura (vedi **sicurezza-dati**) e usali nel
mockup invece di inventare numeri plausibili, quando è ragionevole
farlo — un mockup con dati veri è più utile per decidere.

Itera sul mockup finché l'utente non conferma esplicitamente che gli
piace ("mi piace", "vai con questo", un preferito indicato tra più
opzioni). **Non passare al punto 3 senza quella conferma esplicita** —
anche se sembra ovvio quale versione preferirebbe.

Salta questo passaggio solo se: la modifica non è visiva (logica
interna, un bug, una soglia numerica), oppure l'utente chiede
esplicitamente di implementare direttamente senza vedere un mockup
prima.

## 3. Implementa per davvero, seguendo verifica-locale

Solo ora tocchi il codice vero dell'app. Segui lo Skill
**verifica-locale** dall'inizio: server locale, dati veri mockati nel
browser, bump della cache-busting version, screenshot di conferma.

Se in un punto qualunque di questo passaggio serve leggere o scrivere
sul vero backend (non solo file locali) — fermati e attraversa
esplicitamente lo Skill **sicurezza-dati** prima di procedere.

## 4. Aggiorna la copertura di test in qa-agent

Se la modifica cambia un comportamento già coperto da un test esistente
(vedi `apps/<app>/tests/smoke/*.spec.ts`), aggiorna quel test — non
lasciarlo rotto o disallineato. Se la modifica è un comportamento nuovo
abbastanza importante da meritarlo, aggiungi un test mockato (mai contro
il vero Supabase) che lo copra.

## 5. Commit, push, e conferma esplicita per main

Messaggio di commit che spiega il perché, non solo il cosa. Push sempre
al branch di sessione per primo. Il push su `main` è un'azione condivisa
e visibile a un gruppo reale — **chiedi conferma esplicita prima di
farlo**, anche se l'utente ha già autorizzato main in un turno
precedente per un lavoro diverso: un'autorizzazione vale per quello che
copriva, non per sempre. L'unica eccezione è quando l'utente ha già
detto esplicitamente, in questa stessa richiesta, di procedere fino in
fondo senza altre conferme.

## 6. Dopo aver spedito

Un riepilogo breve di cosa è cambiato e dov'è visibile (link/percorso),
non un elenco di ogni comando eseguito. Se qualcosa nella verifica non è
andato secondo i piani (es. un test preesistente fallito per motivi non
legati alla modifica, vedi la nota sui flake di rete in
**verifica-locale**), dillo — non ometterlo per sembrare più lineare di
quanto sia stato.
