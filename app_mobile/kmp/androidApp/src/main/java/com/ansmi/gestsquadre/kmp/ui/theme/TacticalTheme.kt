package com.ansmi.gestsquadre.kmp.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

private val TacticalColorScheme = darkColorScheme(
    primary = TacticalGreen,
    secondary = TacticalYellow,
    error = TacticalRed,
    background = BrandBase,
    surface = BrandBase,
    onPrimary = Color.White,
    onSecondary = Color.Black,
    onBackground = Color.White,
    onSurface = Color.White,
)

@Composable
fun TacticalTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TacticalColorScheme,
        content = content,
    )
}

@Composable
fun GlobalAppBackground(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BrandBase),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(BrandTint.copy(alpha = BrandBackgroundAlpha)),
        )
    }
}
