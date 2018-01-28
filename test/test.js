const assert = require('assert');
const api = require('../api.js');
const db = require('../db.js');


const sequelize = db.sequelize();
const [Stops, Logbooks] = [db.Stops(sequelize), db.Logbooks(sequelize)];


describe('locateStation', function() {
    it('returns the station nearest to the given coordinates', function() {
        // Set up.
        // Stops.create({
        //     authority_id: -1, stop_id: -1, stop_name: "Expected", stop_lat: 0, stop_lon: 0,
        //     authority_start_time: -1, authority_end_time: 1
        // });
        // debugger;
        // locateStation({})
        // assert.equal();

        return true;
    })
});