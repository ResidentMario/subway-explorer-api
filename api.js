const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const moment = require('moment');
const logger = require('./logging.js').logger;

function locateStation(req, sequelize, Stops) {
    // Find the stop_id for a given (latitude, longitude) pair, route_id, and heading (N or S).
    // TODO: Add logging.

    const unix_ts = moment(req.query.time).unix();

    return Stops.findOne({
        attributes: [
            [
                sequelize.literal(
                    `ABS(${req.query.x} - stop_lon) + ABS(${req.query.y} - stop_lat)`
                ),
                'taxicab_dist'
            ],
            'stop_id', 'stop_name', 'stop_lat', 'stop_lon',
            'authority_start_time', 'authority_end_time'
        ],
        where: {
            authority_start_time: {[Op.lt]: [unix_ts]},
            authority_end_time: {[Op.gt]: [unix_ts]},
            route_id: {[Op.eq]: [req.query.line]}
        },
        order: [[sequelize.col('taxicab_dist'), 'ASC']],
        limit: 1
    }).then(result => {
        if (!result) { return {status: "TIMESTAMP_OUT_OF_RANGE"} }
        // Selecting the right stop sequence from the database requires that we get right not only the stop, but also
        // the heading of the stop. We already removed parent stops in the table generation pre-processing, so the
        // entries we get back from the query will only be "N" or "S". Since besides the heading the data for each of
        // the stations is otherwise equivalent, we'll deal with selecting the right ID by hot-swapping the last
        // character.
        else {
            result.dataValues.stop_id = result.dataValues.stop_id.slice(0, -1) + req.query.heading;
            return Object.assign(result, {status: "OK"});
        }
    });
}

function pollTravelTimes(req, sequelize, Logbooks) {
    req.query.timestamps = req.query.timestamps.split("|").map(ts => moment(ts).unix());

    let result_set = req.query.timestamps.map(function(ts) {
        return _pollTravelTime(req.query.start, req.query.end, ts, req.query.line, Array(), sequelize, Logbooks);
    });

    // Remove stops before the first stop from the result. Stops that occurred after the last stop were already removed
    // in the `_fastestSubsequence` subroutine of the `_pollTravelTime` call. Stops that occurred before cannot be
    // removed until just before returning (here) however, due to the recursive nature of the algorithm.
    return Promise.all(result_set).then(result_set => result_set);
}

function _pollTravelTime(start, end, ts, line, ignore, sequelize, Logbooks) {
    // Subroutine. Uses fastestSubsequence to return the trip on the given route which has the earliest start time
    // after the given ts, and also ensures that said trip occurred within one hour of the given timestamp.
    //
    // This approach is used to model a reasonable arrival time estimate (when the trains are running normally) while
    // backing out of estimating unreasonable ones (when trains are rerouted onto different lines, e.g. not running) in
    // a computationally tractable way.
    //
    // An additional bit of sophistication is required for cases where the stop of interest is also the last one in the
    // message.
    let subseq = _fastestSubsequence(start, ts, line, ignore, sequelize, Logbooks);

    return subseq.then(function(subseq) {
        if (subseq.length === 0) {

            // If no trips were found, return an empty result container.
            logger.info(`No matching trips were found. Aborting with NO_TRIPS_FOUND.`);
            return {status: "NO_TRIPS_FOUND", results: {}};

        } else if ((+subseq[0].dataValues.maximum_time - ts) >= 3600) {

            // If the trip found begins an hour or longer after the current timestamp, there is a high probability
            // that variant service is in effect. Our model can't return reasonable results in this case, so instead we
            // return a flag. Note that we must use maximum time here because minimum time may be null.
            logger.info(
                `This trip left station ${start} at ${+subseq[0].dataValues.maximum_time} ` +
                `(${moment.unix(subseq[0].dataValues.maximum_time).utcOffset(-5).format()}), ` +
                `${(+subseq[0].dataValues.maximum_time - ts)} seconds after we arrived. ` +
                `This wait time was too long, aborting with POSSIBLE_SERVICE_VARIATION.`);
            return {status: "POSSIBLE_SERVICE_VARIATION", results: {}};

        } else if (subseq.map(s => s.dataValues.stop_id).some(s => (s === end))) {

            // If the closest sub-sequence we discovered includes the desired end stop, we are done.
            let idx_start = subseq.findIndex(s => s.dataValues.stop_id === start);
            let idx_end = subseq.findIndex(s => s.dataValues.stop_id === end);
            subseq = subseq.filter((s, idx) => (idx <= idx_end) & (idx_start <= idx));

            logger.info(
                `This trip reached the requested endpoint station ${end} by time ${subseq[subseq.length - 1].maximum_time} ` +
                `(${moment.unix(subseq[subseq.length - 1].maximum_time).utcOffset(-5).format()}). Returning with OK.`
            );
            return {status: "OK", results: subseq};

        } else {

            // Otherwise, we must try to find a new sub-sequence, starting from where the old one left off. In this
            // case the information time is a safe join time (`minimum_time` may be undefined, and `maximum_time` may
            // be far away from `minimum_time` in the case of e.g. delays).
            let end_record = subseq[subseq.length - 1];
            let [new_start, new_ts] = [end_record.dataValues.stop_id, +end_record.dataValues.latest_information_time];

            logger.info(
                `This trip terminated at probable intermediate station ${end_record.dataValues.stop_id} by time ` +
                `${end_record.dataValues.latest_information_time} ` +
                `(${moment.unix(+end_record.dataValues.latest_information_time).utcOffset(-5).format()}). ` +
                `Adding to ignore list and recursively polling again.`
            );

            ignore.push(end_record.dataValues.unique_trip_id);

            return _pollTravelTime(new_start, end, new_ts, line, ignore, sequelize, Logbooks).then(
                function(next_subseq) {
                    if ((next_subseq.status === "NO_TRIPS_FOUND") ||
                        (next_subseq.status === "POSSIBLE_SERVICE_VARIATION")) {
                        return {status: next_subseq.status, results: []}
                    } else {
                        let idx_start = subseq.findIndex(s => s.dataValues.stop_id === start);
                        let idx_end = subseq.findIndex(s => s.dataValues.stop_id === new_start) - 1;
                        subseq = subseq.filter((s, idx) => (idx <= idx_end) & (idx_start <= idx));
                        return {status: next_subseq.status, results: subseq.concat(next_subseq.results)};
                    }
                });
        }
    });
}

function _fastestSubsequence(start, ts, route, ignore, sequelize, Logbooks) {
    // Subroutine. Returns the trip on the given route which has the earliest start time after the given ts.
    logger.info(
        `Requesting the next ${route} trip departing from station ${start} at time ${ts} ` +
        `(${moment.unix(ts).utcOffset(-5).format()}). Ignoring ${ignore.length} pre-explored trips.`
    );

    // We technically need the first train whose minimum arrival time is greater than the timestamp provided.
    // However the minimum arrival time is always null for the first station in a trip, as in this case it is
    // indeterminate. Due to this fact `minimum_time > ts` is not an option. Instead, we compare the `maximum_time`
    // (which is never null) against the input timestamp plus the window size (60 seconds for the MTA). The
    // reasoning being that if the train left the stop by time N and was not in the system at time N-1, it was
    // either accessible or soon-to-be-accessible to passengers arriving at time N-1.
    return Logbooks.findOne({
        attributes: ['unique_trip_id'],
        where: {
            maximum_time: {[Op.gt]: [ts + 60]},
            stop_id: {[Op.eq]: [start]},
            route_id: {[Op.eq]: [route]},
            unique_trip_id: {[Op.notIn]: [ignore]}
        },
        order: [[sequelize.col('maximum_time'), 'ASC']],
        limit: 1
    })
    .then(function(result) {

        if (!result) {
            return [];
        }  // The empty list is turned into a NO_TRIPS_FOUND status upstream.

        logger.info(`Found matching trip with unique_trip_id ${result.unique_trip_id}.`);
        return Logbooks.findAll({
            where: {
                unique_trip_id: {[Op.eq]: [result.unique_trip_id]}
            },
            order: [[sequelize.col('maximum_time'), 'ASC']]
        })
    })
}

// Externally facing.
exports.locateStation = locateStation;
exports.pollTravelTimes = pollTravelTimes;

// Exported for testing.
exports._fastestSubsequence = _fastestSubsequence;
exports._pollTravelTime = _pollTravelTime;