const assert = require('assert');
const api = require('../api.js');
const db = require('../db.js');


// TODO: Don't re-use the existing DB for testing.
const sequelize = db.sequelize('./scripts/logbooks.sqlite', {logging: false});
const [Stops, Logbooks] = [db.Stops(sequelize), db.Logbooks(sequelize)];


describe('locateStation', function() {
    it('returns the station nearest to the given coordinates', function(done) {
        let query = {query: {time:'2018-01-18T12:00', x:40.6, y:-73.75, heading:'N', line:'A'}};

        let p = api.locateStation(query, sequelize, Stops).then(function(station) {
            assert.equal(station.stop_id, "H11N");
            done();
        });
    })
});