/** Payload APNs per FCM su iPhone (Ad Hoc / TestFlight / App Store = production). */
export function fcmIosApnsPayload(title: string, body: string) {
  return {
    headers: {
      "apns-priority": "10",
    },
    payload: {
      aps: {
        alert: {
          title,
          body,
        },
        sound: "default",
        "content-available": 1,
      },
    },
  };
}

export function fcmIosApnsSilentPayload() {
  return {
    headers: {
      "apns-priority": "10",
    },
    payload: {
      aps: {
        "content-available": 1,
      },
    },
  };
}
