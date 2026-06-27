const operationalEventActivatorSuffixes = [
  '_01_AN',
  '_01_EN',
  '_01_RR',
  '_01_TOC',
  '_01_UN',
];

const operationalEventUnauthorizedMessage =
    'utente non autorizzato ad apertura eventi';

bool isOperationalEventActivatorSquad(String squadCode) {
  final code = squadCode.trim().toUpperCase();
  if (code.isEmpty) {
    return false;
  }
  for (final suffix in operationalEventActivatorSuffixes) {
    if (code.endsWith(suffix)) {
      return true;
    }
    final bare = suffix.substring(1);
    if (code == bare || code == 'GT$suffix') {
      return true;
    }
  }
  return false;
}
