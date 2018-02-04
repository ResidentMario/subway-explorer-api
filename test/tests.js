const assert = require('assert');
const api = require('../api.js');
const db = require('../db.js');


// Define the test database layer.
const db_fp = './test/test.sqlite';
const sqlite = require('sqlite3');
new sqlite.Database(db_fp);
const sequelize = db.sequelize(db_fp, {logging: false});
const [Stops, Logbooks] = [db.Stops(sequelize), db.Logbooks(sequelize)];
sequelize.sync({force: true});


function resetdb(done) { Promise.all([Stops.sync({force: true}), Logbooks.sync({force: true})]).then(() => done()); }

describe('locateStation', function() {
    beforeEach(resetdb);

    it('correctly handles valid input', function(done) {
        Stops.bulkCreate([{
            authority_id: 0, stop_id: "1N", stop_name: "Expected", stop_lat: 0, stop_lon:0,
            authority_start_time: 0, authority_end_time: 2000000000, route_id: "TST"
        }])
        .then(() => api.locateStation(
            {query: {time:'2000-01-01T00:00', x:0.1, y:-0.1, heading:'N', line:'TST'}}, sequelize, Stops
            )
        ).then(function(result) {
            assert.equal(result.dataValues.stop_id, "1N");
            done();
        });
    });

    it('correctly handles bad timestamps', function(done) {
        Stops.bulkCreate([{
            authority_id: 0, stop_id: "1N", stop_name: "Expected", stop_lat: 0, stop_lon:0,
            authority_start_time: 0, authority_end_time: 2000000000, route_id: "TST"
        }])
        .then(() => api.locateStation(
            {query: {time:'2100-01-01T00:00', x:0.1, y:-0.1, heading:'N', line:'TST'}}, sequelize, Stops)
        )
        .then(function(result) { assert.equal(result.status, "TIMESTAMP_OUT_OF_RANGE"); done(); })
    });
});


describe('fastestSubsequence', function() {
    beforeEach(resetdb);

    it('correctly handles simple valid input', function(done) {
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "_", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "TST_STOP_1", latest_information_time: 1
            },
            {
                event_id: 1, trip_id: "_", unique_trip_id: "_", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "TST_STOP_2", latest_information_time: 2
            }
        ])
        .then(() => api._fastestSubsequence("TST_STOP_1", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.length, 2);
            done();
        })
    });

    it('correctly handles input leading to no results', function(done) {
        Logbooks.bulkCreate([])
        .then(() => api._fastestSubsequence("TST_STOP", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.length, 0);
            done();
        });
    });

    it('correctly handles input with ignored trips', function(done) {
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "PLS_IGNORE", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "TST_STOP_1", latest_information_time: 1
            },
            {
                event_id: 1, trip_id: "_", unique_trip_id: "PLS_IGNORE", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "TST_STOP_2", latest_information_time: 2
            },
            {
                event_id: 2, trip_id: "_", unique_trip_id: "PLS_CATCH", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "TST_STOP_1", latest_information_time: 2
            },
            {
                event_id: 3, trip_id: "_", unique_trip_id: "PLS_CATCH", route_id: "TST_ROUTE", action: "_",
                minimum_time: 2, maximum_time: 3, stop_id: "TST_STOP_2", latest_information_time: 3
            }
        ])
        .then(() => api._fastestSubsequence("TST_STOP_1", 0, "TST_ROUTE", ["PLS_IGNORE"], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.length, 2);
            assert.equal(result[0].unique_trip_id, "PLS_CATCH");
            assert.equal(result[1].unique_trip_id, "PLS_CATCH");
            done();
        });
    });
});


describe('pollTravelTime', function() {
    beforeEach(resetdb);

    it('correctly handles simple (non-recursive) valid input', function(done) {
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "_", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "START_STOP", latest_information_time: 1
            },
            {
                event_id: 1, trip_id: "_", unique_trip_id: "_", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "END_STOP", latest_information_time: 2
            }
        ])
        .then(() => api._pollTravelTime("START_STOP", "END_STOP", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.results.length, 2);
            done();
        });
    });

    it('correctly handles simple (non-recursive) service variation input', function(done) {
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "_", route_id: "TST_ROUTE", action: "_",
                minimum_time: 3601, maximum_time: 3602, stop_id: "START_STOP", latest_information_time: 3602
            }
        ])
        .then(() => api._pollTravelTime("START_STOP", "END_STOP", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.status, "POSSIBLE_SERVICE_VARIATION");
            done();
        });
    });

    it('correctly handles simple (non-recursive) empty input', function(done) {
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "_", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "START_STOP", latest_information_time: 1
            }
        ])
        .then(() => api._pollTravelTime("START_STOP", "END_STOP", 0, "TST_BAD_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.status, "NO_TRIPS_FOUND");
            done();
        });
    });

    it('correctly handles resolvable recursive input', function(done) {
        // The first two records are a trip from START_STOP to INTERMEDIATE_STOP. The second two are a later trip from
        // INTERMEDIATE_STOP to END_STOP. The result should be a concatenation of the two.
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "FIRST_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "START_STOP", latest_information_time: 1
            },
            {
                event_id: 1, trip_id: "_", unique_trip_id: "FIRST_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "INTERMEDIATE_STOP", latest_information_time: 2
            },
            {
                event_id: 2, trip_id: "_", unique_trip_id: "SECOND_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 2, maximum_time: 3, stop_id: "INTERMEDIATE_STOP", latest_information_time: 3
            },
            {
                event_id: 3, trip_id: "_", unique_trip_id: "SECOND_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 3, maximum_time: 4, stop_id: "END_STOP", latest_information_time: 4
            }
        ])
        .then(() => api._pollTravelTime("START_STOP", "END_STOP", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.status, "OK");
            assert.equal(result.results.length, 3);
            done();
        });
    });

    it('correctly handles unresolvable (timed-out) recursive input', function(done) {
        // If we follow the recursive code path and find that the next trip doesn't occur within the next hour,
        // we've probably hit a service variation.
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "FIRST_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "START_STOP", latest_information_time: 1
            },
            {
                event_id: 1, trip_id: "_", unique_trip_id: "FIRST_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "INTERMEDIATE_STOP", latest_information_time: 2
            },
            {
                event_id: 2, trip_id: "_", unique_trip_id: "SECOND_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 10002, maximum_time: 10003, stop_id: "INTERMEDIATE_STOP", latest_information_time: 10003
            },
            {
                event_id: 3, trip_id: "_", unique_trip_id: "SECOND_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 10003, maximum_time: 10004, stop_id: "END_STOP", latest_information_time: 10004
            }
        ])
        .then(() => api._pollTravelTime("START_STOP", "END_STOP", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.status, "POSSIBLE_SERVICE_VARIATION");
            done();
        });
    });

    it('correctly handles unresolvable (timed-out) recursive input', function(done) {
        // If we follow the recursive code path and find that there *is* no next trip, we've failed.
        Logbooks.bulkCreate([
            {
                event_id: 0, trip_id: "_", unique_trip_id: "FIRST_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 0, maximum_time: 1, stop_id: "START_STOP", latest_information_time: 1
            },
            {
                event_id: 1, trip_id: "_", unique_trip_id: "FIRST_TRIP", route_id: "TST_ROUTE", action: "_",
                minimum_time: 1, maximum_time: 2, stop_id: "INTERMEDIATE_STOP", latest_information_time: 2
            }
        ])
        .then(() => api._pollTravelTime("START_STOP", "END_STOP", 0, "TST_ROUTE", [], sequelize, Logbooks))
        .then(function(result) {
            assert.equal(result.status, "NO_TRIPS_FOUND");
            done();
        });
    });
});