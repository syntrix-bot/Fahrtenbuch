import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Person.order) private var people: [Person]
    @Query(sort: \Payment.date, order: .reverse) private var payments: [Payment]
    @Query(sort: \Trip.date) private var trips: [Trip]
    @Query(sort: \Expense.date) private var expenses: [Expense]

    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Personen") {
                    ForEach(people) { person in
                        PersonNameField(person: person)
                    }
                }

                Section {
                    if payments.isEmpty {
                        Text("Noch keine Ausgleichszahlungen")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(payments) { payment in
                        HStack {
                            VStack(alignment: .leading) {
                                Text("\(payment.from?.name ?? "–") → \(payment.to?.name ?? "–")")
                                Text(payment.date.formatted(date: .abbreviated, time: .omitted))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(payment.amount.euro).monospacedDigit()
                        }
                    }
                    .onDelete { offsets in
                        for index in offsets { context.delete(payments[index]) }
                    }
                } header: {
                    Text("Ausgleichszahlungen")
                } footer: {
                    Text("Wischen zum Löschen, falls eine Zahlung versehentlich eingetragen wurde.")
                }

                Section("Export") {
                    ShareLink(item: CSVFile(text: csvExport()),
                              preview: SharePreview("Fahrtenbuch.csv")) {
                        Label("Als CSV exportieren", systemImage: "square.and.arrow.up")
                    }
                }

                Section {
                    Button("Alle Daten löschen", role: .destructive) { confirmReset = true }
                }
            }
            .navigationTitle("Einstellungen")
            .confirmationDialog("Wirklich alle Fahrten, Kosten und Personen löschen?",
                                isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Alles löschen", role: .destructive, action: resetAll)
            }
        }
    }

    private func resetAll() {
        payments.forEach { context.delete($0) }
        trips.forEach { context.delete($0) }
        expenses.forEach { context.delete($0) }
        people.forEach { context.delete($0) }
        try? context.save()
    }

    private func csvExport() -> String {
        func field(_ text: String) -> String {
            "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        let dateFormat = Date.ISO8601FormatStyle().year().month().day()
        var rows = ["Typ;Datum;Person;Start-km;End-km;km;Betrag;Kategorie;Notiz"]
        for trip in trips {
            rows.append([
                "Fahrt", trip.date.formatted(dateFormat), field(trip.driver?.name ?? ""),
                String(trip.startOdometer), String(trip.endOdometer), String(trip.distance),
                "", "", field(trip.note),
            ].joined(separator: ";"))
        }
        for expense in expenses {
            rows.append([
                "Kosten", expense.date.formatted(dateFormat), field(expense.paidBy?.name ?? ""),
                "", "", "", String(format: "%.2f", expense.amount).replacingOccurrences(of: ".", with: ","),
                field(expense.category.rawValue), field(expense.note),
            ].joined(separator: ";"))
        }
        for payment in payments.reversed() {
            rows.append([
                "Ausgleich", payment.date.formatted(dateFormat),
                field("\(payment.from?.name ?? "") → \(payment.to?.name ?? "")"),
                "", "", "", String(format: "%.2f", payment.amount).replacingOccurrences(of: ".", with: ","),
                "", "",
            ].joined(separator: ";"))
        }
        return rows.joined(separator: "\n")
    }
}

private struct PersonNameField: View {
    @Bindable var person: Person

    var body: some View {
        HStack {
            Circle().fill(person.color).frame(width: 12, height: 12)
            TextField("Name", text: $person.name)
        }
    }
}

struct CSVFile: Transferable {
    let text: String

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { file in
            // BOM, damit Excel Umlaute korrekt erkennt.
            Data("\u{FEFF}".utf8) + Data(file.text.utf8)
        }
        .suggestedFileName("Fahrtenbuch.csv")
    }
}

#Preview {
    SettingsView()
        .modelContainer(PreviewData.container)
}
