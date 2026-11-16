import SwiftData
import SwiftUI

struct OnboardingView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Person.order) private var people: [Person]

    @State private var firstName = ""
    @State private var secondName = ""

    private var canStart: Bool {
        !firstName.trimmingCharacters(in: .whitespaces).isEmpty
            && !secondName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "car.2.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(.tint)
                        Text("Willkommen beim Fahrtenbuch")
                            .font(.title2.bold())
                        Text("Tragt eure Fahrten und Autokosten ein – die App rechnet aus, wer wie viel zahlen muss, fair nach gefahrenen Kilometern.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical)
                }
                .listRowBackground(Color.clear)

                Section("Wer fährt das Auto?") {
                    TextField("Erste Person", text: $firstName)
                        .textContentType(.givenName)
                    TextField("Zweite Person", text: $secondName)
                        .textContentType(.givenName)
                }

                Section {
                    Button("Los geht's", action: start)
                        .frame(maxWidth: .infinity)
                        .disabled(!canStart)
                }
            }
        }
    }

    private func start() {
        // Falls von einem früheren Versuch noch einzelne Personen existieren.
        for person in people { context.delete(person) }
        context.insert(Person(name: firstName.trimmingCharacters(in: .whitespaces), order: 0))
        context.insert(Person(name: secondName.trimmingCharacters(in: .whitespaces), order: 1))
    }
}

#Preview {
    OnboardingView()
        .modelContainer(for: [Person.self, Trip.self, Expense.self, Payment.self], inMemory: true)
}
