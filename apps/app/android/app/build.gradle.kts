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

        val oidcClientId = providers.gradleProperty("kosmo.oidcClientId").orNull.orEmpty()
        buildConfigField("String", "OIDC_CLIENT_ID", "\"$oidcClientId\"")
        buildConfigField("String", "WEB_ORIGIN", "\"https://kos.moe\"")
    }

    buildFeatures {
        buildConfig = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.12.1")
    implementation("androidx.browser:browser:1.9.0")
}
