package com.ansmi.gestsquadre.kmp.push

import com.ansmi.gestsquadre.kmp.data.TocMessageStorage
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class GestSquadreMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] == "toc_clear_panel") {
            TocMessageStorage(applicationContext).clear()
            FcmPushBus.emitPanelClear()
            return
        }

        if (message.isVolunteerAlarm()) {
            val title = message.tocTitle()
            val body = message.tocBody()
            FcmManager(applicationContext).showLocalNotification(
                title = title,
                body = body,
                isAlarm = true,
            )
            return
        }

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
