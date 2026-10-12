package fr.kristenjestin.hippocampe

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * What a build type is, checked on the variant being tested: `bun run test` runs this class on the
 * debug, beta and release variants (`testDebugUnitTest`, `testBetaUnitTest`, `testReleaseUnitTest`).
 */
@RunWith(RobolectricTestRunner::class)
class BuildTypesTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `the release and the beta have their own application ids`() {
        val id = mapOf(
            "release" to "fr.kristenjestin.hippocampe",
            "beta" to "fr.kristenjestin.hippocampe.beta",
            "debug" to "fr.kristenjestin.hippocampe",
        ).getValue(BuildConfig.BUILD_TYPE)
        assertEquals(id, context.packageName)
        assertEquals(id, BuildConfig.APPLICATION_ID)
        val name = if (BuildConfig.BUILD_TYPE == "beta") "Hippocampe Beta" else "Hippocampe"
        assertEquals(name, context.getString(R.string.app_name))
        assertEquals(
            "the beta looks other than the release in the launcher",
            BuildConfig.BUILD_TYPE == "beta",
            context.getColor(R.color.launcher_background) != 0xFF121212.toInt(),
        )
    }

    @Test
    fun `the release refuses plain http and the beta allows it`() {
        // The platform reads the file the manifest names; the file is the one of the variant.
        val config = context.applicationInfo.javaClass.getField("networkSecurityConfigRes").getInt(context.applicationInfo)
        assertNotEquals("the manifest names a network security config", 0, config)
        val base = context.resources.getXml(config).use { xml ->
            generateSequence { xml.next().takeIf { it != org.xmlpull.v1.XmlPullParser.END_DOCUMENT } }
                .first { xml.eventType == org.xmlpull.v1.XmlPullParser.START_TAG && xml.name == "base-config" }
                .let { xml.getAttributeValue(null, "cleartextTrafficPermitted") }
        }
        assertEquals(BuildConfig.BUILD_TYPE != "release", base.toBoolean())
    }
}
