package com.ansmi.gestsquadre.shared.network

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig

internal expect fun createPlatformHttpClient(
    config: HttpClientConfig<*>.() -> Unit,
): HttpClient
