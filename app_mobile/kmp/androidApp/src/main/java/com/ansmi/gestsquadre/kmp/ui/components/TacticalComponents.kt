package com.ansmi.gestsquadre.kmp.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ansmi.gestsquadre.kmp.R
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalFrame

private val WhiteTextShadow = TextStyle(
    shadow = Shadow(color = Color.Black, blurRadius = 8f),
)

private val WhiteTitleStyle = TextStyle(
    color = Color.White,
    fontWeight = FontWeight.ExtraBold,
    shadow = Shadow(color = Color.Black, blurRadius = 8f),
)

private val WhiteBodyStyle = TextStyle(
    color = Color.White,
    fontWeight = FontWeight.SemiBold,
    shadow = Shadow(color = Color.Black, blurRadius = 8f),
)

@Composable
fun TacticalShell(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(42.dp))
                .border(3.dp, TacticalFrame, RoundedCornerShape(42.dp)),
            shape = RoundedCornerShape(42.dp),
            color = Color.Transparent,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 18.dp),
            ) {
                content()
            }
        }
    }
}

@Composable
fun MainButton(
    label: String,
    backgroundColor: Color,
    foregroundColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    fontWeight: FontWeight = FontWeight.ExtraBold,
) {
    Button(
        onClick = { onClick?.invoke() },
        enabled = onClick != null,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = backgroundColor,
            contentColor = foregroundColor,
            disabledContainerColor = backgroundColor,
            disabledContentColor = foregroundColor,
        ),
        contentPadding = PaddingValues(vertical = 16.dp),
    ) {
        Text(
            text = label,
            textAlign = TextAlign.Center,
            fontSize = 18.sp,
            fontWeight = fontWeight,
        )
    }
}

@Composable
fun OpenGolfLogoBanner(
    modifier: Modifier = Modifier,
    width: Float? = null,
) {
    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val resolvedWidth = width ?: (maxWidth.value * 0.92f).coerceAtMost(260f)
        val aspect = 840f / 200f
        val heightDp = (resolvedWidth / aspect).dp
        Surface(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .width(resolvedWidth.dp)
                .shadow(10.dp, RoundedCornerShape(10.dp))
                .clip(RoundedCornerShape(10.dp)),
            color = Color.White,
            shape = RoundedCornerShape(10.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.logo_open_golf_2026),
                contentDescription = "Open d'Italia 2026",
                modifier = Modifier
                    .padding(start = 5.dp, end = 11.dp, top = 5.dp, bottom = 5.dp)
                    .width((resolvedWidth - 16f).dp)
                    .height(heightDp + 4.dp),
                contentScale = ContentScale.FillWidth,
                alignment = BiasAlignment(-0.1f, 0f),
            )
        }
    }
}

@Composable
fun AppTitleBlock(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        OpenGolfLogoBanner()
        Text(
            text = "Tracking",
            textAlign = TextAlign.Center,
            style = WhiteTitleStyle.copy(fontSize = 32.sp, letterSpacing = 0.8.sp),
            modifier = Modifier.padding(top = 18.dp),
        )
        Text(
            text = "SQUADRE",
            textAlign = TextAlign.Center,
            style = WhiteTitleStyle.copy(
                fontSize = 36.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.4.sp,
            ),
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
fun TacticalTitleText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 24,
) {
    Text(
        text = text,
        modifier = modifier,
        textAlign = TextAlign.Center,
        style = WhiteTitleStyle.copy(fontSize = fontSize.sp),
    )
}

@Composable
fun TacticalBodyText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 14,
    color: Color = Color.White,
) {
    Text(
        text = text,
        modifier = modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
        style = WhiteBodyStyle.copy(fontSize = fontSize.sp, color = color),
    )
}
