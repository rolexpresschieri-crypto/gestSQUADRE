import Foundation

enum WaypointIcons {
    static func imageName(for iconKey: String?) -> String {
        switch iconKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" {
        case "croce_rossa": return "waypoint_croce_rossa"
        case "club_house": return "waypoint_club_house"
        case "cancello_in": return "waypoint_cancello_in"
        case "driving_range": return "waypoint_driving_range"
        case "villaggio_comm": return "waypoint_villaggio_comm"
        case "welcome": return "waypoint_welcome"
        case "media_center": return "waypoint_media_center"
        case "toc": return "waypoint_toc"
        case "pma": return "waypoint_pma"
        case "buche", "buca_golf", "": return "waypoint_buche"
        default: return "waypoint_buche"
        }
    }
}
