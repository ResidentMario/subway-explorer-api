const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const moment = require('moment');


function locateStation(req, sequelize, Stops) {
    // Find the stop_id for a given latitude, longitude pair.

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
        let subseq = fastestSubsequence(req.query.start, ts, req.query.line, sequelize, Logbooks);

        return subseq.then(function(subseq) {
            if (subseq.map(s => s.dataValues.stop_id).some(s => (s === req.query.end))) {
                // If the closest sub-sequence we discovered includes the desired end stop, we are done.

                let idx_stop = subseq.findIndex(s => s.dataValues.stop_id === req.query.end);
                return subseq.filter((s, idx) => idx <= idx_stop);
            } else {
                // Otherwise, we must try to find a new sub-sequence, starting from where the old one left off.
                // TODO: Implement!
                return {};
            }
        });
    });

    return Promise.all(result_set).then(result_set => {
        return result_set;
    });
}

function fastestSubsequence(start, ts, route, sequelize, Logbooks) {
    // Subroutine. Returns the trip on the given route which has the earliest start time after the given ts.
    return Logbooks.findOne({
        attributes: ['unique_trip_id'],
        where: {
            minimum_time: {[Op.gt]: [ts]},
            stop_id: {[Op.eq]: [start]},
            route_id: {[Op.eq]: [route]}
        },
        order: [[sequelize.col('minimum_time'), 'DESC']],
        limit: 1
    })
    .then(function(result) {
        return Logbooks.findAll({
            where: {
                unique_trip_id: {[Op.eq]: [result.unique_trip_id]}
            },
            order: [[sequelize.col('minimum_time'), 'DESC']]
        })
    })
}


exports.locateStation = locateStation;
exports.pollTravelTimes = pollTravelTimes;