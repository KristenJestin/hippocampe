package fr.kristenjestin.hippocampe

import android.content.Context
import android.graphics.drawable.AdaptiveIconDrawable
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
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
    fun `the release, the beta and the debug build have their own application ids`() {
        val id = mapOf(
            "release" to "fr.kristenjestin.hippocampe",
            "beta" to "fr.kristenjestin.hippocampe.beta",
            "debug" to "fr.kristenjestin.hippocampe.debug",
        ).getValue(BuildConfig.BUILD_TYPE)
        assertEquals(id, context.packageName)
        assertEquals(id, BuildConfig.APPLICATION_ID)
        val name = mapOf("release" to "Hippocampe", "beta" to "Hippocampe Beta", "debug" to "Hippocampe Debug")
            .getValue(BuildConfig.BUILD_TYPE)
        assertEquals(name, context.getString(R.string.app_name))
    }

    @Test
    fun `the launcher icon is the horn on the dark of the icon, on the green for the beta`() {
        val background = if (BuildConfig.BUILD_TYPE == "beta") 0xFF5ED39A else 0xFF14120F
        assertEquals(background.toInt(), context.getColor(R.color.launcher_background))
        val icon = context.getDrawable(R.mipmap.ic_launcher) as AdaptiveIconDrawable
        assertNotNull("the horn in one colour, for themed icons", icon.monochrome)
        assertNotNull(icon.foreground)
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
