// Reine Rechenlogik für die Kostenaufteilung. Alle Beträge in Cent.
//
// Prinzip: Alle Kosten werden nach dem Anteil der gefahrenen Kilometer verteilt.
// Wer mehr bezahlt hat, als sein km-Anteil ausmacht, bekommt Geld zurück.
// Bereits geleistete Ausgleichszahlungen werden verrechnet.

export function computeSplit(state) {
  const { people, trips, expenses, payments } = state;
  if (people.length === 0) return [];

  const km = {}, sharedKm = {}, paid = {}, sent = {}, received = {};
  for (const p of people) { km[p.id] = 0; sharedKm[p.id] = 0; paid[p.id] = 0; sent[p.id] = 0; received[p.id] = 0; }

  for (const t of trips) {
    const dist = Math.max(0, t.end - t.start);
    if (t.shared) {
      // Gemeinsame Fahrt: Kilometer werden gleichmäßig auf alle verteilt.
      for (const p of people) { km[p.id] += dist / people.length; sharedKm[p.id] += dist / people.length; }
    } else if (t.driverId in km) {
      km[t.driverId] += dist;
    }
  }
  for (const e of expenses) {
    if (e.paidById in paid) paid[e.paidById] += e.amountCents;
  }
  for (const pay of payments) {
    if (pay.fromId in sent && pay.toId in received) {
      sent[pay.fromId] += pay.amountCents;
      received[pay.toId] += pay.amountCents;
    }
  }

  const totalKm = people.reduce((s, p) => s + km[p.id], 0);
  const totalCost = people.reduce((s, p) => s + paid[p.id], 0);

  return people.map((p) => {
    // Ohne gefahrene km wird gleichmäßig aufgeteilt.
    const share = totalKm > 0 ? km[p.id] / totalKm : 1 / people.length;
    const costShare = totalCost * share;
    return {
      person: p,
      km: km[p.id],
      sharedKm: sharedKm[p.id],
      kmShare: share,
      costShare,
      paid: paid[p.id],
      sent: sent[p.id],
      received: received[p.id],
      // Positiv: bekommt Geld. Negativ: muss zahlen.
      balance: paid[p.id] + sent[p.id] - received[p.id] - costShare,
    };
  });
}

/** Möglichst wenige Überweisungen, um alle Salden auszugleichen. */
export function settle(lines, toleranceCents = 0.5) {
  const creditors = lines.filter((l) => l.balance > toleranceCents)
    .map((l) => ({ person: l.person, amount: l.balance }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = lines.filter((l) => l.balance < -toleranceCents)
    .map((l) => ({ person: l.person, amount: -l.balance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    const cents = Math.round(amount);
    if (cents > 0) transfers.push({ from: debtors[i].person, to: creditors[j].person, amountCents: cents });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= toleranceCents) i++;
    if (creditors[j].amount <= toleranceCents) j++;
  }
  return transfers;
}

/** "12,50" / "12.50" / "1.234,56 €" → Cent, oder null. */
export function parseAmountCents(text) {
  let s = String(text).replace(/[€\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

/** "123.456" / "123 456" → 123456, oder null. */
export function parseOdometer(text) {
  const digits = String(text).replace(/\D/g, '');
  return digits ? Number(digits) : null;
}
