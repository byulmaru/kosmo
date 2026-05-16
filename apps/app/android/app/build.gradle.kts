plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "moe.kos.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "moe.kos"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.0.1"

        val oidcClientId = providers.environmentVariable("PUBLIC_OIDC_CLIENT_ID").orNull.orEmpty()
        val origin = providers.environmentVariable("PUBLIC_ORIGIN").orNull ?: "https://kos.moe"
        buildConfigField("String", "OIDC_CLIENT_ID", "\"$oidcClientId\"")
        buildConfigField("String", "WEB_ORIGIN", "\"$origin\"")
        manifestPlaceholders["usesCleartextTraffic"] = origin.startsWith("http://").toString()
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.12.1")
    implementation("androidx.browser:browser:1.9.0")
}
