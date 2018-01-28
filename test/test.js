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


describe('locateStation', function() {
    beforeEach(function(done) {
        Promise.all([Stops.sync({force: true}), Logbooks.sync({force: true})]).then(() => done());
    });

    it('returns the station nearest to the given coordinates', function(done) {

        Stops.bulkCreate([
            {authority_id: 0, stop_id: "1N", stop_name: "Expected", stop_lat: 0, stop_lon:0,
                authority_start_time: 0, authority_end_time: 2000000000, route_id: "TST"}
        ])
        .then(() => api.locateStation(
            {query: {time:'2000-01-01T00:00', x:0.1, y:-0.1, heading:'N', line:'TST'}}, sequelize, Stops
            )
        ).then(function(result) {
            assert.equal(result.dataValues.stop_id, "1N");
            done();
        });
    })
});