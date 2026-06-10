/// Icone waypoint (allineate a backend `waypoint-icons.ts`).
class WaypointIcons {
  WaypointIcons._();

  static const defaultKey = 'buche';

  static String assetPath(String? iconKey) {
    switch ((iconKey ?? '').trim()) {
      case 'croce_rossa':
        return 'assets/waypoint_croce_rossa.png';
      case 'club_house':
        return 'assets/waypoint_club_house.png';
      case 'cancello_in':
        return 'assets/waypoint_cancello_in.png';
      case 'driving_range':
        return 'assets/waypoint_driving_range.png';
      case 'villaggio_comm':
        return 'assets/waypoint_villaggio_comm.png';
      case 'welcome':
        return 'assets/waypoint_welcome.png';
      case 'media_center':
        return 'assets/waypoint_media_center.png';
      case 'buche':
      case 'buca_golf':
      default:
        return 'assets/waypoint_buche.png';
    }
  }
}
