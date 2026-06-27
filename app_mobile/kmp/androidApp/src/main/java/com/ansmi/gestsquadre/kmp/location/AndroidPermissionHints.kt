package com.ansmi.gestsquadre.kmp.location

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat

object AndroidPermissionHints {
  const val UNUSED_APP_PERMISSIONS_HINT =
      "Android: Impostazioni → gestSQUADRE → «Gestisci l'app se inutilizzata» → " +
          "disattiva «Rimuovi le autorizzazioni se l'app non viene usata», " +
          "altrimenti il telefono toglie GPS e notifiche da solo."

  const val PERMISSIONS_REVOKED_HINT =
      "Permessi rimossi (spesso per «app inutilizzata»). " +
          "Riattiva Posizione e Notifiche; disattiva «Rimuovi le autorizzazioni…» come sopra."

  fun hasPostNotifications(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return true
    }
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
  }

  fun hasRequiredRuntimePermissions(context: Context): Boolean =
      GpsLocationPermissions.hasFineLocation(context) && hasPostNotifications(context)

  fun openAppDetailsSettings(context: Context) {
    val intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.fromParts("package", context.packageName, null)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    context.startActivity(intent)
  }
}
