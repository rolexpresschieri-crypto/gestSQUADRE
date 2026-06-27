plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.compose.compiler)
}

val definesFile = rootProject.file("../gest_squadre/dart-defines.json")
fun defineValue(key: String): String {
    if (!definesFile.exists()) {
        return ""
    }
    val pattern = """"$key"\s*:\s*"([^"]*)"""".toRegex()
    return pattern.find(definesFile.readText())?.groupValues?.get(1)?.trim().orEmpty()
}

val supabaseUrl = defineValue("SUPABASE_URL")
val supabaseAnonKey = defineValue("SUPABASE_ANON_KEY")
val firebaseApiKey =
    defineValue("FIREBASE_ANDROID_API_KEY").ifBlank { "AIzaSyACHMCXgKkzzOh6mfiB6YfO9SznuGst8mQ" }
val firebaseAppId =
    defineValue("FIREBASE_ANDROID_APP_ID").ifBlank { "1:250732909266:android:e338fd154ee75aba39d30b" }
val firebaseSenderId =
    defineValue("FIREBASE_MESSAGING_SENDER_ID").ifBlank { "250732909266" }
val firebaseProjectId =
    defineValue("FIREBASE_PROJECT_ID").ifBlank { "allarme-app-2026-b9f74" }
val firebaseStorageBucket =
    defineValue("FIREBASE_STORAGE_BUCKET").ifBlank { "allarme-app-2026-b9f74.firebasestorage.app" }
val tocBackendUrl = defineValue("TOC_BACKEND_URL").ifBlank { "https://gest-squadre.vercel.app" }

android {
    namespace = "com.ansmi.gestsquadre.kmp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ansmi.gest_squadre"
        minSdk = 24
        targetSdk = 35
        versionCode = 32
        versionName = "1.0.32"
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "FIREBASE_ANDROID_API_KEY", "\"$firebaseApiKey\"")
        buildConfigField("String", "FIREBASE_ANDROID_APP_ID", "\"$firebaseAppId\"")
        buildConfigField("String", "FIREBASE_MESSAGING_SENDER_ID", "\"$firebaseSenderId\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"$firebaseProjectId\"")
        buildConfigField("String", "FIREBASE_STORAGE_BUCKET", "\"$firebaseStorageBucket\"")
        buildConfigField("String", "TOC_BACKEND_URL", "\"$tocBackendUrl\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation("androidx.compose.material:material-icons-extended")
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.kotlinx.coroutines.core)
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
    implementation("org.osmdroid:osmdroid-android:6.1.18")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.1")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("androidx.core:core-ktx:1.15.0")
}
