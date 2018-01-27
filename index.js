// TODO: Recheck the Google Maps API output format to ensure intermediary routing stops are included!
// TODO: (assuming yes) Reformat the routing information with a "stops=start|next|next|next|next|end" format.
// URI: http://localhost:3000/locate-stations/json?line=2&x=10&y=40&name=%22The%20Road%22&time=2018-01-18T12:00

const express = require('express');
const app = express();
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const moment = require('moment');

// Establish a connection to the database.
const sequelize = new Sequelize('database', 'username', 'password', {
  host: 'localhost',
  dialect: 'sqlite',

  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },

  // SQLite only
  storage: './scripts/logbooks.sqlite',  // TODO: Move the DB to a production location.

  // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
  operatorsAliases: false
});

// Authenticate the connection.
sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

// Define a stops model.
const Stops = sequelize.define('Stops', {
    authority_id: {type: Sequelize.INTEGER, primaryKey: true},
    stop_id: {type: Sequelize.STRING},
    stop_name: {type: Sequelize.STRING},
    stop_lat: {type: Sequelize.REAL},
    stop_lon: {type: Sequelize.REAL},
    authority_start_time: {type: Sequelize.REAL},
    authority_end_time: {type: Sequelize.REAL}
}, {
    timestamps: false
});

const Logbooks = sequelize.define('Logbooks', {
    event_id: {type: Sequelize.INTEGER, primaryKey: true},
    trip_id: {type: Sequelize.STRING},
    unique_trip_id: {type: Sequelize.STRING},
    route_id: {type: Sequelize.STRING},
    action: {type: Sequelize.STRING},
    minimum_time: {type: Sequelize.REAL},
    maximum_time: {type: Sequelize.REAL},
    stop_id: {type: Sequelize.STRING},
    latest_information_time: {type: Sequelize.REAL}
}, {
    timestamps: false
});

/*
   I need to define another middleware script for writing GTFS stations.txt records to the database so that it can
   queried using this function.
*/
app.get('/locate-stations/json',
    function(req, res) {
        // console.log(req.query);
        res.setHeader('Content-Type', 'application/json');

        // Query validation.
        if (!req.query.line) {
            res.status(400).send({
                status: "Error",
                message: "No line parameter was provided."
            });
        }

        else if (!req.query.time) {
            res.status(400).send({
                status: "Error",
                message: "No time parameter was provided."
            });
        }

        else if (!req.query.name || (!req.query.x && !req.query.y)) {
            console.log(~req.query.name);
            res.status(400).send({
                status: "Error",
                message: "Neither the station coordinates nor the station name was provided. At least one is required."
            });
        }

        // Validation passed, now let's do stuff.
        else {
            const unix_ts = moment(req.query.time).unix();

            if (req.query.name) {
                Stops.findAll({
                    where: {
                        authority_start_time: {[Op.lt]: [unix_ts]},
                        authority_end_time: {[Op.gt]: [unix_ts]},
                        stop_name: {[Op.eq]: [req.query.name]}
                    }
                })
                .then(resultSet => {
                    if (resultSet.length > 0) {
                        res.send(resultSet[0]);
                    } else {
                        // Finding the stop using an exact name match failed. Now we need to geolocate.
                        // TODO: Implement this match!
                        Stops.findOne({
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
                        }).then(result => res.send(result))
                    }
                });

            }

        }
});

app.get('/poll-travel-times/json',
    function(req, res) {
        // console.log(req.query);
        res.setHeader('Content-Type', 'application/json');

        function missing(text) { return {status: "Error", message: `Missing ${text}.`}; }

        // Query validation.
        if (!req.query.start) {
            res.status(400).send(missing('starting stop'));
        } else if (!req.query.end) {
            res.status(400).send(missing('ending stop'));
        } else if (!req.query.line) {
            res.status(400).send(missing('line'));
        } else if (!req.query.timestamps) {
            res.status(400).send(missing('timestamps'));
        }

        // Validation passed, now let's do stuff.
        else {
            req.query.timestamps = req.query.timestamps.split("|").map(ts => moment(ts).unix());

            // SELECT * FROM Logbooks WHERE unique_trip_id IN (SELECT unique_trip_id FROM Logbooks WHERE route_id = "6"
            // AND "stop_id" == "604S" AND minimum_time > 1516253092 ORDER BY minimum_time LIMIT 1);
            // http://localhost:3000/poll-travel-times/json?line=2&start=201N&end=231N&timestamps=2017-01-18T12:00|2017-01-18T12:30
            let result_set = req.query.timestamps.map(function(ts) {
                return fastest_subsequence(req.query.start, req.query.end, ts);
            });
            // let result_set = req.query.timestamps.map(function(ts) {
            //     return Logbooks.findOne({
            //         attributes: ['unique_trip_id'],
            //         where: {
            //             minimum_time: {[Op.gt]: [ts]},
            //             stop_id: {[Op.eq]: [req.query.start]}
            //         },
            //         order: [[sequelize.col('minimum_time'), 'ASC']],
            //         limit: 1
            //     })
            //     .then(function(result) {
            //         return Logbooks.findAll({
            //             where: {
            //                 unique_trip_id: {[Op.eq]: [result.unique_trip_id]}
            //             },
            //             order: [[sequelize.col('minimum_time'), 'ASC']]
            //         })
            //     }).then(function(result) {
            //         result.map(function(r) { console.log(r.stop_id); console.log(req.query.end)});
            //
            //         if (result.some(r => r.stop_id === req.query.end)) {
            //             console.log("Success");
            //         } else {
            //             console.log("Failure");
            //         }
            //
            //     });
            // });

            Promise.all(result_set).then(result_set => {
                console.log(result_set);
                res.send("Foo");
            });

        }
});

// Helper function that returns the fastest stop subsequence.
function fastest_subsequence(start, end, ts) {
    return Logbooks.findOne({
        attributes: ['unique_trip_id'],
        where: {
            minimum_time: {[Op.gt]: [ts]},
            stop_id: {[Op.eq]: [start]}
        },
        order: [[sequelize.col('minimum_time'), 'ASC']],
        limit: 1
    })
    .then(function(result) {
        return Logbooks.findAll({
            where: {
                unique_trip_id: {[Op.eq]: [result.unique_trip_id]}
            },
            order: [[sequelize.col('minimum_time'), 'ASC']]
        })
    })
}

app.listen(3000);