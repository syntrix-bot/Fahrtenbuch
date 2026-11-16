import Foundation

extension Double {
    var euro: String { formatted(.currency(code: "EUR")) }
}

extension Int {
    var km: String { "\(formatted()) km" }
}

/// Liest eine Zahl wie "12,50" oder "12.50" ein.
func parseAmount(_ text: String) -> Double? {
    let cleaned = text
        .trimmingCharacters(in: .whitespaces)
        .replacingOccurrences(of: "€", with: "")
        .replacingOccurrences(of: ",", with: ".")
        .trimmingCharacters(in: .whitespaces)
    guard let value = Double(cleaned), value.isFinite else { return nil }
    return value
}

/// Liest einen Kilometerstand wie "123.456" oder "123 456" ein.
func parseOdometer(_ text: String) -> Int? {
    let digits = text.filter { $0.isASCII && $0.isNumber }
    return digits.isEmpty ? nil : Int(digits)
}
