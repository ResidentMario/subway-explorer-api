const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const moment = require('moment');


function locateStation(req, sequelize, Stops) {
    // Find the stop_id for a given latitude, longitude pair.
    // TODO: Compute the heading too.

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
            authority_end_time: {[Op.gt]: [unix_ts]}
        },
        order: [[sequelize.col('taxicab_dist'), 'ASC']],
        limit: 1
    });
}

function pollTravelTimes(req, sequelize, Logbooks) {
    req.query.timestamps = req.query.timestamps.split("|").map(ts => moment(ts).unix());

    // SELECT * FROM Logbooks WHERE unique_trip_id IN (SELECT unique_trip_id FROM Logbooks WHERE route_id = "6"
    // AND "stop_id" == "604S" AND minimum_time > 1516253092 ORDER BY minimum_time LIMIT 1);
    // http://localhost:3000/poll-travel-times/json?line=2&start=201N&end=231N&timestamps=2017-01-18T12:00|2017-01-18T12:30
    let result_set = req.query.timestamps.map(function(ts) {
        return pollTravelTime(req.query.start, req.query.end, ts, req.query.line, Array(), sequelize, Logbooks);
    });

    return Promise.all(result_set).then(result_set => { return result_set });
}

function pollTravelTime(start, end, ts, line, ignore, sequelize, Logbooks) {
    // Subroutine. Uses fastestSubsequence to return the trip on the given route which has the earliest start time
    // after the given ts, and also ensures that said trip occurred within one hour of the given timestamp.
    //
    // This approach is used to model a reasonable arrival time estimate (when the trains are running normally) while
    // backing out of estimating unreasonable ones (when trains are rerouted onto different lines, e.g. not running) in
    // a computationally tractable way.
    //
    // An additional bit of sophistication is required for cases where the stop of interest is also the last one in the
    // message.
    let subseq = fastestSubsequence(start, ts, line, ignore, sequelize, Logbooks);

    return subseq.then(function(subseq) {
        if (subseq.length === 0) {

            // If no trips were found, return an empty result container.
            return {status: "NO_TRIPS_FOUND", results: {}};

        } else if ((+subseq[0].dataValues.maximum_time - ts) >= 3600) {

            // If the trip found begins an hour or longer after the current timestamp, there is a high probability
            // that variant service is in effect. Our model can't return reasonable results in this case, so instead we
            // return a flag. Note that we must use maximum time here because minimum time may be null.
            return {status: "POSSIBLE_SERVICE_VARIATION", results: {}};

        } else if (subseq.map(s => s.dataValues.stop_id).some(s => (s === end))) {

            // If the closest sub-sequence we discovered includes the desired end stop, we are done.
            let idx_end = subseq.findIndex(s => s.dataValues.stop_id === end);
            return {status: "OK", results: subseq.filter((s, idx) => (idx <= idx_end))};

        } else {

            // Otherwise, we must try to find a new sub-sequence, starting from where the old one left off.
            console.log("Hit the pathfinder code path.");

            let end_record = subseq[subseq.length - 1];
            console.log(end_record);
            let [new_start, new_ts] = [end_record.dataValues.stop_id, end_record.dataValues.maximum_time];

            ignore.push(end_record.dataValues.unique_trip_id);

            return pollTravelTime(new_start, end, ts, line, ignore, sequelize, Logbooks).then(function(next_subseq) {
                return {status: next_subseq.status, results: subseq.concat(next_subseq)}
            });

        }
    });
}

function fastestSubsequence(start, ts, route, ignore, sequelize, Logbooks) {
    // Subroutine. Returns the trip on the given route which has the earliest start time after the given ts.
    return Logbooks.findOne({
        attributes: ['unique_trip_id'],
        where: {
            maximum_time: {[Op.gt]: [ts]},
            stop_id: {[Op.eq]: [start]},
            route_id: {[Op.eq]: [route]},
            unique_trip_id: {[Op.notIn]: [ignore]}
        },
        order: [[sequelize.col('minimum_time'), 'ASC']],
        limit: 1
    })
    .then(function(result) {
        if (!result) { return [] }  // The empty list is turned into a NO_TRIPS_FOUND status upstream.

        return Logbooks.findAll({
            where: {
                unique_trip_id: {[Op.eq]: [result.unique_trip_id]}
            },
            order: [[sequelize.col('minimum_time'), 'ASC']]
        })
    })
}


exports.locateStation = locateStation;
exports.pollTravelTimes = pollTravelTimes;