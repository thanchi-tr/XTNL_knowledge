package com.xtnl.app.core

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

object Fmt {
    /** 8.3 → "8.3", 8.0 → "8", 0.25 → "0.3" (one decimal at most). */
    fun figure(v: Double, dp: Int = 1): String {
        val scale = Math.pow(10.0, dp.toDouble())
        val r = (abs(v) * scale).roundToLong() / scale
        return if (r % 1.0 == 0.0) r.toLong().toString() else String.format(Locale.ENGLISH, "%.${dp}f", r).trimEnd('0').trimEnd('.')
    }

    /** "+4.2", "−3.8" (a true minus), "0". */
    fun signed(v: Double, dp: Int = 1): String = when {
        v > 0 -> "+" + figure(v, dp)
        v < 0 -> "−" + figure(v, dp)
        else -> "0"
    }

    fun plural(n: Int, one: String, many: String = one + "s") = "$n ${if (n == 1) one else many}"
}
