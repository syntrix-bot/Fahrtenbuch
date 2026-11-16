import SwiftData
import SwiftUI

struct ExpensesView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Expense.date, order: .reverse) private var expenses: [Expense]

    @State private var showAdd = false
    @State private var editing: Expense?

    private var sections: [(month: Date, expenses: [Expense])] {
        let calendar = Calendar.current
        let groups = Dictionary(grouping: expenses) {
            calendar.dateInterval(of: .month, for: $0.date)?.start ?? $0.date
        }
        return groups.keys.sorted(by: >).map { (month: $0, expenses: groups[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if expenses.isEmpty {
                    ContentUnavailableView {
                        Label("Noch keine Kosten", systemImage: "eurosign.circle")
                    } description: {
                        Text("Tanken, Versicherung, Werkstatt … alles, was das Auto kostet.")
                    } actions: {
                        Button("Kosten eintragen") { showAdd = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        ForEach(sections, id: \.month) { section in
                            Section {
                                ForEach(section.expenses) { expense in
                                    Button { editing = expense } label: { ExpenseRow(expense: expense) }
                                        .tint(.primary)
                                }
                                .onDelete { offsets in
                                    for index in offsets { context.delete(section.expenses[index]) }
                                }
                            } header: {
                                HStack {
                                    Text(section.month.formatted(.dateTime.month(.wide).year()))
                                    Spacer()
                                    Text(section.expenses.reduce(0) { $0 + $1.amount }.euro)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Kosten")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Image(systemName: "plus.circle.fill") }
                }
            }
            .sheet(isPresented: $showAdd) { ExpenseEditorView(expense: nil) }
            .sheet(item: $editing) { expense in ExpenseEditorView(expense: expense) }
        }
    }
}

struct ExpenseRow: View {
    let expense: Expense

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: expense.category.symbol)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(expense.note.isEmpty ? expense.category.rawValue : expense.note)
                    .lineLimit(1)
                Text("\(expense.date.formatted(date: .abbreviated, time: .omitted)) · bezahlt von \(expense.paidBy?.name ?? "–")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(expense.amount.euro)
                .font(.headline)
                .monospacedDigit()
        }
    }
}

struct ExpenseEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \Person.order) private var people: [Person]

    let expense: Expense?

    @State private var amountText = ""
    @State private var category: ExpenseCategory = .tanken
    @State private var paidBy: Person?
    @State private var date = Date.now
    @State private var note = ""
    @State private var didLoad = false

    private var amount: Double? {
        guard let value = parseAmount(amountText), value > 0 else { return nil }
        return value
    }

    private var canSave: Bool { amount != nil && paidBy != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Betrag") {
                    HStack {
                        TextField("0,00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.title2.bold())
                        Text("€").font(.title2).foregroundStyle(.secondary)
                    }
                }

                Section("Wer hat bezahlt?") {
                    Picker("Bezahlt von", selection: $paidBy) {
                        ForEach(people) { person in
                            Text(person.name).tag(Optional(person))
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Picker("Kategorie", selection: $category) {
                        ForEach(ExpenseCategory.allCases) { category in
                            Label(category.rawValue, systemImage: category.symbol).tag(category)
                        }
                    }
                    DatePicker("Datum", selection: $date, displayedComponents: .date)
                    TextField("Notiz (optional)", text: $note)
                }
            }
            .navigationTitle(expense == nil ? "Neue Kosten" : "Kosten bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern", action: save).disabled(!canSave)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        if let expense {
            amountText = expense.amount.formatted(.number.precision(.fractionLength(2)).grouping(.never))
            category = expense.category
            paidBy = expense.paidBy
            date = expense.date
            note = expense.note
        } else {
            paidBy = people.first
        }
    }

    private func save() {
        guard let amount, let paidBy else { return }
        let trimmedNote = note.trimmingCharacters(in: .whitespaces)
        if let expense {
            expense.amount = amount
            expense.category = category
            expense.paidBy = paidBy
            expense.date = date
            expense.note = trimmedNote
        } else {
            context.insert(Expense(date: date, amount: amount, category: category, note: trimmedNote, paidBy: paidBy))
        }
        dismiss()
    }
}

#Preview {
    ExpensesView()
        .modelContainer(PreviewData.container)
}
