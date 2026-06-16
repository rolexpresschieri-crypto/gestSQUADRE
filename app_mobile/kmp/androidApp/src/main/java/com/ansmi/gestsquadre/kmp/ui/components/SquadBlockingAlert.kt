package com.ansmi.gestsquadre.kmp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ansmi.gestsquadre.kmp.ui.theme.TacticalRed

@Composable
fun SquadBlockingAlert(
    message: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = message,
        modifier =
            modifier
                .fillMaxWidth()
                .background(TacticalRed, RoundedCornerShape(10.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
        color = Color.White,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        textAlign = TextAlign.Center,
    )
}
