import Foundation

/// Reine Rechenlogik für die Kostenaufteilung – unabhängig von SwiftData und UI.
///
/// Prinzip: Alle Kosten werden anteilig nach gefahrenen Kilometern verteilt.
/// Wer mehr bezahlt hat, als es seinem km-Anteil entspricht, bekommt Geld zurück.
/// Bereits geleistete Ausgleichszahlungen werden verrechnet.
enum CostSplit {

    struct Payment<ID: Hashable> {
        let from: ID
        let to: ID
        let amount: Double
    }

    struct Line<ID: Hashable>: Identifiable {
        let id: ID
        let kilometers: Int
        /// Anteil an allen gefahrenen km (0…1).
        let kilometerShare: Double
        /// Anteil an den Gesamtkosten in Euro.
        let costShare: Double
        /// Selbst bezahlte Kosten in Euro.
        let paid: Double
        let paymentsSent: Double
        let paymentsReceived: Double

        /// Positiv: bekommt Geld. Negativ: muss zahlen.
        var balance: Double { paid + paymentsSent - paymentsReceived - costShare }
    }

    struct Transfer<ID: Hashable> {
        let from: ID
        let to: ID
        let amount: Double
    }

    static func compute<ID: Hashable>(
        people: [ID],
        kilometers: [ID: Int],
        paid: [ID: Double],
        payments: [Payment<ID>]
    ) -> [Line<ID>] {
        guard !people.isEmpty else { return [] }

        let totalKm = people.reduce(0) { $0 + max(0, kilometers[$1] ?? 0) }
        let totalCost = people.reduce(0.0) { $0 + (paid[$1] ?? 0) }

        var sent: [ID: Double] = [:]
        var received: [ID: Double] = [:]
        for payment in payments {
            sent[payment.from, default: 0] += payment.amount
            received[payment.to, default: 0] += payment.amount
        }

        return people.map { person in
            let km = max(0, kilometers[person] ?? 0)
            // Ohne gefahrene km wird gleichmäßig aufgeteilt.
            let share = totalKm > 0 ? Double(km) / Double(totalKm) : 1.0 / Double(people.count)
            return Line(
                id: person,
                kilometers: km,
                kilometerShare: share,
                costShare: totalCost * share,
                paid: paid[person] ?? 0,
                paymentsSent: sent[person] ?? 0,
                paymentsReceived: received[person] ?? 0
            )
        }
    }

    /// Ermittelt möglichst wenige Überweisungen, um alle Salden auszugleichen.
    static func settle<ID: Hashable>(_ lines: [Line<ID>], tolerance: Double = 0.005) -> [Transfer<ID>] {
        var creditors = lines
            .filter { $0.balance > tolerance }
            .map { (id: $0.id, amount: $0.balance) }
            .sorted { $0.amount > $1.amount }
        var debtors = lines
            .filter { $0.balance < -tolerance }
            .map { (id: $0.id, amount: -$0.balance) }
            .sorted { $0.amount > $1.amount }

        var result: [Transfer<ID>] = []
        var i = 0
        var j = 0
        while i < debtors.count && j < creditors.count {
            let amount = min(debtors[i].amount, creditors[j].amount)
            let rounded = (amount * 100).rounded() / 100
            if rounded > 0 {
                result.append(Transfer(from: debtors[i].id, to: creditors[j].id, amount: rounded))
            }
            debtors[i].amount -= amount
            creditors[j].amount -= amount
            if debtors[i].amount <= tolerance { i += 1 }
            if creditors[j].amount <= tolerance { j += 1 }
        }
        return result
    }
}
