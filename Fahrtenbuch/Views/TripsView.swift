import SwiftData
import SwiftUI

struct TripsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\Trip.date, order: .reverse),
                  SortDescriptor(\Trip.startOdometer, order: .reverse)])
    private var trips: [Trip]

    @State private var showAdd = false
    @State private var editing: Trip?

    private var sections: [(month: Date, trips: [Trip])] {
        let calendar = Calendar.current
        let groups = Dictionary(grouping: trips) {
            calendar.dateInterval(of: .month, for: $0.date)?.start ?? $0.date
        }
        return groups.keys.sorted(by: >).map { (month: $0, trips: groups[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if trips.isEmpty {
                    ContentUnavailableView {
                        Label("Noch keine Fahrten", systemImage: "car")
                    } description: {
                        Text("Trage nach jeder Fahrt den Kilometerstand ein.")
                    } actions: {
                        Button("Fahrt eintragen") { showAdd = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        ForEach(sections, id: \.month) { section in
                            Section {
                                ForEach(section.trips) { trip in
                                    Button { editing = trip } label: { TripRow(trip: trip) }
                                        .tint(.primary)
                                }
                                .onDelete { offsets in
                                    for index in offsets { context.delete(section.trips[index]) }
                                }
                            } header: {
                                HStack {
                                    Text(section.month.formatted(.dateTime.month(.wide).year()))
                                    Spacer()
                                    Text(section.trips.reduce(0) { $0 + $1.distance }.km)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Fahrten")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Image(systemName: "plus.circle.fill") }
                }
            }
            .sheet(isPresented: $showAdd) { TripEditorView(trip: nil) }
            .sheet(item: $editing) { trip in TripEditorView(trip: trip) }
        }
    }
}

struct TripRow: View {
    let trip: Trip

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                PersonBadge(person: trip.driver)
                Text("\(trip.date.formatted(date: .abbreviated, time: .omitted)) · \(trip.startOdometer.formatted()) → \(trip.endOdometer.formatted())")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !trip.note.isEmpty {
                    Text(trip.note)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            Text(trip.distance.km)
                .font(.headline)
                .monospacedDigit()
        }
    }
}

struct TripEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \Person.order) private var people: [Person]
    @Query(sort: \Trip.endOdometer, order: .reverse) private var allTrips: [Trip]
    @AppStorage("lastDriverOrder") private var lastDriverOrder = 0

    let trip: Trip?

    @State private var driver: Person?
    @State private var date = Date.now
    @State private var startText = ""
    @State private var endText = ""
    @State private var note = ""
    @State private var didLoad = false

    private var start: Int? { parseOdometer(startText) }
    private var end: Int? { parseOdometer(endText) }

    private var distance: Int? {
        guard let start, let end, end > start else { return nil }
        return end - start
    }

    /// Höchster bisher erfasster Kilometerstand (ohne die gerade bearbeitete Fahrt).
    private var lastOdometer: Int? {
        allTrips.first { $0.persistentModelID != trip?.persistentModelID }?.endOdometer
    }

    private var canSave: Bool { driver != nil && distance != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Wer ist gefahren?") {
                    Picker("Fahrer", selection: $driver) {
                        ForEach(people) { person in
                            Text(person.name).tag(Optional(person))
                        }
                    }
                    .pickerStyle(.segmented)
                    DatePicker("Datum", selection: $date, displayedComponents: .date)
                }

                Section {
                    LabeledContent("Start") {
                        TextField("km-Stand", text: $startText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Ende") {
                        TextField("km-Stand", text: $endText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Gefahren") {
                        Text(distance?.km ?? "–").bold().monospacedDigit()
                    }
                } header: {
                    Text("Kilometerstand")
                } footer: {
                    footerText
                }

                Section("Notiz") {
                    TextField("z. B. Einkaufen, Arbeit, Urlaub", text: $note)
                }
            }
            .navigationTitle(trip == nil ? "Neue Fahrt" : "Fahrt bearbeiten")
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

    @ViewBuilder
    private var footerText: some View {
        if let start, let end, end <= start {
            Text("Der End-Kilometerstand muss größer als der Start sein.")
                .foregroundStyle(.red)
        } else if trip == nil, let start, let lastOdometer, start > lastOdometer {
            Text("Seit der letzten Fahrt fehlen \((start - lastOdometer).km) – wurde eine Fahrt vergessen?")
                .foregroundStyle(.orange)
        } else if trip == nil, let start, let lastOdometer, start < lastOdometer {
            Text("Der Start liegt unter dem letzten Kilometerstand (\(lastOdometer.formatted())).")
                .foregroundStyle(.orange)
        }
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        if let trip {
            driver = trip.driver
            date = trip.date
            startText = String(trip.startOdometer)
            endText = String(trip.endOdometer)
            note = trip.note
        } else {
            driver = people.first { $0.order == lastDriverOrder } ?? people.first
            if let lastOdometer { startText = String(lastOdometer) }
        }
    }

    private func save() {
        guard let start, let end, let driver else { return }
        let trimmedNote = note.trimmingCharacters(in: .whitespaces)
        if let trip {
            trip.driver = driver
            trip.date = date
            trip.startOdometer = start
            trip.endOdometer = end
            trip.note = trimmedNote
        } else {
            context.insert(Trip(date: date, startOdometer: start, endOdometer: end, note: trimmedNote, driver: driver))
            lastDriverOrder = driver.order
        }
        dismiss()
    }
}

#Preview {
    TripsView()
        .modelContainer(PreviewData.container)
}
