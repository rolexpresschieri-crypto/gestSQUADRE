class SquadSession {
  const SquadSession({
    required this.sessionId,
    required this.eventId,
    required this.squadId,
    required this.squadCode,
    required this.squadName,
    required this.loginAt,
    this.canOpenOperationalEvent = false,
  });

  final String sessionId;
  final String eventId;
  final String squadId;
  final String squadCode;
  final String squadName;
  final DateTime loginAt;
  final bool canOpenOperationalEvent;
}

class EventInfo {
  const EventInfo({required this.id, required this.title});

  final String id;
  final String title;
}
