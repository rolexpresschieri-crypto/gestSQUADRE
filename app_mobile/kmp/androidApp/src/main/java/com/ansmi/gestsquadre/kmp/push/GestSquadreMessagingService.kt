package com.ansmi.gestsquadre.kmp.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class GestSquadreMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.tocTitle()
        val body = message.tocBody()
        val isAlarm = message.isTocAlarm()

        TocPushDelivery.deliver(
            context = applicationContext,
            title = title,
            body = body,
        )
        FcmManager(applicationContext).showLocalNotification(
            title = title,
            body = body,
            isAlarm = isAlarm,
        )
    }

    override fun onNewToken(token: String) {
        FcmSessionRegistry.deliverNewToken(token)
    }
}
