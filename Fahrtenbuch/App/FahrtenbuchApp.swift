import SwiftData
import SwiftUI

@main
struct FahrtenbuchApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [Person.self, Trip.self, Expense.self, Payment.self])
    }
}

struct RootView: View {
    @Query(sort: \Person.order) private var people: [Person]

    var body: some View {
        if people.count < 2 {
            OnboardingView()
        } else {
            TabView {
                OverviewView()
                    .tabItem { Label("Übersicht", systemImage: "chart.pie.fill") }
                TripsView()
                    .tabItem { Label("Fahrten", systemImage: "car.fill") }
                ExpensesView()
                    .tabItem { Label("Kosten", systemImage: "eurosign.circle.fill") }
                SettingsView()
                    .tabItem { Label("Einstellungen", systemImage: "gearshape.fill") }
            }
        }
    }
}
