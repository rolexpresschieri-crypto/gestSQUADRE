package com.ansmi.gestsquadre.kmp.push

import android.content.Context
import com.ansmi.gestsquadre.kmp.data.TocMessageStorage

object TocPushDelivery {
    fun deliver(
        context: Context,
        title: String,
        body: String,
    ) {
        val message = TocMessageStorage.formatDisplayMessage(title, body)
        TocMessageStorage(context.applicationContext).save(message)
        FcmPushBus.emit(title = title, body = body)
    }
}
