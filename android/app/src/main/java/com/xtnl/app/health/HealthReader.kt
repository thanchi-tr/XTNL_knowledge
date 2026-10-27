package com.xtnl.app.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.feature.ExperimentalFeatureAvailabilityApi
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.xtnl.app.core.HealthLine
import java.time.Instant

/**
 * Health Connect, read only (blueprint P27; D21): exercise sessions with the distance (and a hike's climb) their own
 * app recorded inside them, and weigh-ins. Nothing is ever written to Health Connect, and nothing else is read: the
 * sessions are ExerciseSessionRecord (READ_EXERCISE covers every type), their distance and climb the records walks
 * always read. Every call needs Health Connect on the phone ([availability]) and its permission ([granted]); a missing
 * one throws SecurityException, which HealthSync turns into Settings' line.
 */
class HealthReader(private val context: Context) {

    fun availability(): HealthLine.Availability = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HealthLine.Availability.AVAILABLE
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthLine.Availability.NEEDS_UPDATE
        else -> HealthLine.Availability.UNAVAILABLE
    }

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    suspend fun granted(): Set<String> = client().permissionController.getGrantedPermissions()

    /** Android 15+: Health Connect lets an app read while it is closed, once the user allows it. */
    @OptIn(ExperimentalFeatureAvailabilityApi::class)
    fun backgroundAvailable(): Boolean = runCatching {
        client().features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    }.getOrDefault(false)

    /**
     * The exercise sessions that started in [from, to). A walk, a hike, a run, a ride, a swim or a row comes with the
     * distance (and a walk or a hike, when allowed, with the climb) that its own app recorded inside it, so another
     * app's steps or a car journey never add to it. Any other kind needs no distance, so nothing more is read for it,
     * and a type the sync doesn't map comes back bare, only to be counted (HealthLine.skippedUnread), never sent.
     */
    suspend fun sessions(from: Instant, to: Instant, climb: Boolean): List<HealthLine.Session> {
        val out = mutableListOf<HealthLine.Session>()
        var page: String? = null
        do {
            val res = client().readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(from, to), pageToken = page))
            for (r in res.records) {
                if (!HealthLine.readsDistance(r.exerciseType)) {
                    out += HealthLine.Session(r.metadata.id, r.exerciseType, r.startTime, r.endTime, null, null, r.metadata.dataOrigin.packageName)
                    continue
                }
                val within = TimeRangeFilter.between(r.startTime, r.endTime)
                val origin = setOf(r.metadata.dataOrigin)
                val distance = client().aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), within, origin))[DistanceRecord.DISTANCE_TOTAL]
                val gained = if (climb && HealthLine.readsClimb(r.exerciseType)) {
                    runCatching { client().aggregate(AggregateRequest(setOf(ElevationGainedRecord.ELEVATION_GAINED_TOTAL), within, origin))[ElevationGainedRecord.ELEVATION_GAINED_TOTAL] }.getOrNull()
                } else null
                out += HealthLine.Session(
                    id = r.metadata.id,
                    type = r.exerciseType,
                    start = r.startTime,
                    end = r.endTime,
                    distanceM = distance?.inMeters,
                    climbM = gained?.inMeters,
                    origin = r.metadata.dataOrigin.packageName,
                )
            }
            page = res.pageToken
        } while (page != null)
        return out
    }

    /** The weigh-ins in [from, to). */
    suspend fun weights(from: Instant, to: Instant): List<HealthLine.Weigh> {
        val out = mutableListOf<HealthLine.Weigh>()
        var page: String? = null
        do {
            val res = client().readRecords(ReadRecordsRequest(WeightRecord::class, TimeRangeFilter.between(from, to), pageToken = page))
            for (r in res.records) out += HealthLine.Weigh(r.metadata.id, r.time, r.weight.inKilograms)
            page = res.pageToken
        } while (page != null)
        return out
    }
}
