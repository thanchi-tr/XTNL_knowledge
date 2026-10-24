package com.xtnl.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.xtnl.app.BuildConfig
import com.xtnl.app.core.ServerAddress
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.security.KeyStore
import java.time.Instant
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

enum class ThemeChoice(val label: String) { SYSTEM("System"), NIGHT("Night"), VELLUM("Vellum") }

/** Full: every effect. Calm: no particles or flights, short fades. Still: nothing moves. */
enum class MotionChoice(val label: String) { FULL("Full"), CALM("Calm"), STILL("Still") }

data class Prefs(
    val server: String,
    /** A token is saved for [server] (each address keeps its own, and none is sent to another). */
    val hasToken: Boolean,
    val theme: ThemeChoice = ThemeChoice.NIGHT,
    val motion: MotionChoice = MotionChoice.FULL,
    val sound: Boolean = true,
    val haptics: Boolean = true,
    val demo: Boolean = false,
    /** Settings › Notifications › Week audit: the Sunday 19:00 (Sydney) reminder (D37; core/AuditAlarm). */
    val auditReminder: Boolean = true,
    /**
     * The last /check from the server said `auditOn`: its audit is switched on (never set from demo data). Cleared
     * when the source changes (another address, or demo data on or off): the next server /check sets it again.
     */
    val auditLive: Boolean = false,
    /** The notification permission (Android 13+) was asked for once; the app never asks again by itself. */
    val notifyAsked: Boolean = false,
    /** Settings › Health Connect (blueprint P27, D22): walks, hikes and weight read from Health Connect. Off until the user turns it on. */
    val healthSync: Boolean = false,
    /** When it was switched on (ISO): a walk that started before it is the backfill, recorded on the server, never paid. */
    val healthSince: String? = null,
    /** The last sync that reached the server (ISO) and its line; the last try (ISO) and why it didn't land (null when it did). */
    val healthLastAt: String? = null,
    val healthLine: String? = null,
    val healthTriedAt: String? = null,
    val healthError: String? = null,
)

/**
 * The app's settings, in one SharedPreferences file. The API token is never
 * stored in the clear: it is sealed with an AES-256-GCM key that lives in the
 * Android Keystore (the same thing EncryptedSharedPreferences does, without
 * that now-deprecated library), and only "a token is saved" is ever shown.
 * A token belongs to the address it was saved for, so switching the address
 * (Local dev, a typo) never sends it anywhere else. Sealed tokens have their
 * own file, which backups and phone transfers leave out
 * (res/xml/data_extraction_rules.xml): the Keystore key never moves with them.
 */
class AppSettings(context: Context) {
    private val prefs = context.getSharedPreferences("xtnl.settings", Context.MODE_PRIVATE)
    private val tokens = context.getSharedPreferences("xtnl.tokens", Context.MODE_PRIVATE)
    private val vault = TokenVault()

    private val _state = MutableStateFlow(load(context))
    val state: StateFlow<Prefs> = _state.asStateFlow()

    /** The decrypted token and the address it is for, cached for the session (a null token = none). */
    @Volatile private var tokenCache: Pair<String, String?>? = null

    private fun load(context: Context): Prefs {
        // The WebView shell (v1) kept a custom address in "xtnl"/"url". Carry an https one over once.
        if (!prefs.contains(K_SERVER)) {
            val old = context.getSharedPreferences("xtnl", Context.MODE_PRIVATE).getString("url", null)
            val migrated = old?.takeIf { it.startsWith("https://") }?.let { ServerAddress.normalize(it) }
            if (migrated != null) prefs.edit().putString(K_SERVER, migrated).apply()
        }
        val server = prefs.getString(K_SERVER, null)?.let { ServerAddress.normalize(it) } ?: defaultServer()
        // A token saved before each address had its own was saved for the address in use now.
        prefs.getString(K_TOKEN_OLD, null)?.let { old ->
            if (!tokens.contains(tokenKey(server))) tokens.edit().putString(tokenKey(server), old).apply()
            prefs.edit().remove(K_TOKEN_OLD).apply()
        }
        return Prefs(
            server = server,
            hasToken = tokens.contains(tokenKey(server)),
            theme = enumOr(prefs.getString(K_THEME, null), ThemeChoice.NIGHT),
            motion = enumOr(prefs.getString(K_MOTION, null), MotionChoice.FULL),
            sound = prefs.getBoolean(K_SOUND, true),
            haptics = prefs.getBoolean(K_HAPTICS, true),
            demo = prefs.getBoolean(K_DEMO, false),
            auditReminder = prefs.getBoolean(K_AUDIT_REMINDER, true),
            auditLive = prefs.getBoolean(K_AUDIT_LIVE, false),
            notifyAsked = prefs.getBoolean(K_NOTIFY_ASKED, false),
            healthSync = prefs.getBoolean(K_HEALTH_SYNC, false),
            healthSince = prefs.getString(K_HEALTH_SINCE, null),
            healthLastAt = prefs.getString(K_HEALTH_LAST, null),
            healthLine = prefs.getString(K_HEALTH_LINE, null),
            healthTriedAt = prefs.getString(K_HEALTH_TRIED, null),
            healthError = prefs.getString(K_HEALTH_ERROR, null),
        )
    }

    fun defaultServer(): String = ServerAddress.normalize(BuildConfig.DEFAULT_SERVER) ?: ServerAddress.PRODUCTION

    fun setServer(origin: String) {
        // The audit's switch was the old address's: it waits for this one's first /check (the Sunday reminder with it).
        val moved = origin != _state.value.server
        val edit = prefs.edit().putString(K_SERVER, origin)
        if (moved) edit.putBoolean(K_AUDIT_LIVE, false)
        // Health Connect (P27): another server reads the whole window again (it answers what it has as duplicates).
        if (moved) edit.remove(K_HEALTH_LAST).remove(K_HEALTH_LINE).remove(K_HEALTH_ERROR)
        edit.apply()
        _state.update {
            it.copy(
                server = origin, hasToken = tokens.contains(tokenKey(origin)), auditLive = if (moved) false else it.auditLive,
                healthLastAt = if (moved) null else it.healthLastAt, healthLine = if (moved) null else it.healthLine, healthError = if (moved) null else it.healthError,
            )
        }
    }

    fun setTheme(t: ThemeChoice) { prefs.edit().putString(K_THEME, t.name).apply(); _state.update { it.copy(theme = t) } }
    fun setMotion(m: MotionChoice) { prefs.edit().putString(K_MOTION, m.name).apply(); _state.update { it.copy(motion = m) } }
    fun setSound(on: Boolean) { prefs.edit().putBoolean(K_SOUND, on).apply(); _state.update { it.copy(sound = on) } }
    fun setHaptics(on: Boolean) { prefs.edit().putBoolean(K_HAPTICS, on).apply(); _state.update { it.copy(haptics = on) } }
    /** Demo data on or off changes the source: the audit's switch waits for the server's next /check (demo never sets it). */
    fun setDemo(on: Boolean) {
        val moved = on != _state.value.demo
        val edit = prefs.edit().putBoolean(K_DEMO, on)
        if (moved) edit.putBoolean(K_AUDIT_LIVE, false)
        if (moved) edit.remove(K_HEALTH_LAST).remove(K_HEALTH_LINE).remove(K_HEALTH_ERROR)
        edit.apply()
        _state.update {
            it.copy(
                demo = on, auditLive = if (moved) false else it.auditLive,
                healthLastAt = if (moved) null else it.healthLastAt, healthLine = if (moved) null else it.healthLine, healthError = if (moved) null else it.healthError,
            )
        }
    }

    /**
     * Settings › Health Connect (P27). Turning it on starts the history at [now] (`since`: what came before is the
     * backfill, recorded only) and forgets the last sync, so the first one reads the 30 days Health Connect allows.
     */
    fun setHealthSync(on: Boolean, now: Instant) {
        val edit = prefs.edit().putBoolean(K_HEALTH_SYNC, on)
        if (on) edit.putString(K_HEALTH_SINCE, now.toString()).remove(K_HEALTH_LAST).remove(K_HEALTH_LINE).remove(K_HEALTH_TRIED).remove(K_HEALTH_ERROR)
        edit.apply()
        _state.update {
            if (on) it.copy(healthSync = true, healthSince = now.toString(), healthLastAt = null, healthLine = null, healthTriedAt = null, healthError = null)
            else it.copy(healthSync = false)
        }
    }

    /** A sync reached the server at [at]: its line, and no error. */
    fun setHealthSynced(at: Instant, line: String?) {
        prefs.edit().putString(K_HEALTH_LAST, at.toString()).putString(K_HEALTH_TRIED, at.toString()).putString(K_HEALTH_LINE, line).remove(K_HEALTH_ERROR).apply()
        _state.update { it.copy(healthLastAt = at.toString(), healthTriedAt = at.toString(), healthLine = line, healthError = null) }
    }

    /** A try at [at] that didn't land, and why (the server's line, or the reason it couldn't read). */
    fun setHealthFailed(at: Instant, error: String) {
        prefs.edit().putString(K_HEALTH_TRIED, at.toString()).putString(K_HEALTH_ERROR, error).apply()
        _state.update { it.copy(healthTriedAt = at.toString(), healthError = error) }
    }
    fun setAuditReminder(on: Boolean) { prefs.edit().putBoolean(K_AUDIT_REMINDER, on).apply(); _state.update { it.copy(auditReminder = on) } }
    fun setAuditLive(on: Boolean) { prefs.edit().putBoolean(K_AUDIT_LIVE, on).apply(); _state.update { it.copy(auditLive = on) } }
    fun setNotifyAsked() { prefs.edit().putBoolean(K_NOTIFY_ASKED, true).apply(); _state.update { it.copy(notifyAsked = true) } }

    /** The token for the address in use, or null. It may wait on the Keystore: call it off the main thread. */
    fun token(): String? {
        val origin = _state.value.server
        tokenCache?.let { (o, t) -> if (o == origin) return t }
        val sealed = tokens.getString(tokenKey(origin), null)
        if (sealed == null) {
            tokenCache = origin to null
            return null
        }
        return when (val r = vault.open(sealed)) {
            is TokenVault.Opened.Token -> r.value.also { tokenCache = origin to it }
            TokenVault.Opened.Lost -> {
                // This phone's key can't open it (copied from another phone, a reset key): it is gone, and Settings says so.
                tokens.edit().remove(tokenKey(origin)).apply()
                tokenCache = origin to null
                _state.update { if (it.server == origin) it.copy(hasToken = false) else it }
                null
            }
            // A Keystore hiccup: no token on this call, and the next one tries again.
            TokenVault.Opened.Failed -> null
        }
    }

    /** Saves the token for the address in use (blank = remove it). Returns false when the Keystore refused. Off the main thread. */
    fun setToken(token: String?): Boolean {
        val origin = _state.value.server
        val t = token?.trim().orEmpty()
        if (t.isEmpty()) {
            tokens.edit().remove(tokenKey(origin)).apply()
            tokenCache = origin to null
            _state.update { if (it.server == origin) it.copy(hasToken = false) else it }
            return true
        }
        val sealed = vault.seal(t) ?: return false
        tokens.edit().putString(tokenKey(origin), sealed).apply()
        tokenCache = origin to t
        _state.update { if (it.server == origin) it.copy(hasToken = true) else it }
        return true
    }

    private fun tokenKey(origin: String) = "sealed:$origin"

    private inline fun <reified E : Enum<E>> enumOr(name: String?, fallback: E): E =
        runCatching { enumValueOf<E>(name ?: "") }.getOrDefault(fallback)

    private companion object {
        const val K_SERVER = "server"
        /** Where the one token lived before each address had its own. */
        const val K_TOKEN_OLD = "token.sealed"
        const val K_THEME = "theme"
        const val K_MOTION = "motion"
        const val K_SOUND = "sound"
        const val K_HAPTICS = "haptics"
        const val K_DEMO = "demo"
        const val K_AUDIT_REMINDER = "audit.reminder"
        const val K_AUDIT_LIVE = "audit.live"
        const val K_NOTIFY_ASKED = "notify.asked"
        const val K_HEALTH_SYNC = "health.sync"
        const val K_HEALTH_SINCE = "health.since"
        const val K_HEALTH_LAST = "health.last"
        const val K_HEALTH_LINE = "health.line"
        const val K_HEALTH_TRIED = "health.tried"
        const val K_HEALTH_ERROR = "health.error"
    }
}

/** AES-GCM with a non-exportable Keystore key: seal → "iv:ciphertext" in Base64. */
private class TokenVault {
    private val alias = "xtnl.api.token"

    private fun key(): SecretKey? = runCatching {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: run {
            val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            gen.init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            gen.generateKey()
        }
    }.getOrNull()

    fun seal(plain: String): String? = runCatching {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key() ?: return null)
        val iv = Base64.encodeToString(c.iv, Base64.NO_WRAP)
        val ct = Base64.encodeToString(c.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        "$iv:$ct"
    }.getOrNull()

    sealed interface Opened {
        data class Token(val value: String) : Opened
        /** It can never be opened on this phone: no key, another key, or a damaged entry. */
        data object Lost : Opened
        /** The Keystore failed this time. */
        data object Failed : Opened
    }

    fun open(sealed: String): Opened {
        // Only the key that sealed it can open it: never make a new one here.
        val key = try {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey
        } catch (e: Exception) {
            return Opened.Failed
        } ?: return Opened.Lost
        val parts = sealed.split(':', limit = 2).takeIf { it.size == 2 } ?: return Opened.Lost
        return try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            Opened.Token(String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
        } catch (e: AEADBadTagException) {
            Opened.Lost
        } catch (e: IllegalArgumentException) {
            Opened.Lost // not Base64
        } catch (e: Exception) {
            Opened.Failed
        }
    }
}
