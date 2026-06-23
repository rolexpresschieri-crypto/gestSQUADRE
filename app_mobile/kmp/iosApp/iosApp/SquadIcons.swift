import UIKit

/// Icone squadra su mappa (PNG nel bundle). Allineato ad Android SquadIcons.kt.
enum SquadIcons {
    static func normalizeKey(_ raw: String?) -> String {
        let key = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if key.isEmpty { return "squadre_a_piedi" }
        switch key {
        case "nv_ansmi", "ansmi", "k9_nvansmi": return "logo_ansmi"
        case "rolexpress", "rolex_express", "role_xpress": return "logo_rolexpress"
        case "waypoint_toc", "toc", "t.o.c.": return "waypoint_toc"
        default:
            return key.replacingOccurrences(of: "-", with: "_")
        }
    }

    static func bundleImageName(forKey iconKey: String?) -> String {
        let key = normalizeKey(iconKey)
        switch key {
        case "ambulanza": return "squad_ambulanza"
        case "coordinatore_cri": return "squad_coordinatore_cri"
        case "vigili_fuoco": return "squad_vigili_fuoco"
        case "forze_ordine": return "squad_forze_ordine"
        case "medico": return "squad_medico"
        case "fig": return "squad_fig"
        case "waypoint_toc": return "squad_waypoint_toc"
        case "logo_rolexpress": return "squad_logo_rolexpress"
        case "logo_ansmi": return "squad_logo_ansmi"
        case "squadre_a_piedi": return "squad_squadre_a_piedi"
        default:
            let candidate = "squad_\(key)"
            return UIImage(named: candidate) != nil ? candidate : "squad_squadre_a_piedi"
        }
    }
}
