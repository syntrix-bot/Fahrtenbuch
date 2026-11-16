import Foundation
import SwiftData

/// Beispieldaten für die Xcode-Vorschau (#Preview).
@MainActor
enum PreviewData {
    static let container: ModelContainer = {
        let container = try! ModelContainer(
            for: Person.self, Trip.self, Expense.self, Payment.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = container.mainContext
        let anna = Person(name: "Anna", order: 0)
        let ben = Person(name: "Ben", order: 1)
        context.insert(anna)
        context.insert(ben)

        let day: TimeInterval = 86_400
        context.insert(Trip(date: .now.addingTimeInterval(-5 * day), startOdometer: 52_100, endOdometer: 52_180, note: "Einkaufen", driver: anna))
        context.insert(Trip(date: .now.addingTimeInterval(-3 * day), startOdometer: 52_180, endOdometer: 52_420, note: "Besuch Eltern", driver: ben))
        context.insert(Trip(date: .now.addingTimeInterval(-1 * day), startOdometer: 52_420, endOdometer: 52_455, driver: anna))

        context.insert(Expense(date: .now.addingTimeInterval(-4 * day), amount: 72.40, category: .tanken, paidBy: anna))
        context.insert(Expense(date: .now.addingTimeInterval(-2 * day), amount: 38.90, category: .versicherung, note: "Monatsbeitrag", paidBy: ben))
        return container
    }()
}
