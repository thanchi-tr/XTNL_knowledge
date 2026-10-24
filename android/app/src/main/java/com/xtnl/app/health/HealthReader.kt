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
 * Health Connect, read only (blueprint P27): walking and hiking sessions with the distance and climb their own app
 * recorded inside them, and weigh-ins. Nothing is ever written to Health Connect, and nothing else is read. Every call
 * needs Health Connect on the phone ([availability]) and its permission ([granted]); a missing one throws
 * SecurityException, which HealthSync turns into Settings' line.
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
     * The walking and hiking sessions that started in [from, to), each with the distance (and, when allowed, the climb)
     * that its own app recorded inside it, so another app's steps or a car journey never add to it.
     */
    suspend fun sessions(from: Instant, to: Instant, climb: Boolean): List<HealthLine.Session> {
        val out = mutableListOf<HealthLine.Session>()
        var page: String? = null
        do {
            val res = client().readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(from, to), pageToken = page))
            for (r in res.records) {
                if (HealthLine.kindOf(r.exerciseType) == null) continue
                val within = TimeRangeFilter.between(r.startTime, r.endTime)
                val origin = setOf(r.metadata.dataOrigin)
                val distance = client().aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), within, origin))[DistanceRecord.DISTANCE_TOTAL]
                val gained = if (climb) {
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
