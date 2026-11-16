import SwiftData
import SwiftUI

struct OverviewView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Person.order) private var people: [Person]
    @Query private var trips: [Trip]
    @Query private var expenses: [Expense]
    @Query private var payments: [Payment]

    @State private var showAddTrip = false
    @State private var showAddExpense = false
    @State private var transferToConfirm: CostSplit.Transfer<Person>?

    // MARK: - Berechnung

    private var lines: [CostSplit.Line<Person>] {
        var kilometers: [Person: Int] = [:]
        for trip in trips {
            if let driver = trip.driver { kilometers[driver, default: 0] += trip.distance }
        }
        var paid: [Person: Double] = [:]
        for expense in expenses {
            if let payer = expense.paidBy { paid[payer, default: 0] += expense.amount }
        }
        let made: [CostSplit.Payment<Person>] = payments.compactMap { payment in
            guard let from = payment.from, let to = payment.to else { return nil }
            return CostSplit.Payment(from: from, to: to, amount: payment.amount)
        }
        return CostSplit.compute(people: people, kilometers: kilometers, paid: paid, payments: made)
    }

    private var totalKm: Int { trips.reduce(0) { $0 + $1.distance } }
    private var totalCost: Double { expenses.reduce(0) { $0 + $1.amount } }
    private var currentOdometer: Int? { trips.map(\.endOdometer).max() }

    // MARK: - UI

    var body: some View {
        let lines = self.lines
        let transfers = CostSplit.settle(lines)

        NavigationStack {
            List {
                Section {
                    HStack(spacing: 0) {
                        stat(title: "Kilometerstand", value: currentOdometer?.km ?? "–")
                        Divider()
                        stat(title: "Gefahren", value: totalKm.km)
                    }
                    HStack(spacing: 0) {
                        stat(title: "Kosten gesamt", value: totalCost.euro)
                        Divider()
                        stat(title: "Kosten pro km",
                             value: totalKm > 0 ? (totalCost / Double(totalKm)).euro : "–")
                    }
                }

                Section("Wer ist wie viel gefahren?") {
                    ForEach(lines) { line in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                PersonBadge(person: line.id)
                                Spacer()
                                Text(line.kilometers.km).monospacedDigit()
                                Text(line.kilometerShare.formatted(.percent.precision(.fractionLength(0))))
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                                    .frame(minWidth: 44, alignment: .trailing)
                            }
                            ProgressView(value: line.kilometerShare)
                                .tint(line.id.color)
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    ForEach(lines) { line in
                        VStack(alignment: .leading, spacing: 4) {
                            PersonBadge(person: line.id)
                            LabeledContent("Anteil an Kosten", value: line.costShare.euro)
                            LabeledContent("Selbst bezahlt", value: line.paid.euro)
                            if line.paymentsSent > 0 || line.paymentsReceived > 0 {
                                LabeledContent("Ausgleich gezahlt / erhalten",
                                               value: "\(line.paymentsSent.euro) / \(line.paymentsReceived.euro)")
                            }
                            LabeledContent("Saldo") {
                                Text(balanceText(line.balance))
                                    .bold()
                                    .foregroundStyle(balanceColor(line.balance))
                            }
                        }
                        .font(.subheadline)
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Kosten")
                } footer: {
                    Text("Alle Kosten werden nach dem Anteil der gefahrenen Kilometer aufgeteilt.")
                }

                Section("Ausgleich") {
                    if transfers.isEmpty {
                        Label("Alles ausgeglichen", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                    } else {
                        ForEach(Array(transfers.enumerated()), id: \.offset) { _, transfer in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text("\(transfer.from.name) zahlt \(transfer.to.name)")
                                    Text(transfer.amount.euro)
                                        .font(.title3.bold())
                                        .monospacedDigit()
                                }
                                Spacer()
                                Button("Bezahlt") { transferToConfirm = transfer }
                                    .buttonStyle(.borderedProminent)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Übersicht")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showAddTrip = true } label: { Label("Fahrt eintragen", systemImage: "car.fill") }
                        Button { showAddExpense = true } label: { Label("Kosten eintragen", systemImage: "eurosign.circle") }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                }
            }
            .sheet(isPresented: $showAddTrip) { TripEditorView(trip: nil) }
            .sheet(isPresented: $showAddExpense) { ExpenseEditorView(expense: nil) }
            .confirmationDialog(
                "Ausgleich als bezahlt markieren?",
                isPresented: Binding(get: { transferToConfirm != nil },
                                     set: { if !$0 { transferToConfirm = nil } }),
                titleVisibility: .visible,
                presenting: transferToConfirm
            ) { transfer in
                Button("\(transfer.from.name) hat \(transfer.to.name) \(transfer.amount.euro) gezahlt") {
                    context.insert(Payment(amount: transfer.amount, from: transfer.from, to: transfer.to))
                }
            }
        }
    }

    private func stat(title: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).monospacedDigit()
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }

    private func balanceText(_ balance: Double) -> String {
        if balance > 0.005 { return "bekommt \(balance.euro)" }
        if balance < -0.005 { return "zahlt \((-balance).euro)" }
        return "ausgeglichen"
    }

    private func balanceColor(_ balance: Double) -> Color {
        if balance > 0.005 { return .green }
        if balance < -0.005 { return .red }
        return .secondary
    }
}

struct PersonBadge: View {
    let person: Person?

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(person?.color ?? .gray)
                .frame(width: 10, height: 10)
            Text(person?.name ?? "Unbekannt")
                .font(.body.weight(.semibold))
        }
    }
}

#Preview {
    OverviewView()
        .modelContainer(PreviewData.container)
}
