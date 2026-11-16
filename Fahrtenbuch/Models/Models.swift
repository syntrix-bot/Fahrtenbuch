import Foundation
import SwiftData
import SwiftUI

/// Eine Person, die das Auto fährt und Kosten bezahlt.
@Model
final class Person {
    var name: String
    /// Reihenfolge in der Anzeige (0 = erste Person).
    var order: Int

    @Relationship(deleteRule: .nullify, inverse: \Trip.driver)
    var trips: [Trip] = []

    @Relationship(deleteRule: .nullify, inverse: \Expense.paidBy)
    var expenses: [Expense] = []

    @Relationship(deleteRule: .cascade, inverse: \Payment.from)
    var paymentsSent: [Payment] = []

    @Relationship(deleteRule: .cascade, inverse: \Payment.to)
    var paymentsReceived: [Payment] = []

    init(name: String, order: Int) {
        self.name = name
        self.order = order
    }

    var color: Color {
        let palette: [Color] = [.blue, .orange, .green, .purple, .pink]
        return palette[abs(order) % palette.count]
    }
}

/// Eine Fahrt, erfasst über den Kilometerstand.
@Model
final class Trip {
    var date: Date
    var startOdometer: Int
    var endOdometer: Int
    var note: String
    var driver: Person?

    init(date: Date, startOdometer: Int, endOdometer: Int, note: String = "", driver: Person?) {
        self.date = date
        self.startOdometer = startOdometer
        self.endOdometer = endOdometer
        self.note = note
        self.driver = driver
    }

    /// Gefahrene Kilometer dieser Fahrt.
    var distance: Int { max(0, endOdometer - startOdometer) }
}

enum ExpenseCategory: String, CaseIterable, Identifiable {
    case tanken = "Tanken"
    case versicherung = "Versicherung"
    case steuer = "Kfz-Steuer"
    case werkstatt = "Werkstatt & Wartung"
    case reifen = "Reifen"
    case pflege = "Pflege & Wäsche"
    case parken = "Parken & Maut"
    case sonstiges = "Sonstiges"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .tanken: "fuelpump.fill"
        case .versicherung: "shield.fill"
        case .steuer: "building.columns.fill"
        case .werkstatt: "wrench.and.screwdriver.fill"
        case .reifen: "circle.circle.fill"
        case .pflege: "sparkles"
        case .parken: "parkingsign.circle.fill"
        case .sonstiges: "ellipsis.circle.fill"
        }
    }
}

/// Eine Ausgabe rund ums Auto, die von einer Person bezahlt wurde.
@Model
final class Expense {
    var date: Date
    var amount: Double
    var categoryRaw: String
    var note: String
    var paidBy: Person?

    init(date: Date, amount: Double, category: ExpenseCategory, note: String = "", paidBy: Person?) {
        self.date = date
        self.amount = amount
        self.categoryRaw = category.rawValue
        self.note = note
        self.paidBy = paidBy
    }

    var category: ExpenseCategory {
        get { ExpenseCategory(rawValue: categoryRaw) ?? .sonstiges }
        set { categoryRaw = newValue.rawValue }
    }
}

/// Eine Ausgleichszahlung zwischen zwei Personen (z. B. "Lisa hat Max 23,40 € überwiesen").
@Model
final class Payment {
    var date: Date
    var amount: Double
    var from: Person?
    var to: Person?

    init(date: Date = .now, amount: Double, from: Person?, to: Person?) {
        self.date = date
        self.amount = amount
        self.from = from
        self.to = to
    }
}
