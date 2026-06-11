package com.ansmi.gestsquadre.kmp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ansmi.gestsquadre.kmp.R
import com.ansmi.gestsquadre.kmp.ui.components.OpenGolfLogoBanner
import com.ansmi.gestsquadre.kmp.ui.theme.GlobalAppBackground

private val EaseOutCubic = CubicBezierEasing(0.33f, 1f, 0.68f, 1f)

private val BlackOpsOneFamily =
    FontFamily(Font(R.font.black_ops_one, FontWeight.Normal))

@Composable
fun LaunchSplashScreen() {
    val progress = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 4300, easing = EaseOutCubic),
        )
    }

    val logoScale = 0.34f + (0.68f * progress.value)
    val logoAlignY = -0.74f + (0.36f * progress.value)
    val titleAlpha =
        when {
            progress.value < 0.24f -> 0f
            progress.value > 0.9f -> 1f
            else -> (progress.value - 0.24f) / (0.9f - 0.24f)
        }
    val signatureAlpha =
        when {
            progress.value < 0.58f -> 0f
            else -> (progress.value - 0.58f) / (1f - 0.58f)
        }

    Box(modifier = Modifier.fillMaxSize()) {
        GlobalAppBackground()
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = BiasAlignment(0f, logoAlignY),
        ) {
            OpenGolfLogoBanner(
                modifier = Modifier.scale(logoScale),
                width = 286f,
            )
        }
        Text(
            text = "GESTIONE\nSQUADRE",
            modifier =
                Modifier
                    .align(Alignment.Center)
                    .padding(top = 246.dp)
                    .alpha(titleAlpha),
            textAlign = TextAlign.Center,
            fontFamily = BlackOpsOneFamily,
            style =
                TextStyle(
                    color = Color.White,
                    fontSize = 44.sp,
                    lineHeight = 46.sp,
                    fontWeight = FontWeight.Normal,
                    letterSpacing = 1.6.sp,
                    shadow = Shadow(color = Color.Black, blurRadius = 8f),
                ),
        )
        Surface(
            modifier =
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 38.dp)
                    .alpha(signatureAlpha),
            color = Color.Black.copy(alpha = 0.42f),
            shape = RoundedCornerShape(8.dp),
        ) {
            Text(
                text = "by R. Ronco",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                color = Color.White,
                fontSize = 18.sp,
                fontStyle = FontStyle.Italic,
                style = TextStyle(shadow = Shadow(color = Color.Black, blurRadius = 8f)),
            )
        }
    }
}
